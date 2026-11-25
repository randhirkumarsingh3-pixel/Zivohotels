/**
 * Admin → Fraud & risk: accounts, phone numbers and internet addresses whose recent activity looks
 * risky, each with the reasons, so a person can review them. Nothing is blocked automatically.
 *
 * Signals (last 30 days unless stated), with the points they add to a 0–100 score:
 *   failed online payments          8 each (max 32)
 *   bookings in one hour            more than 3: 25
 *   unpaid holds released           3+: 6 each (max 30) — rooms held without paying
 *   cancellations                   3+ and over 60% of bookings: 20
 *   phone shared by several accounts 3+ accounts: 25
 *   failed sign-ins / codes         10+: 15; account locked: 20
 *   flagged by the code-abuse check 25
 * A review ("looks fine") hides an account until it has a new signal.
 */
import prisma from '../../config/db.js';
import systemCache from '../../utils/systemCache.js';

const DAY = 86400000;
const since = (days) => new Date(Date.now() - days * DAY);
const bad = (m, code = 400) => Object.assign(new Error(m), { statusCode: code });
const level = (s) => (s >= 70 ? 'high' : s >= 40 ? 'medium' : 'low');

export const riskOverview = async ({ days = 30 } = {}) => {
  const from = since(days);
  const [failedPay, hourBursts, unpaid, bookingCounts, cancels, sharedPhones, failedLogins, locks, otpFlags, reviews, ipRows, blockedUsers, refunds] = await Promise.all([
    prisma.transaction.groupBy({ by: ['userId'], where: { status: 'FAILED', createdAt: { gte: from }, userId: { not: null } }, _count: { _all: true }, _max: { createdAt: true } }),
    prisma.$queryRaw`SELECT "userId", max(n)::int AS n, max(last) AS last FROM (
        SELECT "userId", date_trunc('hour', "createdAt") h, count(*) n, max("createdAt") last FROM "Booking"
        WHERE "createdAt" >= ${from} AND "userId" IS NOT NULL GROUP BY 1, 2) t WHERE n > 3 GROUP BY 1`,
    prisma.booking.groupBy({ by: ['userId'], where: { status: 'CANCELLED', paymentStatus: { in: ['PENDING', 'FAILED'] }, paymentType: 'PREPAID', createdAt: { gte: from }, userId: { not: null } }, _count: { _all: true }, _max: { createdAt: true } }),
    prisma.booking.groupBy({ by: ['userId'], where: { createdAt: { gte: from }, userId: { not: null } }, _count: { _all: true } }),
    prisma.booking.groupBy({ by: ['userId'], where: { createdAt: { gte: from }, status: 'CANCELLED', paymentStatus: { in: ['PAID', 'PARTIAL_PAID', 'REFUNDED'] }, userId: { not: null } }, _count: { _all: true }, _max: { cancelledAt: true } }),
    prisma.$queryRaw`SELECT "guestPhone" AS phone, count(DISTINCT "userId")::int AS accounts, array_agg(DISTINCT "userId") AS users, max("createdAt") AS last
        FROM "Booking" WHERE "createdAt" >= ${from} AND "userId" IS NOT NULL AND length("guestPhone") >= 8
        GROUP BY 1 HAVING count(DISTINCT "userId") >= 3 ORDER BY 2 DESC LIMIT 50`,
    prisma.securityLog.groupBy({ by: ['userId'], where: { type: { in: ['FAILED_LOGIN', 'LOGIN_WHILE_LOCKED', 'OTP_FAILED'] }, createdAt: { gte: from }, userId: { not: null } }, _count: { _all: true }, _max: { createdAt: true } }),
    prisma.securityLog.groupBy({ by: ['userId'], where: { type: 'ACCOUNT_LOCKED', createdAt: { gte: from }, userId: { not: null } }, _count: { _all: true }, _max: { createdAt: true } }),
    prisma.fraudLog.findMany({ where: { createdAt: { gte: from }, status: 'FLAGGED' }, orderBy: { createdAt: 'desc' }, take: 200 }),
    prisma.fraudLog.findMany({ where: { status: { in: ['CLEARED', 'BLOCKED', 'UNBLOCKED'] }, createdAt: { gte: since(90) } }, orderBy: { createdAt: 'desc' }, take: 1000 }),
    prisma.securityLog.groupBy({ by: ['ip'], where: { type: { in: ['FAILED_LOGIN', 'LOGIN_WHILE_LOCKED', 'OTP_FAILED', 'OTP_RATE_LIMITED', 'FORBIDDEN_ACCESS', 'TOKEN_MISMATCH'] }, createdAt: { gte: since(1) } }, _count: { _all: true }, _max: { createdAt: true }, orderBy: { _count: { ip: 'desc' } }, take: 30 }),
    prisma.user.count({ where: { status: 'BLOCKED' } }),
    prisma.transaction.aggregate({ where: { type: 'REFUND', createdAt: { gte: from } }, _sum: { amount: true }, _count: { _all: true } }),
  ]);

  // Per account: signals and score
  const acc = new Map();
  const get = (id) => { if (!acc.has(id)) acc.set(id, { userId: id, score: 0, reasons: [], lastSignal: null }); return acc.get(id); };
  const hit = (id, pts, code, text, at) => {
    if (!id) return;
    const a = get(id); a.score += pts; a.reasons.push({ code, text });
    if (at && (!a.lastSignal || new Date(at) > a.lastSignal)) a.lastSignal = new Date(at);
  };
  failedPay.forEach((r) => hit(r.userId, Math.min(32, r._count._all * 8), 'PAYMENT_FAILURES', `${r._count._all} failed online payment${r._count._all === 1 ? '' : 's'}`, r._max.createdAt));
  hourBursts.forEach((r) => hit(r.userId, 25, 'BOOKING_BURST', `${r.n} bookings within one hour`, r.last));
  unpaid.filter((r) => r._count._all >= 3).forEach((r) => hit(r.userId, Math.min(30, r._count._all * 6), 'UNPAID_HOLDS', `${r._count._all} bookings held and released without paying`, r._max.createdAt));
  const totalBy = new Map(bookingCounts.map((r) => [r.userId, r._count._all]));
  cancels.forEach((r) => { const t = totalBy.get(r.userId) || r._count._all; if (r._count._all >= 3 && r._count._all / t > 0.6) hit(r.userId, 20, 'CANCELLATIONS', `cancelled ${r._count._all} of ${t} paid bookings`, r._max.cancelledAt); });
  sharedPhones.forEach((p) => (p.users || []).forEach((u) => hit(u, 25, 'SHARED_PHONE', `guest phone ending ${String(p.phone).slice(-4)} used by ${p.accounts} accounts`, p.last)));
  failedLogins.filter((r) => r._count._all >= 10).forEach((r) => hit(r.userId, 15, 'FAILED_SIGNINS', `${r._count._all} failed sign-ins or codes`, r._max.createdAt));
  locks.forEach((r) => hit(r.userId, 20, 'LOCKED', `account locked ${r._count._all} time${r._count._all === 1 ? '' : 's'} after wrong passwords`, r._max.createdAt));

  // Latest review per account hides it until something new happens
  const lastReview = new Map();
  reviews.forEach((r) => { if (r.userId && !lastReview.has(r.userId)) lastReview.set(r.userId, r); });

  const ids = [...acc.keys()];
  const users = ids.length ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, email: true, phone: true, role: true, status: true, createdAt: true } }) : [];
  const userById = new Map(users.map((u) => [u.id, u]));
  const accounts = [...acc.values()].filter((a) => userById.has(a.userId)).map((a) => {
    const u = userById.get(a.userId);
    const rev = lastReview.get(a.userId);
    const score = Math.min(100, a.score);
    const reviewedClean = rev && rev.status === 'CLEARED' && (!a.lastSignal || a.lastSignal <= rev.createdAt);
    return {
      userId: u.id, name: u.name, email: u.email, phone: u.phone, role: u.role, accountStatus: u.status, joined: u.createdAt,
      score, level: level(score), reasons: a.reasons, lastSignal: a.lastSignal,
      review: rev ? { decision: rev.status, note: rev.reason, at: rev.createdAt } : null,
      needsReview: u.status !== 'BLOCKED' && !reviewedClean && score >= 20,
    };
  }).sort((x, y) => y.score - x.score);

  const queue = accounts.filter((a) => a.needsReview);
  const blocked = await prisma.user.findMany({ where: { status: 'BLOCKED' }, select: { id: true, name: true, email: true, role: true, updatedAt: true }, orderBy: { updatedAt: 'desc' }, take: 50 });
  const blockedIps = [...(systemCache.blacklist || [])].slice(0, 100);

  return {
    period: { days },
    totals: {
      toReview: queue.length, high: queue.filter((a) => a.level === 'high').length, blockedAccounts: blockedUsers, blockedIps: blockedIps.length,
      failedPayments: failedPay.reduce((s, r) => s + r._count._all, 0),
      refunds: refunds._count._all, refundAmount: Math.round(Number(refunds._sum.amount || 0)),
      suspiciousIps24h: ipRows.filter((r) => r._count._all >= 20).length,
    },
    queue, reviewed: accounts.filter((a) => !a.needsReview && a.review).slice(0, 30),
    blocked, blockedIps,
    ips: ipRows.map((r) => ({ ip: r.ip, events: r._count._all, last: r._max.createdAt, blocked: blockedIps.includes(r.ip) })),
    sharedPhones: sharedPhones.map((p) => ({ phoneEnding: String(p.phone).slice(-4), accounts: p.accounts, last: p.last })),
    codeAbuse: otpFlags.slice(0, 20).map((f) => ({ id: f.id, who: f.userId, score: f.riskScore, reason: f.reason, at: f.createdAt })),
    rules: [
      ['Failed online payments', '8 points each, up to 32'],
      ['More than 3 bookings within an hour', '25'],
      ['3+ bookings held and released without paying', '6 each, up to 30'],
      ['3+ paid bookings cancelled and over 60% of their bookings', '20'],
      ['The same guest phone used by 3+ accounts', '25'],
      ['10+ failed sign-ins or codes', '15'],
      ['Account locked after wrong passwords', '20'],
    ],
  };
};

/** Account activity for the review panel. */
export const accountDetail = async (userId) => {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, email: true, phone: true, role: true, status: true, createdAt: true, lastActiveAt: true } });
  if (!user) throw bad('Account not found', 404);
  const [bookings, payments, security, decisions] = await Promise.all([
    prisma.booking.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 15, select: { id: true, bookingRef: true, status: true, paymentStatus: true, paymentType: true, totalAmount: true, createdAt: true, checkIn: true, guestPhone: true, hotel: { select: { name: true } } } }),
    prisma.transaction.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 15, select: { type: true, status: true, amount: true, createdAt: true } }),
    prisma.securityLog.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 15, select: { type: true, ip: true, createdAt: true } }),
    prisma.fraudLog.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 10 }),
  ]);
  return { user, bookings, payments, security, decisions: decisions.map((d) => ({ decision: d.status, note: d.reason, at: d.createdAt, score: d.riskScore })) };
};

/** decision: CLEARED (looks fine) | BLOCKED (block and sign out) | UNBLOCKED */
export const reviewAccount = async (userId, { decision, note, score }, admin) => {
  if (!['CLEARED', 'BLOCKED', 'UNBLOCKED'].includes(decision)) throw bad('Unknown decision');
  const text = String(note || '').trim();
  if (text.length < 3) throw bad('Add a short note for the record.');
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, role: true, status: true } });
  if (!user) throw bad('Account not found', 404);
  if (user.role === 'ADMIN') throw bad('Staff accounts are managed in Staff & roles.');
  if (user.id === admin?.id) throw bad('You can\'t review your own account.');
  if (decision === 'BLOCKED') await prisma.user.update({ where: { id: userId }, data: { status: 'BLOCKED', tokenVersion: { increment: 1 } } });
  if (decision === 'UNBLOCKED') await prisma.user.update({ where: { id: userId }, data: { status: 'ACTIVE' } });
  await prisma.fraudLog.create({ data: { userId, riskScore: Number(score) || 0, reason: `${text.slice(0, 400)} — ${admin?.email || admin?.id}`, status: decision } });
  await prisma.auditLog.create({ data: { action: `RISK_${decision}`, entityType: 'USER', entityId: userId, userId: admin?.id || 'SYSTEM', details: { note: text.slice(0, 400), score } } }).catch(() => {});
  return { ok: true };
};

const IP = /^[0-9a-fA-F:.]{3,45}$/;
export const setIpBlock = async (ip, block, note, admin) => {
  if (!IP.test(String(ip || ''))) throw bad('Enter a valid internet address.');
  if (block) systemCache.blockIp(ip); else systemCache.unblockIp(ip);
  await prisma.auditLog.create({ data: { action: block ? 'RISK_IP_BLOCKED' : 'RISK_IP_UNBLOCKED', entityType: 'IP', entityId: ip, userId: admin?.id || 'SYSTEM', details: { note: String(note || '').slice(0, 300) } } }).catch(() => {});
  return { ok: true };
};

export default { riskOverview, accountDetail, reviewAccount, setIpBlock };
