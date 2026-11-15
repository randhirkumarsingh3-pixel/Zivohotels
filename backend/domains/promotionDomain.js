/**
 * Promotion rules (pure: no database). Used by checkout pricing, the hotel page / search display
 * and booking, so a guest is always offered and charged the same discount.
 */

const DAY = 24 * 60 * 60 * 1000;
const toNum = (v) => (v === null || v === undefined ? null : Number(v));
const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };

/** Discount in rupees for a subtotal (pre-tax): % (capped by maxDiscount) or a flat amount. */
export const discountFor = (promotion, subtotal) => {
  const amount = Math.max(0, Number(subtotal) || 0);
  if (!promotion || amount <= 0) return 0;
  const value = toNum(promotion.value) || 0;
  let discount = promotion.discountType === 'FLAT' ? value : (amount * value) / 100;
  const cap = toNum(promotion.maxDiscount);
  if (cap != null && cap > 0) discount = Math.min(discount, cap);
  return Math.round(Math.min(discount, amount));
};

/** Short label for badges: "15% off" or "₹500 off". */
export const promotionLabel = (promotion) =>
  promotion.discountType === 'FLAT'
    ? `₹${Number(promotion.value).toLocaleString('en-IN')} off`
    : `${Number(promotion.value)}% off`;

/** Does the promotion cover this property? Own promotion, or a platform one for all / listed hotels. */
export const coversHotel = (promotion, hotelId) =>
  promotion.hotelId ? promotion.hotelId === hotelId : !(promotion.hotelIds?.length) || promotion.hotelIds.includes(hotelId);

/**
 * Checks the stay against the promotion's conditions (everything except usage limits, which need
 * the database). ctx: { hotelId, roomTypeId, ratePlanId, checkIn, checkOut, subtotal, now }.
 * Returns { ok: true } or { ok: false, reason } with a message the guest can read.
 */
export const checkEligibility = (promotion, ctx) => {
  const now = ctx.now ? new Date(ctx.now) : new Date();
  const checkIn = startOfDay(ctx.checkIn);
  const checkOut = startOfDay(ctx.checkOut);
  const nights = Math.round((checkOut - checkIn) / DAY);
  const lastNight = new Date(checkOut.getTime() - DAY);
  const fmt = (d) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

  if (!promotion.isActive) return { ok: false, reason: 'This offer is no longer available' };
  if (!coversHotel(promotion, ctx.hotelId)) return { ok: false, reason: 'This code isn\'t valid for this hotel' };
  if (promotion.roomTypeIds?.length && !promotion.roomTypeIds.includes(ctx.roomTypeId)) return { ok: false, reason: 'This offer isn\'t valid for the selected room' };
  if (promotion.ratePlanIds?.length && !promotion.ratePlanIds.includes(ctx.ratePlanId)) return { ok: false, reason: 'This offer isn\'t valid for the selected rate plan' };
  if (promotion.bookStart && now < startOfDay(promotion.bookStart)) return { ok: false, reason: `This offer can be booked from ${fmt(promotion.bookStart)}` };
  if (promotion.bookEnd && now >= new Date(startOfDay(promotion.bookEnd).getTime() + DAY)) return { ok: false, reason: 'This offer has ended' };
  if (promotion.stayStart && checkIn < startOfDay(promotion.stayStart)) return { ok: false, reason: `This offer is for stays from ${fmt(promotion.stayStart)}` };
  if (promotion.stayEnd && lastNight > startOfDay(promotion.stayEnd)) return { ok: false, reason: `This offer is for stays until ${fmt(promotion.stayEnd)}` };
  if (nights < (promotion.minNights || 1)) return { ok: false, reason: `This offer needs a stay of at least ${promotion.minNights} nights` };
  const advance = Math.round((checkIn - startOfDay(now)) / DAY);
  if (promotion.minAdvanceDays != null && advance < promotion.minAdvanceDays) return { ok: false, reason: `Book at least ${promotion.minAdvanceDays} days before check-in for this offer` };
  if (promotion.maxAdvanceDays != null && advance > promotion.maxAdvanceDays) return { ok: false, reason: `This offer is for stays within ${promotion.maxAdvanceDays} days of booking` };
  const min = toNum(promotion.minBookingAmount);
  if (min != null && ctx.subtotal != null && Number(ctx.subtotal) < min) return { ok: false, reason: `This offer needs a booking of at least ₹${min.toLocaleString('en-IN')} before tax` };
  return { ok: true };
};

export default { discountFor, promotionLabel, coversHotel, checkEligibility };
