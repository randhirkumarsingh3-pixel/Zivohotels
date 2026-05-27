import prisma from '../config/db.js';
import { logActivity } from './activityService.js';
import { createNotification } from './notificationService.js';

/**
 * Valid state transitions for OTA bookings.
 */
const VALID_TRANSITIONS = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['CHECKED_IN', 'NO_SHOW', 'CANCELLED'],
  CHECKED_IN: ['CHECKED_OUT'],
  CHECKED_OUT: [], // Terminal state
  NO_SHOW: [], // Terminal state
  CANCELLED: [] // Terminal state
};

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
export const transitionBookingStatus = async (bookingId, newStatus, userId) => {
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

  // 3. Perform Side Effects based on newStatus
  const transactionOps = [];

  // If cancelling, we need to release inventory
  if (newStatus === 'CANCELLED') {
    // Release inventory logic: find inventory records for dates and decrement bookedRooms
    const checkInDate = new Date(booking.checkIn);
    const checkOutDate = new Date(booking.checkOut);
    
    // We update inventory inside a transaction
    transactionOps.push(
      prisma.$executeRaw`
        UPDATE "Inventory" 
        SET "bookedRooms" = GREATEST("bookedRooms" - ${booking.rooms}, 0) 
        WHERE "roomTypeId" = ${booking.roomTypeId} 
        AND "date" >= ${checkInDate} 
        AND "date" < ${checkOutDate}
      `
    );
  }

  // Update booking status
  const updateOp = prisma.booking.update({
    where: { id: bookingId },
    data: { status: newStatus }
  });
  transactionOps.push(updateOp);

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
  } else if (newStatus === 'CHECKED_OUT') {
    eventTitle = 'Checked Out';
    eventMessage = 'You have checked out. Safe travels!';
  } else if (newStatus === 'NO_SHOW') {
    eventTitle = 'No Show';
    eventMessage = 'The booking was marked as No Show.';
  }

  transactionOps.push(
    prisma.bookingTimelineEvent.create({
      data: {
        bookingId,
        status: newStatus,
        title: eventTitle,
        message: eventMessage
      }
    })
  );

  // Execute transaction safely and extract the updated booking object
  const transactionResults = await prisma.$transaction(transactionOps);
  const updatedBooking = transactionResults[transactionOps.indexOf(updateOp)];


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

  if (['CANCELLED', 'NO_SHOW'].includes(newStatus)) {
    await createNotification({
      hotelId: booking.hotelId,
      type: newStatus,
      title: `Booking ${booking.bookingRef} ${newStatus}`,
      message: `Booking for ${booking.guestName} was marked as ${newStatus}. Inventory updated.`,
      metadata: { bookingId: booking.id }
    });
  }

  return updatedBooking;
};
