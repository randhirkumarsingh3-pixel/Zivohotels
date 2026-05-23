/**
 * bookingSchema.js
 * Server-side validation schema for POST /api/v1/bookings.
 * Never trust the frontend.
 */

const today = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

export const bookingSchema = {
  hotelId: (v) => (!v || typeof v !== 'string' ? 'hotelId is required' : null),

  roomTypeId: (v) => (!v || typeof v !== 'string' ? 'roomTypeId is required' : null),

  guestName: (v) =>
    (!v || v.trim().length < 2 ? 'Guest name must be at least 2 characters' : null),

  guestEmail: (v) => {
    if (!v) return 'Guest email is required';
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(v) ? null : 'Invalid email format';
  },

  guestPhone: (v) => {
    if (!v) return 'Guest phone is required';
    // Accepts: +91-9876543210, 9876543210, +919876543210 (10 digits min)
    const phoneRegex = /^\+?[\d\s\-]{10,15}$/;
    return phoneRegex.test(v) ? null : 'Invalid phone number (min 10 digits)';
  },

  checkIn: (v) => {
    if (!v) return 'checkIn date is required';
    const date = new Date(v);
    if (isNaN(date)) return 'checkIn must be a valid date';
    if (date < today()) return 'checkIn cannot be in the past';
    return null;
  },

  checkOut: (v, body) => {
    if (!v) return 'checkOut date is required';
    const date = new Date(v);
    if (isNaN(date)) return 'checkOut must be a valid date';
    if (body.checkIn) {
      const checkInDate = new Date(body.checkIn);
      if (date <= checkInDate) return 'checkOut must be after checkIn';
    }
    return null;
  },

  guests: (v) => {
    const n = parseInt(v);
    if (isNaN(n) || n < 1) return 'guests must be at least 1';
    if (n > 20) return 'guests cannot exceed 20';
    return null;
  },

  rooms: (v) => {
    const n = parseInt(v);
    if (isNaN(n) || n < 1) return 'rooms must be at least 1';
    if (n > 50) return 'rooms cannot exceed 50 per booking';
    return null;
  },

  paymentType: (v) => {
    const allowed = ['PREPAID', 'PARTIAL', 'PAY_AT_HOTEL'];
    return !v || !allowed.includes(v)
      ? `paymentType must be one of: ${allowed.join(', ')}`
      : null;
  },
};
