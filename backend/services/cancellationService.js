import Razorpay from 'razorpay';
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
export const cancelBookingWithRefund = async ({ bookingId, initiatedBy, userId, requestId }) => {
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
  if (initiatedBy === 'GUEST') {
    const policy = await prisma.cancellationPolicy.findUnique({ where: { hotelId: booking.hotelId } }) || getDefaultPolicy();
    ({ refundAmount, policyApplied } = calculateRefund(booking, policy));
  } else {
    refundAmount = roundMoney(paidAmount);
    policyApplied = `CANCELLED_BY_${initiatedBy}`; // full refund
  }
  const retainedAmount = roundMoney(paidAmount - refundAmount);

  const refundRecord = await prisma.refund.upsert({
    where: { bookingId },
    update: { status: 'INITIATED', amount: refundAmount, retryCount: { increment: 1 }, lastAttemptAt: new Date(), requestId },
    create: { bookingId, amount: refundAmount, status: 'INITIATED', lastAttemptAt: new Date(), requestId }
  });

  // Razorpay refund (outside the DB transaction, with an idempotency key)
  let razorpayRefundId = null;
  if (refundAmount > 0 && booking.razorpayPaymentId) {
    try {
      const razorResponse = await withTimeout(
        razorpay.payments.refund(booking.razorpayPaymentId, {
          amount: Math.round(refundAmount * 100),
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

    await tx.bookingTimelineEvent.create({
      data: {
        bookingId,
        status: 'CANCELLED',
        title: 'Booking Cancelled',
        message: refundAmount > 0
          ? `Cancelled by ${byLabel}. A refund of ${inr(refundAmount)} has been initiated to your original payment method.`
          : `Cancelled by ${byLabel}.`
      }
    });

    // Fee kept under the property's policy -> the hotel's share is settled in its payout cycle
    if (initiatedBy === 'GUEST' && retainedAmount > 0) {
      await settlementService.createForRetained(tx, updated, 'CANCELLATION', retainedAmount);
    }

    await tx.auditLog.create({
      data: {
        action: 'CANCEL_BOOKING',
        entityType: 'BOOKING',
        entityId: bookingId,
        userId,
        requestId,
        details: {
          initiatedBy, refundAmount, retainedAmount, status: 'SUCCESS', policy: policyApplied,
          razorpayRefundId, paymentId: booking.razorpayPaymentId
        }
      }
    });

    return updated;
  });

  // Tell the hotel (in-app; plus email when the hotel side cancelled, so the owner has a record)
  const message = initiatedBy === 'GUEST'
    ? `The guest cancelled booking ${booking.bookingRef}. Refund under your cancellation policy: ${inr(refundAmount)}.` +
      (retainedAmount > 0 ? ` ${inr(retainedAmount)} was kept and will be settled in your payout cycle.` : '')
    : `Booking ${booking.bookingRef} was cancelled by ${byLabel}.` +
      (refundAmount > 0 ? ` A full refund of ${inr(refundAmount)} will be initiated to the guest.` : ' Nothing was paid online, so there is no refund.');

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

  return { booking: finalizedBooking, refundAmount, retainedAmount, policyApplied, razorpayRefundId };
};

export default { cancelBookingWithRefund, initiatorForRole, CancellationError };
