/**
 * Reserve now, pay later: the payment deadline shown at checkout. Same rules as the server
 * (backend/domains/payLater.js), which decides the real deadline when the booking is made.
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

