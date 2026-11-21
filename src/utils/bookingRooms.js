/**
 * The rooms of a booking for booking screens. booking.bookingRooms lists each room (type, plan,
 * guests, lead guest); bookings made before rooms were stored one by one only have
 * booking.rooms × booking.roomType.
 */
export const bookingRoomsOf = (b) => b?.bookingRooms || [];

/** "2 × Premium Suite, 1 × Standard Room", or "Deluxe × 2" for older bookings */
/** Rooms still part of the stay (one room can be cancelled on its own) */
export const activeRoomsOf = (b) => bookingRoomsOf(b).filter((r) => !r.cancelledAt);

export const roomsText = (b) => {
  const rows = bookingRoomsOf(b).length ? activeRoomsOf(b) : [];
  if (!rows.length) {
    const name = typeof b?.roomType === 'string' ? b.roomType : b?.roomType?.name || 'Room';
    return `${name}${b?.rooms > 1 ? ` × ${b.rooms}` : ''}`;
  }
  const counts = new Map();
  rows.forEach((r) => counts.set(r.roomType?.name || 'Room', (counts.get(r.roomType?.name || 'Room') || 0) + 1));
  if (counts.size === 1) { const [[name, n]] = [...counts.entries()]; return `${name}${n > 1 ? ` × ${n}` : ''}`; }
  return [...counts.entries()].map(([name, n]) => `${n} × ${name}`).join(', ');
};

export const roomGuests = (r) => [
  `${r.adults} adult${r.adults === 1 ? '' : 's'}`,
  r.children ? `${r.children} child${r.children === 1 ? '' : 'ren'}` : null,
].filter(Boolean).join(', ');

/** One line per room: "Room 2 · Standard Room · Room Only · 1 adult, 1 child · Vikram Rao" */
export const roomLines = (b) => bookingRoomsOf(b).map((r) =>
  [`Room ${r.roomNumber}`, r.roomType?.name, r.ratePlan?.name, roomGuests(r), r.guestName].filter(Boolean).join(' · '));
