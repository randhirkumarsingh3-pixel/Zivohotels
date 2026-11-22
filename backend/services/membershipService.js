import crypto from 'crypto';
import Razorpay from 'razorpay';
import { Prisma } from '@prisma/client';
import prisma from '../config/db.js';
import { move as moveWallet } from './finance/walletService.js';
import ledgerService from './finance/ledgerService.js';
import { queueService } from './queueService.js';
import { escapeHtml } from '../utils/html.js';

/**
 * Membership engine.
 *
 *  Member (free)   every signed-in guest account. Member prices from hotels that opted in.
 *  Paid plans      e.g. Zivo Prime, bought for a period with Zivo Cash or online (Razorpay).
 *                  Benefits come from the plan (Admin -> Membership): Zivo-funded extra discount,
 *                  extra Rewards points, plan-only offers, longer free cancellation (Zivo pays the
 *                  hotel's fee), priority support.
 *
 * Wired into: pricing (member discounts in preview, booking, hotel page, search), Zivo Rewards
 * (points multiplier), promotions (audience), cancellations (extended free cancellation), wallet
 * (pay for a plan), settlements (Zivo-funded part paid to the hotel), vouchers and bookings
 * (plan shown, priority support). A job expires plans and sends renewal reminders.
 */

const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const DAY = 24 * 60 * 60 * 1000;
const razorpay = new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID || 'rzp_test_placeholder', key_secret: process.env.RAZORPAY_KEY_SECRET || 'placeholder' });

export const DEFAULT_BENEFITS = {
  hotelMemberRates: true, zivoDiscountPercent: 0, zivoDiscountMax: 0, pointsMultiplier: 1,
  memberOffers: true, freeCancelExtraHours: 0, prioritySupport: false,
};

const shapePlan = (p) => ({
  id: p.id, code: p.code, name: p.name, description: p.description, price: Number(p.price),
  durationDays: p.durationDays, isFree: p.isFree, isActive: p.isActive, sortOrder: p.sortOrder,
  benefits: { ...DEFAULT_BENEFITS, ...(p.benefits || {}) },
});

export const listPlans = async ({ includeInactive = false } = {}) =>
  (await prisma.membershipPlan.findMany({ where: includeInactive ? {} : { isActive: true }, orderBy: { sortOrder: 'asc' } })).map(shapePlan);

/**
 * The guest's membership now: the active paid plan if any, else the free plan. null for people who
 * aren't guest accounts (or not signed in).
 */
export const membershipFor = async (userId, db = prisma) => {
  if (!userId) return null;
  const user = await db.user.findUnique({ where: { id: userId }, select: { role: true } });
  if (user?.role !== 'CUSTOMER') return null;
  const now = new Date();
  const active = await db.membership.findFirst({
    where: { userId, status: 'ACTIVE', startsAt: { lte: now }, endsAt: { gt: now }, plan: { isFree: false } },
    orderBy: { endsAt: 'desc' }, include: { plan: true },
  });
  const plan = active ? active.plan : await db.membershipPlan.findFirst({ where: { isFree: true, isActive: true }, orderBy: { sortOrder: 'asc' } });
  if (!plan) return null;
  const p = shapePlan(plan);
  return { plan: p, benefits: p.benefits, isPaid: !p.isFree, membershipId: active?.id || null, endsAt: active?.endsAt || null };
};

/** Member discounts on a stay (pre-GST): hotel's member price (hotel-funded) + plan's Zivo-funded extra. */
export const memberDiscounts = (membership, hotelMemberPercent, eligibleAmount) => {
  if (!membership || !(eligibleAmount > 0)) return { hotel: 0, zivo: 0 };
  const b = membership.benefits;
  const hotelPct = b.hotelMemberRates ? Math.max(0, Math.min(50, Number(hotelMemberPercent) || 0)) : 0;
  const hotel = Math.round((eligibleAmount * hotelPct) / 100);
  let zivo = Math.round(((eligibleAmount - hotel) * (Number(b.zivoDiscountPercent) || 0)) / 100);
  if (b.zivoDiscountMax > 0) zivo = Math.min(zivo, Number(b.zivoDiscountMax));
  return { hotel, zivo: Math.max(0, zivo) };
};

/** Can this membership use a promotion with the given audience? */
export const canUseAudience = (membership, audience = 'ALL') => {
  if (!audience || audience === 'ALL') return true;
  if (!membership || !membership.benefits.memberOffers) return false;
  if (audience === 'MEMBERS') return true;
  return membership.isPaid && membership.plan.code === audience;
};

// ── Buying a plan ───────────────────────────────────────────────────────────

const activePaid = (db, userId, planId) => db.membership.findFirst({ where: { userId, planId, status: 'ACTIVE', endsAt: { gt: new Date() } }, orderBy: { endsAt: 'desc' } });

/** Turns on a plan (renewals start when the current period ends). */
const activate = async (tx, { membership, plan }) => {
  const current = await activePaid(tx, membership.userId, plan.id);
  const startsAt = current && current.id !== membership.id ? current.endsAt : new Date();
  const endsAt = new Date(new Date(startsAt).getTime() + plan.durationDays * DAY);
  return tx.membership.update({ where: { id: membership.id }, data: { status: 'ACTIVE', startsAt, endsAt } });
};

const loadPaidPlan = async (planId) => {
  const plan = await prisma.membershipPlan.findUnique({ where: { id: planId } });
  if (!plan || !plan.isActive || plan.isFree) throw fail('This plan is not available');
  if (!(Number(plan.price) > 0) || !(plan.durationDays > 0)) throw fail('This plan is not set up for purchase');
  return plan;
};

const checkGuest = async (userId) => {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true, email: true, name: true } });
  if (user?.role !== 'CUSTOMER') throw fail('Membership is for guest accounts', 403);
  return user;
};

/** Pay with Zivo Cash: the plan starts at once (or after the current period, for a renewal). */
export const buyWithWallet = async (userId, planId) => {
  await checkGuest(userId);
  const plan = await loadPaidPlan(planId);
  return prisma.$transaction(async (tx) => {
    const m = await tx.membership.create({ data: { userId, planId, status: 'PENDING_PAYMENT', pricePaid: plan.price, paymentMethod: 'WALLET' } });
    await moveWallet(tx, { userId, type: 'DEBIT', amount: plan.price, category: 'MEMBERSHIP', description: `${plan.name} membership` });
    const active = await activate(tx, { membership: m, plan });
    await ledgerService.record([
      { referenceId: m.id, account: 'ZIVO_CASH', type: 'DEBIT', amount: plan.price, description: `${plan.name} paid with Zivo Cash` },
      { referenceId: m.id, account: 'MEMBERSHIP_REVENUE', type: 'CREDIT', amount: plan.price, description: `${plan.name} membership fee (GST inclusive)` },
    ], tx);
    return active;
  });
};

/** Pay online: creates the Razorpay order; verifyOnline() turns the plan on. */
export const startOnlinePayment = async (userId, planId) => {
  await checkGuest(userId);
  const plan = await loadPaidPlan(planId);
  const m = await prisma.membership.create({ data: { userId, planId, status: 'PENDING_PAYMENT', pricePaid: plan.price, paymentMethod: 'RAZORPAY' } });
  let order;
  try {
    order = await razorpay.orders.create({ amount: Math.round(Number(plan.price) * 100), currency: 'INR', receipt: `MEM-${m.id.slice(0, 8)}` });
  } catch (err) {
    await prisma.membership.update({ where: { id: m.id }, data: { status: 'CANCELLED', note: 'Online payment could not start' } });
    console.error('[Membership] Razorpay order failed:', err?.error?.description || err?.message);
    throw fail('Online payment is unavailable right now. Please try again, or pay with Zivo Cash.', 502);
  }
  await prisma.membership.update({ where: { id: m.id }, data: { razorpayOrderId: order.id } });
  return { membershipId: m.id, order, plan: shapePlan(plan) };
};

export const verifyOnline = async (userId, { membershipId, razorpay_order_id, razorpay_payment_id, razorpay_signature }) => {
  const m = await prisma.membership.findUnique({ where: { id: membershipId }, include: { plan: true } });
  if (!m || m.userId !== userId) throw fail('Membership not found', 404);
  if (m.status === 'ACTIVE') return m;
  if (m.razorpayOrderId !== razorpay_order_id) throw fail('Payment does not match this membership');
  const expected = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || '').update(`${razorpay_order_id}|${razorpay_payment_id}`).digest('hex');
  if (!razorpay_signature || expected.length !== razorpay_signature.length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(razorpay_signature))) {
    throw fail('Invalid payment signature');
  }
  return prisma.$transaction(async (tx) => {
    await tx.membership.update({ where: { id: m.id }, data: { razorpayPaymentId: razorpay_payment_id } });
    const active = await activate(tx, { membership: m, plan: m.plan });
    await ledgerService.record([
      { referenceId: m.id, account: 'USER', type: 'DEBIT', amount: m.pricePaid, description: `${m.plan.name} paid online` },
      { referenceId: m.id, account: 'MEMBERSHIP_REVENUE', type: 'CREDIT', amount: m.pricePaid, description: `${m.plan.name} membership fee (GST inclusive)` },
    ], tx);
    return active;
  });
};

// ── Member view ─────────────────────────────────────────────────────────────

export const myMembership = async (userId) => {
  const [current, history, plans, savings] = await Promise.all([
    membershipFor(userId),
    // (purchases that never went through aren't history)
    prisma.membership.findMany({ where: { userId, NOT: [{ status: 'PENDING_PAYMENT' }, { status: 'CANCELLED', startsAt: null }] }, orderBy: { createdAt: 'desc' }, include: { plan: { select: { name: true, code: true } } }, take: 20 }),
    listPlans(),
    memberSavings(userId),
  ]);
  const queued = await prisma.membership.findFirst({ where: { userId, status: 'ACTIVE', startsAt: { gt: new Date() } }, orderBy: { endsAt: 'desc' } });
  return {
    current, plans, savings,
    renewsTo: queued?.endsAt || null,
    history: history.map((h) => ({ id: h.id, plan: h.plan.name, code: h.plan.code, status: h.status, startsAt: h.startsAt, endsAt: h.endsAt, pricePaid: Number(h.pricePaid), paymentMethod: h.paymentMethod })),
  };
};

/** What membership saved the guest on bookings that weren't cancelled. */
export const memberSavings = async (userId) => {
  const rows = await prisma.$queryRawUnsafe(`
    SELECT COALESCE(SUM((metadata->'membership'->>'hotelDiscount')::numeric + (metadata->'membership'->>'zivoDiscount')::numeric), 0) AS total, COUNT(*) AS bookings
    FROM "Booking" WHERE "userId" = $1 AND status <> 'CANCELLED' AND metadata ? 'membership' AND metadata->'membership' IS NOT NULL AND metadata->>'membership' <> 'null'`, userId);
  return { total: Number(rows[0]?.total || 0), bookings: Number(rows[0]?.bookings || 0) };
};

// ── Jobs ────────────────────────────────────────────────────────────────────

export const runMembershipJob = async () => {
  const now = new Date();
  const expired = await prisma.membership.updateMany({ where: { status: 'ACTIVE', endsAt: { lte: now } }, data: { status: 'EXPIRED' } });
  // Unpaid online purchases older than a day are dropped
  await prisma.membership.updateMany({ where: { status: 'PENDING_PAYMENT', createdAt: { lt: new Date(now.getTime() - DAY) } }, data: { status: 'CANCELLED', note: 'Payment not completed' } });
  // Renewal reminder 7 days before the end (skipped when a renewal is already queued)
  const ending = await prisma.membership.findMany({ where: { status: 'ACTIVE', reminderSentAt: null, endsAt: { gt: now, lte: new Date(now.getTime() + 7 * DAY) } }, include: { plan: true } });
  let reminded = 0;
  for (const m of ending) {
    const renewed = await prisma.membership.findFirst({ where: { userId: m.userId, planId: m.planId, status: 'ACTIVE', startsAt: { gte: m.endsAt } } });
    const user = await prisma.user.findUnique({ where: { id: m.userId }, select: { email: true, name: true } });
    if (!renewed && user?.email) {
      const date = m.endsAt.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
      await queueService.enqueue('email', 'MEMBERSHIP_RENEWAL_REMINDER', {
        to: user.email,
        subject: `Your ${m.plan.name} membership ends on ${date}`,
        html: `<div style="font-family:sans-serif;max-width:560px;margin:auto;padding:20px"><h2>Keep your ${escapeHtml(m.plan.name)} benefits</h2>
          <p>Hi ${escapeHtml((user.name || '').split(' ')[0] || 'there')}, your membership ends on <strong>${date}</strong>. Renew from ZivoPlus → Membership to keep your member savings, extra points and flexible cancellation.</p></div>`,
      }, { priority: 4 }).catch(() => {});
      reminded += 1;
    }
    await prisma.membership.update({ where: { id: m.id }, data: { reminderSentAt: now } });
  }
  return { expired: expired.count, reminded };
};

export const startMembershipJob = () => {
  const run = () => runMembershipJob()
    .then((r) => { if (r.expired || r.reminded) console.log(`[Membership] expired ${r.expired}, reminded ${r.reminded}`); })
    .catch((err) => console.error('[Membership] job failed:', err.message));
  const first = setTimeout(run, 30 * 1000);
  first.unref?.();
  const timer = setInterval(run, 60 * 60 * 1000);
  timer.unref?.();
  return timer;
};

// ── Admin ───────────────────────────────────────────────────────────────────

export const updatePlan = async (id, input) => {
  const plan = await prisma.membershipPlan.findUnique({ where: { id } });
  if (!plan) throw fail('Plan not found', 404);
  const b = { ...DEFAULT_BENEFITS, ...(plan.benefits || {}), ...(input.benefits || {}) };
  const num = (v, min, max, label) => { const n = Number(v); if (!Number.isFinite(n) || n < min || n > max) throw fail(`${label}: enter ${min} to ${max}`); return n; };
  const benefits = {
    hotelMemberRates: Boolean(b.hotelMemberRates),
    zivoDiscountPercent: num(b.zivoDiscountPercent, 0, 50, 'Zivo discount %'),
    zivoDiscountMax: num(b.zivoDiscountMax, 0, 100000, 'Zivo discount cap'),
    pointsMultiplier: num(b.pointsMultiplier, 1, 10, 'Points multiplier'),
    memberOffers: Boolean(b.memberOffers),
    freeCancelExtraHours: Math.round(num(b.freeCancelExtraHours, 0, 168, 'Extra free-cancellation hours')),
    prioritySupport: Boolean(b.prioritySupport),
  };
  const data = { benefits };
  if (input.name !== undefined) { if (String(input.name).trim().length < 2) throw fail('Name the plan'); data.name = String(input.name).trim().slice(0, 40); }
  if (input.description !== undefined) data.description = String(input.description || '').slice(0, 200);
  if (input.isActive !== undefined) data.isActive = Boolean(input.isActive);
  if (!plan.isFree) {
    if (input.price !== undefined) data.price = new Prisma.Decimal(num(input.price, 1, 100000, 'Price'));
    if (input.durationDays !== undefined) data.durationDays = Math.round(num(input.durationDays, 7, 1095, 'Length (days)'));
  }
  return shapePlan(await prisma.membershipPlan.update({ where: { id }, data }));
};

export const adminOverview = async () => {
  const now = new Date();
  const since = new Date(now.getTime() - 30 * DAY);
  const [plans, active, revenue30, revenueAll, hotelsOptedIn, hotels] = await Promise.all([
    listPlans({ includeInactive: true }),
    prisma.membership.groupBy({ by: ['planId'], where: { status: 'ACTIVE', endsAt: { gt: now } }, _count: { _all: true } }),
    prisma.membership.aggregate({ where: { status: { in: ['ACTIVE', 'EXPIRED'] }, paymentMethod: { in: ['WALLET', 'RAZORPAY'] }, createdAt: { gte: since } }, _sum: { pricePaid: true } }),
    prisma.membership.aggregate({ where: { status: { in: ['ACTIVE', 'EXPIRED'] }, paymentMethod: { in: ['WALLET', 'RAZORPAY'] } }, _sum: { pricePaid: true } }),
    prisma.hotel.count({ where: { isDeleted: false, memberDiscountPercent: { gt: 0 } } }),
    prisma.hotel.findMany({ where: { isDeleted: false }, select: { id: true, name: true, city: true, memberDiscountPercent: true }, orderBy: { name: 'asc' } }),
  ]);
  const aMap = new Map(active.map((a) => [a.planId, a._count._all]));
  return {
    plans: plans.map((p) => ({ ...p, activeMembers: p.isFree ? null : aMap.get(p.id) || 0 })),
    revenueLast30: Number(revenue30._sum.pricePaid || 0),
    revenueTotal: Number(revenueAll._sum.pricePaid || 0),
    hotelsOptedIn, hotels,
  };
};

export const listMembers = async ({ search = '', status = 'ACTIVE' } = {}) => {
  const q = String(search).trim();
  const rows = await prisma.membership.findMany({
    where: { ...(status === 'ALL' ? { NOT: { status: 'PENDING_PAYMENT' } } : { status }), ...(q ? { userId: { in: (await prisma.user.findMany({ where: { OR: [{ email: { contains: q, mode: 'insensitive' } }, { name: { contains: q, mode: 'insensitive' } }] }, select: { id: true } })).map((u) => u.id) } } : {}) },
    orderBy: { createdAt: 'desc' }, take: 100, include: { plan: { select: { name: true, code: true } } },
  });
  const users = await prisma.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.userId))] } }, select: { id: true, name: true, email: true } });
  const uMap = new Map(users.map((u) => [u.id, u]));
  return rows.map((r) => ({ id: r.id, user: uMap.get(r.userId), plan: r.plan.name, status: r.status, startsAt: r.startsAt, endsAt: r.endsAt, pricePaid: Number(r.pricePaid), paymentMethod: r.paymentMethod, note: r.note }));
};

/** Admin gives a guest a plan (free of charge), e.g. for service recovery. */
export const grant = async ({ email, planId, days, note }, adminId) => {
  const user = await prisma.user.findUnique({ where: { email: String(email || '').trim().toLowerCase() }, select: { id: true, role: true } });
  if (!user || user.role !== 'CUSTOMER') throw fail('No guest account with that email', 404);
  const plan = await prisma.membershipPlan.findUnique({ where: { id: planId } });
  if (!plan || plan.isFree) throw fail('Choose a paid plan');
  if (!note?.trim()) throw fail('Give a reason');
  const length = Math.round(Number(days) || plan.durationDays);
  return prisma.$transaction(async (tx) => {
    const m = await tx.membership.create({ data: { userId: user.id, planId, status: 'PENDING_PAYMENT', pricePaid: 0, paymentMethod: 'ADMIN', note: note.trim().slice(0, 200), createdById: adminId } });
    const active = await activate(tx, { membership: m, plan: { ...plan, durationDays: length } });
    await tx.auditLog.create({ data: { action: 'MEMBERSHIP_GRANTED', entityType: 'USER', entityId: user.id, userId: adminId, details: { plan: plan.code, days: length, note } } });
    return active;
  });
};

export const cancelMembership = async (id, note, adminId) => {
  const m = await prisma.membership.findUnique({ where: { id } });
  if (!m) throw fail('Membership not found', 404);
  if (!note?.trim()) throw fail('Give a reason');
  const updated = await prisma.membership.update({ where: { id }, data: { status: 'CANCELLED', note: note.trim().slice(0, 200) } });
  await prisma.auditLog.create({ data: { action: 'MEMBERSHIP_CANCELLED', entityType: 'USER', entityId: m.userId, userId: adminId, details: { membershipId: id, note } } });
  return updated;
};

export default {
  DEFAULT_BENEFITS, listPlans, membershipFor, memberDiscounts, canUseAudience, buyWithWallet, startOnlinePayment, verifyOnline,
  myMembership, memberSavings, runMembershipJob, startMembershipJob, updatePlan, adminOverview, listMembers, grant, cancelMembership,
};
