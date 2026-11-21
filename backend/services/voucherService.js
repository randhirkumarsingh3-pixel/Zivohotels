import { getBrowser } from '../utils/browser.js';
import { getSupportContacts } from '../config/supportContacts.js';
import prisma from '../config/db.js';
import { escapeHtml as h } from '../utils/html.js';
import { toMoney, roundMoney } from '../utils/money.js';
import { policyFieldsForCode } from '../utils/refundCalculator.js';
import {
  computeSettlement, staySettlementInput, settlementTermsForHotel, nextPayoutDate, zivoFundedDiscount,
} from './finance/settlementService.js';
import { COMMISSION_GST_PERCENT, TCS_PERCENT, TDS_PERCENT } from '../constants/finance.js';

/**
 * Booking vouchers (PDF):
 *  - guest:    booking confirmation for the traveller (stay, price, payment, cancellation terms)
 *  - hotelier: for the property (guest & stay, night-wise payment breakup, commission, GST on
 *              commission, TCS, TDS and the amount payable to the property)
 *
 * Money for the hotelier voucher comes from the booking's settlement once it exists (after
 * check-out); before that it is the same calculation the settlement will use.
 */

const IST = 'Asia/Kolkata';
const fmtDate = (d, opts = {}) => new Intl.DateTimeFormat('en-IN', { timeZone: IST, day: 'numeric', month: 'short', year: 'numeric', ...opts }).format(new Date(d));
const fmtDateTime = (d) => new Intl.DateTimeFormat('en-IN', { timeZone: IST, day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(d));
const inr = (n) => `₹${(toMoney(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const time12 = (hhmm) => {
  if (!hhmm || !/^\d{1,2}:\d{2}/.test(hhmm)) return '';
  const [H, M] = hhmm.split(':').map(Number);
  return `${((H + 11) % 12) + 1}:${String(M).padStart(2, '0')} ${H < 12 ? 'AM' : 'PM'}`;
};

const MEAL = { NONE: 'Room only', EP: 'Room only', CP: 'Breakfast included', MAP: 'Breakfast and one meal', AP: 'All meals included' };
const IST_MS = 330 * 60 * 1000;
const indiaDay = (d) => new Date(new Date(d).getTime() + IST_MS).toISOString().slice(0, 10);
const nightsBetween = (a, b) => Math.max(1, Math.round((new Date(indiaDay(b)) - new Date(indiaDay(a))) / 86400000));

const company = () => ({
  name: process.env.ZIVO_LEGAL_NAME || 'ZivoHotels',
  pan: process.env.ZIVO_PAN || '',
  gstin: process.env.ZIVO_GSTIN || '',
  cin: process.env.ZIVO_CIN || '',
  address: process.env.ZIVO_ADDRESS || '',
  email: process.env.ZIVO_SUPPORT_EMAIL || '',
  phone: process.env.ZIVO_SUPPORT_PHONE || '',
});
// With the support contacts from Admin → Platform Settings → Support (d.support, loaded with the voucher)
const companyWithSupport = (support) => ({ ...company(), ...(support?.email ? { email: support.email } : {}), ...(support?.phone ? { phone: support.phone } : {}) });

/** Who may download which voucher. Guests: their own; owners: their hotels'; admins: any. */
export const canDownloadVoucher = (booking, hotel, user, type) => {
  if (!booking || !user) return false;
  if (user.role === 'ADMIN') return true;
  if (user.role === 'OWNER' && hotel?.ownerId === user.id) return true;
  return type === 'guest' && booking.userId === user.id;
};

import { loadBookingRooms, roomsSummary, guestsLabel } from './bookingRoomsView.js';

export const loadVoucherData = async (bookingId) => {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking) return null;
  const [hotel, roomType, ratePlan, policy, settlement, timeline, rooms] = await Promise.all([
    prisma.hotel.findUnique({ where: { id: booking.hotelId } }),
    prisma.roomType.findUnique({ where: { id: booking.roomTypeId }, select: { name: true } }),
    booking.ratePlanId ? prisma.ratePlan.findUnique({ where: { id: booking.ratePlanId }, select: { name: true, mealPlan: true } }) : null,
    prisma.cancellationPolicy.findUnique({ where: { hotelId: booking.hotelId } }),
    prisma.settlement.findUnique({ where: { bookingId } }),
    prisma.bookingTimelineEvent.findFirst({ where: { bookingId, status: 'CONFIRMED' }, orderBy: { createdAt: 'asc' }, select: { createdAt: true } }),
    loadBookingRooms(bookingId),
  ]);
  return { booking, hotel, roomType, ratePlan, policy, settlement, confirmedAt: timeline?.createdAt, rooms, support: await getSupportContacts() };
};

// ── shared pieces ─────────────────────────────────────────────────────────────

const address = (hotel) => {
  const a = hotel?.integrationSettings?.addressDetails || {};
  return [hotel?.location || a.address, hotel?.city, a.state || hotel?.state, a.pincode || hotel?.pincode].filter(Boolean)
    .filter((v, i, arr) => arr.indexOf(v) === i).join(', ');
};

const cancellationText = (booking, policy) => {
  const code = policy?.policyCode || 'FREE_CANCEL_24H';
  if (code === 'NON_REFUNDABLE') return ['This booking is non-refundable. No refund is due if it is cancelled or the guest does not arrive.'];
  const { freeCancellationHours } = policyFieldsForCode(code);
  // Same instant the refund engine uses (check-in date minus the free-cancellation hours)
  const deadline = new Date(new Date(booking.checkIn).getTime() - freeCancellationHours * 3600 * 1000);
  if (deadline <= new Date(booking.createdAt)) {
    return [
      'This booking was made after the free-cancellation period had ended, so the amount paid online is not refundable.',
      'Cancellations are possible until check-in from My Bookings on ZivoHotels.',
    ];
  }
  return [
    `Free cancellation (full refund of the amount paid online) if cancelled before ${fmtDateTime(deadline)} IST.`,
    'After that, the amount paid is not refundable. A no-show is treated as a cancellation after this time.',
    'Cancellations are possible until check-in from My Bookings on ZivoHotels.',
  ];
};

const paymentSummary = (booking) => {
  const total = toMoney(booking.totalAmount) || 0;
  const paid = toMoney(booking.paidAmount) || 0;
  const refunded = toMoney(booking.refundAmount) || 0;
  const dueAtHotel = roundMoney(Math.max(0, total - paid));
  let label;
  if (booking.status === 'CANCELLED') label = refunded > 0 ? `Cancelled · ${inr(refunded)} refunded` : 'Cancelled';
  else if (booking.paymentType === 'PAY_AT_HOTEL') label = booking.expiresAt ? `Not paid yet · pay online by ${new Date(booking.expiresAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' })}` : 'Not paid yet';
  else if (paid >= total && total > 0) label = 'Paid online';
  else if (paid > 0) label = 'Part-paid online';
  else label = 'Payment pending';
  return { total, paid, refunded, dueAtHotel, label };
};

const STATUS_LABEL = { PENDING: 'Awaiting payment', CONFIRMED: 'Confirmed', CHECKED_IN: 'Checked in', COMPLETED: 'Checked out', CANCELLED: 'Cancelled', NO_SHOW: 'No-show' };

const baseCss = `
  @page { size: A4; margin: 14mm 12mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1f2937; font-size: 11.5px; line-height: 1.5; margin: 0; }
  .band { background: #111827; color: #fff; border-radius: 14px; padding: 18px 22px; display: flex; justify-content: space-between; align-items: center; }
  .brand { font-size: 22px; font-weight: 800; letter-spacing: -0.3px; }
  .brand span { color: #f43f5e; }
  .doc { text-align: right; }
  .doc .t { font-size: 15px; font-weight: 700; }
  .doc .s { color: #9ca3af; font-size: 10.5px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 14px; }
  .card { border: 1px solid #e5e7eb; border-radius: 12px; padding: 14px 16px; break-inside: avoid; }
  .section, table, tr { break-inside: avoid; }
  .card h3 { margin: 0 0 8px; font-size: 10px; letter-spacing: 1.2px; text-transform: uppercase; color: #6b7280; }
  .big { font-size: 15px; font-weight: 700; color: #111827; }
  .kv { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 14px; }
  .kv div span { display: block; color: #6b7280; font-size: 9.5px; text-transform: uppercase; letter-spacing: .8px; }
  .kv div b { font-size: 12.5px; color: #111827; }
  .pill { display: inline-block; padding: 2px 9px; border-radius: 999px; font-size: 10px; font-weight: 700; background: #ecfdf5; color: #047857; }
  .pill.warn { background: #fff7ed; color: #c2410c; }
  .pill.off { background: #f3f4f6; color: #4b5563; }
  .section { margin-top: 14px; }
  .section h2 { font-size: 13px; margin: 0 0 8px; color: #111827; border-left: 3px solid #f43f5e; padding-left: 8px; }
  ul { margin: 0; padding-left: 16px; } li { margin: 2px 0; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: right; font-size: 9.5px; text-transform: uppercase; letter-spacing: .6px; color: #6b7280; font-weight: 600; padding: 6px 6px; border-bottom: 1px solid #e5e7eb; }
  td { text-align: right; padding: 6px 6px; border-bottom: 1px solid #f3f4f6; }
  th:first-child, td:first-child { text-align: left; }
  tr.total td { font-weight: 700; border-top: 1.5px solid #111827; border-bottom: none; }
  .rows div { display: flex; justify-content: space-between; padding: 5px 0; border-bottom: 1px dashed #e5e7eb; }
  .rows div.sub { font-weight: 700; border-bottom: 1px solid #d1d5db; }
  .rows div.grand { font-size: 14px; font-weight: 800; border-bottom: none; padding-top: 8px; }
  .muted { color: #6b7280; font-size: 10.5px; }
  .foot { margin-top: 16px; padding-top: 10px; border-top: 1px solid #e5e7eb; color: #6b7280; font-size: 10px; }
`;

const companyLines = (support) => {
  const c = companyWithSupport(support);
  const reg = [c.pan && `PAN ${h(c.pan)}`, c.gstin && `GSTIN ${h(c.gstin)}`, c.cin && `CIN ${h(c.cin)}`].filter(Boolean).join(' · ');
  const contact = [c.email && h(c.email), c.phone && h(c.phone)].filter(Boolean).join(' · ');
  return `<div class="foot"><b>${h(c.name)}</b>${c.address ? ` · ${h(c.address)}` : ''}${reg ? `<br>${reg}` : ''}${contact ? `<br>Support: ${contact}` : ''}</div>`;
};

const stayCard = (d) => {
  const { booking, hotel } = d;
  const nights = nightsBetween(booking.checkIn, booking.checkOut);
  const guests = `${booking.adults || booking.guests || 1} adult${(booking.adults || 1) > 1 ? 's' : ''}${booking.children ? `, ${booking.children} child${booking.children > 1 ? 'ren' : ''}` : ''}`;
  return `
    <div class="card">
      <h3>Stay</h3>
      <div class="kv">
        <div><span>Check-in</span><b>${fmtDate(booking.checkIn, { weekday: 'short' })}</b><div class="muted">from ${h(time12(hotel?.checkInTime) || '2:00 PM')}</div></div>
        <div><span>Check-out</span><b>${fmtDate(booking.checkOut, { weekday: 'short' })}</b><div class="muted">by ${h(time12(hotel?.checkOutTime) || '11:00 AM')}</div></div>
        <div><span>Nights</span><b>${nights}</b></div>
        <div><span>Guests</span><b>${h(guests)}</b></div>
      </div>
    </div>`;
};

const roomBlock = (d) => {
  const { booking, roomType, ratePlan, rooms = [] } = d;
  // Each room with its type, plan, guests and lead guest
  if (rooms.length) return `
    <div class="section">
      <h2>${rooms.filter((r) => !r.cancelledAt).length} room${rooms.filter((r) => !r.cancelledAt).length > 1 ? 's' : ''}</h2>
      ${rooms.map((r) => `
      <div class="card" style="margin-bottom:8px${r.cancelledAt ? ';opacity:.6' : ''}">
        <div class="big">Room ${r.roomNumber}: ${h(r.roomType?.name || 'Room')}${r.cancelledAt ? ' (cancelled)' : ''}</div>
        <div class="muted">${h(r.ratePlan?.name || 'Standard rate')} · ${h(MEAL[r.ratePlan?.mealPlan] || 'Room only')} · ${h(guestsLabel(r.adults, r.children))}</div>
        <div>Lead guest: <b>${h(r.guestName)}</b></div>
      </div>`).join('')}
    </div>`;
  return `
    <div class="section">
      <h2>${booking.rooms} room${booking.rooms > 1 ? 's' : ''}</h2>
      <div class="card">
        <div class="big">${booking.rooms} × ${h(roomType?.name || 'Room')}</div>
        <div class="muted">${h(ratePlan?.name || 'Standard rate')} · ${h(MEAL[ratePlan?.mealPlan] || 'Room only')}${booking.extraBeds ? ` · ${booking.extraBeds} extra bed${booking.extraBeds > 1 ? 's' : ''}` : ''}</div>
      </div>
    </div>`;
};

const cancellationBlock = (d) => `
  <div class="section"><h2>Cancellation policy</h2>
    <ul>${cancellationText(d.booking, d.policy).map(t => `<li>${h(t)}</li>`).join('')}</ul>
  </div>`;

const companyBlock = (booking) => booking.guestCompanyName ? `
  <div class="card"><h3>Billing (GST invoice)</h3>
    <div class="big">${h(booking.guestCompanyName)}</div>
    ${booking.guestCompanyGstin ? `<div>GSTIN ${h(booking.guestCompanyGstin)}</div>` : ''}
    ${booking.guestCompanyAddress ? `<div class="muted">${h(booking.guestCompanyAddress)}</div>` : ''}
  </div>` : '';

// ── guest voucher ─────────────────────────────────────────────────────────────

export const guestVoucherHtml = (d) => {
  const { booking, hotel } = d;
  const pay = paymentSummary(booking);
  const extras = (toMoney(booking.extraGuestCharges) || 0) + (toMoney(booking.extraBedCharges) || 0) + (toMoney(booking.mealCharges) || 0);
  const discount = toMoney(booking.metadata?.discountAmount) || 0;
  const roomCharges = toMoney(booking.roomPrice) || Math.max(0, (toMoney(booking.baseAmount) || 0) + discount - extras);
  const taxPct = booking.metadata?.taxPercentage;
  const contact = hotel?.integrationSettings?.contactInfo || {};
  const map = hotel?.latitude && hotel?.longitude ? `https://www.google.com/maps?q=${hotel.latitude},${hotel.longitude}` : '';
  const statusCls = booking.status === 'CANCELLED' ? 'off' : booking.status === 'PENDING' ? 'warn' : '';

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Booking ${h(booking.bookingRef)}</title><style>${baseCss}</style></head><body>
    <div class="band">
      <div class="brand">Zivo<span>Hotels</span></div>
      <div class="doc"><div class="t">Booking Confirmation</div><div class="s">Show this at check-in</div></div>
    </div>

    <div class="grid">
      <div class="card">
        <h3>Booking</h3>
        <div class="big">${h(booking.bookingRef)}</div>
        <div style="margin-top:6px"><span class="pill ${statusCls}">${h(STATUS_LABEL[booking.status] || booking.status)}</span></div>
        <div class="muted" style="margin-top:6px">Booked on ${fmtDateTime(booking.createdAt)} IST</div>
      </div>
      <div class="card">
        <h3>Property</h3>
        <div class="big">${h(hotel?.name)}</div>
        <div class="muted">${h(address(hotel))}</div>
        ${contact.receptionPhone ? `<div>Front desk: ${h(contact.receptionPhone)}</div>` : ''}
        ${map ? `<div class="muted">Map: ${h(map)}</div>` : ''}
      </div>
      <div class="card">
        <h3>Primary guest</h3>
        <div class="big">${h(booking.guestName)}</div>
        <div class="muted">${h(booking.guestPhone)} · ${h(booking.guestEmail)}</div>
      </div>
      ${stayCard(d)}
    </div>

    ${roomBlock(d)}

    <div class="grid">
      <div class="card">
        <h3>Price</h3>
        <div class="rows">
          <div><span>Room charges</span><span>${inr(roomCharges)}</span></div>
          ${extras ? `<div><span>Extra guest / bed / meals</span><span>${inr(extras)}</span></div>` : ''}
          ${(() => {
            const promo = booking.metadata?.promotion;
            const promoAmt = toMoney(promo?.discountAmount) || 0;
            const pts = booking.metadata?.loyalty;
            const ptsAmt = toMoney(pts?.discountAmount) || 0;
            const mem = booking.metadata?.membership;
            const memAmt = roundMoney((toMoney(mem?.hotelDiscount) || 0) + (toMoney(mem?.zivoDiscount) || 0));
            const other = roundMoney(discount - promoAmt - ptsAmt - memAmt);
            return (promoAmt ? `<div><span>Offer: ${h(promo.name)}${promo.code ? ` (${h(promo.code)})` : ''}</span><span>− ${inr(promoAmt)}</span></div>` : '')
              + (memAmt ? `<div><span>${h(mem.plan)} price</span><span>− ${inr(memAmt)}</span></div>` : '')
              + (ptsAmt ? `<div><span>Zivo Rewards (${Number(pts.pointsRedeemed).toLocaleString('en-IN')} points)</span><span>− ${inr(ptsAmt)}</span></div>` : '')
              + (other > 0 ? `<div><span>${booking.metadata?.prepaidDiscountAmount ? 'Pay-now discount' : 'Discount'}</span><span>− ${inr(other)}</span></div>` : '');
          })()}
          <div><span>GST${taxPct != null ? ` @ ${h(taxPct)}%` : ''}</span><span>${inr(booking.taxAmount)}</span></div>
          <div class="grand"><span>Total</span><span>${inr(pay.total)}</span></div>
        </div>
      </div>
      <div class="card">
        <h3>Payment</h3>
        <div class="big">${h(pay.label)}</div>
        <div class="rows" style="margin-top:6px">
          <div><span>Paid online</span><span>${inr(pay.paid)}</span></div>
          ${booking.status !== 'CANCELLED' ? `<div class="sub"><span>To pay at the hotel</span><span>${inr(pay.dueAtHotel)}</span></div>` : ''}
          ${pay.refunded ? `<div><span>Refunded</span><span>${inr(pay.refunded)}</span></div>` : ''}
        </div>
      </div>
      ${companyBlock(booking)}
    </div>

    ${cancellationBlock(d)}

    <div class="section"><h2>Good to know</h2>
      <ul>
        <li>Carry a government photo ID (Aadhaar, passport, driving licence or voter ID) for every adult guest.</li>
        <li>The property may ask for a refundable security deposit and charges extras (minibar, laundry, etc.) separately.</li>
        <li>The tax invoice for the stay is issued by the property${booking.guestCompanyGstin ? ' in the company name and GSTIN above' : ''}.</li>
      </ul>
    </div>
    ${companyLines(d.support)}
  </body></html>`;
};

// ── hotelier voucher ──────────────────────────────────────────────────────────

/** Splits an amount over n nights in whole paise, the remainder going to the last night. */
const splitNights = (amount, n) => {
  const paise = Math.round((toMoney(amount) || 0) * 100);
  const each = Math.floor(paise / n);
  return Array.from({ length: n }, (_, i) => (i === n - 1 ? paise - each * (n - 1) : each) / 100);
};

export const hotelierFigures = async (d) => {
  const { booking, settlement } = d;
  const terms = await settlementTermsForHotel(prisma, booking.hotelId);
  let m;
  if (settlement) {
    const n = (v) => toMoney(v) || 0;
    m = {
      gross: n(settlement.grossAmount), tax: n(settlement.taxAmount), commission: n(settlement.commissionAmount),
      commissionGst: n(settlement.commissionGstAmount), tcs: n(settlement.tcsAmount), tds: n(settlement.tdsAmount),
      netPayable: n(settlement.netPayable), igst: n(settlement.igstAmount),
    };
    m.zivoFunded = toMoney(zivoFundedDiscount(booking)) || 0;
    m.collected = roundMoney(m.netPayable + m.commission + m.commissionGst + m.tcs + m.tds - m.zivoFunded);
  } else {
    const c = computeSettlement({ ...staySettlementInput(booking), ...terms });
    m = Object.fromEntries(Object.entries(c).map(([k, v]) => [k, toMoney(v)]));
  }
  const extras = (toMoney(booking.extraGuestCharges) || 0) + (toMoney(booking.extraBedCharges) || 0) + (toMoney(booking.mealCharges) || 0);
  const roomCharges = roundMoney(m.gross - m.tax - extras);
  const releaseOn = settlement?.holdUntil || nextPayoutDate(terms.payoutCycle, booking.checkOut);
  return { ...m, extras, roomCharges, terms, releaseOn, final: Boolean(settlement) };
};

export const hotelierVoucherHtml = (d, f) => {
  const { booking, hotel, roomType } = d;
  const pay = paymentSummary(booking);
  const nights = nightsBetween(booking.checkIn, booking.checkOut);
  const days = Array.from({ length: nights }, (_, i) => new Date(new Date(booking.checkIn).getTime() + i * 86400000));
  const R = splitNights(f.roomCharges, nights), E = splitNights(f.extras, nights), T = splitNights(f.tax, nights);
  const G = splitNights(f.gross, nights), C = splitNights(f.commission + f.commissionGst, nights);
  const commissionInclGst = roundMoney(f.commission + f.commissionGst);
  const deductions = roundMoney(f.tcs + f.tds);
  const collectedAtHotel = roundMoney(Math.max(0, f.gross - f.collected));
  const owed = f.netPayable < 0;
  const gstSplit = f.terms.sameState ? 'CGST + SGST' : 'IGST';

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Hotelier voucher ${h(booking.bookingRef)}</title><style>${baseCss}</style></head><body>
    <div class="band">
      <div class="brand">Zivo<span>Hotels</span> <span style="color:#9ca3af;font-weight:600;font-size:13px">Partner</span></div>
      <div class="doc"><div class="t">Hotelier Booking Voucher</div><div class="s">${h(hotel?.name)} · ${h(address(hotel))}</div></div>
    </div>

    <div class="grid">
      <div class="card">
        <h3>Booking</h3>
        <div class="kv">
          <div><span>Booking ID</span><b>${h(booking.bookingRef)}</b></div>
          <div><span>Booked on</span><b>${fmtDateTime(booking.createdAt)}</b></div>
          <div><span>Status</span><b>${h(STATUS_LABEL[booking.status] || booking.status)}</b></div>
          <div><span>Payment</span><b>${h(pay.label)}</b></div>
          <div><span>Booked via</span><b>ZivoHotels</b></div>
          <div><span>Property</span><b>${h(hotel?.name)}</b></div>
        </div>
      </div>
      <div class="card">
        <h3>Primary guest</h3>
        <div class="big">${h(booking.guestName)}</div>
        <div class="muted">${h(booking.guestPhone)} · ${h(booking.guestEmail)}</div>
      </div>
      ${stayCard(d)}
      ${companyBlock(booking) || `<div class="card"><h3>Billing</h3><div class="muted">Invoice to the guest (no company GST details given).</div></div>`}
    </div>

    ${roomBlock(d)}
    ${cancellationBlock(d)}

    <div class="section"><h2>Payment</h2>
      <div class="grid" style="margin-top:0">
        <div class="card"><h3>Property gross charges</h3><div class="big">${inr(f.gross)}</div>
          <div class="muted">Room ${inr(f.roomCharges)}${f.extras ? ` + extras ${inr(f.extras)}` : ''} + GST ${inr(f.tax)}</div></div>
        <div class="card"><h3>${owed ? 'Payable by property to ZivoHotels' : 'Payable to property'}</h3><div class="big">${inr(Math.abs(f.netPayable))}</div>
          <div class="muted">${owed
            ? `The guest pays ${inr(collectedAtHotel)} at the property. The amount above is netted against your next payout.`
            : `Released on ${fmtDate(f.releaseOn)} (your payout cycle after check-out); bank credit usually takes 1–3 working days.`}</div></div>
      </div>
    </div>

    <div class="section"><h2>Night-wise breakup (₹)</h2>
      <table>
        <thead><tr><th>Night</th><th>Room (R)</th><th>Extras (E)</th><th>GST (T)</th><th>Gross (G=R+E+T)</th><th>Commission incl. GST (C)</th><th>Net (G−C)</th></tr></thead>
        <tbody>
          <tr><td colspan="7" style="color:#f43f5e;font-weight:600">${h(roomsSummary(d.rooms, booking, roomType?.name))}</td></tr>
          ${days.map((day, i) => `<tr><td>${fmtDate(day)}</td><td>${R[i].toFixed(2)}</td><td>${E[i].toFixed(2)}</td><td>${T[i].toFixed(2)}</td><td>${G[i].toFixed(2)}</td><td>${C[i].toFixed(2)}</td><td>${(G[i] - C[i]).toFixed(2)}</td></tr>`).join('')}
          <tr class="total"><td>Total</td><td>${f.roomCharges.toFixed(2)}</td><td>${f.extras.toFixed(2)}</td><td>${f.tax.toFixed(2)}</td><td>${f.gross.toFixed(2)}</td><td>${commissionInclGst.toFixed(2)}</td><td>${(f.gross - commissionInclGst).toFixed(2)}</td></tr>
        </tbody>
      </table>
    </div>

    <div class="section"><h2>Settlement calculation</h2>
      <div class="card"><div class="rows">
        <div><span>1. Room charges</span><span>${inr(f.roomCharges)}</span></div>
        <div><span>2. Extra guest / bed / meal charges</span><span>${inr(f.extras)}</span></div>
        <div><span>3. GST charged to the guest</span><span>${inr(f.tax)}</span></div>
        <div class="sub"><span>(A) Property gross charges (1+2+3)</span><span>${inr(f.gross)}</span></div>
        ${f.zivoFunded > 0 ? `<div><span>Plus: Zivo-funded discount (offer / reward points, paid by ZivoHotels; commission is on the full price)</span><span>+ ${inr(f.zivoFunded)}</span></div>` : ''}
        ${collectedAtHotel ? `<div><span>Less: collected by the property from the guest</span><span>− ${inr(collectedAtHotel)}</span></div>
        <div class="sub"><span>(A′) Collected online by ZivoHotels</span><span>${inr(f.collected)}</span></div>` : ''}
        <div><span>4. ZivoHotels commission @ ${h(f.terms.commissionPercent)}% of pre-GST amount</span><span>${inr(f.commission)}</span></div>
        <div><span>5. GST on commission @ ${COMMISSION_GST_PERCENT}% (${gstSplit})</span><span>${inr(f.commissionGst)}</span></div>
        <div class="sub"><span>(B) Commission incl. GST (4+5)</span><span>${inr(commissionInclGst)}</span></div>
        <div><span>6. TCS @ ${TCS_PERCENT}% (GST s.52)${f.terms.hotelGstRegistered ? '' : ', not applicable: property not GST-registered'}</span><span>${inr(f.tcs)}</span></div>
        <div><span>7. TDS @ ${TDS_PERCENT}% (Income-tax s.194-O)</span><span>${inr(f.tds)}</span></div>
        <div class="sub"><span>(C) Tax deductions (6+7)</span><span>${inr(deductions)}</span></div>
        <div class="grand"><span>${owed ? 'Payable by property' : 'Payable to property'} (${collectedAtHotel ? 'A′' : 'A'}${f.zivoFunded > 0 ? ' + promotion' : ''} − B − C)</span><span>${inr(Math.abs(f.netPayable))}</span></div>
      </div></div>
      <div class="muted" style="margin-top:6px">${f.final ? 'Final figures from the settlement created at check-out.' : 'Provisional: the settlement is created at check-out and reflects any changes or cancellations.'}</div>
    </div>

    <div class="section"><h2>Notes for the property</h2>
      <ul>
        <li>TCS and TDS are subject to reconciliation and are reported against the property's PAN / GSTIN.</li>
        <li>ZivoHotels deducts TDS under section 194-O on this booking; the property should not deduct TDS on ZivoHotels' commission.</li>
        <li>Issue the tax invoice to the guest for the property gross charges${booking.guestCompanyGstin ? `, in the name of ${h(booking.guestCompanyName)} (GSTIN ${h(booking.guestCompanyGstin)})` : ''}.</li>
        <li>Do not charge the guest again for anything paid online. Collect only ${collectedAtHotel ? `${inr(collectedAtHotel)} for the stay plus ` : ''}extra services they use.</li>
        <li>If the guest cancels or changes this booking, you will be notified and this voucher will no longer be valid.</li>
      </ul>
    </div>
    ${companyLines(d.support)}
  </body></html>`;
};

// ── PDF ───────────────────────────────────────────────────────────────────────

export const renderPdf = async (html) => {
  const page = await (await getBrowser()).newPage();
  try {
    // Vouchers need no network: block every request so nothing in the HTML can reach out
    await page.setRequestInterception(true);
    page.on('request', (req) => (req.url().startsWith('data:') ? req.continue() : req.abort()));
    await page.setContent(html, { waitUntil: 'load' });
    return await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true });
  } finally {
    await page.close();
  }
};

export default { loadVoucherData, canDownloadVoucher, guestVoucherHtml, hotelierVoucherHtml, hotelierFigures, renderPdf };
