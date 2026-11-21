import prisma from '../config/db.js';
import inventoryRepository from '../repositories/inventoryRepository.js';
import { createNotification } from './notificationService.js';
import { sendPayLaterEmail, sendDueReminders } from './payLaterService.js';

/**
 * Cancels unpaid bookings whose payment window has passed (expiresAt: 30 minutes to pay now, or
 * the "reserve now, pay later" deadline) and gives their rooms back. Before this ran on a schedule, a guest who closed the tab
 * before paying held the room forever.
 *
 * Only bookings with nothing paid are touched. A payment that arrives later for an expired booking
 * is refunded automatically by the payment verification / webhook handlers.
 */
export const expireStaleBookings = async (now = new Date()) => {
  const expired = await prisma.booking.findMany({
    where: {
      status: 'PENDING',
      expiresAt: { lt: now },
      paymentStatus: { not: 'PAID' },
      OR: [{ paidAmount: null }, { paidAmount: 0 }]
    }
  });

  let count = 0;
  for (const b of expired) {
    await prisma.$transaction(async (tx) => {
      // Re-check inside the transaction so a payment confirmed meanwhile isn't cancelled
      const fresh = await tx.booking.findUnique({ where: { id: b.id }, select: { status: true, paymentStatus: true } });
      if (fresh?.status !== 'PENDING' || fresh.paymentStatus === 'PAID') return;

      // Restore inventory before the status changes (the helper skips CANCELLED bookings)
      await inventoryRepository.restoreInventory(tx, b);
      await tx.booking.update({ where: { id: b.id }, data: { status: 'CANCELLED', cancelledAt: now } });
      await tx.bookingTimelineEvent.create({
        data: { bookingId: b.id, status: 'CANCELLED', title: 'Booking Expired', message: 'Payment was not completed in time, so the reservation was released.' }
      });
      b.expiredNow = true;
      await tx.auditLog.create({
        data: { action: 'BOOKING_EXPIRED', entityType: 'BOOKING', entityId: b.id, userId: 'SYSTEM', details: { ref: b.bookingRef, reason: 'Payment Timeout' } }
      });
      count++;
    });
  }
  // Pay later: tell the guest and the hotel (they saw the tentative booking)
  for (const b of expired.filter((x) => x.expiredNow && x.paymentType === 'PAY_AT_HOTEL')) {
    sendPayLaterEmail(b.id, 'expired').catch((e) => console.error('[PayLater] expired email failed:', e.message));
    createNotification({
      hotelId: b.hotelId, type: 'CANCELLED', title: `Booking ${b.bookingRef} cancelled: not paid`,
      message: `${b.guestName} didn't pay by the deadline, so the tentative booking was cancelled and the rooms are back on sale.`,
      metadata: { bookingId: b.id, reason: 'PAY_LATER_EXPIRED' },
    }).catch(() => {});
  }
  return count;
};

const FIVE_MINUTES = 5 * 60 * 1000;

/** Runs the expiry every 5 minutes inside the API process. */
export const startBookingExpiryJob = () => {
  const run = () => expireStaleBookings()
    .then((n) => { if (n) console.log(`[BookingExpiry] Released ${n} unpaid booking(s)`); })
    .then(() => sendDueReminders())
    .then((n) => { if (n) console.log(`[BookingExpiry] Sent ${n} pay-later reminder(s)`); })
    // Day-before check-in reminders and after-stay review requests (each sent once)
    .then(() => import('./bookingNotices.js').then((m) => m.sendStayMessages()))
    .then((n) => { if (n) console.log(`[BookingExpiry] Sent ${n} stay message(s)`); })
    .catch((err) => console.error('[BookingExpiry] failed:', err.message));
  run();
  const timer = setInterval(run, FIVE_MINUTES);
  timer.unref?.();
  return timer;
};
