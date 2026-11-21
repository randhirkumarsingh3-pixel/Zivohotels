/**
 * "Reserve now, pay later" (the booking option stored as PAY_AT_HOTEL): the booking is tentative
 * until the guest pays online. They must pay within `hours` of booking (Admin → Platform Settings
 * → Booking Rules, default 24) and before the check-in day starts (midnight, India time); an
 * unpaid booking is then cancelled and its rooms go back on sale.
 *
 * Pure functions: shared by booking, the expiry job, checkout and unit tests.
 */
export const DEFAULT_PAY_LATER_HOURS = 24;
/** Less time than this to pay, and the option isn't offered (pay now instead) */
export const MIN_PAY_WINDOW_MINUTES = 120;
const IST_OFFSET_MIN = 330;

/** Midnight India time at the start of the check-in day, as a Date. */
export const checkInDayStart = (checkIn) => {
  const d = new Date(checkIn);
  // The calendar day of check-in in India, then that day's 00:00 IST in UTC
  const ist = new Date(d.getTime() + IST_OFFSET_MIN * 60000);
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()) - IST_OFFSET_MIN * 60000);
};

/** Settings from the admin "booking_settings" config: { enabled, hours } */
export const payLaterSettings = (bookingSettings = {}) => {
  const hours = Number(bookingSettings?.expiryHours);
  return {
    enabled: bookingSettings?.payAtHotel !== false,
    hours: Number.isFinite(hours) && hours >= 1 && hours <= 168 ? hours : DEFAULT_PAY_LATER_HOURS,
  };
};

/**
 * The payment deadline for a booking made at `now` for `checkIn`, or null when pay later can't be
 * offered (switched off, or less than 2 hours left before the check-in day).
 */
export const payLaterDeadline = ({ now = new Date(), checkIn, settings }) => {
  if (!settings?.enabled) return null;
  const byHours = new Date(new Date(now).getTime() + settings.hours * 3600000);
  const dayStart = checkInDayStart(checkIn);
  const deadline = byHours < dayStart ? byHours : dayStart;
  return deadline.getTime() - new Date(now).getTime() >= MIN_PAY_WINDOW_MINUTES * 60000 ? deadline : null;
};

/** When to remind the guest: 6 hours before the deadline (or halfway, for short windows). */
export const reminderAt = (createdAt, deadline) => {
  const start = new Date(createdAt).getTime();
  const end = new Date(deadline).getTime();
  return new Date(Math.max(start + (end - start) / 2, end - 6 * 3600000));
};
