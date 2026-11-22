/**
 * Hourly stays: the rules, with no database access (unit tested).
 *
 * A guest books a room for a slot on one day: a start time and a duration the hotel offers
 * (3, 6, 9 or 12 hours). Each room type sets aside a number of rooms for hourly use per day;
 * slots that overlap in time (each followed by the hotel's cleaning time) may never need more
 * rooms than that. Night bookings use their own rooms and are never touched.
 *
 * Times are India time (UTC+05:30, no daylight saving). Slots stay inside the hotel's hourly
 * opening hours on one day (no overnight slots).
 */

export const ALL_DURATIONS = [3, 6, 9, 12];

/** ZivoPlus' own rules (Admin → Platform settings → Hourly stays). */
export const platformHourly = (saved = {}) => {
  const durations = (Array.isArray(saved.durations) ? saved.durations : ALL_DURATIONS)
    .map(Number).filter((d) => ALL_DURATIONS.includes(d));
  return {
    enabled: saved.enabled !== false,
    durations: durations.length ? durations : ALL_DURATIONS,
    maxHours: Math.min(12, Math.max(3, Number(saved.maxHours) || 12)),
    commissionPercent: saved.commissionPercent === null || saved.commissionPercent === undefined || saved.commissionPercent === '' ? null : Math.max(0, Math.min(50, Number(saved.commissionPercent) || 0)),
    defaultFreeCancelHours: Math.max(0, Math.min(48, Number(saved.defaultFreeCancelHours ?? 2))),
  };
};

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;
export const toMinutes = (hhmm) => {
  const m = HHMM.exec(String(hhmm || ''));
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};
export const fromMinutes = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

/** A hotel's hourly settings, filled with defaults and limited to what ZivoPlus allows. */
export const hotelHourly = (saved = {}, platform = platformHourly()) => {
  const s = saved || {};
  const openFrom = toMinutes(s.openFrom) ?? 8 * 60;
  let openTo = toMinutes(s.openTo) ?? 21 * 60;
  if (openTo <= openFrom) openTo = Math.min(24 * 60 - 1, openFrom + 12 * 60);
  const wanted = (Array.isArray(s.durations) ? s.durations : [3, 6]).map(Number);
  const durations = wanted.filter((d) => platform.durations.includes(d) && d <= platform.maxHours && d * 60 <= openTo - openFrom).sort((a, b) => a - b);
  return {
    enabled: Boolean(s.enabled),
    approved: Boolean(s.approved),
    openFrom: fromMinutes(openFrom),
    openTo: fromMinutes(openTo),
    durations,
    cleaningMinutes: Math.max(0, Math.min(180, Number(s.cleaningMinutes ?? 30))),
    leadMinutes: Math.max(0, Math.min(24 * 60, Number(s.leadMinutes ?? 60))),
    freeCancelHours: Math.max(0, Math.min(48, Number(s.freeCancelHours ?? platform.defaultFreeCancelHours))),
    extraHourPrice: Math.max(0, Number(s.extraHourPrice) || 0),
    allowOffers: Boolean(s.allowOffers),
  };
};

/** Guests can book hourly stays here: the hotel switched it on, ZivoPlus approved it, and it's on platform-wide. */
export const isBookable = (settings, platform) => Boolean(platform.enabled && settings.enabled && settings.approved && settings.durations.length);

/** India time on a date: ("2026-12-10", "11:00") -> Date (UTC instant). */
export const istDate = (ymd, hhmm) => new Date(`${ymd}T${hhmm}:00+05:30`);
/** The India-time date of an instant: "2026-12-10". */
export const istYmd = (d) => new Date(new Date(d).getTime() + 330 * 60000).toISOString().slice(0, 10);
export const istHhmm = (d) => new Date(new Date(d).getTime() + 330 * 60000).toISOString().slice(11, 16);

const isYmd = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) && !Number.isNaN(new Date(`${v}T00:00:00Z`).getTime());

/**
 * Checks a requested slot against the hotel's settings. Returns { ok, start, end, error }.
 * Start times are on the half hour; the slot must end by closing time; at least leadMinutes ahead.
 */
export const checkSlot = ({ date, start, hours }, settings, now = new Date()) => {
  const h = Number(hours);
  if (!isYmd(date)) return { ok: false, error: 'Choose a date.' };
  const startMin = toMinutes(start);
  if (startMin === null || startMin % 30 !== 0) return { ok: false, error: 'Choose a start time.' };
  if (!settings.durations.includes(h)) return { ok: false, error: `This hotel offers ${settings.durations.join(', ')}-hour stays.` };
  if (startMin < toMinutes(settings.openFrom)) return { ok: false, error: `Hourly stays start from ${settings.openFrom}.` };
  if (startMin + h * 60 > toMinutes(settings.openTo)) return { ok: false, error: `A ${h}-hour stay must end by ${settings.openTo}. Choose an earlier start.` };
  const startAt = istDate(date, fromMinutes(startMin));
  if (startAt.getTime() < now.getTime() + settings.leadMinutes * 60000) {
    return { ok: false, error: settings.leadMinutes ? `Book at least ${settings.leadMinutes >= 60 ? `${settings.leadMinutes / 60} hour${settings.leadMinutes === 60 ? '' : 's'}` : `${settings.leadMinutes} minutes`} before the start.` : 'This time has passed.' };
  }
  return { ok: true, start: startAt, end: new Date(startAt.getTime() + h * 3600000) };
};

/** Start times that can still be booked on a date for a duration (every 30 minutes). */
export const startTimes = (date, hours, settings, now = new Date()) => {
  const out = [];
  const from = toMinutes(settings.openFrom);
  const to = toMinutes(settings.openTo) - Number(hours) * 60;
  for (let m = Math.ceil(from / 30) * 30; m <= to; m += 30) {
    if (checkSlot({ date, start: fromMinutes(m), hours }, settings, now).ok) out.push(fromMinutes(m));
  }
  return out;
};

/**
 * Most rooms in use at the same moment if a new slot is added to the existing ones. Each slot
 * holds its room until its end plus the cleaning time. Interval scheduling: the rooms needed equal
 * the largest number of slots overlapping at one moment.
 */
export const roomsNeeded = (existing, slot, cleaningMinutes = 0) => {
  const pad = cleaningMinutes * 60000;
  const t = (d) => new Date(d).getTime();
  const s = t(slot.start);
  const e = t(slot.end) + pad;
  const relevant = existing.map((x) => [t(x.start), t(x.end) + pad]).filter(([a, b]) => a < e && s < b);
  const events = [[s, 1], [e, -1], ...relevant.flatMap(([a, b]) => [[a, 1], [b, -1]])]
    .sort((p, q) => p[0] - q[0] || p[1] - q[1]); // an end before a start at the same instant
  let cur = 0;
  let max = 0;
  for (const [, d] of events) { cur += d; max = Math.max(max, cur); }
  return max;
};

/** Price of a duration for a room type (pre-GST), or null if the hotel set none. */
export const hourlyPrice = (roomType, hours) => {
  const p = Number(roomType?.hourlyPrices?.[String(hours)]);
  return p > 0 ? Math.round(p) : null;
};

/** GST slab for an hourly stay: the slab of its price (as a day's tariff). */
export const gstPercent = (amount, taxRules = []) => {
  const rule = taxRules.find((r) => (r.maxThreshold !== null && r.maxThreshold !== undefined
    ? amount >= r.minThreshold && amount <= r.maxThreshold
    : amount > r.minThreshold));
  if (rule) return Number(rule.percentage);
  return amount <= 7500 ? 5 : 18;
};

/**
 * The price of an hourly stay: room price, member discounts (hotel's member % and the plan's
 * extra, as for nights), GST. Offers are not applied to hourly stays unless the hotel allows them
 * (not yet supported, so none). Returns the breakdown stored on the booking.
 */
/**
 * Price of an hourly stay: the room's price for those hours, less an offer (promotion), less the
 * member price (worked out on the price after the offer, as for nights), plus GST on the rest.
 */
export const priceHourly = ({ price, promotionDiscount = 0, memberHotel = 0, memberZivo = 0, taxRules = [] }) => {
  const promo = Math.min(price, Math.max(0, Math.round(promotionDiscount)));
  const member = Math.min(price - promo, Math.round(memberHotel + memberZivo));
  const base = price - promo - member;
  const taxPercentage = gstPercent(base, taxRules);
  const taxAmount = Math.round((base * taxPercentage) / 100);
  return { roomPrice: price, promotionDiscountAmount: promo, memberDiscountAmount: member, baseAmount: base, taxPercentage, taxAmount, totalAmount: base + taxAmount };
};

/** Refund if an hourly stay is cancelled now: all of it until freeCancelHours before the start, nothing after. */
export const hourlyRefund = ({ slotStart, paidAmount, freeCancelHours }, now = new Date()) => {
  const free = new Date(slotStart).getTime() - now.getTime() >= freeCancelHours * 3600000;
  return { refundAmount: free ? Math.round(Number(paidAmount) || 0) : 0, free };
};

/** "Sat 22 Nov · 11:00 AM – 2:00 PM · 3 hours" */
export const slotLabel = (start, end, hours) => {
  const opts = { timeZone: 'Asia/Kolkata' };
  const day = new Date(start).toLocaleDateString('en-IN', { ...opts, weekday: 'short', day: 'numeric', month: 'short' });
  const tm = (d) => new Date(d).toLocaleTimeString('en-IN', { ...opts, hour: 'numeric', minute: '2-digit' });
  return `${day} · ${tm(start)} – ${tm(end)} · ${hours} hour${hours === 1 ? '' : 's'}`;
};

/**
 * Adding hours to a booked hourly stay: each extra hour at the hotel's extra-hour price (before
 * GST; offers and member prices aren't applied to it). GST is worked out again on the whole stay,
 * so the guest pays the new total less what they paid. Returns null if the hotel has no
 * extra-hour price.
 */
export const extensionPrice = ({ baseAmount, taxAmount, totalAmount }, extraHours, extraHourPrice, taxRules = []) => {
  const perHour = Math.max(0, Math.round(Number(extraHourPrice) || 0));
  if (!perHour || !(extraHours > 0)) return null;
  const extraBase = perHour * extraHours;
  const newBase = Math.round(Number(baseAmount) || 0) + extraBase;
  const taxPercentage = gstPercent(newBase, taxRules);
  const newTax = Math.round((newBase * taxPercentage) / 100);
  const newTotal = newBase + newTax;
  const paidTotal = Math.round(Number(totalAmount) || 0);
  return { perHour, extraHours, extraBase, newBase, taxPercentage, newTax, newTotal, extraTax: newTax - Math.round(Number(taxAmount) || 0), extraAmount: newTotal - paidTotal };
};
