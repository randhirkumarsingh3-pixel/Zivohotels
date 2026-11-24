/**
 * A booking's price, laid out the same way on every guest document (invoice, voucher, email):
 * each room's charges, extras, each discount by name, the taxable value, GST and the total.
 * Pure: works on the stored booking (and its rooms), so documents always match checkout.
 */
import { toMoney, roundMoney } from '../../utils/money.js';

const m = (v) => toMoney(v) || 0;
export const MEAL = { NONE: 'Room only', EP: 'Room only', CP: 'Breakfast included', MAP: 'Breakfast and one meal', AP: 'All meals included' };

const IST_MS = 330 * 60 * 1000;
const indiaDay = (d) => new Date(new Date(d).getTime() + IST_MS).toISOString().slice(0, 10);
export const nightsOf = (b) => (b.stayType === 'HOURLY' ? 0 : Math.max(1, Math.round((new Date(indiaDay(b.checkOut)) - new Date(indiaDay(b.checkIn))) / 86400000)));

/** Each discount on the booking with its name: offer, member price, Zivo Rewards, pay-now. */
export const discountLines = (booking) => {
  const meta = booking.metadata || {};
  const total = m(meta.discountAmount);
  const out = [];
  const promo = meta.promotion; const promoAmt = m(promo?.discountAmount);
  if (promoAmt) out.push([`Offer: ${promo.name}${promo.code ? ` (${promo.code})` : ''}`, promoAmt]);
  const mem = meta.membership; const memAmt = roundMoney(m(mem?.hotelDiscount) + m(mem?.zivoDiscount));
  if (memAmt) out.push([`${mem.plan || 'Member'} price (signed in)`, memAmt]);
  const pts = meta.loyalty; const ptsAmt = m(pts?.discountAmount);
  if (ptsAmt) out.push([`Zivo Rewards (${Number(pts.pointsRedeemed || 0).toLocaleString('en-IN')} points)`, ptsAmt]);
  const rest = roundMoney(total - promoAmt - memAmt - ptsAmt);
  if (rest > 0.004) out.push([meta.prepaidDiscountAmount ? 'Pay-now discount' : 'Discount', rest]);
  return out;
};

/**
 * Lines and totals. rooms: the booking's BookingRoom rows (may be empty for old bookings).
 * Returns { lines: [{ label, detail, qty, amount }], extras, discounts, discountTotal, taxable,
 * tax, taxPct, total, paid, due, refunded }.
 */
export const bookingFigures = (booking, rooms = [], { roomTypeName = 'Room', ratePlan = null } = {}) => {
  const nights = nightsOf(booking);
  const hourly = booking.stayType === 'HOURLY';
  const active = rooms.filter((r) => !r.cancelledAt);
  const extras = roundMoney(m(booking.extraGuestCharges) + m(booking.extraBedCharges) + m(booking.mealCharges));
  const discounts = discountLines(booking);
  const discountTotal = roundMoney(discounts.reduce((t, [, v]) => t + v, 0));
  const taxable = m(booking.baseAmount);
  const tax = m(booking.taxAmount);
  const total = m(booking.totalAmount);
  // Room charges before discounts = taxable + discounts − extras (exactly what checkout charged)
  const roomCharges = roundMoney(Math.max(0, taxable + discountTotal - extras));
  const stayText = hourly ? `${booking.hours || ''} hour${booking.hours === 1 ? '' : 's'}` : `${nights} night${nights === 1 ? '' : 's'}`;

  let lines;
  const sumRoomPrices = active.reduce((t, r) => t + m(r.roomPrice || r.subtotal), 0);
  if (active.length > 1 && sumRoomPrices > 0) {
    // Split the room charges over the rooms by their own price, last room takes the rounding
    let left = roomCharges;
    lines = active.map((r, i) => {
      const share = i === active.length - 1 ? roundMoney(left) : roundMoney((roomCharges * m(r.roomPrice || r.subtotal)) / sumRoomPrices);
      left -= share;
      return { label: `Room ${r.roomNumber}: ${r.roomType?.name || roomTypeName}`, detail: `${r.ratePlan?.name || 'Standard rate'} · ${MEAL[r.ratePlan?.mealPlan] || 'Room only'} · ${stayText}`, amount: share };
    });
  } else {
    const r = active[0];
    lines = [{
      label: `${booking.rooms > 1 ? `${booking.rooms} × ` : ''}${r?.roomType?.name || roomTypeName}`,
      detail: hourly ? `Hourly stay · ${stayText}` : `${r?.ratePlan?.name || ratePlan?.name || 'Standard rate'} · ${MEAL[r?.ratePlan?.mealPlan || ratePlan?.mealPlan] || 'Room only'} · ${stayText}`,
      amount: roomCharges,
    }];
  }
  if (extras) lines.push({ label: 'Extra guest, bed and meal charges', detail: '', amount: extras });

  const paid = m(booking.paidAmount);
  const refunded = m(booking.refundAmount);
  const cancelled = ['CANCELLED', 'NO_SHOW'].includes(booking.status);
  return {
    nights, hourly, lines, extras, roomCharges, discounts, discountTotal, taxable, tax, total, paid, refunded,
    taxPct: booking.metadata?.taxPercentage ?? (taxable ? Math.round((tax / taxable) * 1000) / 10 : null),
    due: cancelled ? 0 : roundMoney(Math.max(0, total - paid)),
  };
};

export default { bookingFigures, discountLines, nightsOf, MEAL };
