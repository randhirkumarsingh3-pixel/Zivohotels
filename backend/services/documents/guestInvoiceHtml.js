/**
 * The guest's invoice for a stay, and credit / debit notes against it, in the ZivoPlus document
 * look. Who the invoice comes from is set in Admin → Settings → Documents & emails
 * (guestInvoice.mode), or on a business account's terms:
 *
 *  ON_BEHALF      Tax invoice. Supplier: the hotel (its GSTIN and state). Issued and numbered by
 *                 ZivoPlus on the hotel's behalf. Accommodation is supplied where the property is,
 *                 so GST is CGST + SGST.
 *  ZIVO_SUPPLIER  Tax invoice. Supplier: ZivoPlus (its GSTIN). Place of supply is the property's
 *                 state: CGST + SGST when ZivoPlus is registered in that state, else IGST.
 *  HOTEL_ISSUES   Payment receipt (not a tax invoice) for what was paid online; the hotel issues
 *                 the tax invoice for the stay.
 *
 * A tax invoice carries what GST rule 46 asks for: supplier and recipient (GSTIN and state for a
 * business), a number unique in the financial year, date, place of supply, SAC and description,
 * taxable value, GST by rate and head, reverse charge, address of supply (the property), and the
 * issuer's registration (PAN, CIN, registered office). Once issued it is not redrawn with new
 * figures: changes are credit notes (amount down) or debit notes (amount up) against it.
 */
import { esc, money, inr, day, dateTime, amountInWords, shell, header, meta, box, totals, signature } from './theme.js';
import { bookingFigures } from './bookingFigures.js';
import { recipientOf } from '../finance/financeDocuments.js';
import { STATE_NAMES } from '../finance/financeSettings.js';

export const SAC_ACCOMMODATION = '996311';
const SERVICE = 'Accommodation services (hotel stay)';
const pct = (v) => `${Number.isInteger(v) ? v : Number(v).toFixed(1)}%`;
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

const statusOf = (b, f) => {
  if (['CANCELLED', 'NO_SHOW'].includes(b.status)) return { label: f.refunded ? 'Cancelled · refunded' : 'Cancelled', tone: 'off' };
  if (f.paid >= f.total && f.total > 0) return { label: 'Paid', tone: '' };
  if (f.paid > 0) return { label: 'Part-paid', tone: 'warn' };
  return { label: 'Payable at the hotel', tone: 'warn' };
};

/** Who supplies and who receives, how GST splits, and the issuer's registration line. */
const partiesOf = (b, hotel, brand) => {
  // A business account can have its own mode (Admin → Organisations → terms), kept on the booking
  const mode = b.businessPricing?.invoiceMode || brand.settings.guestInvoice.mode;
  const receipt = mode === 'HOTEL_ISSUES';
  const hp = recipientOf(hotel);
  const zivo = brand.company;
  const posCode = hp.stateCode; const posName = hp.stateName || hotel.state || '';
  const supplierIsHotel = mode !== 'ZIVO_SUPPLIER';
  const intra = supplierIsHotel || (zivo.stateCode && zivo.stateCode === posCode);
  const b2b = Boolean(b.guestCompanyGstin);
  const recipientState = b2b ? String(b.guestCompanyGstin).slice(0, 2) : '';

  const supplierBox = supplierIsHotel
    ? box({ label: receipt ? 'Property' : 'Supplier (the property)', name: hp.legalName, lines: [
      `<span class="muted">${esc(hp.property)} · Property ID ${esc(hp.propertyId)}</span>`,
      `<span class="muted">${esc(hp.address)}</span>`,
      hp.gstin ? `GSTIN <b>${esc(hp.gstin)}</b>${hp.pan ? ` · PAN ${esc(hp.pan)}` : ''}` : '<span class="muted">Not registered for GST</span>',
      `<span class="muted">State: ${esc(posName)}${posCode ? ` (${esc(posCode)})` : ''}</span>`,
    ] })
    : box({ label: 'Supplier', name: zivo.legalName, lines: [
      `<span class="muted">${esc(zivo.address)}</span>`,
      `GSTIN <b>${esc(zivo.gstin || '—')}</b>${zivo.pan ? ` · PAN ${esc(zivo.pan)}` : ''}`,
      `<span class="muted">State: ${esc(zivo.stateName)}${zivo.stateCode ? ` (${esc(zivo.stateCode)})` : ''}</span>`,
    ] });

  const recipientBox = box({
    label: b2b ? 'Recipient (registered business)' : 'Billed to (guest)',
    name: b2b ? b.guestCompanyName : b.guestName,
    lines: [
      b2b ? `GSTIN <b>${esc(b.guestCompanyGstin)}</b>` : '',
      b2b && b.guestCompanyAddress ? `<span class="muted">${esc(b.guestCompanyAddress)}</span>` : '',
      b2b && recipientState ? `<span class="muted">State: ${esc(STATE_NAMES[recipientState] || '')} (${esc(recipientState)})</span>` : '',
      b2b ? `<span class="muted">Guest: ${esc(b.guestName)}</span>` : '',
      `<span class="muted">${esc([b.guestEmail, b.guestPhone].filter(Boolean).join(' · '))}</span>`,
    ],
  });

  // The platform that issues every document (also when the hotel is the supplier)
  const issuer = [
    `Issued by <b>${esc(zivo.legalName)}</b>${zivo.tradeName && zivo.tradeName !== zivo.legalName ? ` (${esc(zivo.tradeName)})` : ''}`,
    zivo.gstin && `GSTIN ${esc(zivo.gstin)}`, zivo.pan && `PAN ${esc(zivo.pan)}`, zivo.cin && `CIN ${esc(zivo.cin)}`,
    zivo.address && `Registered office: ${esc(zivo.address)}`,
  ].filter(Boolean).join(' · ');

  return { mode, receipt, hp, zivo, posCode, posName, supplierIsHotel, intra, b2b, supplierBox, recipientBox, issuer };
};

const taxSplit = (intra, rate, tax) => (intra
  ? [['CGST', rate / 2, r2(tax / 2)], ['SGST', rate / 2, r2(tax - r2(tax / 2))]]
  : [['IGST', rate, r2(tax)]]);

const termsBlock = (brand) => {
  const t = brand.settings.guestInvoice.terms || [];
  return t.length ? `<div class="notes" style="margin-top:10px"><b>Terms</b><ol style="margin:4px 0 0 16px;padding:0">${t.map((x) => `<li>${esc(x)}</li>`).join('')}</ol></div>` : '';
};

/**
 * input: { booking, hotel, rooms, invoiceRef, issueDate, brand } where brand comes from
 * documentSettings.brandContext() ({ company, support, settings, signatory }).
 */
export const guestInvoiceHtml = ({ booking: b, hotel, rooms = [], invoiceRef, issueDate = new Date(), brand }) => {
  const P = partiesOf(b, hotel, brand);
  const { receipt, hp, zivo, posCode, posName, supplierIsHotel, intra, b2b } = P;
  const f = bookingFigures(b, rooms, { roomTypeName: b.roomType?.name, ratePlan: b.ratePlan });
  const rate = f.taxPct ?? 0;
  const taxCols = taxSplit(intra, rate, f.tax);

  const stayBox = box({ label: receipt ? 'Stay' : 'Stay (address of supply)', name: hotel.name, lines: [
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
    [receipt ? 'Booked on' : 'Tax payable under reverse charge', receipt ? day(b.createdAt) : 'No'],
  ])}
${receipt ? '' : meta([
    ['SAC', SAC_ACCOMMODATION],
    ['Service', SERVICE],
    ['Category', b2b ? 'B2B (registered recipient)' : 'B2C (unregistered)'],
    ['Booked on', day(b.createdAt)],
  ])}
<div class="parties three">${P.supplierBox}${P.recipientBox}${stayBox}</div>

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
      ${receipt ? '' : b2b
    ? `<br><b>Input tax credit:</b> available to ${esc(b.guestCompanyName)} (GSTIN ${esc(b.guestCompanyGstin)}) only against this invoice.`
    : '<br>Issued to an unregistered person: no input tax credit.'}
      ${brand.settings.guestInvoice.note ? `<br>${esc(brand.settings.guestInvoice.note)}` : ''}
      <br><b>This is not a valid travel document.</b> Show your booking voucher at check-in.
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
<div class="notes" style="margin-top:10px">${P.issuer}</div>
${termsBlock(brand)}
${signature(zivo.legalName, brand.signatory)}
</div>`;
  return shell(`${title} ${invoiceRef}`, body);
};

/**
 * A credit note (kind CREDIT: the amount went down) or debit note (DEBIT: it went up) against a
 * guest's tax invoice. note: { kind, noteRef, amount (GST included), taxAmount, reason, createdAt };
 * invoice: { invoiceRef, createdAt }.
 */
export const guestNoteHtml = ({ booking: b, hotel, note, invoice, brand, taxPct = null }) => {
  const P = partiesOf(b, hotel, brand);
  const { zivo, posCode, posName, supplierIsHotel, intra, b2b } = P;
  const credit = note.kind === 'CREDIT';
  const amount = r2(note.amount); const tax = r2(note.taxAmount); const taxable = r2(amount - tax);
  const rate = taxPct ?? (taxable > 0 ? Math.round((tax / taxable) * 1000) / 10 : 0);
  const title = credit ? 'Credit Note' : 'Debit Note';
  const body = `<div class="page">
${header({ brandSub: zivo.legalName, title, sub: `Against tax invoice ${invoice.invoiceRef}${supplierIsHotel ? ', issued on behalf of the property' : ''}`, ref: note.noteRef, status: { label: credit ? 'Amount reduced' : 'Amount added', tone: credit ? 'off' : 'warn' } })}
${meta([
    [`${title} date`, day(note.createdAt || new Date())],
    ['Original invoice', `${esc(invoice.invoiceRef)}<br><span class="muted">${day(invoice.createdAt)}</span>`],
    ['Booking', esc(b.bookingRef)],
    ['Place of supply', `${esc(posName || '—')}${posCode ? ` (${esc(posCode)})` : ''}`],
  ])}
${meta([
    ['SAC', SAC_ACCOMMODATION],
    ['Service', SERVICE],
    ['Category', b2b ? 'B2B (registered recipient)' : 'B2C (unregistered)'],
    ['Tax payable under reverse charge', 'No'],
  ])}
<div class="parties">${P.supplierBox}${P.recipientBox}</div>
<table><tr><th style="width:22px">#</th><th>Description</th><th style="width:60px">SAC</th><th class="r" style="width:110px">Amount (₹)</th></tr>
<tr><td>1</td><td><b>${esc(note.reason)}</b><br><span class="muted">${esc(hotel.name)} · ${day(b.checkIn)} → ${day(b.checkOut)}</span></td><td>${SAC_ACCOMMODATION}</td><td class="r">${money(taxable)}</td></tr>
<tr class="t"><td></td><td>Taxable value ${credit ? 'reduced' : 'added'}</td><td></td><td class="r">${money(taxable)}</td></tr></table>
<div class="cols">
  <div>
    <div class="words">Amount in words: ${amountInWords(amount)}</div>
    <div class="notes">${credit
    ? `This credit note reduces the value of tax invoice ${esc(invoice.invoiceRef)} dated ${day(invoice.createdAt)} by ${inr(amount)}, GST included${b2b ? '; the recipient must reduce the input tax credit it claimed by the GST shown' : ''}.`
    : `This debit note adds ${inr(amount)}, GST included, to tax invoice ${esc(invoice.invoiceRef)} dated ${day(invoice.createdAt)}.`}</div>
  </div>
  ${totals([
    ['Taxable value', money(taxable)],
    ...taxSplit(intra, rate, tax).map(([n, r, v]) => [`${n} ${pct(r)}`, money(v)]),
    [credit ? 'Total credit' : 'Total debit', inr(amount), 'grand'],
  ])}
</div>
<div class="notes" style="margin-top:10px">${P.issuer}</div>
${termsBlock(brand)}
${signature(zivo.legalName, brand.signatory)}
</div>`;
  return shell(`${title} ${note.noteRef}`, body);
};

export default { guestInvoiceHtml, guestNoteHtml };
