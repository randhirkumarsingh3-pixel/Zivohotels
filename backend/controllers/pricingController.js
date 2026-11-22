import { asyncHandler } from '../middleware/asyncHandler.js';
import prisma from '../config/db.js';
import { z } from 'zod';
import dynamicPricing, { RULE_TYPES, normalizeCondition } from '../services/dynamicPricingService.js';
import { managesHotel, managedHotelWhere } from '../utils/hotelAccess.js';

/**
 * Pricing & RMS.
 *  - Dynamic pricing per property (settings + rules): the owner for their own properties
 *    (Extranet -> Dynamic Pricing) and admins for any property (Admin -> Pricing & RMS).
 *  - Holiday calendar (uplift on festival / event dates): managed by admins, used by every
 *    property that allows holiday pricing.
 *  - Platform mode and pricing snapshots: admins only. (Owners could switch the whole platform to
 *    SAFE_MODE here, which holds every payout, and read other hotels' pricing.)
 */

const fail = (res, req, status, message) => res.status(status).json({ success: false, message, requestId: req.id });
const ok = (res, req, data, status = 200) => res.status(status).json({ success: true, data, requestId: req.id });
const isAdmin = (req) => req.user.role === 'ADMIN';

/** Loads a property the caller may manage (admins: any; owners: their own). */
const loadHotel = async (req, res) => {
  const hotel = await prisma.hotel.findUnique({ where: { id: req.params.hotelId }, select: { id: true, name: true, city: true, ownerId: true, isDeleted: true, integrationMode: true } });
  if (!hotel || hotel.isDeleted || !managesHotel(req.user, hotel)) {
    fail(res, req, 404, 'Property not found');
    return null;
  }
  return hotel;
};

const runSafely = async (fn, res, req) => {
  try {
    return await fn();
  } catch (err) {
    if (err.status) { fail(res, req, err.status, err.message); return undefined; }
    throw err;
  }
};

// ── Platform config (admin) ─────────────────────────────────────────────────

export const getPricingConfig = asyncHandler(async (req, res) => {
  const appState = await prisma.appState.findUnique({ where: { id: 'singleton' } });
  ok(res, req, { systemMode: appState?.systemMode || 'NORMAL' });
});

export const updatePricingConfig = asyncHandler(async (req, res) => {
  if (!isAdmin(req)) return fail(res, req, 403, 'Only Zivo admins can change the platform mode');
  const { systemMode } = req.body;
  if (systemMode !== undefined && !['NORMAL', 'SAFE_MODE'].includes(systemMode)) return fail(res, req, 400, 'Unknown mode');
  const appState = await prisma.appState.upsert({
    where: { id: 'singleton' },
    update: { ...(systemMode !== undefined && { systemMode }) },
    create: { id: 'singleton', systemMode: systemMode || 'NORMAL' }
  });
  ok(res, req, { systemMode: appState.systemMode });
});

export const getPricingSnapshots = asyncHandler(async (req, res) => {
  if (!isAdmin(req)) return fail(res, req, 403, 'Forbidden');
  const { limit = 20, bookingId } = req.query;
  const snapshots = await prisma.pricingSnapshot.findMany({
    where: bookingId ? { bookingId } : {},
    orderBy: { createdAt: 'desc' },
    take: Math.min(parseInt(limit, 10) || 20, 200)
  });
  ok(res, req, snapshots);
});

// ── Holidays (admin manages, everyone with access reads) ─────────────────────

export const getHolidays = asyncHandler(async (req, res) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const holidays = await prisma.holidayCalendar.findMany({
    where: { isActive: true, ...(req.query.all === 'true' ? {} : { date: { gte: today } }) },
    orderBy: { date: 'asc' }
  });
  ok(res, req, holidays);
});

const holidaySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a date'),
  name: z.string().trim().min(2, 'Name the holiday or event'),
  city: z.string().trim().optional().nullable(),
  upliftPercent: z.preprocess((v) => Number(v), z.number().min(-50).max(200)),
});

export const createHoliday = asyncHandler(async (req, res) => {
  if (!isAdmin(req)) return fail(res, req, 403, 'Only Zivo admins manage the holiday calendar');
  const parsed = holidaySchema.safeParse(req.body);
  if (!parsed.success) return fail(res, req, 422, parsed.error.issues[0].message);
  const { date, name, city, upliftPercent } = parsed.data;
  const holiday = await prisma.holidayCalendar.create({
    data: { date: new Date(`${date}T00:00:00`), name, city: city || null, multiplier: upliftPercent / 100 }
  });
  dynamicPricing.recomputeAll().catch(() => {});
  ok(res, req, holiday, 201);
});

export const deleteHoliday = asyncHandler(async (req, res) => {
  if (!isAdmin(req)) return fail(res, req, 403, 'Only Zivo admins manage the holiday calendar');
  await prisma.holidayCalendar.update({ where: { id: req.params.id }, data: { isActive: false } });
  dynamicPricing.recomputeAll().catch(() => {});
  ok(res, req, { removed: true });
});

// ── Dynamic pricing per property ─────────────────────────────────────────────

/** Admin overview: every property with its dynamic pricing state. */
export const getDynamicOverview = asyncHandler(async (req, res) => {
  const where = { isDeleted: false, ...(isAdmin(req) ? {} : managedHotelWhere(req.user)) };
  const [hotels, settings, ruleCounts] = await Promise.all([
    prisma.hotel.findMany({ where, select: { id: true, name: true, city: true, integrationMode: true }, orderBy: { name: 'asc' } }),
    prisma.dynamicPricingSetting.findMany(),
    prisma.pricingRule.groupBy({ by: ['hotelId'], where: { isActive: true }, _count: { _all: true } }),
  ]);
  const sMap = new Map(settings.map((s) => [s.hotelId, s]));
  const rMap = new Map(ruleCounts.map((r) => [r.hotelId, r._count._all]));
  ok(res, req, hotels.map((h) => ({
    ...h,
    enabled: Boolean(sMap.get(h.id)?.enabled),
    rules: rMap.get(h.id) || 0,
    lastRunAt: sMap.get(h.id)?.lastRunAt || null,
    lastRunSummary: sMap.get(h.id)?.lastRunSummary || null,
  })));
});

export const getHotelDynamic = asyncHandler(async (req, res) => {
  const hotel = await loadHotel(req, res);
  if (!hotel) return;
  const [settings, rules, roomTypes, integration] = await Promise.all([
    dynamicPricing.getSettings(hotel.id),
    prisma.pricingRule.findMany({ where: { hotelId: hotel.id }, orderBy: { createdAt: 'asc' } }),
    prisma.roomType.findMany({
      where: { hotelId: hotel.id, isActive: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, ratePlans: { where: { isActive: true }, orderBy: { name: 'asc' }, select: { id: true, name: true, basePrice: true } } }
    }),
    prisma.channelIntegration.findUnique({ where: { hotelId: hotel.id }, select: { provider: true, status: true } }),
  ]);
  const channelManager = hotel.integrationMode === 'CHANNEL_MANAGER' && integration?.status === 'ACTIVE' ? integration.provider : null;
  ok(res, req, { hotel: { id: hotel.id, name: hotel.name, city: hotel.city }, settings, rules, roomTypes, channelManager, ruleTypes: RULE_TYPES });
});

const settingsSchema = z.object({
  enabled: z.boolean().optional(),
  minPercent: z.preprocess((v) => Number(v), z.number().min(-90, 'The lowest limit is -90%').max(0, 'The lower limit must be 0% or below')).optional(),
  maxPercent: z.preprocess((v) => Number(v), z.number().min(0, 'The upper limit must be 0% or above').max(300, 'The highest limit is +300%')).optional(),
  minPrice: z.preprocess((v) => (v === '' || v === null || v === undefined ? null : Number(v)), z.number().positive().nullable()).optional(),
  maxPrice: z.preprocess((v) => (v === '' || v === null || v === undefined ? null : Number(v)), z.number().positive().nullable()).optional(),
  applyHolidays: z.boolean().optional(),
  horizonDays: z.preprocess((v) => Number(v), z.number().int().min(7).max(365)).optional(),
}).strip();

export const updateHotelDynamicSettings = asyncHandler(async (req, res) => {
  const hotel = await loadHotel(req, res);
  if (!hotel) return;
  const parsed = settingsSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, req, 422, parsed.error.issues[0].message);
  const current = await dynamicPricing.getSettings(hotel.id);
  const next = { ...current, ...parsed.data };
  if (next.minPrice != null && next.maxPrice != null && next.minPrice > next.maxPrice) return fail(res, req, 400, 'The minimum price must be below the maximum price');
  const data = { ...parsed.data, updatedById: req.user.id };
  await prisma.dynamicPricingSetting.upsert({ where: { hotelId: hotel.id }, update: data, create: { hotelId: hotel.id, ...data } });
  const summary = await dynamicPricing.recomputeHotel(hotel.id);
  ok(res, req, { settings: await dynamicPricing.getSettings(hotel.id), summary });
});

const ruleSchema = z.object({
  name: z.string().trim().min(2, 'Give the rule a name').max(80),
  type: z.enum(RULE_TYPES),
  condition: z.record(z.any()).optional(),
  adjustment: z.preprocess((v) => Number(v), z.number().min(-90, 'A rule can lower prices by at most 90%').max(300, 'A rule can raise prices by at most 300%').refine((v) => v !== 0, 'Enter a % change other than 0')),
  roomTypeId: z.string().uuid().nullable().optional(),
  ratePlanId: z.string().uuid().nullable().optional(),
  isActive: z.boolean().optional(),
}).strip();

const checkScope = async (hotelId, { roomTypeId, ratePlanId }) => {
  if (roomTypeId && !(await prisma.roomType.count({ where: { id: roomTypeId, hotelId } }))) throw Object.assign(new Error('That room type is not part of this property'), { status: 400 });
  if (ratePlanId) {
    const rp = await prisma.ratePlan.findFirst({ where: { id: ratePlanId, roomType: { hotelId } }, select: { roomTypeId: true } });
    if (!rp) throw Object.assign(new Error('That rate plan is not part of this property'), { status: 400 });
    if (roomTypeId && rp.roomTypeId !== roomTypeId) throw Object.assign(new Error('That rate plan belongs to another room type'), { status: 400 });
  }
};

export const createHotelRule = asyncHandler(async (req, res) => {
  const hotel = await loadHotel(req, res);
  if (!hotel) return;
  const parsed = ruleSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, req, 422, parsed.error.issues[0].message);
  await runSafely(async () => {
    const d = parsed.data;
    const condition = normalizeCondition(d.type, d.condition);
    await checkScope(hotel.id, d);
    const rule = await prisma.pricingRule.create({
      data: { hotelId: hotel.id, name: d.name, type: d.type, condition, adjustment: d.adjustment, roomTypeId: d.roomTypeId || null, ratePlanId: d.ratePlanId || null, isActive: d.isActive ?? true, createdById: req.user.id }
    });
    const summary = await dynamicPricing.recomputeHotel(hotel.id);
    ok(res, req, { rule, summary }, 201);
  }, res, req);
});

const loadRule = async (req, res, hotel) => {
  const rule = await prisma.pricingRule.findUnique({ where: { id: req.params.ruleId } });
  if (!rule || rule.hotelId !== hotel.id) { fail(res, req, 404, 'Rule not found'); return null; }
  return rule;
};

export const updateHotelRule = asyncHandler(async (req, res) => {
  const hotel = await loadHotel(req, res);
  if (!hotel) return;
  const rule = await loadRule(req, res, hotel);
  if (!rule) return;
  const parsed = ruleSchema.partial().safeParse(req.body);
  if (!parsed.success) return fail(res, req, 422, parsed.error.issues[0].message);
  await runSafely(async () => {
    const d = parsed.data;
    const type = d.type || rule.type;
    const condition = d.condition || d.type ? normalizeCondition(type, d.condition || rule.condition) : rule.condition;
    const scope = { roomTypeId: d.roomTypeId !== undefined ? d.roomTypeId : rule.roomTypeId, ratePlanId: d.ratePlanId !== undefined ? d.ratePlanId : rule.ratePlanId };
    await checkScope(hotel.id, scope);
    const updated = await prisma.pricingRule.update({
      where: { id: rule.id },
      data: {
        ...(d.name !== undefined && { name: d.name }),
        ...(d.adjustment !== undefined && { adjustment: d.adjustment }),
        ...(d.isActive !== undefined && { isActive: d.isActive }),
        type, condition, roomTypeId: scope.roomTypeId || null, ratePlanId: scope.ratePlanId || null,
      }
    });
    const summary = await dynamicPricing.recomputeHotel(hotel.id);
    ok(res, req, { rule: updated, summary });
  }, res, req);
});

export const deleteHotelRule = asyncHandler(async (req, res) => {
  const hotel = await loadHotel(req, res);
  if (!hotel) return;
  const rule = await loadRule(req, res, hotel);
  if (!rule) return;
  await prisma.pricingRule.delete({ where: { id: rule.id } });
  const summary = await dynamicPricing.recomputeHotel(hotel.id);
  ok(res, req, { removed: true, summary });
});

export const recomputeHotelPrices = asyncHandler(async (req, res) => {
  const hotel = await loadHotel(req, res);
  if (!hotel) return;
  ok(res, req, await dynamicPricing.recomputeHotel(hotel.id));
});

export const previewHotelPrices = asyncHandler(async (req, res) => {
  const hotel = await loadHotel(req, res);
  if (!hotel) return;
  if (!req.query.ratePlanId) return fail(res, req, 400, 'Choose a rate plan');
  await runSafely(async () => ok(res, req, await dynamicPricing.previewRatePlan(hotel.id, req.query.ratePlanId, req.query.nights)), res, req);
});
