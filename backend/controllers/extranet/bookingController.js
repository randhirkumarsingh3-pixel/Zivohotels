import prisma from '../../config/db.js';
import { transitionBookingStatus, TransitionError } from '../../services/bookingStateMachine.js';
import { eventBus, EVENTS } from '../../services/eventBus.js';

export const getBookings = async (req, res) => {
  try {
    const hotelId = req.scopedHotelId;

    const bookings = await prisma.booking.findMany({
      where: { hotelId },
      include: {
        roomType: { select: { name: true } },
        user: { select: { name: true, email: true, phone: true } }
      },
      orderBy: { createdAt: 'desc' },
      take: 100 // Basic pagination for now
    });

    res.json({ success: true, data: bookings });
  } catch (error) {
    console.error('Error fetching extranet bookings:', error);
    res.status(500).json({ success: false, message: 'Server error fetching bookings' });
  }
};

export const updateBookingStatus = async (req, res) => {
  try {
    const hotelId = req.scopedHotelId;
    const { bookingId } = req.params;
    const { status } = req.body;

    // Verify booking belongs to hotel
    const booking = await prisma.booking.findFirst({
      where: { id: bookingId, hotelId }
    });

    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found or unauthorized' });
    }

    // Use State Machine to transition securely
    const updatedBooking = await transitionBookingStatus(bookingId, status, req.user.id);

    // Broadcast Real-time Event
    eventBus.emitEvent(EVENTS.BOOKING_UPDATED, {
      bookingId: updatedBooking.id,
      bookingRef: updatedBooking.bookingRef,
      hotelId: updatedBooking.hotelId,
      status: updatedBooking.status
    }, { 
      userId: req.user.id, 
      entityId: updatedBooking.id,
      traceId: req.headers['x-trace-id'] || null 
    });

    res.json({ success: true, data: updatedBooking, message: `Booking status updated to ${status}.` });
  } catch (error) {
    if (error instanceof TransitionError) {
      return res.status(400).json({ success: false, message: error.message });
    }
    console.error('Error updating extranet booking:', error);
    res.status(500).json({ success: false, message: 'Server error updating booking status' });
  }
};
