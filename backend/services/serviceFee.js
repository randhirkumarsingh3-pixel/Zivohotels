/**
 * ZivoPlus's service fee on a guest's booking (Admin → Finance → Service fee). Off by default.
 *
 *  - Its own charge, next to the accommodation: the booking's totalAmount (and with it the hotel's
 *    settlement, commission, the hotel's figures and its GST invoice) never includes it. The fee is
 *    kept on the booking (metadata.serviceFee*) as it was quoted.
 *  - Entered including GST (SAC 998552, reservation service); ZivoPlus's facilitator tax invoice
 *    shows it with its GST. So it is offered only while the hotel issues the stay's GST invoice
 *    (Documents & emails → "The hotel issues it"), when that invoice exists.
 *  - Website bookings paid online (in full, or the part-payment): charged with the first payment.
 *    Not on pay-at-hotel stays, business or travel-agent bookings, or hours added later.
 *  - Shown wherever a price to pay is shown (no adding it at the last step).
 *  - Refunded when the hotel or ZivoPlus cancels; when the guest cancels, only if the setting
 *    says so.
 */
import prisma from '../config/db.js';
import { getDocumentSettings, invoiceModeFor } from './documents/documentSettings.js';

const KEY = 'service_fee';
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const fail = (m) => Object.assign(new Error(m), { statusCode: 400 });

export const DEFAULTS = () => ({
  enabled: false,
  /** PERCENT of the accommodation total, or a FLAT amount per booking; both include GST */
  type: 'PERCENT',
  value: 0,
  /** PERCENT only: no more than this per booking (null: no cap) */
  maxAmount: null,
  gstPct: 18,
  /** When the guest cancels: refund the fee too? (always refunded when the hotel or ZivoPlus cancels) */
  refundOnGuestCancel: false,
});

let cache = null; let cachedAt = 0;
export const getServiceFeeSettings = async () => {
  if (cache && Date.now() - cachedAt < 10000) return cache;
  const row = await prisma.systemConfig.findUnique({ where: { key: KEY } }).catch(() => null);
  cache = { ...DEFAULTS(), ...(row?.value || {}) };
  cachedAt = Date.now();
  return cache;
};

export const saveServiceFeeSettings = async (input = {}, userId = null) => {
  const cur = await getServiceFeeSettings();
  const next = { ...cur };
  if (input.enabled !== undefined) next.enabled = Boolean(input.enabled);
  if (input.type !== undefined) {
    if (!['PERCENT', 'FLAT'].includes(input.type)) throw fail('Choose a percentage or a fixed amount.');
    next.type = input.type;
  }
  if (input.value !== undefined) next.value = Number(input.value);
  if (input.maxAmount !== undefined) next.maxAmount = input.maxAmount === null || input.maxAmount === '' ? null : Number(input.maxAmount);
  if (input.gstPct !== undefined) next.gstPct = Number(input.gstPct);
  if (input.refundOnGuestCancel !== undefined) next.refundOnGuestCancel = Boolean(input.refundOnGuestCancel);
  if (!(next.value >= 0)) throw fail('The fee can\'t be negative.');
  if (next.type === 'PERCENT' && next.value > 20) throw fail('A percentage fee can be at most 20%.');
  if (next.type === 'FLAT' && next.value > 5000) throw fail('A fixed fee can be at most ₹5,000 per booking.');
  if (next.maxAmount !== null && !(next.maxAmount > 0)) throw fail('The cap must be more than ₹0, or empty for none.');
  if (![0, 5, 12, 18, 28].includes(next.gstPct)) throw fail('GST on the fee is 0, 5, 12, 18 or 28% (18% for reservation services).');
  if (next.enabled && !(next.value > 0)) throw fail('Set the fee before turning it on.');
  if (next.enabled) {
    const docs = await getDocumentSettings();
    if (docs.guestInvoice.mode !== 'HOTEL_ISSUES') throw fail('The fee needs ZivoPlus\'s facilitator invoice: set Documents & emails → guest invoices to "The hotel issues it" first.');
  }
  next.value = r2(next.value);
  if (next.maxAmount !== null) next.maxAmount = r2(next.maxAmount);
  await prisma.systemConfig.upsert({ where: { key: KEY }, create: { key: KEY, value: next }, update: { value: next } });
  await prisma.auditLog.create({ data: { action: 'SERVICE_FEE_UPDATED', entityType: 'SYSTEM', entityId: KEY, userId: userId || 'SYSTEM', details: { before: cur, after: next } } }).catch(() => {});
  cache = null;
  return next;
};

/** The fee on an amount, GST included and split out: { amount, tax, gstPct } (amount 0: none). */
export const feeOn = (total, s) => {
  if (!s?.enabled || !(s.value > 0) || !(Number(total) > 0)) return { amount: 0, tax: 0, gstPct: s?.gstPct ?? 18 };
  let amount = s.type === 'FLAT' ? s.value : (Number(total) * s.value) / 100;
  if (s.type === 'PERCENT' && s.maxAmount) amount = Math.min(amount, s.maxAmount);
  amount = Math.round(amount); // whole rupees, like the room prices
  const tax = r2(amount - amount / (1 + s.gstPct / 100));
  return { amount, tax, gstPct: s.gstPct };
};

/**
 * The fee for a website booking about to be made (or previewed), or 0 when it doesn't apply.
 * booking: { totalAmount, paymentType, business (truthy for business / agency), guestCompanyGstin }.
 */
export const feeForBooking = async ({ totalAmount, paymentType, business = false, guestCompanyGstin = null }) => {
  const s = await getServiceFeeSettings();
  if (!s.enabled || business || paymentType === 'PAY_AT_HOTEL') return feeOn(0, s);
  if (invoiceModeFor({ guestCompanyGstin }, await getDocumentSettings()) !== 'HOTEL_ISSUES') return feeOn(0, s);
  return feeOn(totalAmount, s);
};

/** For the price shown before checkout (search, hotel page): what the fee would be. */
export const publicFeeInfo = async () => {
  const s = await getServiceFeeSettings();
  if (!s.enabled || !(s.value > 0)) return null;
  const docs = await getDocumentSettings();
  if (docs.guestInvoice.mode !== 'HOTEL_ISSUES') return null;
  return { type: s.type, value: s.value, maxAmount: s.maxAmount, gstPct: s.gstPct, refundOnGuestCancel: s.refundOnGuestCancel };
};

/** The fee on a booking, as recorded: { amount, tax, gstPct, paid, refunded }. */
export const feeOf = (booking) => {
  const m = booking?.metadata || {};
  return {
    amount: r2(m.serviceFee || 0), tax: r2(m.serviceFeeTax || 0), gstPct: Number(m.serviceFeeGstPct ?? 18),
    paid: Boolean(m.serviceFeePaid), refunded: r2(m.serviceFeeRefunded || 0),
    refundOnGuestCancel: Boolean(m.serviceFeeRefundOnGuestCancel),
  };
};

/** Fee still to be charged with the next online payment (only the first one carries it). */
export const feeDueNow = (booking) => { const f = feeOf(booking); return f.amount > 0 && !f.paid ? f.amount : 0; };

/** Fee to refund when the booking is cancelled now. */
export const feeRefundOnCancel = (booking, initiatedBy) => {
  const f = feeOf(booking);
  if (!(f.amount > 0) || !f.paid || f.refunded > 0) return 0;
  if (initiatedBy === 'GUEST' && !f.refundOnGuestCancel) return 0;
  return f.amount;
};

/** metadata fields recording the fee on a new booking. */
export const feeMetadata = (fee, s) => (fee.amount > 0 ? {
  serviceFee: fee.amount, serviceFeeTax: fee.tax, serviceFeeGstPct: fee.gstPct, serviceFeePaid: false,
  serviceFeeRefundOnGuestCancel: Boolean(s?.refundOnGuestCancel),
} : {});

export default { getServiceFeeSettings, saveServiceFeeSettings, feeOn, feeForBooking, publicFeeInfo, feeOf, feeDueNow, feeRefundOnCancel, feeMetadata };
