/**
 * The rooms of a booking for vouchers, emails, invoices and booking screens: each room's type,
 * plan, guests and lead guest. Bookings made before rooms were stored one by one have no rows;
 * their rooms are all booking.rooms × its room type.
 */
import prisma from '../config/db.js';

export const loadBookingRooms = (bookingId) => prisma.bookingRoom.findMany({
  where: { bookingId },
  orderBy: { roomNumber: 'asc' },
  include: { roomType: { select: { name: true } }, ratePlan: { select: { name: true, mealPlan: true } } },
});

/** Prisma include for a booking's rooms (lists of bookings) */
export const BOOKING_ROOMS_INCLUDE = {
  bookingRooms: {
    orderBy: { roomNumber: 'asc' },
    select: {
      roomNumber: true, adults: true, children: true, guestName: true, subtotal: true,
      roomTypeId: true, ratePlanId: true,
      roomType: { select: { name: true } }, ratePlan: { select: { name: true, mealPlan: true } },
    },
  },
};

export const guestsLabel = (adults, children) => [
  `${adults} adult${adults === 1 ? '' : 's'}`,
  children ? `${children} child${children === 1 ? '' : 'ren'}` : null,
].filter(Boolean).join(', ');

/** "2 × Premium Suite, 1 × Standard Room" */
export const roomsSummary = (rows, booking, roomTypeName) => {
  if (!rows?.length) return `${booking.rooms} × ${roomTypeName || 'Room'}`;
  const counts = new Map();
  for (const r of rows) counts.set(r.roomType?.name || 'Room', (counts.get(r.roomType?.name || 'Room') || 0) + 1);
  return [...counts.entries()].map(([name, n]) => `${n} × ${name}`).join(', ');
};
