import prisma from '../config/db.js';
import { logActivity } from './activityService.js';
import { createNotification } from './notificationService.js';
import settlementService from './finance/settlementService.js';
import { cancelBookingWithRefund, initiatorForRole } from './cancellationService.js';
import { roundMoney, toMoney } from '../utils/money.js';

/**
 * Valid state transitions for OTA bookings.
 */
// COMPLETED is the checked-out state (the extranet's "Check out" sends CHECKED_OUT, an alias).
// A stay can be completed straight from CONFIRMED when nobody recorded the check-in.
const VALID_TRANSITIONS = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['CHECKED_IN', 'COMPLETED', 'NO_SHOW', 'CANCELLED'],
  CHECKED_IN: ['COMPLETED'],
  COMPLETED: [], // Terminal state
  NO_SHOW: [], // Terminal state
  CANCELLED: [] // Terminal state
};

const STATUS_ALIASES = { CHECKED_OUT: 'COMPLETED' };

/**
 * Custom error for invalid transitions.
 */
export class TransitionError extends Error {
  constructor(message) {
    super(message);
    this.name = 'TransitionError';
  }
}

/**
 * Transition a booking to a new state with strict validation and side effects.
 */
export const transitionBookingStatus = async (bookingId, requestedStatus, userId) => {
  const newStatus = STATUS_ALIASES[requestedStatus] || requestedStatus;

  // 1. Fetch booking
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { hotel: true, roomType: true }
  });

  if (!booking) throw new Error('Booking not found');

  const currentStatus = booking.status;

  // 2. Validate transition
  if (!VALID_TRANSITIONS[currentStatus] || !VALID_TRANSITIONS[currentStatus].includes(newStatus)) {
    throw new TransitionError(`Invalid transition from ${currentStatus} to ${newStatus}`);
  }

  // 3. Cancelling goes through the refund flow: a hotel/admin cancellation refunds the guest in
  // full and notifies the owner (the hotel hasn't been paid yet; payouts follow check-out)
  if (newStatus === 'CANCELLED') {
    const actor = userId ? await prisma.user.findUnique({ where: { id: userId }, select: { role: true } }) : null;
    const { booking: cancelled } = await cancelBookingWithRefund({
      bookingId,
      initiatedBy: initiatorForRole(actor?.role || 'OWNER'),
      userId
    });
    await logActivity({
      hotelId: booking.hotelId, userId, action: 'BOOKING_STATUS_CHANGED', entityType: 'Booking',
      entityId: booking.id, before: { status: currentStatus }, after: { status: 'CANCELLED' }
    });
    return cancelled;
  }

  // Other side effects, status change and timeline run in one transaction (below)

  // Append timeline event based on status change
  let eventTitle = 'Booking Status Updated';
  let eventMessage = `Booking status changed to ${newStatus}`;
  
  if (newStatus === 'CONFIRMED') {
    eventTitle = 'Booking Confirmed';
    eventMessage = 'Your stay is confirmed! We look forward to hosting you.';
  } else if (newStatus === 'CANCELLED') {
    eventTitle = 'Booking Cancelled';
    eventMessage = 'Your booking has been cancelled.';
  } else if (newStatus === 'CHECKED_IN') {
    eventTitle = 'Checked In';
    eventMessage = `Welcome! Your check-in at ${booking.hotel?.name || 'the hotel'} is complete.`;
  } else if (newStatus === 'COMPLETED') {
    eventTitle = 'Checked Out';
    eventMessage = 'You have checked out. Safe travels!';
  } else if (newStatus === 'NO_SHOW') {
    eventTitle = 'No Show';
    eventMessage = 'The booking was marked as No Show. Amounts paid online are not refunded.';
  }

  const updatedBooking = await prisma.$transaction(async (tx) => {
    const updated = await tx.booking.update({
      where: { id: bookingId },
      data: { status: newStatus }
    });

    await tx.bookingTimelineEvent.create({
      data: { bookingId, status: newStatus, title: eventTitle, message: eventMessage }
    });

    // Check-out: the hotel's settlement (agreed commission, next payout-cycle date) is created now
    if (newStatus === 'COMPLETED') {
      await settlementService.createForCheckout(tx, updated);
    }

    // No-show: whatever the guest paid online is kept, and the hotel's share is settled
    if (newStatus === 'NO_SHOW') {
      const kept = roundMoney((toMoney(updated.paidAmount) || 0) - (toMoney(updated.refundAmount) || 0));
      await settlementService.createForRetained(tx, updated, 'NO_SHOW', kept);
    }

    return updated;
  });


  // 4. Log Activity & Notifications
  await logActivity({
    hotelId: booking.hotelId,
    userId,
    action: 'BOOKING_STATUS_CHANGED',
    entityType: 'Booking',
    entityId: booking.id,
    before: { status: currentStatus },
    after: { status: newStatus }
  });

  if (newStatus === 'NO_SHOW') {
    await createNotification({
      hotelId: booking.hotelId,
      type: newStatus,
      title: `Booking ${booking.bookingRef} ${newStatus}`,
      message: `Booking for ${booking.guestName} was marked as a no-show. Any amount paid online is kept and settled in your payout cycle.`,
      metadata: { bookingId: booking.id }
    });
  }

  return updatedBooking;
};
