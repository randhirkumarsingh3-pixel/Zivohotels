import Razorpay from 'razorpay';
import ledgerService from './finance/ledgerService.js';
import { move as moveWallet } from './finance/walletService.js';
import { syncBooking as syncLoyalty } from './loyaltyService.js';
import prisma from '../config/db.js';
import { getDefaultPolicy } from '../utils/refundCalculator.js';
import { guestRefund, roomCancellationQuote } from '../domains/cancellationRules.js';
export { roomCancellationQuote };
import { roundMoney, toMoney } from '../utils/money.js';
import { withTimeout } from '../utils/promiseUtils.js';
import { criticalLogger } from '../middleware/logger.js';
import inventoryRepository from '../repositories/inventoryRepository.js';
import settlementService from './finance/settlementService.js';
import { createNotification } from './notificationService.js';
import { queueService } from './queueService.js';
import { getDatesInRange } from '../utils/dateUtils.js';
import { scheduleRecompute } from './dynamicPricingService.js';

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
      alertRefundFailure(booking, refundAmount, apiError.message);
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

  // Guest: bell + email with the refund. Hotel: email to its booking recipients.
  import('./bookingNotices.js')
    .then((m) => m.onBookingCancelled(bookingId, { initiatedBy, refundAmount, refundTo: toWallet > 0 && !toSource ? 'wallet' : refundAmount > 0 ? 'source' : null }))
    .catch((e) => console.error('[Notify] booking cancelled:', e.message));

  return { booking: finalizedBooking, refundAmount, retainedAmount, policyApplied, razorpayRefundId, refundToWallet: toWallet, refundToSource: toSource };
};

/** Admins hear at once when Razorpay refuses a refund: the guest is waiting for their money. */
const alertRefundFailure = (booking, amount, error) => {
  import('./notifyService.js').then(({ notifyAdmins }) => notifyAdmins({
    type: 'REFUND_FAILED',
    title: `Refund failed: ${booking.bookingRef}`,
    message: `Razorpay refused a refund of ${inr(amount)}: ${String(error).slice(0, 160)}. Retry it from Admin → Bookings.`,
    link: '/admin/bookings',
    metadata: { bookingId: booking.id },
    email: { jobType: 'SEND_ADMIN_ALERT', priority: 1, subject: `Refund failed for ${booking.bookingRef}`, html: `<p>Razorpay refused a refund of ${inr(amount)} for booking ${booking.bookingRef}.</p><p>Error: ${String(error).replace(/[<>&]/g, '')}</p><p>Retry it from Admin → Bookings.</p>` },
  })).catch(() => {});
};

export default { cancelBookingWithRefund, initiatorForRole, CancellationError };

// ─── One room of a booking with several rooms ───────────────────────────────────────────────────

const loadForRoomCancel = async (bookingId, roomNumber) => {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId }, include: { bookingRooms: { orderBy: { roomNumber: 'asc' }, include: { roomType: { select: { name: true } } } } } });
  if (!booking) throw new CancellationError(404, 'Booking not found');
  if (!['CONFIRMED', 'PENDING'].includes(booking.status)) throw new CancellationError(400, 'Only a booking that is confirmed or awaiting payment can have a room cancelled');
  const active = booking.bookingRooms.filter((r) => !r.cancelledAt);
  const room = active.find((r) => r.roomNumber === Number(roomNumber));
  if (!room) throw new CancellationError(404, booking.bookingRooms.some((r) => r.roomNumber === Number(roomNumber)) ? 'This room is already cancelled' : 'Room not found in this booking');
  if (active.length < 2) throw new CancellationError(400, 'This is the last room: cancel the whole booking instead');
  return { booking, active, room };
};

/** What the guest would get back for cancelling one room now. */
export const previewRoomCancellation = async (bookingId, roomNumber, initiatedBy = 'GUEST') => {
  const { booking, active, room } = await loadForRoomCancel(bookingId, roomNumber);
  const policy = await prisma.cancellationPolicy.findUnique({ where: { hotelId: booking.hotelId } }) || getDefaultPolicy();
  const q = roomCancellationQuote({ booking, rooms: active, room, policy, initiatedBy });
  return {
    roomNumber: room.roomNumber, roomTypeName: room.roomType?.name, guestName: room.guestName,
    roomShare: q.shareTotal, paidForRoom: q.sharePaid, refundAmount: q.refundAmount, retainedAmount: q.retainedAmount,
    memberWaiver: q.memberWaiver, newTotal: roundMoney((toMoney(booking.totalAmount) || 0) - q.shareTotal + q.retainedAmount),
    policyCode: policy.policyCode, policyLabel: POLICY_LABELS[policy.policyCode] || 'Standard cancellation policy',
  };
};

/**
 * Cancels one room: refunds its share (to Zivo Cash or the original payment), puts the room back
 * on sale and leaves the rest of the booking as it is, with its totals reduced. A cancellation
 * charge kept for the room stays in the booking's total and is settled with the stay.
 */
export const cancelBookingRoom = async ({ bookingId, roomNumber, initiatedBy, userId, requestId, refundTo = 'SOURCE' }) => {
  const { booking, active, room } = await loadForRoomCancel(bookingId, roomNumber);
  const policy = await prisma.cancellationPolicy.findUnique({ where: { hotelId: booking.hotelId } }) || getDefaultPolicy();
  const q = roomCancellationQuote({ booking, rooms: active, room, policy, initiatedBy });

  // Zivo Cash used on the booking is returned first (as for a whole booking); the rest goes to the
  // card / UPI, or to Zivo Cash when the guest chose that
  const walletLeft = toMoney(booking.walletAmount) || 0;
  let toWallet = Math.min(q.refundAmount, walletLeft);
  if (refundTo === 'WALLET' && initiatedBy === 'GUEST' && booking.userId) toWallet = q.refundAmount;
  toWallet = roundMoney(toWallet);
  const toSource = roundMoney(q.refundAmount - toWallet);

  let razorpayRefundId = null;
  if (toSource > 0) {
    if (!booking.razorpayPaymentId) throw new CancellationError(400, 'This booking has no online payment to refund to. Choose Zivo Cash.');
    try {
      const r = await withTimeout(
        razorpay.payments.refund(booking.razorpayPaymentId, { amount: Math.round(toSource * 100), notes: { bookingId, roomNumber: String(room.roomNumber), initiatedBy } },
          { 'X-Razorpay-Idempotency-Key': `${bookingId}-room-${room.roomNumber}` }),
        10000, 'Razorpay Refund Timed Out');
      razorpayRefundId = r.id;
    } catch (apiError) {
      criticalLogger('REFUND_FAILURE', { bookingId, roomNumber: room.roomNumber, error: apiError.message, amount: toSource }, requestId);
      alertRefundFailure(booking, toSource, apiError.message);
      throw new CancellationError(502, `Payment refund failed: ${apiError.message}`);
    }
  }

  const byLabel = { GUEST: 'the guest', HOTEL: 'the hotel', ADMIN: 'ZivoHotels' }[initiatedBy];
  const total = toMoney(booking.totalAmount) || 0;
  const newTotal = roundMoney(total - q.shareTotal + q.retainedAmount);
  const newPaid = roundMoney((toMoney(booking.paidAmount) || 0) - q.refundAmount);

  const updated = await prisma.$transaction(async (tx) => {
    await tx.bookingRoom.update({ where: { id: room.id }, data: { cancelledAt: new Date(), refundAmount: q.refundAmount } });
    // This room's nights back on sale
    const dates = getDatesInRange(new Date(booking.checkIn), new Date(booking.checkOut));
    await tx.inventory.updateMany({
      where: { roomTypeId: room.roomTypeId, date: { in: dates } },
      data: { bookedRooms: { decrement: 1 }, availableRooms: { increment: 1 } },
    });
    const cancelledRooms = [...(booking.metadata?.cancelledRooms || []), {
      roomNumber: room.roomNumber, roomTypeName: room.roomType?.name, guestName: room.guestName, at: new Date().toISOString(),
      by: initiatedBy, roomShare: q.shareTotal, refundAmount: q.refundAmount, retainedAmount: q.retainedAmount, toWallet, toSource, razorpayRefundId,
    }];
    const u = await tx.booking.update({
      where: { id: bookingId },
      data: {
        rooms: active.length - 1,
        adults: Math.max(1, booking.adults - room.adults),
        children: Math.max(0, booking.children - room.children),
        guests: Math.max(1, booking.guests - room.adults - room.children),
        totalAmount: newTotal,
        taxAmount: roundMoney((toMoney(booking.taxAmount) || 0) - q.shareTax),
        baseAmount: roundMoney((toMoney(booking.baseAmount) || 0) - q.shareBase + q.retainedAmount),
        paidAmount: newPaid,
        remainingAmount: roundMoney(Math.max(0, newTotal - newPaid)),
        walletAmount: roundMoney(Math.max(0, walletLeft - Math.min(q.refundAmount, walletLeft))),
        metadata: { ...(booking.metadata || {}), cancelledRooms },
      },
    });
    if (toWallet > 0) {
      await moveWallet(tx, { userId: booking.userId, type: 'CREDIT', amount: toWallet, category: 'REFUND', description: `Refund for room ${room.roomNumber} of booking ${booking.bookingRef}`, bookingId });
    }
    await tx.bookingTimelineEvent.create({
      data: {
        bookingId, status: 'ROOM_CANCELLED', title: `Room ${room.roomNumber} cancelled`,
        message: `Room ${room.roomNumber} (${room.roomType?.name || 'room'}, ${room.guestName}) was cancelled by ${byLabel}.` +
          (q.refundAmount > 0 ? ` Refund of ${inr(q.refundAmount)}: ` + [toWallet > 0 && `${inr(toWallet)} to your Zivo Cash`, toSource > 0 && `${inr(toSource)} to your original payment method (5-7 working days)`].filter(Boolean).join(', ') + '.' : '') +
          (q.retainedAmount > 0 ? ` Cancellation charge: ${inr(q.retainedAmount)}.` : ''),
      },
    });
    await tx.auditLog.create({
      data: { action: 'CANCEL_BOOKING_ROOM', entityType: 'BOOKING', entityId: bookingId, userId, requestId, details: { roomNumber: room.roomNumber, initiatedBy, ...q, toWallet, toSource, razorpayRefundId } },
    });
    return u;
  });

  scheduleRecompute(booking.hotelId);
  await syncLoyalty(bookingId).catch((e) => console.error('[ZivoRewards] sync failed:', e.message));
  // A paid booking's invoice shows the new amount
  if (booking.status === 'CONFIRMED') {
    import('./invoiceService.js').then((m) => m.invoiceService.regenerateInvoice(bookingId)).catch(() => {});
  }
  await createNotification({
    hotelId: booking.hotelId, type: 'CANCELLED', title: `Room ${room.roomNumber} of ${booking.bookingRef} cancelled`,
    message: `${initiatedBy === 'GUEST' ? 'The guest' : `Cancelled by ${byLabel}:`} room ${room.roomNumber} (${room.roomType?.name || 'room'}, ${room.guestName}) of booking ${booking.bookingRef}. The rest of the booking stays.` +
      (q.retainedAmount > 0 ? ` A charge of ${inr(q.retainedAmount)} is kept and settled with the stay.` : ''),
    metadata: { bookingId, roomNumber: room.roomNumber },
  });
  if (booking.guestEmail) {
    queueService.enqueue('email', 'SEND_ROOM_CANCELLED', {
      to: booking.guestEmail,
      subject: `Room ${room.roomNumber} cancelled · ${booking.bookingRef}`,
      html: `<div style="font-family:Arial,sans-serif;max-width:560px">
        <h2 style="font-size:18px">Room ${room.roomNumber} of your booking was cancelled</h2>
        <p>${room.roomType?.name || 'Room'} for ${room.guestName} is cancelled; the rest of booking <b>${booking.bookingRef}</b> stays as booked.</p>
        ${q.refundAmount > 0 ? `<p>Refund: <b>${inr(q.refundAmount)}</b>${toWallet > 0 ? ` (${inr(toWallet)} to Zivo Cash)` : ''}${toSource > 0 ? ` (${inr(toSource)} to your original payment method, 5-7 working days)` : ''}.</p>` : ''}
        ${q.retainedAmount > 0 ? `<p>Cancellation charge under the hotel's policy: ${inr(q.retainedAmount)}.</p>` : ''}
        <p>New booking total: <b>${inr(newTotal)}</b>.</p></div>`,
    }, { priority: 2 }).catch(() => {});
  }
  import('./bookingNotices.js').then((m) => m.onRoomCancelled(bookingId, { roomNumber: room.roomNumber, refundAmount: q.refundAmount, initiatedBy })).catch(() => {});
  return { booking: updated, ...q, toWallet, toSource, razorpayRefundId };
};
