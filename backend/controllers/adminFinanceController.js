/**
 * Admin → Finance: the ledger (every money movement, double entry) and payouts (what each hotel is
 * owed now, on hold, paid, and the payout history). Recording a payout uses the existing
 * /admin/wallets/hotels/:hotelId/payout (bank transfer reference), until RazorpayX payouts.
 */
import { asyncHandler } from '../middleware/asyncHandler.js';
import prisma from '../config/db.js';
import { normaliseFilters } from '../services/reportService.js';

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
