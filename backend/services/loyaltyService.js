import crypto from 'crypto';
import prisma from '../config/db.js';
import { queueService } from './queueService.js';
import { escapeHtml } from '../utils/html.js';

/**
 * Zivo Rewards: the guest loyalty program.
 *
 * Earning   Points on the pre-GST amount of a stay (after discounts), times the member's tier
 *           multiplier. They are PENDING from booking until check-out, then AVAILABLE; a
 *           cancelled or no-show booking earns nothing (REVERSED). Published reviews earn a bonus.
 * Tiers     Blue / Silver / Gold from completed stays in the last 12 months (nights OR spend).
 * Spending  At checkout points become a discount (1 point = pointValue rupees), up to a share of
 *           the stay's pre-GST amount. Zivo pays for it: the hotel's settlement is on the full
 *           price. Points used on a booking that is cancelled come back.
 * Expiry    Each batch of points expires expiryMonths after it became usable (0 = never). Points
 *           are used oldest first, so what expires is whatever is left of old batches. Guests
 *           are emailed 30 days before.
 * Ledger    LoyaltyPoint rows; balance = sum of AVAILABLE rows. A reconcile job settles points as
 *           bookings complete or get cancelled, and backfills completed stays.
 * Settings  LoyaltySetting (Admin -> Loyalty).
 */

export const DEFAULT_CONFIG = {
  enabled: true,
  earnPointsPer100: 1,      // points per ₹100 of pre-GST stay value (Blue)
  pointValue: 1,            // ₹ per point when used
  minRedeemPoints: 100,
  maxRedeemPercent: 20,     // of the stay's pre-GST amount
  reviewBonusPoints: 50,
  signupBonusPoints: 0,
  tierWindowMonths: 12,
  expiryMonths: 24,         // points expire this long after they became usable (0 = never)
  tiers: [
    { id: 'BLUE', name: 'Blue', minNights: 0, minSpend: 0, multiplier: 1 },
    { id: 'SILVER', name: 'Silver', minNights: 5, minSpend: 25000, multiplier: 1.25 },
    { id: 'GOLD', name: 'Gold', minNights: 15, minSpend: 75000, multiplier: 1.5 },
  ],
};

const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const DAY = 24 * 60 * 60 * 1000;

// ── Settings ────────────────────────────────────────────────────────────────

export const getConfig = async (db = prisma) => {
  const row = await db.loyaltySetting.findUnique({ where: { id: 'default' } });
  return { ...DEFAULT_CONFIG, ...(row?.config || {}), tiers: row?.config?.tiers || DEFAULT_CONFIG.tiers };
};

export const updateConfig = async (patch, adminId) => {
  const current = await getConfig();
  const next = { ...current, ...patch };
  const num = (k, min, max) => {
    const v = Number(next[k]);
    if (!Number.isFinite(v) || v < min || v > max) throw fail(`${k}: enter a value between ${min} and ${max}`);
    next[k] = v;
  };
  num('earnPointsPer100', 0, 100);
  num('pointValue', 0.01, 100);
  num('minRedeemPoints', 0, 1000000);
  num('maxRedeemPercent', 0, 100);
  num('reviewBonusPoints', 0, 100000);
  num('signupBonusPoints', 0, 100000);
  num('tierWindowMonths', 1, 36);
  num('expiryMonths', 0, 120);
  next.expiryMonths = Math.round(next.expiryMonths);
  next.enabled = Boolean(next.enabled);
  if (!Array.isArray(next.tiers) || next.tiers.length < 1 || next.tiers.length > 5) throw fail('Set up 1 to 5 tiers');
  next.tiers = next.tiers.map((t, i) => ({
    id: String(t.id || t.name || `TIER${i}`).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12) || `TIER${i}`,
    name: String(t.name || `Tier ${i + 1}`).trim().slice(0, 20),
    minNights: Math.max(0, Math.round(Number(t.minNights) || 0)),
    minSpend: Math.max(0, Math.round(Number(t.minSpend) || 0)),
    multiplier: Math.min(10, Math.max(0, Number(t.multiplier) || 1)),
  }));
  next.tiers[0].minNights = 0;
  next.tiers[0].minSpend = 0;
  for (let i = 1; i < next.tiers.length; i++) {
    const a = next.tiers[i - 1]; const b = next.tiers[i];
    if (b.minNights < a.minNights || b.minSpend < a.minSpend) throw fail(`${b.name} must need at least as many nights and as much spend as ${a.name}`);
  }
  await prisma.loyaltySetting.upsert({ where: { id: 'default' }, update: { config: next, updatedById: adminId }, create: { id: 'default', config: next, updatedById: adminId } });
  return next;
};

// ── Balances, tiers ─────────────────────────────────────────────────────────

const sumPoints = async (where, db = prisma) => (await db.loyaltyPoint.aggregate({ where, _sum: { points: true } }))._sum.points || 0;

export const availablePoints = (userId, db = prisma) => sumPoints({ userId, status: 'AVAILABLE' }, db);

/** Tier from completed stays in the window: the highest tier whose nights OR spend is reached. */
export const tierFor = async (userId, config, db = prisma) => {
  const cfg = config || (await getConfig(db));
  const since = new Date(Date.now() - cfg.tierWindowMonths * 30 * DAY);
  const stays = await db.booking.findMany({ where: { userId, status: 'COMPLETED', checkOut: { gte: since } }, select: { checkIn: true, checkOut: true, baseAmount: true, rooms: true } });
  const nights = stays.reduce((s, b) => s + Math.max(1, Math.round((new Date(b.checkOut) - new Date(b.checkIn)) / DAY)) * (b.rooms || 1), 0);
  const spend = Math.round(stays.reduce((s, b) => s + (Number(b.baseAmount) || 0), 0));
  const tiers = cfg.tiers;
  let idx = 0;
  tiers.forEach((t, i) => { if (i > 0 && (nights >= t.minNights || spend >= t.minSpend)) idx = i; });
  const next = tiers[idx + 1] || null;
  return {
    tier: tiers[idx],
    nights,
    spend,
    next: next ? { ...next, nightsToGo: Math.max(0, next.minNights - nights), spendToGo: Math.max(0, next.minSpend - spend) } : null,
  };
};

/** Points a stay earns: pre-GST amount after discounts x rate x tier multiplier. */
export const pointsForAmount = (preTaxAmount, cfg, multiplier = 1) =>
  Math.max(0, Math.floor(((Number(preTaxAmount) || 0) / 100) * cfg.earnPointsPer100 * multiplier));

export const memberSummary = async (userId) => {
  const cfg = await getConfig();
  const [available, pending, earned, redeemed, expired, tier, expiring] = await Promise.all([
    availablePoints(userId),
    sumPoints({ userId, status: 'PENDING' }),
    sumPoints({ userId, status: 'AVAILABLE', points: { gt: 0 } }),
    sumPoints({ userId, status: 'AVAILABLE', type: 'REDEEM' }),
    sumPoints({ userId, status: 'AVAILABLE', type: 'EXPIRE' }),
    tierFor(userId, cfg),
    expiringSoon(userId, cfg, 60),
  ]);
  return {
    enabled: cfg.enabled,
    available, pending,
    value: Math.round(available * cfg.pointValue * 100) / 100,
    lifetimeEarned: earned, lifetimeUsed: Math.abs(redeemed), lifetimeExpired: Math.abs(expired),
    expiringSoon: expiring,
    ...tier,
    program: {
      earnPointsPer100: cfg.earnPointsPer100, pointValue: cfg.pointValue, minRedeemPoints: cfg.minRedeemPoints,
      maxRedeemPercent: cfg.maxRedeemPercent, reviewBonusPoints: cfg.reviewBonusPoints, tierWindowMonths: cfg.tierWindowMonths, tiers: cfg.tiers,
      expiryMonths: cfg.expiryMonths,
    },
  };
};

export const history = async (userId, { page = 1, limit = 20 } = {}) => {
  const take = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const rows = await prisma.loyaltyPoint.findMany({
    where: { userId, NOT: { status: 'VOID' } }, orderBy: { createdAt: 'desc' },
    skip: (Math.max(Number(page) || 1, 1) - 1) * take, take,
  });
  const bookingIds = [...new Set(rows.map((r) => r.bookingId).filter(Boolean))];
  const bookings = bookingIds.length ? await prisma.booking.findMany({ where: { id: { in: bookingIds } }, select: { id: true, bookingRef: true, hotel: { select: { name: true } } } }) : [];
  const bMap = new Map(bookings.map((b) => [b.id, b]));
  return rows.map((r) => ({
    id: r.id, type: r.type, status: r.status, points: r.points, description: r.description, createdAt: r.createdAt,
    booking: r.bookingId && bMap.get(r.bookingId) ? { ref: bMap.get(r.bookingId).bookingRef, hotel: bMap.get(r.bookingId).hotel?.name } : null,
  }));
};

// ── Checkout: earn preview and redemption ────────────────────────────────────

/**
 * What the member can use and earn on a stay. eligibleAmount = pre-GST amount after other
 * discounts. Returns { available, pointsApplied, discount, maxPoints, earn, tier, reason? }.
 */
export const planForCheckout = async ({ userId, eligibleAmount, requestedPoints = 0, extraMultiplier = 1 }) => {
  const cfg = await getConfig();
  if (!cfg.enabled || !userId) return null;
  // Zivo Rewards is for guest accounts (not admins or hotel owners booking for testing)
  const member = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  if (member?.role !== 'CUSTOMER') return null;
  const [available, t] = await Promise.all([availablePoints(userId), tierFor(userId, cfg)]);
  const capByAmount = Math.floor(((Number(eligibleAmount) || 0) * cfg.maxRedeemPercent) / 100 / cfg.pointValue);
  const maxPoints = Math.max(0, Math.min(available, capByAmount));
  let pointsApplied = 0;
  let reason = null;
  const wanted = Math.max(0, Math.floor(Number(requestedPoints) || 0));
  if (wanted > 0) {
    if (available < cfg.minRedeemPoints) reason = `You need at least ${cfg.minRedeemPoints} points to use them`;
    else if (maxPoints < cfg.minRedeemPoints) reason = `Points can cover up to ${cfg.maxRedeemPercent}% of the room price`;
    else pointsApplied = Math.max(cfg.minRedeemPoints, Math.min(wanted, maxPoints));
  }
  const discount = Math.round(pointsApplied * cfg.pointValue);
  return {
    available, pointsApplied, discount, maxPoints: maxPoints >= cfg.minRedeemPoints ? maxPoints : 0,
    pointValue: cfg.pointValue, minRedeemPoints: cfg.minRedeemPoints, maxRedeemPercent: cfg.maxRedeemPercent,
    // Tier multiplier x membership plan multiplier (e.g. Zivo Prime)
    earn: pointsForAmount((Number(eligibleAmount) || 0) - discount, cfg, t.tier.multiplier * (Number(extraMultiplier) || 1)),
    tier: { id: t.tier.id, name: t.tier.name, multiplier: t.tier.multiplier },
    planMultiplier: Number(extraMultiplier) || 1,
    reason,
  };
};

/** Serialises point changes per member inside a transaction (no double spending). */
const lockMember = (tx, userId) => {
  const key = parseInt(crypto.createHash('md5').update(`loyalty:${userId}`).digest('hex').slice(0, 15), 16);
  return tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${key})`);
};

/** Inside the booking transaction: spend points (checked again under the lock). */
export const redeemForBooking = async (tx, { userId, bookingId, points, bookingRef }) => {
  if (!points) return null;
  await lockMember(tx, userId);
  const available = await availablePoints(userId, tx);
  if (available < points) throw Object.assign(new Error('Your points balance changed. Please review the price and try again.'), { statusCode: 409 });
  return tx.loyaltyPoint.create({ data: { userId, bookingId, points: -points, type: 'REDEEM', status: 'AVAILABLE', source: 'REDEMPTION', description: `Used on booking ${bookingRef}` } });
};

/** Inside the booking transaction: points the stay will earn (pending until check-out). */
export const recordEarnForBooking = async (tx, { userId, bookingId, points, bookingRef, tierName }) => {
  if (!userId || !(points > 0)) return null;
  return tx.loyaltyPoint.create({ data: { userId, bookingId, points, type: 'EARN', status: 'PENDING', source: 'BOOKING', description: `Stay ${bookingRef}${tierName ? ` (${tierName} member)` : ''}` } });
};

// ── Settling points as bookings change ──────────────────────────────────────

/**
 * Brings a booking's points in line with its status: completed -> earned points available;
 * cancelled -> earned points reversed and used points returned; no-show -> nothing earned.
 */
export const syncBooking = async (bookingId, db = prisma) => {
  const booking = await db.booking.findUnique({ where: { id: bookingId }, select: { status: true } });
  if (!booking) return;
  if (booking.status === 'COMPLETED') {
    await db.loyaltyPoint.updateMany({ where: { bookingId, type: 'EARN', status: 'PENDING' }, data: { status: 'AVAILABLE', availableAt: new Date() } });
  } else if (booking.status === 'CANCELLED') {
    await db.loyaltyPoint.updateMany({ where: { bookingId, type: 'EARN', status: { in: ['PENDING', 'AVAILABLE'] } }, data: { status: 'REVERSED' } });
    await db.loyaltyPoint.updateMany({ where: { bookingId, type: 'REDEEM', status: 'AVAILABLE' }, data: { status: 'REVERSED', description: 'Returned: booking cancelled' } });
  } else if (booking.status === 'NO_SHOW') {
    await db.loyaltyPoint.updateMany({ where: { bookingId, type: 'EARN', status: { in: ['PENDING', 'AVAILABLE'] } }, data: { status: 'REVERSED' } });
  }
};

/**
 * Job: settle points for bookings whose status moved on, and give points for stays that never had
 * any (bookings made before Zivo Rewards).
 */
export const reconcile = async () => {
  const toSync = await prisma.$queryRawUnsafe(`
    SELECT DISTINCT lp."bookingId" AS id FROM "LoyaltyPoint" lp JOIN "Booking" b ON b.id = lp."bookingId"
    WHERE (lp.type = 'EARN' AND lp.status = 'PENDING' AND b.status IN ('COMPLETED','CANCELLED','NO_SHOW'))
       OR (lp.type = 'EARN' AND lp.status = 'AVAILABLE' AND b.status IN ('CANCELLED','NO_SHOW'))
       OR (lp.type = 'REDEEM' AND lp.status = 'AVAILABLE' AND b.status = 'CANCELLED')`);
  for (const { id } of toSync) await syncBooking(id);

  const cfg = await getConfig();
  let backfilled = 0;
  if (cfg.enabled) {
    const missing = await prisma.$queryRawUnsafe(`
      SELECT b.id, b."userId", b."bookingRef", b."baseAmount", b.status FROM "Booking" b
      JOIN "User" u ON u.id = b."userId" AND u.role = 'CUSTOMER'
      WHERE b.status IN ('COMPLETED','CONFIRMED','CHECKED_IN')
        AND NOT EXISTS (SELECT 1 FROM "LoyaltyPoint" lp WHERE lp."bookingId" = b.id AND lp.type = 'EARN')
      LIMIT 500`);
    for (const b of missing) {
      const points = pointsForAmount(b.baseAmount, cfg, 1);
      if (points > 0) {
        await prisma.loyaltyPoint.create({ data: { userId: b.userId, bookingId: b.id, points, type: 'EARN', status: b.status === 'COMPLETED' ? 'AVAILABLE' : 'PENDING', availableAt: b.status === 'COMPLETED' ? new Date() : null, source: 'BOOKING', description: `Stay ${b.bookingRef}` } });
        backfilled += 1;
      }
    }
  }
  const expired = await expirePoints();
  const reminded = await sendExpiryReminders();
  return { synced: toSync.length, backfilled, expired, reminded };
};

const FIVE_MINUTES = 5 * 60 * 1000;
export const startLoyaltyJob = () => {
  const run = () => reconcile()
    .then((r) => { if (r.synced || r.backfilled || r.expired || r.reminded) console.log(`[ZivoRewards] settled ${r.synced} booking(s), backfilled ${r.backfilled}, expired ${r.expired} pts, reminded ${r.reminded}`); })
    .catch((err) => console.error('[ZivoRewards] reconcile failed:', err.message));
  const first = setTimeout(run, 20 * 1000);
  first.unref?.();
  const timer = setInterval(run, FIVE_MINUTES);
  timer.unref?.();
  return timer;
};

// ── Expiry ──────────────────────────────────────────────────────────────────

const addMonths = (d, m) => { const x = new Date(d); x.setMonth(x.getMonth() + m); return x; };

/**
 * Oldest-first allocation (pure): batches of points (credits) are used up by the member's debits
 * (points used, removed or expired), oldest batch first. Returns each batch with what is left.
 * lots: [{ id, points, availableAt }] sorted oldest first; debitTotal: points taken out (>= 0).
 */
export const allocateLots = (lots, debitTotal) => {
  let toCover = Math.max(0, debitTotal);
  return lots.map((lot) => {
    const used = Math.min(lot.points, toCover);
    toCover -= used;
    return { ...lot, remaining: lot.points - used };
  });
};

/** The member's batches of usable points with what is left of each and when it expires. */
export const pointLots = async (userId, cfg, db = prisma) => {
  const rows = await db.loyaltyPoint.findMany({ where: { userId, status: 'AVAILABLE' }, select: { id: true, points: true, availableAt: true, createdAt: true, expiryNoticeAt: true } });
  const credits = rows.filter((r) => r.points > 0)
    .map((r) => ({ id: r.id, points: r.points, availableAt: r.availableAt || r.createdAt, expiryNoticeAt: r.expiryNoticeAt }))
    .sort((a, b) => a.availableAt - b.availableAt);
  const debits = -rows.filter((r) => r.points < 0).reduce((s, r) => s + r.points, 0);
  return allocateLots(credits, debits).map((l) => ({ ...l, expiresAt: cfg.expiryMonths > 0 ? addMonths(l.availableAt, cfg.expiryMonths) : null }));
};

/** Points expiring soonest (within `days`): { points, date } or null. */
export const expiringSoon = async (userId, cfg, days = 60, db = prisma) => {
  if (!(cfg.expiryMonths > 0)) return null;
  const until = new Date(Date.now() + days * DAY);
  const lots = (await pointLots(userId, cfg, db)).filter((l) => l.remaining > 0 && l.expiresAt <= until);
  if (!lots.length) return null;
  return { points: lots.reduce((s, l) => s + l.remaining, 0), date: lots[0].expiresAt };
};

/** Expires what is left of each member's batches that reached their expiry date. */
export const expirePoints = async () => {
  const cfg = await getConfig();
  if (!(cfg.expiryMonths > 0)) return 0;
  const cutoff = addMonths(new Date(), -cfg.expiryMonths);
  const candidates = await prisma.loyaltyPoint.findMany({
    where: { status: 'AVAILABLE', points: { gt: 0 }, OR: [{ availableAt: { lte: cutoff } }, { availableAt: null, createdAt: { lte: cutoff } }] },
    distinct: ['userId'], select: { userId: true },
  });
  let expired = 0;
  for (const { userId } of candidates) {
    await prisma.$transaction(async (tx) => {
      await lockMember(tx, userId);
      const now = new Date();
      const due = (await pointLots(userId, cfg, tx)).filter((l) => l.remaining > 0 && l.expiresAt && l.expiresAt <= now);
      const points = due.reduce((sum, l) => sum + l.remaining, 0);
      if (points > 0) {
        const oldest = due[0].availableAt;
        await tx.loyaltyPoint.create({ data: {
          userId, points: -points, type: 'EXPIRE', status: 'AVAILABLE', source: 'EXPIRY',
          description: `${points.toLocaleString('en-IN')} points expired (added ${new Date(oldest).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })})`,
        } });
        expired += points;
      }
    });
  }
  return expired;
};

/** Emails members whose points expire within 30 days (once per batch). */
export const sendExpiryReminders = async () => {
  const cfg = await getConfig();
  if (!(cfg.expiryMonths > 0) || !cfg.enabled) return 0;
  const cutoff = addMonths(new Date(Date.now() + 30 * DAY), -cfg.expiryMonths);
  const candidates = await prisma.loyaltyPoint.findMany({
    where: { status: 'AVAILABLE', points: { gt: 0 }, expiryNoticeAt: null, OR: [{ availableAt: { lte: cutoff } }, { availableAt: null, createdAt: { lte: cutoff } }] },
    distinct: ['userId'], select: { userId: true },
  });
  let sent = 0;
  for (const { userId } of candidates) {
    const soon = (await pointLots(userId, cfg)).filter((l) => l.remaining > 0 && l.expiresAt <= new Date(Date.now() + 30 * DAY) && !l.expiryNoticeAt);
    const points = soon.reduce((s, l) => s + l.remaining, 0);
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, name: true } });
    if (points > 0 && user?.email) {
      const date = soon[0].expiresAt.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
      await queueService.enqueue('email', 'REWARDS_EXPIRY_REMINDER', {
        to: user.email,
        subject: `${points.toLocaleString('en-IN')} Zivo Rewards points expire on ${date}`,
        html: `<div style="font-family:sans-serif;max-width:560px;margin:auto;padding:20px">
          <h2 style="margin:0 0 12px">Use your points before they expire</h2>
          <p>Hi ${escapeHtml((user.name || '').split(' ')[0] || 'there')},</p>
          <p><strong>${points.toLocaleString('en-IN')} points</strong> (worth ₹${Math.round(points * cfg.pointValue).toLocaleString('en-IN')}) expire on <strong>${date}</strong>.
          Use them on your next booking: tick "Use my points" at checkout.</p>
          <p style="color:#888;font-size:13px">Zivo Rewards points expire ${cfg.expiryMonths} months after they are added. See your points at ZivoHotels → Zivo Rewards.</p></div>`,
      }, { priority: 4 }).catch(() => {});
      sent += 1;
    }
    await prisma.loyaltyPoint.updateMany({ where: { id: { in: soon.map((l) => l.id) } }, data: { expiryNoticeAt: new Date() } });
  }
  return sent;
};

// ── Bonuses and admin adjustments ───────────────────────────────────────────

/** Bonus for a review when it is first published (once per review). */
export const awardReviewBonus = async (review) => {
  const cfg = await getConfig();
  if (!cfg.enabled || !(cfg.reviewBonusPoints > 0)) return null;
  const exists = await prisma.loyaltyPoint.findFirst({ where: { reviewId: review.id, type: 'BONUS' }, select: { id: true } });
  if (exists) return null;
  return prisma.loyaltyPoint.create({ data: { userId: review.userId, reviewId: review.id, points: cfg.reviewBonusPoints, type: 'BONUS', status: 'AVAILABLE', availableAt: new Date(), source: 'REVIEW', description: 'Review published' } });
};

export const awardSignupBonus = async (userId) => {
  const cfg = await getConfig();
  if (!cfg.enabled || !(cfg.signupBonusPoints > 0)) return null;
  return prisma.loyaltyPoint.create({ data: { userId, points: cfg.signupBonusPoints, type: 'BONUS', status: 'AVAILABLE', availableAt: new Date(), source: 'SIGNUP', description: 'Welcome to Zivo Rewards' } });
};

export const adjust = async ({ userId, points, reason }, adminId) => {
  const p = Math.round(Number(points));
  if (!Number.isInteger(p) || p === 0 || Math.abs(p) > 1000000) throw fail('Enter the points to add (or a negative number to remove)');
  if (!reason?.trim()) throw fail('Give a reason for the adjustment');
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) throw fail('Member not found', 404);
  return prisma.$transaction(async (tx) => {
    await lockMember(tx, userId);
    if (p < 0 && (await availablePoints(userId, tx)) + p < 0) throw fail('That would make the balance negative');
    const row = await tx.loyaltyPoint.create({ data: { userId, points: p, type: 'ADJUST', status: 'AVAILABLE', availableAt: p > 0 ? new Date() : null, source: 'ADMIN', description: reason.trim().slice(0, 200), createdById: adminId } });
    await tx.auditLog.create({ data: { action: 'LOYALTY_ADJUST', entityType: 'USER', entityId: userId, userId: adminId, details: { points: p, reason: reason.trim() } } });
    return row;
  });
};

// ── Admin views ─────────────────────────────────────────────────────────────

export const programStats = async () => {
  const cfg = await getConfig();
  const since = new Date(Date.now() - 30 * DAY);
  const [outstanding, pending, members, earned30, used30, expired30] = await Promise.all([
    sumPoints({ status: 'AVAILABLE' }),
    sumPoints({ status: 'PENDING' }),
    prisma.loyaltyPoint.groupBy({ by: ['userId'], where: { NOT: { status: 'VOID' } } }),
    sumPoints({ status: { in: ['AVAILABLE', 'PENDING'] }, points: { gt: 0 }, createdAt: { gte: since } }),
    sumPoints({ status: 'AVAILABLE', type: 'REDEEM', createdAt: { gte: since } }),
    sumPoints({ status: 'AVAILABLE', type: 'EXPIRE', createdAt: { gte: since } }),
  ]);
  return {
    config: cfg,
    members: members.length,
    outstandingPoints: outstanding,
    outstandingValue: Math.round(outstanding * cfg.pointValue),
    pendingPoints: pending,
    earnedLast30: earned30,
    usedLast30: Math.abs(used30),
    expiredLast30: Math.abs(expired30),
  };
};

export const listMembers = async ({ search = '', page = 1, limit = 25 } = {}) => {
  const take = Math.min(Math.max(Number(limit) || 25, 1), 100);
  const q = String(search).trim();
  const users = await prisma.user.findMany({
    where: { role: 'CUSTOMER', ...(q ? { OR: [{ email: { contains: q, mode: 'insensitive' } }, { name: { contains: q, mode: 'insensitive' } }] } : {}) },
    select: { id: true, name: true, email: true, createdAt: true },
    orderBy: { createdAt: 'desc' }, skip: (Math.max(Number(page) || 1, 1) - 1) * take, take,
  });
  const cfg = await getConfig();
  return Promise.all(users.map(async (u) => {
    const [available, pending, t] = await Promise.all([availablePoints(u.id), sumPoints({ userId: u.id, status: 'PENDING' }), tierFor(u.id, cfg)]);
    return { ...u, available, pending, tier: t.tier.name, nights: t.nights, spend: t.spend };
  }));
};

export default {
  DEFAULT_CONFIG, getConfig, updateConfig, availablePoints, tierFor, pointsForAmount, memberSummary, history,
  allocateLots, pointLots, expiringSoon, expirePoints, sendExpiryReminders,
  planForCheckout, redeemForBooking, recordEarnForBooking, syncBooking, reconcile, startLoyaltyJob,
  awardReviewBonus, awardSignupBonus, adjust, programStats, listMembers,
};
