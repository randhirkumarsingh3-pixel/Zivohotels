/**
 * Booking references: ZIVO- plus 8 characters from a set without look-alikes (no 0/O, 1/I/L),
 * e.g. ZIVO-7KQ3MX9P. About a trillion combinations, so references don't collide and can't be
 * guessed (they were 6 random digits: duplicates after about a thousand bookings).
 */
import crypto from 'crypto';

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export const newBookingRef = () =>
  `ZIVO-${Array.from({ length: 8 }, () => ALPHABET[crypto.randomInt(ALPHABET.length)]).join('')}`;

/** A reference not used yet (checked against the database; a clash is practically impossible). */
export const uniqueBookingRef = async (db) => {
  for (let i = 0; i < 5; i += 1) {
    const ref = newBookingRef();
    if (!(await db.booking.findUnique({ where: { bookingRef: ref }, select: { id: true } }))) return ref;
  }
  throw new Error('Could not create a booking reference. Please try again.');
};
