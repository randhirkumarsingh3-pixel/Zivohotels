/**
 * How a booking's stay reads: nights for nightly stays, the time slot for hourly ones.
 * "Thu, 10 Dec · 11:00 am – 2:00 pm · 3 hours" / "10 Dec – 12 Dec · 2 nights"
 */
const IST = { timeZone: 'Asia/Kolkata' };
export const isHourly = (b) => b?.stayType === 'HOURLY';
const time = (d) => new Date(d).toLocaleTimeString('en-IN', { ...IST, hour: 'numeric', minute: '2-digit' });
const day = (d, opts = {}) => new Date(d).toLocaleDateString('en-IN', { ...IST, day: 'numeric', month: 'short', ...opts });

export const slotText = (b) => `${day(b.slotStart || b.checkIn, { weekday: 'short' })} · ${time(b.slotStart || b.checkIn)} – ${time(b.slotEnd || b.checkOut)} · ${b.hours} hour${b.hours === 1 ? '' : 's'}`;

export const nightsOf = (b) => Math.max(1, Math.round((new Date(b.checkOut) - new Date(b.checkIn)) / 86400000));

export const stayText = (b) => (isHourly(b)
  ? slotText(b)
  : `${day(b.checkIn)} – ${day(b.checkOut, { year: 'numeric' })} · ${nightsOf(b)} night${nightsOf(b) === 1 ? '' : 's'}`);

/** Short length: "3 hours" / "2 nights" */
export const lengthText = (b) => (isHourly(b) ? `${b.hours} hour${b.hours === 1 ? '' : 's'}` : `${nightsOf(b)} night${nightsOf(b) === 1 ? '' : 's'}`);

/** Can this hourly stay still get more hours? (confirmed, paid, not ended) */
export const canAddHours = (b) => b?.stayType === 'HOURLY' && ['CONFIRMED', 'CHECKED_IN'].includes(b.status)
  && b.paymentStatus === 'PAID' && Boolean(b.slotEnd) && new Date(b.slotEnd) > new Date();
