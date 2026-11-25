/**
 * An organisation's account with ZivoPlus (OrgLedgerEntry). The balance is the sum of its
 * entries: above zero it is prepaid money (wallet); below zero it is credit in use. Every entry is
 * written with the organisation's row locked, so two bookings can't both spend the same money.
 *
 *  available to spend = balance + credit limit (credit allowed) | balance (prepaid only)
 *  overdue            = credit bookings past their due date that payments haven't covered yet
 *                       (payments and top-ups settle the oldest bookings first)
 */
import { Prisma } from '@prisma/client';
import prisma from '../../config/db.js';
import { getBusinessSettings, termsFor } from './businessSettings.js';

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const fail = (m, code = 400) => Object.assign(new Error(m), { statusCode: code });
export const ENTRY_TYPES = ['TOPUP', 'BOOKING', 'REFUND', 'PAYMENT', 'ADJUSTMENT', 'COMMISSION', 'TDS'];

/** Settles credits against the oldest debits; what is still owed, with due dates. */
export const outstanding = (entries, now = new Date()) => {
  const debts = [];
  let credit = 0;
  for (const e of [...entries].sort((x, y) => new Date(x.createdAt) - new Date(y.createdAt))) {
    const amt = Number(e.amount);
    if (amt < 0) debts.push({ id: e.id, reference: e.reference, bookingId: e.bookingId, left: -amt, dueAt: e.dueAt, createdAt: e.createdAt });
    else credit += amt;
    while (credit > 0 && debts.length) {
      const d = debts[0];
      const used = Math.min(d.left, credit);
      d.left = round2(d.left - used); credit = round2(credit - used);
      if (d.left <= 0) debts.shift();
    }
  }
  const open = debts.filter((d) => d.left > 0);
  const overdue = open.filter((d) => d.dueAt && new Date(d.dueAt) < now);
  return {
    open, overdueAmount: round2(overdue.reduce((s, d) => s + d.left, 0)),
    oldestOverdueDueAt: overdue.length ? overdue[0].dueAt : null,
    nextDueAt: open.filter((d) => d.dueAt && new Date(d.dueAt) >= now).map((d) => d.dueAt).sort((a, b) => new Date(a) - new Date(b))[0] || null,
  };
};

const balanceOf = async (db, organisationId) => {
  const agg = await db.orgLedgerEntry.aggregate({ where: { organisationId }, _sum: { amount: true } });
  return round2(agg._sum.amount || 0);
};

/** Balance, credit and what can be spent now. */
export const accountSummary = async (org, { settings, db = prisma } = {}) => {
  const s = settings || await getBusinessSettings();
  const terms = termsFor(org, s);
  const entries = await db.orgLedgerEntry.findMany({ where: { organisationId: org.id }, select: { id: true, amount: true, createdAt: true, dueAt: true, reference: true, bookingId: true } });
  const balance = round2(entries.reduce((x, e) => x + Number(e.amount), 0));
  const due = outstanding(entries);
  const onHold = terms.creditAllowed && s.credit.holdWhenOverdue && due.overdueAmount > 0;
  const creditLimit = terms.creditAllowed ? terms.creditLimit : 0;
  const available = org.status !== 'ACTIVE' ? 0 : round2(Math.max(0, onHold ? balance : balance + creditLimit));
  return {
    balance, walletBalance: round2(Math.max(0, balance)), creditUsed: round2(Math.max(0, -balance)), creditLimit,
    available, overdueAmount: due.overdueAmount, oldestOverdueDueAt: due.oldestOverdueDueAt, nextDueAt: due.nextDueAt,
    creditOnHold: onHold, paymentMode: terms.paymentMode, creditDays: terms.creditDays,
  };
};

/**
 * Records one entry. Debits (amount < 0) must fit what the organisation can spend unless
 * `force` (corrections by ZivoPlus). The same (type, reference) is recorded once: a repeat
 * returns the existing entry. Pass `tx` to make it part of a larger transaction.
 */
export const postEntry = async ({ organisationId, type, amount, reference, bookingId = null, note = null, dueAt = null, createdById = null, force = false }, tx = null) => {
  if (!ENTRY_TYPES.includes(type)) throw fail('Unknown account entry type.');
  const amt = round2(amount);
  if (!amt) throw fail('The amount can\'t be zero.');
  if (!reference) throw fail('An entry needs a reference.');
  const run = async (db) => {
    const rows = await db.$queryRaw`SELECT id FROM "Organisation" WHERE id = ${organisationId} FOR UPDATE`;
    if (!rows.length) throw fail('Organisation not found', 404);
    const existing = await db.orgLedgerEntry.findUnique({ where: { organisationId_type_reference: { organisationId, type, reference } } });
    if (existing) return { entry: existing, duplicate: true };
    const balance = await balanceOf(db, organisationId);
    if (amt < 0 && !force) {
      const org = await db.organisation.findUnique({ where: { id: organisationId } });
      const summary = await accountSummary(org, { db });
      if (-amt > summary.available) {
        throw fail(summary.creditOnHold
          ? 'Your credit is on hold because a payment is overdue. Pay the overdue amount or top up your wallet.'
          : `Not enough balance: ₹${summary.available.toLocaleString('en-IN')} available. Top up your wallet${summary.creditLimit ? ' or ask ZivoPlus to raise your credit limit' : ''}.`, 402);
      }
    }
    const entry = await db.orgLedgerEntry.create({ data: {
      organisationId, type, amount: new Prisma.Decimal(amt), balanceAfter: new Prisma.Decimal(round2(balance + amt)),
      reference: String(reference).slice(0, 120), bookingId, note: note ? String(note).slice(0, 500) : null, dueAt, createdById,
    } });
    return { entry, duplicate: false };
  };
  return tx ? run(tx) : prisma.$transaction(run);
};

export default { postEntry, accountSummary, outstanding, ENTRY_TYPES };
