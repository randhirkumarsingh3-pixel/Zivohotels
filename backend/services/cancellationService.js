import Razorpay from 'razorpay';
import ledgerService from './finance/ledgerService.js';
import { move as moveWallet } from './finance/walletService.js';
import { syncBooking as syncLoyalty } from './loyaltyService.js';
import prisma from '../config/db.js';
import { calculateRefund, getDefaultPolicy } from '../utils/refundCalculator.js';
import { roundMoney, toMoney } from '../utils/money.js';
import { withTimeout } from '../utils/promiseUtils.js';
import { criticalLogger } from '../middleware/logger.js';
import inventoryRepository from '../repositories/inventoryRepository.js';
import settlementService from './finance/settlementService.js';
import { createNotification } from './notificationService.js';
import { queueService } from './queueService.js';

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

/** Error with an HTTP status, so controllers can pass the right response through. */
export class CancellationError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'CancellationError';
    this.status = status;
  }
}

const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

/** Who is cancelling, from the user's role. */
export const initiatorForRole = (role) => (role === 'CUSTOMER' ? 'GUEST' : role === 'ADMIN' ? 'ADMIN' : 'HOTEL');

const POLICY_LABELS = {
  FREE_CANCEL_CHECKIN: 'Free cancellation until check-in',
  FREE_CANCEL_24H: 'Free cancellation until 24 hours before check-in',
  FREE_CANCEL_48H: 'Free cancellation until 48 hours before check-in',
  FREE_CANCEL_72H: 'Free cancellation until 72 hours before check-in',
  NON_REFUNDABLE: 'Non-refundable',
};

/**
 * What a guest would get back if they cancelled now (same rules as cancelBookingWithRefund).
 * Shown before they confirm; the old dialog always promised a full refund.
 */
/**
 * The guest's refund under the property's policy, and the membership perk: a paid plan with
 * freeCancelExtraHours (at booking time) lets the guest cancel free for that much longer. The fee
 * the hotel would have kept is then paid to the hotel by Zivo (memberWaiver).
 */
const guestRefund = (booking, policy, now = new Date()) => {
  const base = calculateRefund(booking, policy, now);
  const extra = Number(booking.metadata?.membership?.freeCancelExtraHours) || 0;
  if (extra > 0) {
    const asIfEarlier = calculateRefund(booking, policy, new Date(now.getTime() - extra * 60 * 60 * 1000));
    if (asIfEarlier.refundAmount > base.refundAmount) {
      return { refundAmount: asIfEarlier.refundAmount, policyApplied: `${asIfEarlier.policyApplied}_MEMBER_EXTENDED`, memberWaiver: roundMoney(asIfEarlier.refundAmount - base.refundAmount) };
    }
  }
  return { ...base, memberWaiver: 0 };
};

export const previewGuestCancellation = async (booking) => {
  const policy = await prisma.cancellationPolicy.findUnique({ where: { hotelId: booking.hotelId } }) || getDefaultPolicy();
  const paidAmount = toMoney(booking.paidAmount) || 0;
  const { refundAmount, policyApplied, memberWaiver } = guestRefund(booking, policy);
  // Zivo Cash used on the booking goes back to the wallet; for the rest the guest can choose
  const walletPart = Math.min(refundAmount, toMoney(booking.walletAmount) || 0);
  return {
    paidAmount,
    refundAmount,
    walletRefund: roundMoney(walletPart),
    choosableRefund: roundMoney(refundAmount - walletPart),
    retainedAmount: roundMoney(paidAmount - refundAmount),
    memberWaiver,
    memberPlan: memberWaiver > 0 ? booking.metadata?.membership?.plan : null,
    payAtHotel: booking.paymentType === 'PAY_AT_HOTEL',
    policyCode: policy.policyCode,
    policyLabel: POLICY_LABELS[policy.policyCode] || 'Standard cancellation policy',
    policyApplied
  };
};

/**
 * Cancels a booking and refunds the guest.
 *
 * - GUEST cancels: refund follows the property's cancellation policy. Anything kept (the
 *   cancellation fee) becomes a CANCELLATION settlement for the hotel, paid in its payout cycle.
 * - HOTEL or ADMIN cancels: the guest is refunded everything they paid (the hotel hasn't been paid
 *   yet: payouts happen after check-out), and the hotel is notified that the refund is being made.
 *
 * Refunds go through Razorpay with an idempotency key; a failed refund leaves the booking as it
 * was so it can be retried (up to 3 attempts).
 */
export const cancelBookingWithRefund = async ({ bookingId, initiatedBy, userId, requestId, refundTo = 'SOURCE' }) => {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });

  if (!booking) throw new CancellationError(404, 'Booking not found');
  if (booking.status === 'CANCELLED') throw new CancellationError(400, 'Booking is already cancelled');
  // A stay that has started or ended can't be cancelled (the hotel may already be settled)
  if (['CHECKED_IN', 'COMPLETED', 'NO_SHOW'].includes(booking.status)) {
    throw new CancellationError(400, `A booking that is ${booking.status.replace('_', ' ').toLowerCase()} can't be cancelled`);
  }

  // Idempotency & retry limit
  const existingRefund = await prisma.refund.findUnique({ where: { bookingId } });
  if (existingRefund?.status === 'SUCCESS') throw new CancellationError(400, 'Refund already completed');
  if (existingRefund && existingRefund.retryCount >= 3) {
    throw new CancellationError(429, 'Max refund retries reached. Manual intervention required.');
  }

  // How much goes back to the guest
  const paidAmount = toMoney(booking.paidAmount) || 0;
  let refundAmount;
  let policyApplied;
  let memberWaiver = 0;
  if (initiatedBy === 'GUEST') {
    const policy = await prisma.cancellationPolicy.findUnique({ where: { hotelId: booking.hotelId } }) || getDefaultPolicy();
    ({ refundAmount, policyApplied, memberWaiver } = guestRefund(booking, policy));
  } else {
    refundAmount = roundMoney(paidAmount);
    policyApplied = `CANCELLED_BY_${initiatedBy}`; // full refund
  }
  const retainedAmount = roundMoney(paidAmount - refundAmount);

  // Where the refund goes. Zivo Cash used on the booking always goes back to the wallet; the rest
  // goes back to the card / UPI, or to Zivo Cash (instant) only when the guest chose that.
  const walletUsed = toMoney(booking.walletAmount) || 0;
  const isPaid = ['PAID', 'PARTIAL_PAID'].includes(booking.paymentStatus);
  let toWallet = 0;
  if (isPaid) {
    toWallet = Math.min(refundAmount, walletUsed);
    if (refundTo === 'WALLET' && initiatedBy === 'GUEST' && booking.userId) toWallet = refundAmount;
  }
  toWallet = roundMoney(toWallet);
  const toSource = roundMoney(refundAmount - toWallet);
  // Never completed (abandoned at checkout): the Zivo Cash put towards it comes back in full
  const walletReturned = !isPaid && walletUsed > 0 && booking.userId ? walletUsed : 0;

  const refundRecord = await prisma.refund.upsert({
    where: { bookingId },
    update: { status: 'INITIATED', amount: refundAmount, retryCount: { increment: 1 }, lastAttemptAt: new Date(), requestId },
    create: { bookingId, amount: refundAmount, status: 'INITIATED', lastAttemptAt: new Date(), requestId }
  });

  // Razorpay refund (outside the DB transaction, with an idempotency key)
  let razorpayRefundId = null;
  if (toSource > 0 && booking.razorpayPaymentId) {
    try {
      const razorResponse = await withTimeout(
        razorpay.payments.refund(booking.razorpayPaymentId, {
          amount: Math.round(toSource * 100),
          notes: { requestId, bookingId, retry: refundRecord.retryCount, initiatedBy }
        }, {
          'X-Razorpay-Idempotency-Key': `${bookingId}-${refundRecord.retryCount}`
        }),
        10000,
        'Razorpay Refund Timed Out'
      );
      razorpayRefundId = razorResponse.id;
    } catch (apiError) {
      criticalLogger('REFUND_FAILURE', {
        bookingId, error: apiError.message, amount: refundAmount, paymentId: booking.razorpayPaymentId
      }, requestId);
      await prisma.refund.update({ where: { id: refundRecord.id }, data: { status: 'FAILED' } });
      throw new CancellationError(502, `Payment refund failed: ${apiError.message}`);
    }
  }

  const byLabel = { GUEST: 'the guest', HOTEL: 'the hotel', ADMIN: 'ZivoHotels' }[initiatedBy];

  const finalizedBooking = await prisma.$transaction(async (tx) => {
    await tx.refund.update({ where: { id: refundRecord.id }, data: { status: 'SUCCESS', razorpayRefundId } });

    const updated = await tx.booking.update({
      where: { id: bookingId },
      data: {
        status: 'CANCELLED',
        refundAmount,
        cancelledAt: new Date(),
        // With no refund, the payment status is unchanged; refundAmount records what was returned
        paymentStatus: refundAmount > 0 ? 'REFUNDED' : booking.paymentStatus
      }
    });

    await inventoryRepository.restoreInventory(tx, booking);

    if (toWallet > 0) {
      await moveWallet(tx, { userId: booking.userId, type: 'CREDIT', amount: toWallet, category: 'REFUND', description: `Refund for cancelled booking ${booking.bookingRef}`, bookingId });
    }
    if (walletReturned > 0) {
      await moveWallet(tx, { userId: booking.userId, type: 'CREDIT', amount: walletReturned, category: 'PAYMENT_RETURNED', description: `Booking ${booking.bookingRef} was cancelled before payment`, bookingId });
    }

    await tx.bookingTimelineEvent.create({
      data: {
        bookingId,
        status: 'CANCELLED',
        title: 'Booking Cancelled',
        message: refundAmount > 0
          ? `Cancelled by ${byLabel}. Refund of ${inr(refundAmount)}: ` + [
              toWallet > 0 && `${inr(toWallet)} added to your Zivo Cash`,
              toSource > 0 && `${inr(toSource)} to your original payment method (5-7 working days)`,
            ].filter(Boolean).join(', ') + '.'
          : walletReturned > 0 ? `Cancelled by ${byLabel}. ${inr(walletReturned)} returned to your Zivo Cash.` : `Cancelled by ${byLabel}.`
      }
    });

    // Fee kept under the property's policy -> the hotel's share is settled in its payout cycle
    // (one settlement per booking: the fee kept, plus a fee waived for a member, which Zivo pays)
    if (initiatedBy === 'GUEST' && retainedAmount + memberWaiver > 0) {
      await settlementService.createForRetained(tx, updated, 'CANCELLATION', roundMoney(retainedAmount + memberWaiver));
    }
    // Membership perk: the guest got the fee back, Zivo pays the hotel the fee it would have kept
    if (initiatedBy === 'GUEST' && memberWaiver > 0) {
      await ledgerService.record([
        { referenceId: bookingId, account: 'ZIVO_MEMBERSHIP', type: 'DEBIT', amount: memberWaiver, description: `Cancellation fee waived for a member, paid to the hotel by Zivo (${booking.bookingRef})` },
        { referenceId: bookingId, account: 'USER', type: 'CREDIT', amount: memberWaiver, description: `Cancellation fee refunded to the member (${booking.bookingRef})` },
      ], tx);
    }

    await tx.auditLog.create({
      data: {
        action: 'CANCEL_BOOKING',
        entityType: 'BOOKING',
        entityId: bookingId,
        userId,
        requestId,
        details: {
          initiatedBy, refundAmount, retainedAmount, memberWaiver, refundToWallet: toWallet, refundToSource: toSource, walletReturned, status: 'SUCCESS', policy: policyApplied,
          razorpayRefundId, paymentId: booking.razorpayPaymentId
        }
      }
    });

    return updated;
  });

  // Tell the hotel (in-app; plus email when the hotel side cancelled, so the owner has a record)
  const message = initiatedBy === 'GUEST'
    ? `The guest cancelled booking ${booking.bookingRef}. Refund under your cancellation policy: ${inr(refundAmount - memberWaiver)}.` +
      (retainedAmount > 0 ? ` ${inr(retainedAmount)} was kept and will be settled in your payout cycle.` : '') +
      (memberWaiver > 0 ? ` As a ${booking.metadata?.membership?.plan || 'member'} benefit the guest also got the ${inr(memberWaiver)} fee back; ZivoHotels pays you that fee in your payout cycle.` : '')
    : `Booking ${booking.bookingRef} was cancelled by ${byLabel}.` +
      (refundAmount > 0 ? ` A full refund of ${inr(refundAmount)} will be initiated to the guest.` : ' Nothing was paid online, so there is no refund.');

  // Zivo Rewards: points used on this booking come back; points it would earn are cancelled
  await syncLoyalty(bookingId).catch((e) => console.error('[ZivoRewards] sync failed:', e.message));

  // An unpaid booking abandoned at checkout (payment cancelled / failed) was never confirmed, so
  // the hotel doesn't need to hear about it
  // (A pay-later booking was shown to the hotel as tentative, so the hotel is told.)
  const abandonedAtCheckout = booking.status === 'PENDING' && paidAmount === 0 && booking.paymentType !== 'PAY_AT_HOTEL';
  if (abandonedAtCheckout) {
    return { booking: finalizedBooking, refundAmount, retainedAmount, policyApplied, razorpayRefundId, refundToWallet: toWallet, refundToSource: toSource };
  }

  await createNotification({
    hotelId: booking.hotelId,
    type: 'CANCELLED',
    title: `Booking ${booking.bookingRef} cancelled`,
    message,
    metadata: { bookingId, initiatedBy, refundAmount, retainedAmount }
  });

  if (initiatedBy !== 'GUEST') {
    const hotel = await prisma.hotel.findUnique({ where: { id: booking.hotelId }, include: { owner: { select: { email: true, name: true } } } });
    if (hotel?.owner?.email) {
      await queueService.enqueue('email', 'SEND_BOOKING_CANCELLED_OWNER', {
        to: hotel.owner.email,
        subject: `Booking ${booking.bookingRef} cancelled — guest refund ${refundAmount > 0 ? 'initiated' : 'not needed'}`,
        html: `<p>Dear ${hotel.owner.name || 'Partner'},</p><p>${message}</p><p>Guest: ${booking.guestName}<br/>Stay: ${new Date(booking.checkIn).toDateString()} – ${new Date(booking.checkOut).toDateString()}<br/>Property: ${hotel.name}</p><p>The rooms have been released back to your inventory.</p><p>— ZivoHotels</p>`
      }, { priority: 2 });
    }
  }

  return { booking: finalizedBooking, refundAmount, retainedAmount, policyApplied, razorpayRefundId, refundToWallet: toWallet, refundToSource: toSource };
};

export default { cancelBookingWithRefund, initiatorForRole, CancellationError };
