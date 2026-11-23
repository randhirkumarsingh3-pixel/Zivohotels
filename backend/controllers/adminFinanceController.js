/**
 * Admin → Finance: the ledger (every money movement, double entry) and payouts (what each hotel is
 * owed now, on hold, paid, and the payout history). Recording a payout uses the existing
 * /admin/wallets/hotels/:hotelId/payout (bank transfer reference), until RazorpayX payouts.
 */
import { asyncHandler } from '../middleware/asyncHandler.js';
import prisma from '../config/db.js';
import { normaliseFilters } from '../services/reportService.js';
import financeDocs from '../services/finance/financeDocuments.js';
import financeMail from '../services/finance/financeMail.js';
import { getFinanceSettings, saveFinanceSettings, readiness, STATE_NAMES } from '../services/finance/financeSettings.js';
import { hotelGstStateCode } from '../constants/finance.js';
import { buildCsv } from '../utils/xlsx.js';

const IST = 330 * 60000;
const n = (v) => Number(v || 0);
const r2 = (v) => Math.round((v + Number.EPSILON) * 100) / 100;
const range = (from, to) => ({ gte: new Date(new Date(`${from}T00:00:00Z`).getTime() - IST), lt: new Date(new Date(`${to}T00:00:00Z`).getTime() + 86400000 - IST) });

const ACCOUNTS = {
  SALES_GUEST: 'Guest payments received', TAX_COLLECTED: 'GST collected on rooms', HOTEL: 'Owed to hotels',
  ZIVO_COMMISSION: 'ZivoPlus commission', ZIVO: 'ZivoPlus', GST_ON_COMMISSION: 'GST on commission', TCS_PAYABLE: 'TCS to deposit',
  TDS_PAYABLE: 'TDS to deposit', ZIVO_PROMOTIONS: 'Offers paid by ZivoPlus', ZIVO_CASH: 'Zivo Cash (guest wallets)', USER: 'Guest wallets',
  ZIVO_BANK_OPERATIONAL: 'ZivoPlus bank', MEMBERSHIP_REVENUE: 'Membership revenue', ZIVO_MEMBERSHIP: 'Membership',
};

export const ledger = asyncHandler(async (req, res) => {
  const f = normaliseFilters(req.query);
  const account = req.query.account ? String(req.query.account) : null;
  const page = Math.max(1, Number(req.query.page) || 1);
  const where = { createdAt: range(f.from, f.to), ...(account ? { account } : {}) };
  const [entries, count, sums] = await Promise.all([
    prisma.ledgerEntry.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * 100, take: 100, select: { id: true, createdAt: true, referenceId: true, referenceType: true, account: true, type: true, amount: true, description: true } }),
    prisma.ledgerEntry.count({ where }),
    prisma.ledgerEntry.groupBy({ by: ['account', 'type'], where: { createdAt: range(f.from, f.to) }, _sum: { amount: true }, _count: true }),
  ]);
  const acc = {};
  for (const s of sums) {
    const a = (acc[s.account] ||= { account: s.account, label: ACCOUNTS[s.account] || s.account, credit: 0, debit: 0, entries: 0 });
    a[s.type === 'CREDIT' ? 'credit' : 'debit'] += n(s._sum.amount);
    a.entries += s._count;
  }
  const accounts = Object.values(acc).map((a) => ({ ...a, credit: r2(a.credit), debit: r2(a.debit), balance: r2(a.credit - a.debit) })).sort((a, b) => a.label.localeCompare(b.label));
  const credit = r2(accounts.reduce((s, a) => s + a.credit, 0));
  const debit = r2(accounts.reduce((s, a) => s + a.debit, 0));
  res.json({
    success: true,
    data: {
      filters: { from: f.from, to: f.to, account },
      accounts, totals: { credit, debit, difference: r2(credit - debit) },
      entries: entries.map((e) => ({ ...e, amount: n(e.amount), accountLabel: ACCOUNTS[e.account] || e.account })),
      page, pages: Math.max(1, Math.ceil(count / 100)), count,
    },
  });
});

export const payouts = asyncHandler(async (req, res) => {
  const now = new Date();
  const [hotels, open, history, banks] = await Promise.all([
    prisma.hotel.findMany({ where: { isDeleted: false }, select: { id: true, name: true, city: true, payoutCycle: true }, orderBy: { name: 'asc' } }),
    prisma.settlement.findMany({ where: { status: { in: ['PENDING', 'READY'] } }, select: { hotelId: true, status: true, netPayable: true, holdUntil: true } }),
    prisma.payout.findMany({ orderBy: { createdAt: 'desc' }, take: 300, select: { id: true, hotelId: true, totalAmount: true, status: true, reference: true, createdAt: true } }),
    prisma.bankDetail.findMany({ select: { hotelId: true, bankName: true, accountNumber: true, ifscCode: true } }),
  ]);
  // Credit notes (commission given back) are paid with the next payout
  const adjustments = await prisma.hotelAdjustment.findMany({ where: { status: 'PENDING' }, select: { hotelId: true, amount: true } });
  const bank = new Map(banks.map((b) => [b.hotelId, b]));
  const name = new Map(hotels.map((h) => [h.id, h.name]));
  const by = new Map(hotels.map((h) => [h.id, { hotelId: h.id, name: h.name, city: h.city, cycle: h.payoutCycle, due: 0, dueCount: 0, onHold: 0, holdCount: 0, nextDate: null, lastPayout: null, paidTotal: 0 }]));
  for (const s of open) {
    const row = by.get(s.hotelId);
    if (!row) continue;
    const isDue = s.status === 'READY' || (s.holdUntil && new Date(s.holdUntil) <= now);
    if (isDue) { row.due += n(s.netPayable); row.dueCount += 1; } else {
      row.onHold += n(s.netPayable); row.holdCount += 1;
      if (s.holdUntil && (!row.nextDate || new Date(s.holdUntil) < new Date(row.nextDate))) row.nextDate = s.holdUntil;
    }
  }
  for (const a of adjustments) {
    const row = by.get(a.hotelId);
    if (row) { row.due += n(a.amount); row.dueCount += 1; }
  }
  for (const p of history) {
    const row = by.get(p.hotelId);
    if (!row) continue;
    if (!row.lastPayout) row.lastPayout = { amount: n(p.totalAmount), reference: p.reference, at: p.createdAt };
    if (p.status === 'SUCCESS') row.paidTotal += n(p.totalAmount);
  }
  const rows = [...by.values()].map((r) => {
    const b = bank.get(r.hotelId);
    return { ...r, due: r2(r.due), onHold: r2(r.onHold), paidTotal: r2(r.paidTotal), bank: b ? { bankName: b.bankName, last4: String(b.accountNumber).slice(-4), ifsc: b.ifscCode } : null };
  });
  res.json({
    success: true,
    data: {
      hotels: rows,
      totals: { due: r2(rows.reduce((s, r) => s + Math.max(0, r.due), 0)), owedByHotels: r2(rows.reduce((s, r) => s + Math.min(0, r.due), 0)), onHold: r2(rows.reduce((s, r) => s + r.onHold, 0)) },
      history: history.map((p) => ({ ...p, totalAmount: n(p.totalAmount), hotel: name.get(p.hotelId) || '' })),
    },
  });
});

// ─── Invoices, credit notes, statements, settings ───────────────────────────────────────────────

const sendFile = (res, buf, name, type) => {
  res.setHeader('Content-Type', type);
  res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
  res.send(buf);
};
const PDF = 'application/pdf';
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const hotelStates = async () => {
  const hotels = await prisma.hotel.findMany({ where: { isDeleted: false, status: { in: ['LIVE', 'ACTIVE'] } }, select: { gstin: true, state: true, integrationSettings: true } });
  return hotels.map((h) => hotelGstStateCode({ gstin: h.gstin, state: h.state || h.integrationSettings?.addressDetails?.state })).filter(Boolean);
};

export const getSettings = asyncHandler(async (req, res) => {
  const [settings, states] = await Promise.all([getFinanceSettings(), hotelStates()]);
  const last = await prisma.systemConfig.findUnique({ where: { key: 'finance_monthly_last' } }).catch(() => null);
  res.json({ success: true, data: { settings, readiness: readiness(settings, states), states: STATE_NAMES, hotelStates: [...new Set(states)], lastRun: last?.value || null } });
});

export const putSettings = asyncHandler(async (req, res) => {
  const settings = await saveFinanceSettings(req.body || {}, { userId: req.user.id });
  await prisma.auditLog.create({ data: { action: 'FINANCE_SETTINGS_SAVED', entityType: 'SYSTEM_CONFIG', entityId: 'finance_settings', userId: req.user.id, details: { live: settings.invoice.live } } }).catch(() => {});
  res.json({ success: true, data: { settings } });
});

export const listDocuments = asyncHandler(async (req, res) => {
  const where = {
    ...(financeDocs.validPeriod(req.query.period) ? { period: String(req.query.period) } : {}),
    ...(req.query.hotelId ? { hotelId: String(req.query.hotelId) } : {}),
    ...(['INVOICE', 'CREDIT_NOTE'].includes(req.query.kind) ? { kind: req.query.kind } : {}),
  };
  const rows = await prisma.financeDocument.findMany({ where, orderBy: { issueDate: 'desc' }, take: 500, select: { id: true, kind: true, number: true, live: true, hotelId: true, period: true, issueDate: true, stays: true, taxable: true, cgst: true, sgst: true, igst: true, total: true, originalId: true, reason: true, emailedAt: true, recipient: true } });
  if (req.query.format === 'csv') {
    const columns = [{ key: 'number', label: 'Number' }, { key: 'kind', label: 'Type' }, { key: 'issueDate', label: 'Date', type: 'date' }, { key: 'period', label: 'Month' }, { key: 'hotel', label: 'Hotel' }, { key: 'gstin', label: 'Hotel GSTIN' }, { key: 'taxable', label: 'Taxable value', type: 'money' }, { key: 'cgst', label: 'CGST', type: 'money' }, { key: 'sgst', label: 'SGST', type: 'money' }, { key: 'igst', label: 'IGST', type: 'money' }, { key: 'total', label: 'Total', type: 'money' }];
    const data = rows.map((d) => ({ ...d, kind: d.kind === 'INVOICE' ? 'Tax invoice' : 'Credit note', hotel: d.recipient?.property, gstin: d.recipient?.gstin || '', taxable: n(d.taxable), cgst: n(d.cgst), sgst: n(d.sgst), igst: n(d.igst), total: n(d.total) }));
    return sendFile(res, buildCsv({ columns, rows: data }), `ZivoPlus-commission-documents${where.period ? `-${where.period}` : ''}.csv`, 'text/csv; charset=utf-8');
  }
  res.json({ success: true, data: rows.map((d) => ({ ...d, hotel: d.recipient?.property, gstin: d.recipient?.gstin || null, recipient: undefined, taxable: n(d.taxable), cgst: n(d.cgst), sgst: n(d.sgst), igst: n(d.igst), total: n(d.total) })) });
});

export const getDocument = asyncHandler(async (req, res) => {
  const d = await prisma.financeDocument.findUnique({ where: { id: req.params.id } });
  if (!d) return res.status(404).json({ success: false, message: 'Document not found' });
  if (req.query.format === 'pdf') return sendFile(res, await financeDocs.documentPdf(d), `${d.number.replace(/\//g, '-')}.pdf`, PDF);
  const credited = await prisma.financeDocument.findMany({ where: { originalId: d.id }, select: { id: true, number: true, lines: true, total: true } });
  res.json({ success: true, data: { ...d, taxable: n(d.taxable), cgst: n(d.cgst), sgst: n(d.sgst), igst: n(d.igst), total: n(d.total), bookingValue: n(d.bookingValue), creditNotes: credited.map((c) => ({ id: c.id, number: c.number, total: n(c.total), settlementIds: (c.lines || []).map((l) => l.settlementId) })) } });
});

export const previewMonth = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await financeDocs.previewMonth(req.params.period) });
});

export const issueMonth = asyncHandler(async (req, res) => {
  const created = await financeDocs.issueInvoices({ period: req.params.period, hotelId: req.body?.hotelId || null, userId: req.user.id });
  res.status(201).json({ success: true, data: { issued: created.map((d) => ({ id: d.id, number: d.number, hotelId: d.hotelId, total: n(d.total) })) } });
});

export const creditNote = asyncHandler(async (req, res) => {
  const d = await financeDocs.issueCreditNote({ invoiceId: req.params.id, settlementIds: Array.isArray(req.body?.settlementIds) ? req.body.settlementIds : [], reason: req.body?.reason, userId: req.user.id });
  res.status(201).json({ success: true, data: { id: d.id, number: d.number, total: n(d.total) } });
});

export const statement = asyncHandler(async (req, res) => {
  const { hotelId, period } = req.query;
  if (!hotelId) return res.status(400).json({ success: false, message: 'Choose a property' });
  if (req.query.format === 'pdf') return sendFile(res, await financeDocs.statementPdf(String(hotelId), String(period)), `ZivoPlus-Statement-${period}.pdf`, PDF);
  if (req.query.format === 'xlsx') return sendFile(res, await financeDocs.statementWorkbook(String(hotelId), String(period)), `ZivoPlus-Statement-${period}.xlsx`, XLSX);
  res.json({ success: true, data: await financeDocs.statementFor(String(hotelId), String(period)) });
});

export const emailMonth = asyncHandler(async (req, res) => {
  const { period } = req.params;
  if (!financeDocs.validPeriod(period)) return res.status(400).json({ success: false, message: 'Choose a month' });
  const ids = req.body?.hotelId ? [String(req.body.hotelId)] : await financeMail.hotelsWithActivity(period);
  const sent = [];
  for (const id of ids) { const to = await financeMail.emailOwner(id, period); if (to) sent.push(id); }
  res.json({ success: true, data: { queued: sent.length, skipped: ids.length - sent.length } });
});

export const propertyYear = asyncHandler(async (req, res) => {
  const fy = String(req.query.fy || financeDocs.financialYear());
  res.json({ success: true, data: await financeDocs.propertyYear(req.params.hotelId, fy) });
});

/** ZIP of invoice / credit-note PDFs: a month (?period) or a property's financial year (?hotelId&fy). */
export const documentsZip = asyncHandler(async (req, res) => {
  const { period, hotelId, fy } = req.query;
  const where = {};
  let name = 'ZivoPlus-commission-documents';
  if (hotelId) {
    where.hotelId = String(hotelId);
    const f = String(fy || financeDocs.financialYear());
    const y = Number(f.slice(0, 4));
    where.period = { gte: `${y}-04`, lte: `${y + 1}-03` };
    name += `-FY${f}`;
  }
  if (financeDocs.validPeriod(period)) { where.period = String(period); name += `-${period}`; }
  if (!where.period) return res.status(400).json({ success: false, message: 'Choose a month, or a property and financial year' });
  if (['INVOICE', 'CREDIT_NOTE'].includes(req.query.kind)) where.kind = req.query.kind;
  const docs = await prisma.financeDocument.findMany({ where, orderBy: [{ period: 'asc' }, { number: 'asc' }] });
  if (!docs.length) return res.status(404).json({ success: false, message: 'No documents for this selection' });
  sendFile(res, await financeDocs.documentsZip(docs), `${name}.zip`, 'application/zip');
});
