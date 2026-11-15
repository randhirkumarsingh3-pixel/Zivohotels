import { Prisma } from '@prisma/client';
import prisma from '../../config/db.js';

/**
 * Wallets.
 *
 * Guest wallet ("Zivo Cash", Wallet.userId): stored credit that can only be spent on ZivoHotels
 * bookings (no top-ups, withdrawals or transfers: a closed-system wallet). Money comes in from
 * refunds the guest chooses to take as Zivo Cash and from admin credits; it goes out when the guest
 * pays for a booking with it. Every movement is a WalletTransaction with the balance after it.
 *
 * Hotel wallet: not stored money. The hotel's balance is worked out from its settlements (what it
 * earns per stay, cancellation fee or no-show, after commission and taxes) and payouts. See
 * hotelWallet().
 */

const D = (v) => new Prisma.Decimal(v ?? 0);
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const round2 = (n) => Math.round(Number(n) * 100) / 100;

// ── Guest wallet (Zivo Cash) ────────────────────────────────────────────────

export const getOrCreateWallet = async (ownerId, ownerType = 'USER', db = prisma) => {
  const where = ownerType === 'USER' ? { userId: ownerId } : { hotelId: ownerId };
  const existing = await db.wallet.findUnique({ where });
  if (existing) return existing;
  try {
    return await db.wallet.create({ data: { ...where, balance: 0, creditLimit: 0 } });
  } catch (e) {
    if (e.code === 'P2002') return db.wallet.findUnique({ where }); // created meanwhile
    throw e;
  }
};

/** Locks the wallet row for the rest of the transaction and returns it. */
const lockWallet = async (tx, userId) => {
  const wallet = await getOrCreateWallet(userId, 'USER', tx);
  await tx.$queryRaw`SELECT id FROM "Wallet" WHERE id = ${wallet.id} FOR UPDATE`;
  return tx.wallet.findUnique({ where: { id: wallet.id } });
};

/** Adds or takes money (inside a transaction). Debits never take the balance below zero. */
export const move = async (tx, { userId, type, amount, category, description, bookingId = null, createdById = null }) => {
  const value = D(amount).toDecimalPlaces(2);
  if (!value.greaterThan(0)) throw fail('Enter an amount above ₹0');
  const wallet = await lockWallet(tx, userId);
  const next = type === 'CREDIT' ? wallet.balance.plus(value) : wallet.balance.minus(value);
  if (next.isNegative()) throw fail(`Not enough Zivo Cash (balance ₹${wallet.balance.toFixed(2)})`, 409);
  await tx.wallet.update({ where: { id: wallet.id }, data: { balance: next } });
  return tx.walletTransaction.create({
    data: {
      walletId: wallet.id, type, amount: value, category, description, bookingId, createdById,
      balanceAfter: next, reference: bookingId || category,
    }
  });
};

/** Older callers (finance controller): adjust a wallet by id. */
export const adjustBalance = async (id, type, amount, reference, tx = prisma) => {
  const wallet = await tx.wallet.findUnique({ where: { id } });
  if (!wallet) throw new Error('Wallet not found');
  const next = type === 'CREDIT' ? wallet.balance.plus(D(amount)) : wallet.balance.minus(D(amount));
  const updated = await tx.wallet.update({ where: { id }, data: { balance: next } });
  await tx.walletTransaction.create({ data: { walletId: id, type, amount: D(amount), reference, category: 'OTHER', balanceAfter: next } });
  return updated;
};

export const balanceOf = async (userId, db = prisma) => {
  const w = await db.wallet.findUnique({ where: { userId }, select: { balance: true } });
  return w ? Number(w.balance) : 0;
};

export const CATEGORY_LABEL = {
  REFUND: 'Refund',
  BOOKING_PAYMENT: 'Paid for booking',
  PAYMENT_RETURNED: 'Returned from booking',
  ADMIN_CREDIT: 'Credit from ZivoHotels',
  ADMIN_DEBIT: 'Correction by ZivoHotels',
  MEMBERSHIP: 'Membership',
  OTHER: 'Other',
};

export const guestWallet = async (userId, { limit = 50 } = {}) => {
  const wallet = await prisma.wallet.findUnique({ where: { userId } });
  if (!wallet) return { balance: 0, transactions: [] };
  const rows = await prisma.walletTransaction.findMany({ where: { walletId: wallet.id }, orderBy: { createdAt: 'desc' }, take: Math.min(Number(limit) || 50, 200) });
  const refs = [...new Set(rows.map((r) => r.bookingId).filter(Boolean))];
  const bookings = refs.length ? await prisma.booking.findMany({ where: { id: { in: refs } }, select: { id: true, bookingRef: true, hotel: { select: { name: true } } } }) : [];
  const bMap = new Map(bookings.map((b) => [b.id, b]));
  return {
    balance: Number(wallet.balance),
    transactions: rows.map((r) => ({
      id: r.id, type: r.type, amount: Number(r.amount), category: r.category, label: CATEGORY_LABEL[r.category] || r.category,
      description: r.description, balanceAfter: r.balanceAfter != null ? Number(r.balanceAfter) : null, createdAt: r.createdAt,
      booking: r.bookingId && bMap.get(r.bookingId) ? { ref: bMap.get(r.bookingId).bookingRef, hotel: bMap.get(r.bookingId).hotel?.name } : null,
    })),
  };
};

/** Inside the booking transaction: pay up to `amountDue` with Zivo Cash. Returns the amount used. */
export const payForBooking = async (tx, { userId, bookingId, bookingRef, amountDue }) => {
  const wallet = await lockWallet(tx, userId);
  const use = Prisma.Decimal.min(wallet.balance, D(amountDue)).toDecimalPlaces(2);
  if (!use.greaterThan(0)) return 0;
  await move(tx, { userId, type: 'DEBIT', amount: use, category: 'BOOKING_PAYMENT', description: `Paid for booking ${bookingRef}`, bookingId });
  return Number(use);
};

/**
 * Job: Zivo Cash put towards a booking that was never completed (payment window expired, payment
 * failed, refunded by an admin) goes back to the guest. Bookings cancelled through the normal
 * cancellation flow are handled there (it records a Refund), so they are skipped here.
 */
export const returnUnusedBookingPayments = async () => {
  const rows = await prisma.$queryRawUnsafe(`
    SELECT b.id, b."userId", b."bookingRef", b."walletAmount" FROM "Booking" b
    WHERE b.status = 'CANCELLED' AND b."walletAmount" > 0 AND b."userId" IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM "Refund" r WHERE r."bookingId" = b.id)
      AND NOT EXISTS (SELECT 1 FROM "WalletTransaction" t WHERE t."bookingId" = b.id AND t.category = 'PAYMENT_RETURNED')
    LIMIT 200`);
  for (const b of rows) {
    await prisma.$transaction((tx) => move(tx, {
      userId: b.userId, type: 'CREDIT', amount: b.walletAmount, category: 'PAYMENT_RETURNED',
      description: `Booking ${b.bookingRef} was not completed`, bookingId: b.id,
    }));
  }
  return rows.length;
};

export const startWalletJob = () => {
  const run = () => returnUnusedBookingPayments()
    .then((n) => { if (n) console.log(`[Wallet] returned Zivo Cash for ${n} uncompleted booking(s)`); })
    .catch((err) => console.error('[Wallet] job failed:', err.message));
  const first = setTimeout(run, 25 * 1000);
  first.unref?.();
  const timer = setInterval(run, 5 * 60 * 1000);
  timer.unref?.();
  return timer;
};

// ── Hotel wallet (from settlements) ─────────────────────────────────────────

const KIND_LABEL = { STAY: 'Stay', CANCELLATION: 'Cancellation fee kept', NO_SHOW: 'No-show charge kept' };

/**
 * A hotel's money with ZivoHotels: on hold until the payout date, ready to be paid, owed to Zivo
 * (commission on pay-at-hotel stays), paid out, and a statement with a running balance.
 */
export const hotelWallet = async (hotelId, { from, to } = {}) => {
  const now = new Date();
  const [settlements, payouts] = await Promise.all([
    prisma.settlement.findMany({ where: { hotelId }, orderBy: { createdAt: 'asc' } }),
    prisma.payout.findMany({ where: { hotelId, status: 'SUCCESS' }, orderBy: { createdAt: 'asc' } }),
  ]);
  const bookingIds = settlements.map((s) => s.bookingId);
  const bookings = bookingIds.length ? await prisma.booking.findMany({ where: { id: { in: bookingIds } }, select: { id: true, bookingRef: true, guestName: true, checkIn: true, checkOut: true, paymentType: true } }) : [];
  const bMap = new Map(bookings.map((b) => [b.id, b]));

  const open = settlements.filter((s) => ['PENDING', 'READY'].includes(s.status));
  const n = (v) => Number(v || 0);
  const isDue = (s) => s.status === 'READY' || (s.holdUntil && s.holdUntil <= now);
  const onHold = round2(open.filter((s) => !isDue(s) && n(s.netPayable) > 0).reduce((a, s) => a + n(s.netPayable), 0));
  const ready = round2(open.filter((s) => isDue(s) && n(s.netPayable) > 0).reduce((a, s) => a + n(s.netPayable), 0));
  const owed = round2(-open.filter((s) => n(s.netPayable) < 0).reduce((a, s) => a + n(s.netPayable), 0));
  const paidOut = round2(payouts.reduce((a, p) => a + n(p.totalAmount), 0));
  const nextPayoutDate = open.filter((s) => !isDue(s) && s.holdUntil).map((s) => s.holdUntil).sort((a, b) => a - b)[0] || null;

  // Statement: each settlement adds what the hotel earned (or owes), each payout takes it out
  const entries = [
    ...settlements.map((s) => {
      const b = bMap.get(s.bookingId);
      return {
        date: s.createdAt, kind: 'SETTLEMENT', id: s.id, amount: n(s.netPayable),
        title: `${KIND_LABEL[s.kind] || 'Stay'} · ${b?.bookingRef || ''}`,
        detail: b ? `${b.guestName} · ${new Date(b.checkIn).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}–${new Date(b.checkOut).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}${b.paymentType === 'PAY_AT_HOTEL' ? ' · paid at hotel' : ''}` : '',
        gross: n(s.grossAmount), deductions: round2(n(s.commissionAmount) + n(s.commissionGstAmount) + n(s.tcsAmount) + n(s.tdsAmount)),
        status: s.status === 'PAID' ? 'PAID' : isDue(s) ? 'READY' : 'ON_HOLD', payoutOn: s.holdUntil,
      };
    }),
    ...payouts.map((p) => ({ date: p.createdAt, kind: 'PAYOUT', id: p.id, amount: -n(p.totalAmount), title: 'Payout to your bank account', detail: p.reference || '', status: 'PAID' })),
  ].sort((a, b) => new Date(a.date) - new Date(b.date));
  let running = 0;
  for (const e of entries) { running = round2(running + e.amount); e.balance = running; }
  const inRange = entries.filter((e) => (!from || new Date(e.date) >= new Date(from)) && (!to || new Date(e.date) <= new Date(`${to}T23:59:59`)));

  return {
    balance: round2(onHold + ready - owed),
    onHold, ready, owed, paidOut, nextPayoutDate,
    lifetimeEarned: round2(settlements.reduce((a, s) => a + n(s.netPayable), 0)),
    statement: inRange.reverse(),
  };
};

// ── Admin ───────────────────────────────────────────────────────────────────

export const adminOverview = async () => {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [liability, walletsWithBalance, credited, spent, hotels] = await Promise.all([
    prisma.wallet.aggregate({ where: { userId: { not: null } }, _sum: { balance: true } }),
    prisma.wallet.count({ where: { userId: { not: null }, balance: { gt: 0 } } }),
    prisma.walletTransaction.aggregate({ where: { type: 'CREDIT', createdAt: { gte: since }, wallet: { userId: { not: null } } }, _sum: { amount: true } }),
    prisma.walletTransaction.aggregate({ where: { type: 'DEBIT', category: 'BOOKING_PAYMENT', createdAt: { gte: since } }, _sum: { amount: true } }),
    prisma.hotel.findMany({ where: { isDeleted: false }, select: { id: true, name: true, city: true }, orderBy: { name: 'asc' } }),
  ]);
  const hotelRows = await Promise.all(hotels.map(async (h) => {
    const w = await hotelWallet(h.id);
    return { ...h, onHold: w.onHold, ready: w.ready, owed: w.owed, paidOut: w.paidOut, balance: w.balance, nextPayoutDate: w.nextPayoutDate };
  }));
  return {
    guest: {
      liability: Number(liability._sum.balance || 0),
      walletsWithBalance,
      creditedLast30: Number(credited._sum.amount || 0),
      spentLast30: Number(spent._sum.amount || 0),
    },
    hotels: hotelRows,
    hotelTotals: {
      onHold: round2(hotelRows.reduce((a, h) => a + h.onHold, 0)),
      ready: round2(hotelRows.reduce((a, h) => a + h.ready, 0)),
      owed: round2(hotelRows.reduce((a, h) => a + h.owed, 0)),
    },
  };
};

export const listGuestWallets = async ({ search = '', limit = 25 } = {}) => {
  const q = String(search).trim();
  const users = await prisma.user.findMany({
    where: { role: 'CUSTOMER', ...(q ? { OR: [{ email: { contains: q, mode: 'insensitive' } }, { name: { contains: q, mode: 'insensitive' } }] } : {}) },
    select: { id: true, name: true, email: true },
    orderBy: { createdAt: 'desc' }, take: Math.min(Number(limit) || 25, 100),
  });
  const wallets = await prisma.wallet.findMany({ where: { userId: { in: users.map((u) => u.id) } }, select: { userId: true, balance: true, updatedAt: true } });
  const wMap = new Map(wallets.map((w) => [w.userId, w]));
  return users.map((u) => ({ id: u.id, name: u.name, email: u.email, balance: Number(wMap.get(u.id)?.balance || 0), updatedAt: wMap.get(u.id)?.updatedAt || null }));
};

export const adminAdjust = async ({ userId, amount, reason, direction }, adminId) => {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, role: true } });
  if (!user || user.role !== 'CUSTOMER') throw fail('Guest not found', 404);
  if (!reason?.trim()) throw fail('Give a reason (the guest sees it)');
  const value = Number(amount);
  if (!(value > 0) || value > 1000000) throw fail('Enter an amount between ₹1 and ₹10,00,000');
  return prisma.$transaction(async (tx) => {
    const t = await move(tx, { userId, type: direction === 'DEBIT' ? 'DEBIT' : 'CREDIT', amount: value, category: direction === 'DEBIT' ? 'ADMIN_DEBIT' : 'ADMIN_CREDIT', description: reason.trim().slice(0, 200), createdById: adminId });
    await tx.auditLog.create({ data: { action: `WALLET_${direction === 'DEBIT' ? 'DEBIT' : 'CREDIT'}`, entityType: 'USER', entityId: userId, userId: adminId, details: { amount: value, reason: reason.trim() } } });
    return t;
  });
};

export const walletService = {
  getOrCreateWallet, adjustBalance, move, balanceOf, guestWallet, payForBooking, returnUnusedBookingPayments,
  startWalletJob, hotelWallet, adminOverview, listGuestWallets, adminAdjust, CATEGORY_LABEL,
};
export default walletService;
