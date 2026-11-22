import prisma from '../config/db.js';
import { z } from 'zod';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { performance } from '../services/promotionService.js';
import { promotionLabel } from '../domains/promotionDomain.js';
import { managesHotel } from '../utils/hotelAccess.js';

/**
 * Promotions setup (Admin -> Promotions, Extranet -> Promotions).
 *  - Owners: create and manage their own properties' promotions (always hotel-funded), and see the
 *    Zivo promotions that apply to their property (read-only).
 *  - Admins: any property's promotions (choosing who funds them), and Zivo platform promotions for
 *    all properties or chosen ones (Zivo-funded by default).
 * Mounted at /api/v1/admin/promotions (ADMIN, OWNER).
 */

const isAdmin = (req) => req.user.role === 'ADMIN';
const fail = (res, req, status, message) => res.status(status).json({ success: false, message, requestId: req.id });
const ok = (res, req, data, status = 200) => res.status(status).json({ success: true, data, requestId: req.id });

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a valid date').nullable().optional();
const optInt = (min, max) => z.preprocess((v) => (v === '' || v === null || v === undefined ? null : Number(v)), z.number().int().min(min).max(max).nullable()).optional();
const optMoney = z.preprocess((v) => (v === '' || v === null || v === undefined ? null : Number(v)), z.number().positive().nullable()).optional();

const schema = z.object({
  hotelId: z.string().uuid().nullable().optional(),
  hotelIds: z.array(z.string().uuid()).optional(),
  name: z.string().trim().min(3, 'Give the promotion a name').max(80),
  description: z.string().trim().max(300).nullable().optional(),
  code: z.preprocess((v) => (v === '' || v === null || v === undefined ? null : String(v).trim().toUpperCase()),
    z.string().regex(/^[A-Z0-9-]{3,20}$/, 'Codes are 3-20 letters, numbers or dashes').nullable()).optional(),
  discountType: z.enum(['PERCENT', 'FLAT']),
  value: z.preprocess((v) => Number(v), z.number().positive('Enter a discount above 0')),
  maxDiscount: optMoney,
  minBookingAmount: optMoney,
  roomTypeIds: z.array(z.string().uuid()).optional(),
  ratePlanIds: z.array(z.string().uuid()).optional(),
  stayStart: dateStr,
  stayEnd: dateStr,
  bookStart: dateStr,
  bookEnd: dateStr,
  minNights: optInt(1, 60),
  minAdvanceDays: optInt(0, 365),
  maxAdvanceDays: optInt(0, 365),
  usageLimit: optInt(1, 1000000),
  perUserLimit: optInt(1, 100),
  firstBookingOnly: z.boolean().optional(),
  forHourly: z.boolean().optional(),
  fundedBy: z.enum(['HOTEL', 'ZIVO']).optional(),
  // Who can use it: everyone, any member (signed-in guest), or a paid plan's members (admins)
  audience: z.string().trim().toUpperCase().regex(/^[A-Z0-9_]{3,20}$/).optional(),
  isActive: z.boolean().optional(),
}).strip();

const toDate = (s) => (s ? new Date(`${s}T00:00:00`) : null);

/** Checks a full promotion (after merging an update) and returns the data to save, or throws. */
const buildData = async (req, input, existing = null) => {
  const merged = { ...(existing || {}), ...input };
  const hotelId = existing ? existing.hotelId : (input.hotelId || null);
  const bad = (m, status = 400) => { throw Object.assign(new Error(m), { status }); };

  if (!hotelId && !isAdmin(req)) bad('Choose your property', 403);
  if (hotelId && !existing) {
    const hotel = await prisma.hotel.findUnique({ where: { id: hotelId }, select: { ownerId: true, isDeleted: true } });
    if (!hotel || hotel.isDeleted || !managesHotel(req.user, { ...hotel, id: hotelId })) bad('Property not found', 404);
  }
  if (merged.discountType === 'PERCENT' && Number(merged.value) > 90) bad('A percentage discount can be at most 90%');
  const range = (a, b, msg) => { if (merged[a] && merged[b] && String(merged[b]).slice(0, 10) < String(merged[a]).slice(0, 10)) bad(msg); };
  range('stayStart', 'stayEnd', 'The stay end date must be on or after the start date');
  range('bookStart', 'bookEnd', 'The booking end date must be on or after the start date');
  if (merged.minAdvanceDays != null && merged.maxAdvanceDays != null && merged.maxAdvanceDays < merged.minAdvanceDays) bad('"Book at most" days must be more than "book at least" days');

  if (hotelId && (input.roomTypeIds?.length || input.ratePlanIds?.length)) {
    const [rt, rp] = await Promise.all([
      input.roomTypeIds?.length ? prisma.roomType.count({ where: { id: { in: input.roomTypeIds }, hotelId } }) : 0,
      input.ratePlanIds?.length ? prisma.ratePlan.count({ where: { id: { in: input.ratePlanIds }, roomType: { hotelId } } }) : 0,
    ]);
    if (rt !== (input.roomTypeIds?.length || 0) || rp !== (input.ratePlanIds?.length || 0)) bad('Some of the chosen rooms are not part of this property');
  }
  if (!hotelId && (input.roomTypeIds?.length || input.ratePlanIds?.length)) bad('Zivo promotions apply to whole properties; leave rooms empty');
  if (input.code) {
    const clash = await prisma.promotion.findFirst({ where: { code: input.code, ...(existing ? { id: { not: existing.id } } : {}) }, select: { id: true } });
    if (clash) bad(`The code ${input.code} is already in use`, 409);
  }

  if (input.audience && !['ALL', 'MEMBERS'].includes(input.audience)) {
    if (!isAdmin(req)) bad('Hotels can target everyone or members; plan-only offers are set by ZivoHotels');
    const plan = await prisma.membershipPlan.findUnique({ where: { code: input.audience } });
    if (!plan || plan.isFree) bad('Unknown membership plan');
  }
  const data = {};
  for (const k of ['audience', 'name', 'description', 'code', 'discountType', 'value', 'maxDiscount', 'minBookingAmount', 'minAdvanceDays', 'maxAdvanceDays', 'usageLimit', 'perUserLimit', 'firstBookingOnly', 'forHourly', 'isActive']) {
    if (input[k] !== undefined) data[k] = input[k];
  }
  if (input.minNights !== undefined) data.minNights = input.minNights || 1;
  for (const k of ['stayStart', 'stayEnd', 'bookStart', 'bookEnd']) if (input[k] !== undefined) data[k] = toDate(input[k]);
  if (hotelId) {
    if (input.roomTypeIds !== undefined) data.roomTypeIds = input.roomTypeIds;
    if (input.ratePlanIds !== undefined) data.ratePlanIds = input.ratePlanIds;
    // Owners fund their own promotions; admins choose for a property promotion
    data.fundedBy = isAdmin(req) ? (input.fundedBy || existing?.fundedBy || 'HOTEL') : 'HOTEL';
  } else {
    if (input.hotelIds !== undefined) data.hotelIds = input.hotelIds;
    data.fundedBy = input.fundedBy || existing?.fundedBy || 'ZIVO';
  }
  if (!existing) {
    data.hotelId = hotelId;
    data.createdById = req.user.id;
    data.createdByRole = req.user.role;
  }
  return data;
};

const withStats = async (rows, req) => {
  const stats = await performance(rows.map((r) => r.id));
  const hotelNames = new Map((await prisma.hotel.findMany({
    where: { id: { in: [...new Set(rows.flatMap((r) => (r.hotelId ? [r.hotelId] : r.hotelIds || [])))] } },
    select: { id: true, name: true }
  })).map((h) => [h.id, h.name]));
  return rows.map((r) => ({
    ...r,
    label: promotionLabel(r),
    hotelName: r.hotelId ? hotelNames.get(r.hotelId) || null : null,
    targetHotels: r.hotelId ? [] : (r.hotelIds || []).map((id) => ({ id, name: hotelNames.get(id) || id })),
    scope: r.hotelId ? 'PROPERTY' : 'PLATFORM',
    canEdit: isAdmin(req) || Boolean(r.hotelId),
    stats: stats[r.id] || { bookings: 0, discount: 0, revenue: 0 },
  }));
};

/**
 * GET ?hotelId= : a property's promotions plus the Zivo ones covering it.
 * Admin without hotelId: every promotion (?scope=PLATFORM|PROPERTY to filter).
 */
export const listPromotions = asyncHandler(async (req, res) => {
  const { hotelId, scope } = req.query;
  if (!hotelId && !isAdmin(req)) return fail(res, req, 400, 'Choose your property');
  if (hotelId) {
    const hotel = await prisma.hotel.findUnique({ where: { id: hotelId }, select: { ownerId: true, isDeleted: true } });
    if (!hotel || hotel.isDeleted || !managesHotel(req.user, { ...hotel, id: hotelId })) return fail(res, req, 404, 'Property not found');
    const rows = await prisma.promotion.findMany({
      where: { OR: [{ hotelId }, { hotelId: null, OR: [{ hotelIds: { isEmpty: true } }, { hotelIds: { has: hotelId } }] }] },
      orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }]
    });
    const data = (await withStats(rows, req)).map((r) => (r.scope === 'PLATFORM' && !isAdmin(req) ? { ...r, canEdit: false, stats: undefined } : r));
    return ok(res, req, data);
  }
  const rows = await prisma.promotion.findMany({
    where: scope === 'PLATFORM' ? { hotelId: null } : scope === 'PROPERTY' ? { hotelId: { not: null } } : {},
    orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }]
  });
  ok(res, req, await withStats(rows, req));
});

const loadEditable = async (req, res) => {
  const promo = await prisma.promotion.findUnique({ where: { id: req.params.id } });
  if (!promo) { fail(res, req, 404, 'Promotion not found'); return null; }
  if (!isAdmin(req)) {
    if (!promo.hotelId) { fail(res, req, 403, 'Zivo promotions are managed by ZivoHotels'); return null; }
    const hotel = await prisma.hotel.findUnique({ where: { id: promo.hotelId }, select: { ownerId: true } });
    if (!hotel || !managesHotel(req.user, { ...hotel, id: promo.hotelId })) { fail(res, req, 404, 'Promotion not found'); return null; }
  }
  return promo;
};

const handle = async (res, req, fn) => {
  try { await fn(); } catch (err) {
    if (err.status) return fail(res, req, err.status, err.message);
    throw err;
  }
};

export const createPromotion = asyncHandler(async (req, res) => {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return fail(res, req, 422, parsed.error.issues[0].message);
  await handle(res, req, async () => {
    const data = await buildData(req, parsed.data);
    const promo = await prisma.promotion.create({ data });
    await prisma.auditLog.create({ data: { action: 'CREATE_PROMOTION', entityType: 'PROMOTION', entityId: promo.id, userId: req.user.id, requestId: req.id, details: { name: promo.name, hotelId: promo.hotelId, code: promo.code } } }).catch(() => {});
    ok(res, req, (await withStats([promo], req))[0], 201);
  });
});

export const updatePromotion = asyncHandler(async (req, res) => {
  const existing = await loadEditable(req, res);
  if (!existing) return;
  const parsed = schema.partial().safeParse(req.body);
  if (!parsed.success) return fail(res, req, 422, parsed.error.issues[0].message);
  const { hotelId: _ignored, ...input } = parsed.data;
  await handle(res, req, async () => {
    const existingPlain = {
      ...existing,
      value: Number(existing.value),
      stayStart: existing.stayStart?.toISOString(), stayEnd: existing.stayEnd?.toISOString(),
      bookStart: existing.bookStart?.toISOString(), bookEnd: existing.bookEnd?.toISOString(),
    };
    const data = await buildData(req, input, existingPlain);
    const promo = await prisma.promotion.update({ where: { id: existing.id }, data });
    await prisma.auditLog.create({ data: { action: 'UPDATE_PROMOTION', entityType: 'PROMOTION', entityId: promo.id, userId: req.user.id, requestId: req.id, details: { changed: Object.keys(input) } } }).catch(() => {});
    ok(res, req, (await withStats([promo], req))[0]);
  });
});

/** Deletes a promotion never used on a booking; one that was used is switched off instead. */
export const deletePromotion = asyncHandler(async (req, res) => {
  const existing = await loadEditable(req, res);
  if (!existing) return;
  const used = await prisma.promotionRedemption.count({ where: { promotionId: existing.id } });
  if (used) {
    await prisma.promotion.update({ where: { id: existing.id }, data: { isActive: false } });
    return ok(res, req, { switchedOff: true, message: 'This promotion was used on bookings, so it was switched off and kept for reports.' });
  }
  await prisma.promotion.delete({ where: { id: existing.id } });
  ok(res, req, { deleted: true });
});
