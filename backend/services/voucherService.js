import { esc, inr as tInr, money, shell, header, meta, box, totals, renderPdf as renderThemedPdf, footerLine } from './documents/theme.js';
import { bookingFigures, MEAL as TMEAL } from './documents/bookingFigures.js';
import { invoiceModeFor, brandContext } from './documents/documentSettings.js';
import { houseRules } from './documents/houseRules.js';
import { getSupportContacts } from '../config/supportContacts.js';
import prisma from '../config/db.js';
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

const IST_MS = 330 * 60 * 1000;
const indiaDay = (d) => new Date(new Date(d).getTime() + IST_MS).toISOString().slice(0, 10);
const nightsBetween = (a, b) => Math.max(1, Math.round((new Date(indiaDay(b)) - new Date(indiaDay(a))) / 86400000));


/** Who may download which voucher. Guests: their own; owners: their hotels'; admins: any. */
export const canDownloadVoucher = (booking, hotel, user, type) => {
  if (!booking || !user) return false;
  if (user.role === 'ADMIN') return true;
  if (user.role === 'OWNER' && managesHotel(user, { ...hotel, id: hotel?.id || booking.hotelId }, 'bookings.view')) return true;
  return type === 'guest' && booking.userId === user.id;
};

import { loadBookingRooms, roomsSummary, guestsLabel } from './bookingRoomsView.js';
import { managesHotel } from '../utils/hotelAccess.js';

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
  return { booking, hotel, roomType, ratePlan, policy, settlement, confirmedAt: timeline?.createdAt, rooms, support: await getSupportContacts(), brand: await brandContext() };
};

// ── shared pieces ─────────────────────────────────────────────────────────────

const address = (hotel) => {
  const a = hotel?.integrationSettings?.addressDetails || {};
  return [hotel?.location || a.address, hotel?.city, a.state || hotel?.state, a.pincode || hotel?.pincode].filter(Boolean)
    .filter((v, i, arr) => arr.indexOf(v) === i).join(', ');
};

export const cancellationText = (booking, policy) => {
  if (booking.stayType === 'HOURLY') {
    const hrs = Number(booking.metadata?.hourly?.freeCancelHours ?? 2);
    return hrs > 0
      ? [`Free cancellation until ${hrs} hour${hrs === 1 ? '' : 's'} before check-in, from My Bookings. No refund after that, or if the guest does not arrive.`, 'Arriving late does not extend the stay.']
      : ['This hourly stay is non-refundable once booked.'];
  }
  const code = policy?.policyCode || 'FREE_CANCEL_24H';
  if (code === 'NON_REFUNDABLE') return ['This booking is non-refundable. No refund is due if it is cancelled or the guest does not arrive.'];
  const { freeCancellationHours } = policyFieldsForCode(code);
  // Same instant the refund engine uses (check-in date minus the free-cancellation hours)
  const deadline = new Date(new Date(booking.checkIn).getTime() - freeCancellationHours * 3600 * 1000);
  if (deadline <= new Date(booking.createdAt)) {
    return [
      'This booking was made after the free-cancellation period had ended, so the amount paid online is not refundable.',
      'Cancellations are possible until check-in from My Bookings on ZivoPlus.',
    ];
  }
  return [
    `Free cancellation (full refund of the amount paid online) if cancelled before ${fmtDateTime(deadline)} IST.`,
    'After that, the amount paid is not refundable. A no-show is treated as a cancellation after this time.',
    'Cancellations are possible until check-in from My Bookings on ZivoPlus.',
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

// ── shared pieces (themed) ──────────────────────────────────────────────────

const statusTone = (st) => (st === 'CANCELLED' || st === 'NO_SHOW' ? 'off' : st === 'PENDING' ? 'warn' : '');
const guestsText = (b) => `${b.adults || b.guests || 1} adult${(b.adults || 1) > 1 ? 's' : ''}${b.children ? `, ${b.children} child${b.children > 1 ? 'ren' : ''}` : ''}`;
const timeOf = (x) => new Date(x).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });

/** Check-in, check-out, nights (or the hourly slot) and guests, as the meta strip. */
const stayMeta = (d) => {
  const { booking: b, hotel } = d;
  if (b.stayType === 'HOURLY') {
    return meta([
      ['Date', fmtDate(b.slotStart || b.checkIn, { weekday: 'short' })],
      ['Check-in', esc(timeOf(b.slotStart || b.checkIn))],
      ['Check-out', `${esc(timeOf(b.slotEnd || b.checkOut))} <span class="muted">· ${b.hours} h</span>`],
      ['Guests', esc(guestsText(b))],
    ]);
  }
  const nights = nightsBetween(b.checkIn, b.checkOut);
  return meta([
    ['Check-in', `${fmtDate(b.checkIn, { weekday: 'short' })}<div class="muted" style="font-weight:400">from ${esc(time12(hotel?.checkInTime) || '2:00 PM')}</div>`],
    ['Check-out', `${fmtDate(b.checkOut, { weekday: 'short' })}<div class="muted" style="font-weight:400">by ${esc(time12(hotel?.checkOutTime) || '11:00 AM')}</div>`],
    ['Nights', String(nights)],
    ['Guests', esc(guestsText(b))],
  ]);
};

const roomsSection = (d) => {
  const { booking: b, roomType, ratePlan, rooms = [] } = d;
  const active = rooms.filter((r) => !r.cancelledAt).length;
  const list = rooms.length
    ? rooms.map((r) => `<div class="room${r.cancelledAt ? ' off' : ''}"><div><b>Room ${r.roomNumber}: ${esc(r.roomType?.name || 'Room')}</b>${r.cancelledAt ? ' <span class="status off">Cancelled</span>' : ''}<div class="muted">${esc(r.ratePlan?.name || 'Standard rate')} · ${esc(TMEAL[r.ratePlan?.mealPlan] || 'Room only')} · ${esc(guestsLabel(r.adults, r.children))}</div></div><div class="r">Lead guest<br><b>${esc(r.guestName)}</b></div></div>`).join('')
    : `<div class="room"><div><b>${b.rooms} × ${esc(roomType?.name || 'Room')}</b><div class="muted">${esc(ratePlan?.name || (b.stayType === 'HOURLY' ? `Hourly stay · ${b.hours} hours` : 'Standard rate'))} · ${esc(TMEAL[ratePlan?.mealPlan] || 'Room only')}${b.extraBeds ? ` · ${b.extraBeds} extra bed${b.extraBeds > 1 ? 's' : ''}` : ''}</div></div><div class="r">Lead guest<br><b>${esc(b.guestName)}</b></div></div>`;
  return `<h2>${rooms.length ? active : b.rooms} room${(rooms.length ? active : b.rooms) === 1 ? '' : 's'}</h2>${list}`;
};

const propertyBox = (hotel) => {
  const contact = hotel?.integrationSettings?.contactInfo || {};
  const map = hotel?.latitude && hotel?.longitude ? `https://www.google.com/maps?q=${hotel.latitude},${hotel.longitude}` : '';
  return box({ label: 'Property', name: hotel?.name, lines: [
    `<span class="muted">${esc(address(hotel))}</span>`,
    contact.receptionPhone ? `Front desk: <b>${esc(contact.receptionPhone)}</b>` : '',
    contact.receptionEmail ? `<span class="muted">${esc(contact.receptionEmail)}</span>` : '',
    map ? `<span class="muted">Map: ${esc(map)}</span>` : '',
  ] });
};

const billingBox = (b, fallback) => (b.guestCompanyName
  ? box({ label: 'Billing (GST)', name: b.guestCompanyName, lines: [b.guestCompanyGstin ? `GSTIN <b>${esc(b.guestCompanyGstin)}</b>` : '', b.guestCompanyAddress ? `<span class="muted">${esc(b.guestCompanyAddress)}</span>` : ''] })
  : fallback);

/** What each document says about the guest's tax invoice, by Admin → Documents setting. */
const invoiceLine = (mode, b, who) => {
  const company = b.guestCompanyGstin ? ` in the name of ${b.guestCompanyName} (GSTIN ${b.guestCompanyGstin})` : '';
  if (who === 'guest') {
    return mode === 'HOTEL_ISSUES'
      ? b.guestCompanyGstin
        ? `The property issues the GST invoice for your stay${company}; it appears in My Bookings once the property uploads it after check-out. Claim input tax credit only against that invoice: ZivoPlus acts only as a facilitator.`
        : `The property issues the GST invoice for your stay${company}; ask for it at check-out.`
      : `Your GST invoice for the stay comes from ZivoPlus${company}: download it from My Bookings → Financials (with any credit or debit note if the booking changes). The property bills you separately only for extras you use.`;
  }
  if (mode === 'ON_BEHALF') return `ZivoPlus issues the guest's GST invoice for this stay on your behalf (your GSTIN as supplier)${company}; include it in your GST returns. Do not issue another invoice for the room: invoice the guest only for extras.`;
  if (mode === 'ZIVO_SUPPLIER') return `ZivoPlus issues the guest's GST invoice for this stay as the supplier${company}. Do not invoice the guest for the room: invoice only extras.`;
  return b.guestCompanyGstin
    ? `Issue the GST invoice for the stay${company} and upload it in Extranet → GST invoices after check-out: the business claims input tax credit only against your invoice (ZivoPlus is the facilitator).`
    : `Issue the tax invoice to the guest for the property gross charges${company}.`;
};

const footerFor = (d) => footerLine(d.brand?.company || {}, d.support || {});

// ── guest voucher ─────────────────────────────────────────────────────────────

export const guestVoucherHtml = (d) => {
  const { booking: b, hotel } = d;
  const pay = paymentSummary(b);
  const f = bookingFigures(b, d.rooms || [], { roomTypeName: d.roomType?.name, ratePlan: d.ratePlan });
  const settings = d.brand?.settings || { guestInvoice: { mode: 'HOTEL_ISSUES' }, voucher: { guestNotes: [] } };
  const body = `${header({ brandSub: 'Booking voucher', title: 'Booking Confirmation', sub: 'Show this at check-in, on your phone or printed', ref: b.bookingRef, status: { label: STATUS_LABEL[b.status] || b.status, tone: statusTone(b.status) } })}
${stayMeta(d)}
<div class="parties three">
  ${propertyBox(hotel)}
  ${box({ label: 'Primary guest', name: b.guestName, lines: [`<span class="muted">${esc(b.guestPhone || '')}</span>`, `<span class="muted">${esc(b.guestEmail || '')}</span>`] })}
  ${billingBox(b, box({ label: 'Booking', name: b.bookingRef, lines: [`<span class="muted">Booked on ${esc(fmtDateTime(b.createdAt))} IST</span>`, `Payment: <b>${esc(pay.label)}</b>`, '<span class="muted">Booked via ZivoPlus</span>'] }))}
</div>
${roomsSection(d)}
<div class="cols">
  <div>
    <h2>Cancellation policy</h2>
    <div class="notes"><ul>${cancellationText(b, d.policy).map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div>
    ${houseRules(hotel).length ? `<h2>House rules</h2><div class="notes"><ul>${houseRules(hotel).map((r) => `<li>${r.allowed === true ? '✓ ' : r.allowed === false ? '✕ ' : ''}${esc(r.text)}</li>`).join('')}</ul></div>` : ''}
    <h2>Good to know</h2>
    <div class="notes"><ul>${[...(settings.voucher.guestNotes || []), invoiceLine(invoiceModeFor(b, settings), b, 'guest')].map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div>
  </div>
  <div>
    <h2>Price</h2>
    <div style="margin-top:8px">${totals([
      ...f.lines.map((l) => [esc(l.label), money(l.amount)]),
      ...f.discounts.map(([k, v]) => [esc(k), `− ${money(v)}`, 'less']),
      [`GST${f.taxPct != null ? ` @ ${esc(f.taxPct)}%` : ''}`, money(f.tax)],
      ['Total', tInr(f.total), 'grand'],
      ['Paid online', tInr(pay.paid), 'plus'],
      b.status !== 'CANCELLED' ? ['To pay at the hotel', tInr(pay.dueAtHotel), 'sub'] : null,
      pay.refunded ? ['Refunded', tInr(pay.refunded), 'less'] : null,
    ])}</div>
  </div>
</div>`;
  return shell(`Booking ${b.bookingRef}`, body);
};

// ── travel agent's voucher for their customer (white-label) ──────────────────

/**
 * The voucher a Partner Hub agent gives their customer: the agency's name and contact instead of
 * ZivoPlus, the stay, rooms, cancellation terms and house rules. price: 'SELL' shows the agent's
 * price to the customer (net rate + their markup, or the public price), 'NONE' shows "Prepaid".
 */
export const agencyVoucherHtml = (d, { agency, price = 'NONE' }) => {
  const { booking: b, hotel } = d;
  const bp = b.businessPricing || {};
  const contact = [agency.phone && `Phone: <b>${esc(agency.phone)}</b>`, agency.email && esc(agency.email), agency.website && `<span class="muted">${esc(agency.website)}</span>`];
  const sell = Number(bp.sellAmount || b.totalAmount);
  const body = `${header({ brandName: agency.name, brandLogo: agency.logo, brandSub: 'Hotel voucher', title: 'Booking Confirmation', sub: 'Show this at check-in, on your phone or printed', ref: bp.clientReference || b.bookingRef, status: { label: STATUS_LABEL[b.status] || b.status, tone: statusTone(b.status) } })}
${stayMeta(d)}
<div class="parties three">
  ${propertyBox(hotel)}
  ${box({ label: 'Lead guest', name: b.guestName, lines: [`<span class="muted">${esc(b.guestPhone || '')}</span>`] })}
  ${box({ label: 'Booked through', name: agency.name, lines: [...contact, `Hotel confirmation: <b>${esc(b.bookingRef)}</b>`] })}
</div>
${roomsSection(d)}
<div class="cols">
  <div>
    <h2>Cancellation policy</h2>
    <div class="notes"><ul>${cancellationText(b, d.policy).map((t) => t.replace(/ from My Bookings on ZivoPlus/g, ` through ${agency.name}`).replace(/ZivoPlus/g, agency.name).replace(/ paid online/g, '')).map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div>
    ${houseRules(hotel).length ? `<h2>House rules</h2><div class="notes"><ul>${houseRules(hotel).map((r) => `<li>${r.allowed === true ? '✓ ' : r.allowed === false ? '✕ ' : ''}${esc(r.text)}</li>`).join('')}</ul></div>` : ''}
    <h2>Good to know</h2>
    <div class="notes"><ul><li>${esc(`The room is prepaid. Pay the property only for extras you use (food, minibar, laundry).`)}</li><li>${esc(`For changes or cancellation, contact ${agency.name}${agency.phone ? ` on ${agency.phone}` : ''}.`)}</li></ul></div>
  </div>
  <div>
    <h2>Payment</h2>
    <div style="margin-top:8px">${totals(price === 'SELL'
      ? [['Total for the stay (incl. taxes)', tInr(sell), 'grand'], ['Paid to', esc(agency.name), 'sub']]
      : [['Room charges', 'Prepaid', 'grand'], ['To pay at the hotel', 'Extras only', 'sub']])}</div>
  </div>
</div>`;
  return shell(`Booking ${b.bookingRef}`, body);
};

export const agencyVoucherPdf = async (bookingId, { agency, price }) => {
  const d = await loadVoucherData(bookingId);
  if (!d) return null;
  const footer = [agency.name, agency.phone, agency.email].filter(Boolean).map(esc).join(' · ');
  return renderThemedPdf(agencyVoucherHtml(d, { agency, price }), { footer });
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
  // A settled stay shows the rates it was settled with (they can change later)
  if (settlement?.rates) Object.assign(terms, settlement.rates);
  let m;
  if (settlement) {
    const n = (v) => toMoney(v) || 0;
    m = {
      gross: n(settlement.grossAmount), tax: n(settlement.taxAmount), commission: n(settlement.commissionAmount),
      commissionGst: n(settlement.commissionGstAmount), tcs: n(settlement.tcsAmount), tds: n(settlement.tdsAmount),
      netPayable: n(settlement.netPayable), igst: n(settlement.igstAmount), agentCommission: n(settlement.agentCommissionAmount),
    };
    m.zivoFunded = toMoney(zivoFundedDiscount(booking)) || 0;
    m.collected = roundMoney(m.netPayable + m.commission + m.commissionGst + m.tcs + m.tds + m.agentCommission - m.zivoFunded);
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
  const { booking: b, hotel, roomType } = d;
  const pay = paymentSummary(b);
  const nights = b.stayType === 'HOURLY' ? 1 : nightsBetween(b.checkIn, b.checkOut);
  const days = Array.from({ length: nights }, (_, i) => new Date(new Date(b.checkIn).getTime() + i * 86400000));
  const R = splitNights(f.roomCharges, nights), E = splitNights(f.extras, nights), T = splitNights(f.tax, nights);
  const G = splitNights(f.gross, nights), C = splitNights(f.commission + f.commissionGst, nights), D = splitNights(f.tcs + f.tds + (f.agentCommission || 0), nights);
  const commissionInclGst = roundMoney(f.commission + f.commissionGst);
  const deductions = roundMoney(f.tcs + f.tds + (f.agentCommission || 0));
  const collectedAtHotel = roundMoney(Math.max(0, f.gross - f.collected));
  const owed = f.netPayable < 0;
  const gstSplit = f.terms.sameState ? 'CGST + SGST' : 'IGST';
  const settings = d.brand?.settings || { guestInvoice: { mode: 'HOTEL_ISSUES' }, voucher: { hotelNotes: [] } };
  // Night-wise payable after commission and TCS/TDS; the last night takes the rounding so the column adds up
  const P = days.map((_, i) => roundMoney(G[i] - C[i] - D[i]));
  const sumP = roundMoney(P.reduce((t, v) => t + v, 0));
  const target = roundMoney(f.gross - commissionInclGst - deductions);
  if (P.length) P[P.length - 1] = roundMoney(P[P.length - 1] + (target - sumP));

  const body = `${header({ brandSub: 'Partner', title: 'Hotelier Booking Voucher', sub: `${hotel?.name || ''} · ${address(hotel)}`, ref: b.bookingRef, status: { label: STATUS_LABEL[b.status] || b.status, tone: statusTone(b.status) } })}
${stayMeta(d)}
<div class="parties three">
  ${box({ label: 'Booking', name: b.bookingRef, lines: [`<span class="muted">Booked on ${esc(fmtDateTime(b.createdAt))}</span>`, `Payment: <b>${esc(pay.label)}</b>`, '<span class="muted">Booked via ZivoPlus</span>'] })}
  ${box({ label: 'Primary guest', name: b.guestName, lines: [`<span class="muted">${esc(b.guestPhone || '')}</span>`, `<span class="muted">${esc(b.guestEmail || '')}</span>`] })}
  ${billingBox(b, box({ label: 'Billing', name: 'Individual guest', lines: ['<span class="muted">No company GST details given.</span>'] }))}
</div>
<div class="cards">
  <div class="card hero"><div class="k">${owed ? 'Payable by property to ZivoPlus' : 'Payable to property'}</div><div class="v">${tInr(Math.abs(f.netPayable))}</div></div>
  <div class="card"><div class="k">Property gross charges</div><div class="v">${tInr(f.gross)}</div></div>
  <div class="card"><div class="k">Commission incl. GST</div><div class="v">${tInr(commissionInclGst)}</div></div>
  <div class="card"><div class="k">${owed ? 'Collect at check-in' : 'Payout date'}</div><div class="v">${owed ? tInr(collectedAtHotel) : esc(fmtDate(f.releaseOn))}</div></div>
</div>
${roomsSection(d)}

<h2>Night-wise breakup (₹)</h2>
<table><tr><th>Night</th><th class="r">Room (R)</th><th class="r">Extras (E)</th><th class="r">GST (T)</th><th class="r">Gross (G)</th><th class="r">Commission incl. GST (C)</th><th class="r">${f.agentCommission > 0 ? 'TCS, TDS, agent (D)' : 'TCS + TDS (D)'}</th><th class="r">Payable (G−C−D)</th></tr>
<tr class="group"><td colspan="8">${esc(roomsSummary(d.rooms, b, roomType?.name))}</td></tr>
${days.map((dd, i) => `<tr><td>${b.stayType === 'HOURLY' ? 'Hourly stay' : fmtDate(dd)}</td><td class="r">${money(R[i])}</td><td class="r">${money(E[i])}</td><td class="r">${money(T[i])}</td><td class="r">${money(G[i])}</td><td class="r">${money(C[i])}</td><td class="r">${money(D[i])}</td><td class="r"><b>${money(P[i])}</b></td></tr>`).join('')}
<tr class="t"><td>Total</td><td class="r">${money(f.roomCharges)}</td><td class="r">${money(f.extras)}</td><td class="r">${money(f.tax)}</td><td class="r">${money(f.gross)}</td><td class="r">${money(commissionInclGst)}</td><td class="r">${money(deductions)}</td><td class="r">${money(target)}</td></tr></table>
${f.zivoFunded > 0 || collectedAtHotel ? '<div class="notes">The payable amount below also includes offers paid by ZivoPlus and takes off what the guest pays at the property.</div>' : ''}

<div class="cols">
  <div>
    <h2>Cancellation policy</h2>
    <div class="notes"><ul>${cancellationText(b, d.policy).map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div>
    <h2>Notes for the property</h2>
    <div class="notes"><ul>${[
      invoiceLine(invoiceModeFor(b, settings), b, 'hotel'),
      `Do not charge the guest again for anything paid online. Collect only ${collectedAtHotel ? `${tInr(collectedAtHotel)} for the stay plus ` : ''}extra services they use.`,
      ...(settings.voucher.hotelNotes || []),
    ].map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div>
  </div>
  <div>
    <h2>Settlement calculation</h2>
    <div style="margin-top:8px">${totals([
      ['1. Room charges', money(f.roomCharges)],
      ['2. Extra guest / bed / meals', money(f.extras)],
      ['3. GST charged to the guest', money(f.tax)],
      ['(A) Property gross charges', tInr(f.gross), 'sub'],
      f.zivoFunded > 0 ? ['Plus: offers paid by ZivoPlus', `+ ${money(f.zivoFunded)}`, 'plus'] : null,
      collectedAtHotel ? ['Less: collected by the property', `− ${money(collectedAtHotel)}`, 'less'] : null,
      [`4. Commission @ ${esc(f.terms.commissionPercent)}% of pre-GST`, `− ${money(f.commission)}`, 'less'],
      [`5. GST on commission @ ${esc(f.terms.commissionGstPercent ?? COMMISSION_GST_PERCENT)}% (${gstSplit})`, `− ${money(f.commissionGst)}`, 'less'],
      [`6. TCS @ ${esc(f.terms.tcsPercent ?? TCS_PERCENT)}% (GST s.52)${f.terms.hotelGstRegistered ? '' : ', n/a'}`, `− ${money(f.tcs)}`, 'less'],
      [`7. TDS @ ${esc(f.terms.tdsPercent ?? TDS_PERCENT)}% (Income-tax s.194-O)`, `− ${money(f.tds)}`, 'less'],
      f.agentCommission > 0 ? [`8. Travel agent's commission (your agent discount, ${esc(b.businessPricing?.organisationName || 'Partner Hub')})`, `− ${money(f.agentCommission)}`, 'less'] : null,
      [owed ? 'Payable by property' : 'Payable to property', tInr(Math.abs(f.netPayable)), 'grand'],
    ])}</div>
    <div class="notes">${f.final ? 'Final figures from the settlement created at check-out.' : 'Provisional: the settlement is created at check-out and reflects any changes or cancellations.'}${owed ? '' : ` Released on ${esc(fmtDate(f.releaseOn))}; bank credit usually takes 1–3 working days.`}</div>
  </div>
</div>`;
  return shell(`Hotelier voucher ${b.bookingRef}`, body);
};

// ── PDF ───────────────────────────────────────────────────────────────────────

/** The voucher PDF, with the company line and page numbers on every page. */
export const renderPdf = async (html, d = null) => renderThemedPdf(html, { footer: d ? footerFor(d) : '' });

export default { loadVoucherData, canDownloadVoucher, guestVoucherHtml, hotelierVoucherHtml, hotelierFigures, renderPdf, agencyVoucherHtml, agencyVoucherPdf };
