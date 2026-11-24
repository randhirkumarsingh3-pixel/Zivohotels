/**
 * Commission tax invoices, credit notes and statements for hotels.
 *
 * Monthly invoice: one per hotel per month, for the stays settled (checked out, or a cancellation
 * / no-show charge kept) in that month that aren't on an invoice yet. Each line is one stay: its
 * room value before GST, the commission and the GST on it, split CGST + SGST when the hotel is in
 * ZivoPlus' state and IGST otherwise (as worked out when the stay was settled). Numbered per
 * financial year: ZPC/2026-27/000001; before live invoicing, TEST-ZPC/… (marked as a test).
 *
 * Credit note: gives back the commission (and its GST) on chosen stays of an issued invoice, e.g.
 * after a refund. The amount is owed to the hotel and goes into its next payout.
 *
 * Statement of account: for a hotel and month, the opening balance, each stay settled (booking
 * value, collected online / at the hotel, commission, GST, TCS, TDS, net), credit notes, payouts
 * with their bank reference and the closing balance; with TCS and TDS for the hotel to claim.
 */
import prisma from '../../config/db.js';
import { getFinanceSettings, STATE_NAMES } from './financeSettings.js';
import { hotelGstStateCode } from '../../constants/finance.js';
import { renderPdf as renderThemedPdf, footerLine } from '../documents/theme.js';
import { buildXlsx } from '../../utils/xlsx.js';
import html from './financeDocumentHtml.js';
import ledgerService from './ledgerService.js';

const IST = 330 * 60000;
const n = (v) => Number(v || 0);
const r2 = (v) => Math.round((Number(v) + Number.EPSILON) * 100) / 100;
const bad = (message, status = 400) => Object.assign(new Error(message), { status, statusCode: status });

// ─── Dates and numbers ──────────────────────────────────────────────────────────────────────────

const istNow = () => new Date(Date.now() + IST);
export const currentPeriod = () => istNow().toISOString().slice(0, 7);
export const previousPeriod = () => {
  const d = istNow(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - 1);
  return d.toISOString().slice(0, 7);
};
export const validPeriod = (p) => /^\d{4}-(0[1-9]|1[0-2])$/.test(String(p || ''));
/** The month as moments: from the 1st 00:00 to the next 1st 00:00, India time. */
export const periodRange = (p) => {
  const [y, m] = p.split('-').map(Number);
  return { gte: new Date(Date.UTC(y, m - 1, 1) - IST), lt: new Date(Date.UTC(y, m, 1) - IST) };
};
export const periodLabel = (p) => new Date(`${p}-01T00:00:00Z`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });
/** Indian financial year (April to March) of a date, e.g. "2026-27". */
export const financialYear = (date = new Date()) => {
  const d = new Date(new Date(date).getTime() + IST);
  const y = d.getUTCFullYear() - (d.getUTCMonth() < 3 ? 1 : 0);
  return `${y}-${String((y + 1) % 100).padStart(2, '0')}`;
};
export const documentNumber = (prefix, live, date, seq) => `${live ? '' : 'TEST-'}${prefix}/${financialYear(date)}/${String(seq).padStart(6, '0')}`;

const nextSeq = async (tx, series) => {
  const row = await tx.documentSequence.upsert({ where: { series }, create: { series, counter: 1 }, update: { counter: { increment: 1 } } });
  return row.counter;
};

// ─── Parties ────────────────────────────────────────────────────────────────────────────────────

const supplierOf = (s, hotelStateCode) => ({
  ...s.company,
  stateName: STATE_NAMES[s.company.stateCode] || '',
  // TCS is collected under ZivoPlus' registration in the hotel's state
  tcsGstin: s.tcsRegistrations[hotelStateCode] || null,
});

export const hotelSelect = { id: true, name: true, legalName: true, brandName: true, gstin: true, pan: true, location: true, city: true, state: true, pincode: true, integrationSettings: true, owner: { select: { name: true, email: true } } };

export const recipientOf = (h) => {
  const stateCode = hotelGstStateCode({ gstin: h.gstin, state: h.state || h.integrationSettings?.addressDetails?.state });
  return {
    hotelId: h.id,
    legalName: h.legalName || h.name,
    property: h.brandName && h.brandName !== h.name ? `${h.name} (${h.brandName})` : h.name,
    propertyId: `ZP-${h.id.slice(0, 8).toUpperCase()}`,
    address: [h.location, h.city, h.state, h.pincode].filter(Boolean).join(', '),
    gstin: h.gstin || null,
    pan: h.pan || (h.gstin ? h.gstin.slice(2, 12) : null),
    stateCode,
    stateName: STATE_NAMES[stateCode] || h.state || '',
    registered: Boolean(h.gstin),
    email: h.owner?.email || null,
    ownerName: h.owner?.name || null,
  };
};

// ─── Stays → invoice lines ──────────────────────────────────────────────────────────────────────

const KIND = { STAY: 'Stay', CANCELLATION: 'Cancellation charge', NO_SHOW: 'No-show charge' };
const PAY = { PREPAID: 'Paid online', PARTIAL: 'Part online', PAY_AT_HOTEL: 'Pay at hotel' };

const linesFor = async (settlements) => {
  const bookings = await prisma.booking.findMany({
    where: { id: { in: settlements.map((s) => s.bookingId) } },
    select: { id: true, bookingRef: true, guestName: true, checkIn: true, checkOut: true, stayType: true, hours: true, rooms: true, paymentType: true },
  });
  const by = new Map(bookings.map((b) => [b.id, b]));
  return settlements.map((s) => {
    const b = by.get(s.bookingId) || {};
    const value = r2(n(s.grossAmount) - n(s.taxAmount));
    const commission = r2(n(s.commissionAmount));
    const nights = b.stayType === 'HOURLY' ? 0 : Math.max(1, Math.round((new Date(b.checkOut) - new Date(b.checkIn)) / 86400000));
    return {
      settlementId: s.id,
      bookingId: s.bookingId,
      ref: b.bookingRef || '',
      guest: b.guestName || '',
      checkIn: b.checkIn ? new Date(b.checkIn).toISOString().slice(0, 10) : null,
      checkOut: b.checkOut ? new Date(b.checkOut).toISOString().slice(0, 10) : null,
      stay: b.stayType === 'HOURLY' ? `Hourly (${b.hours || 0} h)` : 'Nightly',
      nights,
      rooms: b.rooms || 1,
      kind: KIND[s.kind] || s.kind,
      payment: PAY[b.paymentType] || '',
      settledAt: s.createdAt,
      value,
      rate: value ? r2((commission / value) * 100) : 0,
      commission,
      cgst: r2(n(s.cgstAmount)),
      sgst: r2(n(s.sgstAmount)),
      igst: r2(n(s.igstAmount)),
      total: r2(commission + n(s.cgstAmount) + n(s.sgstAmount) + n(s.igstAmount)),
    };
  });
};

const sum = (rows, k) => r2(rows.reduce((a, r) => a + n(r[k]), 0));

// ─── Monthly invoices ───────────────────────────────────────────────────────────────────────────

const openSettlements = (period, hotelId) => prisma.settlement.findMany({
  where: { createdAt: periodRange(period), invoiceId: null, commissionAmount: { gt: 0 }, ...(hotelId ? { hotelId } : {}) },
  orderBy: { createdAt: 'asc' },
});

/** What would be invoiced for a month: per hotel, stays and amounts not yet on an invoice. */
export const previewMonth = async (period) => {
  if (!validPeriod(period)) throw bad('Choose a month');
  const [open, issued] = await Promise.all([
    openSettlements(period),
    prisma.financeDocument.findMany({ where: { period, kind: 'INVOICE' }, select: { id: true, number: true, hotelId: true, total: true, stays: true, live: true, emailedAt: true } }),
  ]);
  const hotels = await prisma.hotel.findMany({ where: { id: { in: [...new Set([...open.map((s) => s.hotelId), ...issued.map((d) => d.hotelId)])] } }, select: hotelSelect });
  const rows = hotels.map((h) => {
    const mine = open.filter((s) => s.hotelId === h.id);
    const commission = mine.reduce((a, s) => a + n(s.commissionAmount), 0);
    const gst = mine.reduce((a, s) => a + n(s.commissionGstAmount), 0);
    const rec = recipientOf(h);
    return {
      hotelId: h.id, name: h.name, gstin: h.gstin || null, state: rec.stateName, stateCode: rec.stateCode,
      toInvoice: { stays: mine.length, commission: r2(commission), gst: r2(gst), total: r2(commission + gst) },
      issued: issued.filter((d) => d.hotelId === h.id).map((d) => ({ ...d, total: n(d.total) })),
    };
  }).sort((a, b) => a.name.localeCompare(b.name));
  return { period, label: periodLabel(period), complete: period < currentPeriod(), hotels: rows };
};

/**
 * Issues the invoices for a finished month (all hotels, or one). Stays already on an invoice are
 * skipped, so running it again only invoices what was settled later. Returns the new documents.
 */
export const issueInvoices = async ({ period, hotelId = null, userId = null } = {}) => {
  if (!validPeriod(period)) throw bad('Choose a month');
  if (period >= currentPeriod()) throw bad('A month can be invoiced once it is over');
  const settings = await getFinanceSettings();
  const open = await openSettlements(period, hotelId);
  const byHotel = new Map();
  for (const s of open) { if (!byHotel.has(s.hotelId)) byHotel.set(s.hotelId, []); byHotel.get(s.hotelId).push(s); }
  const hotels = await prisma.hotel.findMany({ where: { id: { in: [...byHotel.keys()] } }, select: hotelSelect });
  const created = [];
  for (const h of hotels) {
    const stays = byHotel.get(h.id);
    const lines = await linesFor(stays);
    const recipient = recipientOf(h);
    const supplier = supplierOf(settings, recipient.stateCode);
    const issueDate = new Date();
    const doc = await prisma.$transaction(async (tx) => {
      // Stays can't be invoiced twice, even if two runs overlap
      const still = await tx.settlement.count({ where: { id: { in: stays.map((s) => s.id) }, invoiceId: null } });
      if (still !== stays.length) return null;
      const live = Boolean(settings.invoice.live);
      const series = `${live ? '' : 'TEST-'}${settings.invoice.prefix}/${financialYear(issueDate)}`;
      const seq = await nextSeq(tx, series);
      const d = await tx.financeDocument.create({
        data: {
          kind: 'INVOICE', number: documentNumber(settings.invoice.prefix, live, issueDate, seq), series, seq, live,
          hotelId: h.id, period, issueDate, placeOfSupply: recipient.stateCode,
          supplier: { ...supplier, sac: settings.invoice.sac, description: settings.invoice.description, signatory: settings.invoice.signatory },
          recipient, lines,
          stays: lines.length, bookingValue: sum(lines, 'value'), taxable: sum(lines, 'commission'),
          cgst: sum(lines, 'cgst'), sgst: sum(lines, 'sgst'), igst: sum(lines, 'igst'), total: sum(lines, 'total'),
          createdById: userId,
        },
      });
      await tx.settlement.updateMany({ where: { id: { in: stays.map((s) => s.id) } }, data: { invoiceId: d.id } });
      await tx.auditLog.create({ data: { action: 'COMMISSION_INVOICE_ISSUED', entityType: 'FINANCE_DOCUMENT', entityId: d.id, userId: userId || 'SYSTEM', details: { number: d.number, hotelId: h.id, period, total: n(d.total), stays: lines.length } } });
      return d;
    });
    if (doc) created.push(doc);
  }
  return created;
};

// ─── Credit notes ───────────────────────────────────────────────────────────────────────────────

const creditedRefs = async (invoiceId) => {
  const notes = await prisma.financeDocument.findMany({ where: { kind: 'CREDIT_NOTE', originalId: invoiceId }, select: { lines: true } });
  return new Set(notes.flatMap((d) => (d.lines || []).map((l) => l.settlementId)));
};

/**
 * Gives back the commission and its GST on chosen stays of an invoice. The amount is owed to the
 * hotel (HotelAdjustment, paid with its next payout) and the ledger is corrected.
 */
export const issueCreditNote = async ({ invoiceId, settlementIds = [], reason, userId = null } = {}) => {
  const why = String(reason || '').trim();
  if (why.length < 5) throw bad('Say why the commission is given back (at least a few words)');
  const inv = await prisma.financeDocument.findUnique({ where: { id: invoiceId } });
  if (!inv || inv.kind !== 'INVOICE') throw bad('Invoice not found', 404);
  const done = await creditedRefs(inv.id);
  const chosen = (inv.lines || []).filter((l) => settlementIds.includes(l.settlementId));
  if (!chosen.length) throw bad('Choose at least one stay from the invoice');
  if (chosen.some((l) => done.has(l.settlementId))) throw bad('A credit note was already issued for one of these stays');
  const settings = await getFinanceSettings();
  const issueDate = new Date();
  const total = sum(chosen, 'total');
  return prisma.$transaction(async (tx) => {
    const series = `${inv.live ? '' : 'TEST-'}${settings.invoice.creditPrefix}/${financialYear(issueDate)}`;
    const seq = await nextSeq(tx, series);
    const d = await tx.financeDocument.create({
      data: {
        kind: 'CREDIT_NOTE', number: documentNumber(settings.invoice.creditPrefix, inv.live, issueDate, seq), series, seq, live: inv.live,
        hotelId: inv.hotelId, period: new Date(issueDate.getTime() + IST).toISOString().slice(0, 7), issueDate,
        placeOfSupply: inv.placeOfSupply, supplier: inv.supplier, recipient: inv.recipient, lines: chosen,
        stays: chosen.length, bookingValue: sum(chosen, 'value'), taxable: sum(chosen, 'commission'),
        cgst: sum(chosen, 'cgst'), sgst: sum(chosen, 'sgst'), igst: sum(chosen, 'igst'), total,
        originalId: inv.id, reason: why.slice(0, 500), createdById: userId,
      },
    });
    await tx.hotelAdjustment.create({ data: { hotelId: inv.hotelId, amount: total, reason: `Credit note ${d.number} (against ${inv.number})`, documentId: d.id } });
    await ledgerService.record([
      { referenceId: d.id, account: 'ZIVO', type: 'DEBIT', amount: sum(chosen, 'commission'), description: `Commission given back, credit note ${d.number}` },
      { referenceId: d.id, account: 'GST_ON_COMMISSION', type: 'DEBIT', amount: r2(total - sum(chosen, 'commission')), description: `GST on commission given back, credit note ${d.number}` },
      { referenceId: d.id, account: 'HOTEL', type: 'CREDIT', amount: total, description: `Owed to hotel, credit note ${d.number}` },
    ].filter((e) => e.amount > 0), tx);
    await tx.auditLog.create({ data: { action: 'COMMISSION_CREDIT_NOTE_ISSUED', entityType: 'FINANCE_DOCUMENT', entityId: d.id, userId: userId || 'SYSTEM', details: { number: d.number, against: inv.number, total, reason: why } } });
    await tx.notification.create({ data: { hotelId: inv.hotelId, type: 'PAYOUT', title: 'Commission credit note', message: `Credit note ${d.number}: ₹${total.toLocaleString('en-IN')} of commission given back; it is added to your next payout.`, metadata: { documentId: d.id } } });
    return d;
  });
};

// ─── Statement of account ───────────────────────────────────────────────────────────────────────

/** A hotel's month: opening balance, stays settled, credit notes, payouts, closing balance. */
export const statementFor = async (hotelId, period) => {
  if (!validPeriod(period)) throw bad('Choose a month');
  const range = periodRange(period);
  const [hotel, settings] = await Promise.all([prisma.hotel.findUnique({ where: { id: hotelId }, select: hotelSelect }), getFinanceSettings()]);
  if (!hotel) throw bad('Hotel not found', 404);
  const [before, settled, adjBefore, adjusts, paidBefore, payouts, documents, bank] = await Promise.all([
    prisma.settlement.aggregate({ where: { hotelId, createdAt: { lt: range.gte } }, _sum: { netPayable: true } }),
    prisma.settlement.findMany({ where: { hotelId, createdAt: range }, orderBy: { createdAt: 'asc' } }),
    prisma.hotelAdjustment.aggregate({ where: { hotelId, createdAt: { lt: range.gte } }, _sum: { amount: true } }),
    prisma.hotelAdjustment.findMany({ where: { hotelId, createdAt: range }, orderBy: { createdAt: 'asc' } }),
    prisma.payout.aggregate({ where: { hotelId, status: 'SUCCESS', createdAt: { lt: range.gte } }, _sum: { totalAmount: true } }),
    prisma.payout.findMany({ where: { hotelId, status: 'SUCCESS', createdAt: range }, orderBy: { createdAt: 'asc' } }),
    prisma.financeDocument.findMany({ where: { hotelId, OR: [{ period }, { kind: 'CREDIT_NOTE', issueDate: range }] }, orderBy: { issueDate: 'asc' }, select: { id: true, kind: true, number: true, issueDate: true, total: true, live: true, period: true } }),
    prisma.bankDetail.findUnique({ where: { hotelId }, select: { bankName: true, accountNumber: true } }),
  ]);
  const lines = await linesFor(settled);
  const full = new Map(settled.map((s) => [s.id, s]));
  const stays = lines.map((l) => {
    const s = full.get(l.settlementId);
    const gross = n(s.grossAmount);
    const onlinePlusFunded = r2(n(s.netPayable) + n(s.commissionAmount) + n(s.commissionGstAmount) + n(s.tcsAmount) + n(s.tdsAmount));
    return { ...l, tcsRate: s.rates?.tcsPercent ?? null, tdsRate: s.rates?.tdsPercent ?? null, gross: r2(gross), roomGst: r2(n(s.taxAmount)), online: onlinePlusFunded, atHotel: r2(Math.max(0, gross - onlinePlusFunded)), tcs: r2(n(s.tcsAmount)), tds: r2(n(s.tdsAmount)), net: r2(n(s.netPayable)), status: s.status, invoiceId: s.invoiceId };
  });
  const opening = r2(n(before._sum.netPayable) + n(adjBefore._sum.amount) - n(paidBefore._sum.totalAmount));
  const earned = sum(stays, 'net');
  const credits = r2(adjusts.reduce((a, x) => a + n(x.amount), 0));
  const paid = r2(payouts.reduce((a, p) => a + n(p.totalAmount), 0));
  const recipient = recipientOf(hotel);
  const supplier = supplierOf(settings, recipient.stateCode);
  return {
    period, label: periodLabel(period), live: Boolean(settings.invoice.live), supplier, recipient,
    totals: {
      stays: stays.length, gross: sum(stays, 'gross'), value: sum(stays, 'value'), roomGst: sum(stays, 'roomGst'), online: sum(stays, 'online'), atHotel: sum(stays, 'atHotel'),
      commission: sum(stays, 'commission'), commissionGst: r2(sum(stays, 'cgst') + sum(stays, 'sgst') + sum(stays, 'igst')), cgst: sum(stays, 'cgst'), sgst: sum(stays, 'sgst'), igst: sum(stays, 'igst'),
      tcs: sum(stays, 'tcs'), tds: sum(stays, 'tds'), earned, credits, paid, opening, closing: r2(opening + earned + credits - paid),
    },
    stays,
    adjustments: adjusts.map((a) => ({ at: a.createdAt, amount: n(a.amount), reason: a.reason, status: a.status })),
    payouts: payouts.map((p) => ({ at: p.createdAt, amount: n(p.totalAmount), reference: p.reference, account: bank ? `${bank.bankName} ••••${String(bank.accountNumber).slice(-4)}` : '' })),
    documents: documents.map((d) => ({ ...d, total: n(d.total) })),
  };
};

/** Twelve months of a hotel's earnings (net payable, commission, stays), oldest first. */
export const earningsByMonth = async (hotelId, months = 12) => {
  const end = currentPeriod();
  const [y, m] = end.split('-').map(Number);
  const start = new Date(Date.UTC(y, m - months, 1) - IST);
  const rows = await prisma.settlement.findMany({ where: { hotelId, createdAt: { gte: start } }, select: { createdAt: true, netPayable: true, commissionAmount: true, grossAmount: true } });
  const out = [];
  for (let i = months - 1; i >= 0; i -= 1) {
    const p = new Date(Date.UTC(y, m - 1 - i, 1)).toISOString().slice(0, 7);
    const mine = rows.filter((r) => new Date(new Date(r.createdAt).getTime() + IST).toISOString().slice(0, 7) === p);
    out.push({ period: p, label: new Date(`${p}-01T00:00:00Z`).toLocaleDateString('en-IN', { month: 'short', timeZone: 'UTC' }), stays: mine.length, gross: r2(mine.reduce((a, r) => a + n(r.grossAmount), 0)), commission: r2(mine.reduce((a, r) => a + n(r.commissionAmount), 0)), net: r2(mine.reduce((a, r) => a + n(r.netPayable), 0)) });
  }
  return out;
};

/** TCS and TDS per quarter of the financial year (for Form 26AS and the GST portal). */
export const taxByQuarter = async (hotelId, fy = financialYear()) => {
  const y = Number(fy.slice(0, 4));
  const rows = await prisma.settlement.findMany({ where: { hotelId, createdAt: { gte: new Date(Date.UTC(y, 3, 1) - IST), lt: new Date(Date.UTC(y + 1, 3, 1) - IST) } }, select: { createdAt: true, tcsAmount: true, tdsAmount: true, grossAmount: true, taxAmount: true } });
  const q = [['Q1', 'Apr–Jun'], ['Q2', 'Jul–Sep'], ['Q3', 'Oct–Dec'], ['Q4', 'Jan–Mar']].map(([k, label]) => ({ quarter: k, label, value: 0, tcs: 0, tds: 0 }));
  for (const r of rows) {
    const mo = new Date(new Date(r.createdAt).getTime() + IST).getUTCMonth();
    const i = mo >= 3 ? Math.floor((mo - 3) / 3) : 3;
    q[i].value += n(r.grossAmount) - n(r.taxAmount); q[i].tcs += n(r.tcsAmount); q[i].tds += n(r.tdsAmount);
  }
  return { fy, quarters: q.map((x) => ({ ...x, value: r2(x.value), tcs: r2(x.tcs), tds: r2(x.tds) })) };
};

// ─── One property, one financial year ──────────────────────────────────────────────────────────

/** Month by month for a property in a financial year: stays, commission, taxes, net, paid, documents. */
export const propertyYear = async (hotelId, fy = financialYear()) => {
  if (!/^\d{4}-\d{2}$/.test(String(fy))) throw bad('Choose a financial year, e.g. 2026-27');
  const y = Number(fy.slice(0, 4));
  const range = { gte: new Date(Date.UTC(y, 3, 1) - IST), lt: new Date(Date.UTC(y + 1, 3, 1) - IST) };
  const hotel = await prisma.hotel.findUnique({ where: { id: hotelId }, select: hotelSelect });
  if (!hotel) throw bad('Property not found', 404);
  const months = [];
  for (let i = 0; i < 12; i += 1) {
    const p = new Date(Date.UTC(y, 3 + i, 1)).toISOString().slice(0, 7);
    if (p > currentPeriod()) break;
    months.push(p);
  }
  const [settled, payouts, documents] = await Promise.all([
    prisma.settlement.findMany({ where: { hotelId, createdAt: range }, select: { createdAt: true, grossAmount: true, taxAmount: true, commissionAmount: true, commissionGstAmount: true, tcsAmount: true, tdsAmount: true, netPayable: true, invoiceId: true } }),
    prisma.payout.findMany({ where: { hotelId, status: 'SUCCESS', createdAt: range }, select: { createdAt: true, totalAmount: true, reference: true } }),
    prisma.financeDocument.findMany({ where: { hotelId, period: { in: months } }, orderBy: { issueDate: 'asc' }, select: { id: true, kind: true, number: true, period: true, issueDate: true, taxable: true, cgst: true, sgst: true, igst: true, total: true, live: true, emailedAt: true, reason: true } }),
  ]);
  const monthOf = (d) => new Date(new Date(d).getTime() + IST).toISOString().slice(0, 7);
  const rows = months.map((p) => {
    const mine = settled.filter((x) => monthOf(x.createdAt) === p);
    const add = (k) => r2(mine.reduce((a, x) => a + n(x[k]), 0));
    const docs = documents.filter((d) => d.period === p).map((d) => ({ ...d, taxable: n(d.taxable), gst: r2(n(d.cgst) + n(d.sgst) + n(d.igst)), total: n(d.total) }));
    return {
      period: p, label: periodLabel(p), stays: mine.length, uninvoiced: mine.filter((x) => !x.invoiceId && n(x.commissionAmount) > 0).length,
      gross: add('grossAmount'), value: r2(add('grossAmount') - add('taxAmount')), commission: add('commissionAmount'), commissionGst: add('commissionGstAmount'),
      tcs: add('tcsAmount'), tds: add('tdsAmount'), net: add('netPayable'),
      paid: r2(payouts.filter((x) => monthOf(x.createdAt) === p).reduce((a, x) => a + n(x.totalAmount), 0)),
      documents: docs,
    };
  });
  const sumOf = (k) => r2(rows.reduce((a, x) => a + n(x[k]), 0));
  const rec = recipientOf(hotel);
  return {
    fy, hotel: { id: hotel.id, name: hotel.name, gstin: rec.gstin, state: rec.stateName, legalName: rec.legalName },
    months: rows,
    totals: { stays: sumOf('stays'), gross: sumOf('gross'), value: sumOf('value'), commission: sumOf('commission'), commissionGst: sumOf('commissionGst'), tcs: sumOf('tcs'), tds: sumOf('tds'), net: sumOf('net'), paid: sumOf('paid'), documents: documents.length },
  };
};

/** A ZIP of documents' PDFs (at most 200), named by number. */
export const documentsZip = async (docs) => {
  const { zipSync } = await import('fflate');
  const files = {};
  for (const d of docs.slice(0, 200)) files[`${d.number.replace(/\//g, '-')}.pdf`] = new Uint8Array(await documentPdf(d));
  return Buffer.from(zipSync(files, { level: 0 }));
};

// ─── Files ──────────────────────────────────────────────────────────────────────────────────────

// Every page carries ZivoPlus's legal line and page numbers (services/documents/theme.js)
const pdfFrom = async (markup) => {
  const { company } = await getFinanceSettings();
  return renderThemedPdf(markup, { footer: footerLine(company, {}) });
};

export const documentPdf = async (doc) => {
  const original = doc.originalId ? await prisma.financeDocument.findUnique({ where: { id: doc.originalId }, select: { number: true, issueDate: true } }) : null;
  return pdfFrom(await html.documentHtml(doc, { original }));
};

export const statementPdf = async (hotelId, period) => pdfFrom(await html.statementHtml(await statementFor(hotelId, period)));

/** The month's workbook: Summary, Stays, Commission, TCS, TDS, Payouts, Credit notes. */
export const statementWorkbook = async (hotelId, period) => {
  const s = await statementFor(hotelId, period);
  const t = s.totals;
  const money = (key, label) => ({ key, label, type: 'money' });
  return buildXlsx([
    {
      name: 'Summary',
      columns: [{ key: 'item', label: `${s.recipient.property} · ${s.label}` }, money('amount', 'Amount (₹)')],
      rows: [
        { item: 'Opening balance', amount: t.opening },
        { item: `Stays settled (${t.stays})`, amount: null },
        { item: 'Booking value incl. GST', amount: t.gross },
        { item: 'Paid online by guests (and offers paid by ZivoPlus)', amount: t.online },
        { item: 'Paid at the hotel', amount: t.atHotel },
        { item: 'Commission', amount: -t.commission },
        { item: 'GST on commission', amount: -t.commissionGst },
        { item: 'TCS (GST section 52)', amount: -t.tcs },
        { item: 'TDS (Income Tax section 194-O)', amount: -t.tds },
        { item: 'Net earned this month', amount: t.earned },
        { item: 'Credit notes (commission given back)', amount: t.credits },
        { item: 'Paid out', amount: -t.paid },
        { item: 'Closing balance', amount: t.closing },
      ],
    },
    {
      name: 'Stays',
      columns: [{ key: 'ref', label: 'Booking' }, { key: 'guest', label: 'Guest' }, { key: 'checkIn', label: 'Check-in', type: 'date' }, { key: 'checkOut', label: 'Check-out', type: 'date' }, { key: 'stay', label: 'Stay' }, { key: 'nights', label: 'Nights', type: 'int' }, { key: 'kind', label: 'Type' }, { key: 'payment', label: 'Payment' },
        money('gross', 'Booking value incl. GST'), money('value', 'Room value before GST'), money('online', 'Paid online'), money('atHotel', 'Paid at hotel'), money('commission', 'Commission'), { key: 'rate', label: 'Rate', type: 'pct' },
        money('cgst', 'CGST'), money('sgst', 'SGST'), money('igst', 'IGST'), money('tcs', 'TCS'), money('tds', 'TDS'), money('net', 'Net payable')],
      rows: s.stays,
      totals: { gross: t.gross, value: t.value, online: t.online, atHotel: t.atHotel, commission: t.commission, cgst: t.cgst, sgst: t.sgst, igst: t.igst, tcs: t.tcs, tds: t.tds, net: t.earned },
    },
    {
      name: 'TCS',
      columns: [{ key: 'ref', label: 'Booking' }, { key: 'checkOut', label: 'Check-out', type: 'date' }, { key: 'hotelGstin', label: 'Hotel GSTIN' }, { key: 'tcsGstin', label: 'ZivoPlus TCS GSTIN' }, money('base', 'TCS base (online value before GST)'), { key: 'rate', label: 'TCS rate', type: 'pct' }, money('half1', 'CGST TCS'), money('half2', 'SGST TCS'), money('tcs', 'Total TCS')],
      // The hotel's room sales are within its own state, so TCS is collected as CGST + SGST halves
      // Base: the online part of the stay before GST (as TCS was worked out on it)
      rows: s.stays.filter((x) => x.tcs > 0).map((x) => {
        const base = x.gross ? r2(x.online * (x.value / x.gross)) : 0;
        return { ref: x.ref, checkOut: x.checkOut, hotelGstin: s.recipient.gstin, tcsGstin: s.supplier.tcsGstin || 'Registration pending', base, rate: x.tcsRate ?? (base ? r2((x.tcs / base) * 100) : null), half1: r2(x.tcs / 2), half2: r2(x.tcs - r2(x.tcs / 2)), tcs: x.tcs };
      }),
      totals: { tcs: t.tcs, half1: r2(t.tcs / 2), half2: r2(t.tcs - r2(t.tcs / 2)) },
    },
    {
      name: 'TDS',
      columns: [{ key: 'ref', label: 'Booking' }, { key: 'checkOut', label: 'Check-out', type: 'date' }, { key: 'pan', label: 'Hotel PAN' }, money('base', 'TDS base (sale value)'), { key: 'rate', label: 'TDS rate', type: 'pct' }, money('tds', 'TDS')],
      rows: s.stays.filter((x) => x.tds > 0).map((x) => ({ ref: x.ref, checkOut: x.checkOut, pan: s.recipient.pan || 'Not on file', base: x.value, rate: x.tdsRate ?? (x.value ? r2((x.tds / x.value) * 100) : null), tds: x.tds })),
      totals: { tds: t.tds },
    },
    {
      name: 'Payouts',
      columns: [{ key: 'at', label: 'Date', type: 'datetime' }, { key: 'reference', label: 'Bank reference (UTR)' }, { key: 'account', label: 'To account' }, money('amount', 'Amount')],
      rows: s.payouts, totals: { amount: t.paid },
    },
    {
      name: 'Documents',
      columns: [{ key: 'kind', label: 'Document' }, { key: 'number', label: 'Number' }, { key: 'issueDate', label: 'Date', type: 'date' }, money('total', 'Total incl. GST')],
      rows: s.documents.map((d) => ({ ...d, kind: d.kind === 'INVOICE' ? 'Commission tax invoice' : 'Credit note' })),
    },
  ]);
};

export default { propertyYear, documentsZip, previewMonth, issueInvoices, issueCreditNote, statementFor, earningsByMonth, taxByQuarter, documentPdf, statementPdf, statementWorkbook, financialYear, documentNumber, periodRange, previousPeriod, currentPeriod, validPeriod, periodLabel };
