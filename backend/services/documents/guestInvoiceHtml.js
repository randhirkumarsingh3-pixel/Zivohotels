/**
 * The guest's invoice for a stay, in the ZivoPlus document look. Who it comes from is set in
 * Admin → Settings → Documents & emails (guestInvoice.mode):
 *
 *  ON_BEHALF      Tax invoice. Supplier: the hotel (its GSTIN and state). Issued and numbered by
 *                 ZivoPlus on the hotel's behalf. Accommodation is supplied where the property is,
 *                 so GST is CGST + SGST.
 *  ZIVO_SUPPLIER  Tax invoice. Supplier: ZivoPlus (its GSTIN). Place of supply is the property's
 *                 state: CGST + SGST when ZivoPlus is registered in that state, else IGST.
 *  HOTEL_ISSUES   Payment receipt (not a tax invoice) for what was paid online; the hotel issues
 *                 the tax invoice for the stay.
 *
 * The guest is the recipient, or their company when they gave GST details (B2B).
 */
import { esc, money, inr, day, dateTime, amountInWords, shell, header, meta, box, totals, signature } from './theme.js';
import { bookingFigures } from './bookingFigures.js';
import { recipientOf } from '../finance/financeDocuments.js';

const SAC_ACCOMMODATION = '996311';
const pct = (v) => `${Number.isInteger(v) ? v : Number(v).toFixed(1)}%`;

const statusOf = (b, f) => {
  if (['CANCELLED', 'NO_SHOW'].includes(b.status)) return { label: f.refunded ? 'Cancelled · refunded' : 'Cancelled', tone: 'off' };
  if (f.paid >= f.total && f.total > 0) return { label: 'Paid', tone: '' };
  if (f.paid > 0) return { label: 'Part-paid', tone: 'warn' };
  return { label: 'Payable at the hotel', tone: 'warn' };
};

/**
 * input: { booking, hotel, rooms, invoiceRef, issueDate, brand } where brand comes from
 * documentSettings.brandContext() ({ company, support, settings, signatory }).
 */
export const guestInvoiceHtml = ({ booking: b, hotel, rooms = [], invoiceRef, issueDate = new Date(), brand }) => {
  const mode = brand.settings.guestInvoice.mode;
  const receipt = mode === 'HOTEL_ISSUES';
  const f = bookingFigures(b, rooms, { roomTypeName: b.roomType?.name, ratePlan: b.ratePlan });
  const hp = recipientOf(hotel);
  const zivo = brand.company;
  const posCode = hp.stateCode; const posName = hp.stateName || hotel.state || '';

  // Supplier, and how GST splits
  const supplierIsHotel = mode !== 'ZIVO_SUPPLIER';
  const intra = supplierIsHotel || (zivo.stateCode && zivo.stateCode === posCode);
  const rate = f.taxPct ?? 0;
  const taxCols = intra ? [['CGST', rate / 2, f.tax / 2], ['SGST', rate / 2, f.tax - Math.round((f.tax / 2) * 100) / 100]] : [['IGST', rate, f.tax]];

  const supplierBox = supplierIsHotel
    ? box({ label: receipt ? 'Property' : 'Supplier (the property)', name: hp.legalName, lines: [
      `<span class="muted">${esc(hp.property)} · Property ID ${esc(hp.propertyId)}</span>`,
      `<span class="muted">${esc(hp.address)}</span>`,
      hp.gstin ? `GSTIN <b>${esc(hp.gstin)}</b>${hp.pan ? ` · PAN ${esc(hp.pan)}` : ''}` : '<span class="muted">Not registered for GST</span>',
      `<span class="muted">State: ${esc(posName)}${posCode ? ` (${esc(posCode)})` : ''}</span>`,
    ] })
    : box({ label: 'Supplier', name: zivo.legalName, lines: [
      `<span class="muted">${esc(zivo.address)}</span>`,
      `GSTIN <b>${esc(zivo.gstin || '—')}</b>${zivo.pan ? ` · PAN ${esc(zivo.pan)}` : ''}${zivo.cin ? ` · CIN ${esc(zivo.cin)}` : ''}`,
      `<span class="muted">State: ${esc(zivo.stateName)}${zivo.stateCode ? ` (${esc(zivo.stateCode)})` : ''}</span>`,
    ] });

  const b2b = Boolean(b.guestCompanyGstin);
  const recipientBox = box({
    label: b2b ? 'Recipient (business)' : 'Billed to (guest)',
    name: b2b ? b.guestCompanyName : b.guestName,
    lines: [
      b2b ? `GSTIN <b>${esc(b.guestCompanyGstin)}</b>` : '',
      b2b && b.guestCompanyAddress ? `<span class="muted">${esc(b.guestCompanyAddress)}</span>` : '',
      b2b ? `<span class="muted">Guest: ${esc(b.guestName)}</span>` : '',
      `<span class="muted">${esc([b.guestEmail, b.guestPhone].filter(Boolean).join(' · '))}</span>`,
      `<span class="muted">${b2b ? 'Registered (B2B)' : 'Unregistered (B2C)'}</span>`,
    ],
  });

  const stayBox = box({ label: 'Stay', name: hotel.name, lines: [
    `<span class="muted">${esc(hp.address)}</span>`,
    f.hourly
      ? `${dateTime(b.slotStart || b.checkIn)} – ${new Date(b.slotEnd || b.checkOut).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' })}`
      : `${day(b.checkIn, { weekday: 'short' })} → ${day(b.checkOut, { weekday: 'short' })} · ${f.nights} night${f.nights === 1 ? '' : 's'}`,
    `${b.rooms} room${b.rooms === 1 ? '' : 's'} · ${b.adults || b.guests || 1} adult${(b.adults || 1) === 1 ? '' : 's'}${b.children ? `, ${b.children} child${b.children === 1 ? '' : 'ren'}` : ''}`,
  ] });

  const lineRows = f.lines.map((l, i) => `<tr><td>${i + 1}</td><td><b>${esc(l.label)}</b>${l.detail ? `<br><span class="muted">${esc(l.detail)}</span>` : ''}</td><td>${receipt ? '' : SAC_ACCOMMODATION}</td><td class="r">${money(l.amount)}</td></tr>`).join('')
    + f.discounts.map(([label, amt]) => `<tr><td></td><td class="minus">${esc(label)}</td><td></td><td class="r minus">− ${money(amt)}</td></tr>`).join('');

  const title = receipt ? 'Payment Receipt' : 'Tax Invoice';
  const sub = receipt ? 'Amount paid online for your stay' : supplierIsHotel ? `Issued by ${zivo.legalName} on behalf of the property` : 'Accommodation booked on ZivoPlus';
  const st = statusOf(b, f);

  const body = `<div class="page">
${header({ brandSub: zivo.legalName, title, sub, ref: invoiceRef, status: st })}
${meta([
    [receipt ? 'Receipt date' : 'Invoice date', day(issueDate)],
    ['Booking', esc(b.bookingRef)],
    ['Place of supply', `${esc(posName || '—')}${posCode ? ` (${esc(posCode)})` : ''}`],
    [receipt ? 'Booked on' : 'Reverse charge', receipt ? day(b.createdAt) : 'No'],
  ])}
<div class="parties three">${supplierBox}${recipientBox}${stayBox}</div>

<table><tr><th style="width:22px">#</th><th>Description</th><th style="width:60px">${receipt ? '' : 'SAC'}</th><th class="r" style="width:110px">Amount (₹)</th></tr>${lineRows}
<tr class="t"><td></td><td>${receipt ? 'Room charges after discounts (before GST)' : 'Taxable value'}</td><td></td><td class="r">${money(f.taxable)}</td></tr></table>

<div class="cols">
  <div>
    <div class="words">Amount in words: ${amountInWords(f.total)}</div>
    <div class="notes">
      ${receipt
    ? `<b>This is not a tax invoice.</b> It confirms what you paid on ZivoPlus for this booking. ${esc(hotel.name)} issues the GST invoice for the stay${b2b ? ` in the name of ${esc(b.guestCompanyName)} (GSTIN ${esc(b.guestCompanyGstin)})` : ''}; ask for it at check-out.`
    : supplierIsHotel
      ? `Supply of accommodation by ${esc(hp.legalName)}${hp.gstin ? ` (GSTIN ${esc(hp.gstin)})` : ''}. This invoice is issued by ${esc(zivo.legalName)}${zivo.gstin ? ` (GSTIN ${esc(zivo.gstin)})` : ''}, the booking platform, on the property's behalf. The property invoices separately only for extras you use at the hotel.`
      : `Supply of accommodation by ${esc(zivo.legalName)} as an e-commerce operator. Place of supply is the property's location (${esc(posName)}).`}
      ${b2b && !receipt ? `<br><b>Input tax credit:</b> issued to ${esc(b.guestCompanyName)} (GSTIN ${esc(b.guestCompanyGstin)}).` : ''}
      ${brand.settings.guestInvoice.note ? `<br>${esc(brand.settings.guestInvoice.note)}` : ''}
    </div>
  </div>
  ${totals([
    ['Taxable value', money(f.taxable)],
    ...(receipt ? [[`GST ${pct(rate)} (charged by the property)`, money(f.tax)]] : taxCols.map(([n, r, v]) => [`${n} ${pct(r)}`, money(v)])),
    ['Total', inr(f.total), 'grand'],
    ['Paid online', inr(f.paid), 'plus'],
    f.refunded ? ['Refunded', inr(f.refunded), 'less'] : null,
    f.due ? ['To pay at the hotel', inr(f.due), 'sub'] : null,
  ])}
</div>
${signature(zivo.legalName, brand.signatory)}
</div>`;
  return shell(`${title} ${invoiceRef}`, body);
};

export default { guestInvoiceHtml };
