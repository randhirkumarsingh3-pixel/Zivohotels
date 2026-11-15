import prisma from '../config/db.js';
import { canUseAudience } from './membershipService.js';
import { Prisma } from '@prisma/client';
import { checkEligibility, discountFor, promotionLabel, coversHotel } from '../domains/promotionDomain.js';

/**
 * Promotion engine: finds the promotion a booking gets, shows automatic offers to guests, and
 * records promotions used on bookings.
 *
 * A booking gets at most one promotion: the biggest discount among the automatic offers it is
 * eligible for and the code the guest entered (if valid). Usage limits count bookings that weren't
 * cancelled, and are checked again (with the promotion row locked) when the booking is created.
 */

const ACTIVE_BOOKING = { status: { notIn: ['CANCELLED'] } };

/** Active promotions that may apply to a property: its own and Zivo's (automatic, or by code). */
const candidates = async (hotelId, code) => {
  const rows = await prisma.promotion.findMany({
    where: {
      isActive: true,
      OR: [{ hotelId }, { hotelId: null }],
      AND: [{ OR: [{ code: null }, ...(code ? [{ code }] : [])] }],
    }
  });
  return rows.filter((p) => coversHotel(p, hotelId));
};

/** Redemptions whose booking was cancelled don't count towards limits. */
const countRedemptions = async (db, where) => {
  const rows = await db.promotionRedemption.findMany({ where, select: { bookingId: true } });
  if (!rows.length) return 0;
  return db.booking.count({ where: { id: { in: rows.map((r) => r.bookingId) }, ...ACTIVE_BOOKING } });
};

/** Usage-limit checks (need the database). Returns null if fine, else a reason. */
const limitProblem = async (promotion, userId, db = prisma) => {
  if (promotion.usageLimit) {
    const used = await countRedemptions(db, { promotionId: promotion.id });
    if (used >= promotion.usageLimit) return 'This offer has been fully used';
  }
  if (promotion.perUserLimit && userId) {
    const mine = await countRedemptions(db, { promotionId: promotion.id, userId });
    if (mine >= promotion.perUserLimit) return 'You have already used this offer';
  }
  if (promotion.firstBookingOnly) {
    if (!userId) return 'Log in to use this offer';
    const prior = await db.booking.count({ where: { userId, ...ACTIVE_BOOKING } });
    if (prior > 0) return 'This offer is for your first booking';
  }
  return null;
};

const summary = (promotion, discount) => ({
  id: promotion.id,
  name: promotion.name,
  code: promotion.code || null,
  label: promotionLabel(promotion),
  discountType: promotion.discountType,
  value: Number(promotion.value),
  discountAmount: discount,
  fundedBy: promotion.fundedBy,
  platform: !promotion.hotelId,
});

/**
 * The promotion for a stay at checkout. ctx: { hotelId, roomTypeId, ratePlanId, checkIn,
 * checkOut, subtotal, userId, code }. Returns { promotion, codeStatus } where promotion is the
 * chosen one (or null) and codeStatus tells the guest what happened to the code they entered.
 */
export const resolveBest = async (ctx) => {
  const code = ctx.code ? String(ctx.code).trim().toUpperCase() : null;
  const list = await candidates(ctx.hotelId, code);
  let best = null;
  let codeStatus = null;
  if (code && !list.some((p) => p.code === code)) codeStatus = { code, ok: false, message: 'This code isn\'t valid' };

  for (const p of list) {
    const elig = checkEligibility(p, ctx);
    const audienceOk = canUseAudience(ctx.membership, p.audience);
    const problem = !audienceOk
      ? (p.audience === 'MEMBERS' ? 'This offer is for members: sign in with a guest account' : 'This offer is for a membership plan you don\'t have')
      : elig.ok ? await limitProblem(p, ctx.userId) : elig.reason;
    if (code && p.code === code) codeStatus = problem ? { code, ok: false, message: problem } : { code, ok: true };
    if (problem) continue;
    const discount = discountFor(p, ctx.subtotal);
    if (discount > 0 && (!best || discount > best.discount)) best = { promotion: p, discount };
  }
  if (codeStatus?.ok && best && best.promotion.code !== code) {
    codeStatus = { code, ok: false, message: `A better offer (${best.promotion.name}) is already applied` };
  }
  return { promotion: best ? { ...summary(best.promotion, best.discount), raw: best.promotion } : null, codeStatus };
};

/**
 * Best automatic offer to show on the hotel page / search for each rate plan, for one room at base
 * occupancy (the same discount checkout gives for that stay). Offers only for first bookings, or
 * that have run out, aren't shown. plans: [{ roomTypeId, ratePlanId, nightlyPrice }].
 * Returns { [ratePlanId]: { name, label, discountPerNight, nightlyPriceAfter, fundedBy } }.
 */
export const displayOffers = async ({ hotelId, checkIn, checkOut, plans, membership = null }) => {
  if (!checkIn || !checkOut || !plans.length) return {};
  // Member-only offers show only to members who can use them
  const list = (await candidates(hotelId, null)).filter((p) => !p.code && !p.firstBookingOnly && canUseAudience(membership, p.audience));
  if (!list.length) return {};
  const usable = [];
  for (const p of list) if (!(await limitProblem(p, null))) usable.push(p);
  const nights = Math.max(1, Math.round((new Date(checkOut) - new Date(checkIn)) / 86400000));
  const out = {};
  for (const plan of plans) {
    const subtotal = Math.round(Number(plan.nightlyPrice) * nights);
    let best = null;
    for (const p of usable) {
      if (!checkEligibility(p, { hotelId, roomTypeId: plan.roomTypeId, ratePlanId: plan.ratePlanId, checkIn, checkOut, subtotal }).ok) continue;
      const discount = discountFor(p, subtotal);
      if (discount > 0 && (!best || discount > best.discount)) best = { p, discount };
    }
    if (best) {
      out[plan.ratePlanId] = {
        id: best.p.id,
        name: best.p.name,
        label: promotionLabel(best.p),
        audience: best.p.audience,
        discountType: best.p.discountType,
        value: Number(best.p.value),
        maxDiscount: best.p.maxDiscount != null ? Number(best.p.maxDiscount) : null,
        discountTotal: best.discount,
        discountPerNight: Math.round(best.discount / nights),
        nightlyPriceAfter: Math.round((subtotal - best.discount) / nights),
        fundedBy: best.p.fundedBy,
      };
    }
  }
  return out;
};

/**
 * Records the promotion on a new booking inside its transaction, after locking the promotion row
 * and checking its limits again (so two guests can't both take the last use).
 */
export const redeem = async (tx, { promotionId, bookingId, userId, hotelId, discountAmount }) => {
  await tx.$queryRaw`SELECT id FROM "Promotion" WHERE id = ${promotionId} FOR UPDATE`;
  const promotion = await tx.promotion.findUnique({ where: { id: promotionId } });
  if (!promotion || !promotion.isActive) throw Object.assign(new Error('This offer is no longer available. Please review the price and try again.'), { statusCode: 409 });
  const problem = await limitProblem(promotion, userId, tx);
  if (problem) throw Object.assign(new Error(`${problem}. Please review the price and try again.`), { statusCode: 409 });
  return tx.promotionRedemption.create({
    data: { promotionId, bookingId, userId: userId || null, hotelId, discountAmount: new Prisma.Decimal(discountAmount), fundedBy: promotion.fundedBy }
  });
};

/** Bookings, discount given and revenue per promotion (non-cancelled bookings). */
export const performance = async (promotionIds) => {
  if (!promotionIds.length) return {};
  const rows = await prisma.promotionRedemption.findMany({ where: { promotionId: { in: promotionIds } }, select: { promotionId: true, bookingId: true, discountAmount: true } });
  if (!rows.length) return {};
  const bookings = await prisma.booking.findMany({ where: { id: { in: rows.map((r) => r.bookingId) }, ...ACTIVE_BOOKING }, select: { id: true, totalAmount: true } });
  const live = new Map(bookings.map((b) => [b.id, Number(b.totalAmount) || 0]));
  const out = {};
  for (const r of rows) {
    if (!live.has(r.bookingId)) continue;
    const o = (out[r.promotionId] ||= { bookings: 0, discount: 0, revenue: 0 });
    o.bookings += 1;
    o.discount += Number(r.discountAmount) || 0;
    o.revenue += live.get(r.bookingId);
  }
  return out;
};

export default { resolveBest, displayOffers, redeem, performance };
