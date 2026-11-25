import prisma from '../config/db.js';
import { getDatesInRange } from '../utils/dateUtils.js';
import { roundMoney, toMoney } from '../utils/money.js';
import { isDynamicPricingPaused } from './ops/controlService.js';

/**
 * Rule-based dynamic pricing for a property.
 *
 * The owner (extranet) or an admin switches it on and sets rules; each rule moves the rate plan's
 * base price by a percentage when it matches a night:
 *   WEEKDAY      { weekdays: [5, 6] }           chosen days of the week (e.g. weekends)
 *   OCCUPANCY    { minOccupancy: 70 }           when at least 70% of that room type is booked
 *                { maxOccupancy: 30 }           ...or at most 30% (to fill empty rooms)
 *   LAST_MINUTE  { withinDays: 3 }              stays starting within 3 days
 *   EARLY_BIRD   { beyondDays: 60 }             stays starting 60+ days away
 *   DATE_RANGE   { start: 'YYYY-MM-DD', end }   a season or event
 * Admin-managed holidays (HolidayCalendar, all cities or the property's city) add their uplift
 * when the property allows it. Matching percentages add up, then the total is held within the
 * property's limits (minPercent..maxPercent, and minPrice..maxPrice if set).
 *
 * Results are saved as daily rates with source DYNAMIC for the next horizonDays nights, so search,
 * the hotel page and checkout all show and charge exactly the same price. Nights with a manual
 * rate (Inventory & Rates) or a channel-manager rate are left alone, and properties connected to an
 * active channel manager are skipped (that system sets their prices).
 *
 * Recomputed hourly, after a booking changes occupancy, and whenever rules or settings change.
 */

export const RULE_TYPES = ['WEEKDAY', 'OCCUPANCY', 'LAST_MINUTE', 'EARLY_BIRD', 'DATE_RANGE'];
const DAY = 24 * 60 * 60 * 1000;
const key = (d) => new Date(d).toISOString();
const ymdLocal = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const bad = (message) => Object.assign(new Error(message), { status: 400 });

/** Checks and cleans a rule's condition for its type. */
export const normalizeCondition = (type, condition = {}) => {
  const c = condition || {};
  switch (type) {
    case 'WEEKDAY': {
      const weekdays = [...new Set((c.weekdays || []).map(Number))].filter((d) => Number.isInteger(d) && d >= 0 && d <= 6).sort();
      if (!weekdays.length) throw bad('Choose at least one day of the week');
      return { weekdays };
    }
    case 'OCCUPANCY': {
      const min = c.minOccupancy === undefined || c.minOccupancy === '' || c.minOccupancy === null ? undefined : Number(c.minOccupancy);
      const max = c.maxOccupancy === undefined || c.maxOccupancy === '' || c.maxOccupancy === null ? undefined : Number(c.maxOccupancy);
      if ((min === undefined) === (max === undefined)) throw bad('Set either "occupancy at or above" or "occupancy at or below"');
      const v = min ?? max;
      if (!(v >= 0 && v <= 100)) throw bad('Occupancy must be between 0% and 100%');
      return min !== undefined ? { minOccupancy: min } : { maxOccupancy: max };
    }
    case 'LAST_MINUTE': {
      const withinDays = Number(c.withinDays);
      if (!Number.isInteger(withinDays) || withinDays < 0 || withinDays > 30) throw bad('Last-minute window must be 0 to 30 days');
      return { withinDays };
    }
    case 'EARLY_BIRD': {
      const beyondDays = Number(c.beyondDays);
      if (!Number.isInteger(beyondDays) || beyondDays < 1 || beyondDays > 365) throw bad('Early-bird window must be 1 to 365 days');
      return { beyondDays };
    }
    case 'DATE_RANGE': {
      const re = /^\d{4}-\d{2}-\d{2}$/;
      if (!re.test(c.start || '') || !re.test(c.end || '')) throw bad('Choose the start and end dates');
      if (c.end < c.start) throw bad('The end date must be on or after the start date');
      return { start: c.start, end: c.end };
    }
    default:
      throw bad('Unknown rule type');
  }
};

/** Does a rule apply to this night? ctx: { date, daysAhead, occupancyPct } */
export const ruleMatches = (rule, ctx) => {
  const c = rule.condition || {};
  switch (rule.type) {
    case 'WEEKDAY': return (c.weekdays || []).includes(ctx.date.getDay());
    case 'OCCUPANCY': return c.minOccupancy !== undefined ? ctx.occupancyPct >= c.minOccupancy : ctx.occupancyPct <= c.maxOccupancy;
    case 'LAST_MINUTE': return ctx.daysAhead >= 0 && ctx.daysAhead <= c.withinDays;
    case 'EARLY_BIRD': return ctx.daysAhead >= c.beyondDays;
    case 'DATE_RANGE': { const d = ymdLocal(ctx.date); return d >= c.start && d <= c.end; }
    default: return false;
  }
};

const inScope = (rule, roomTypeId, ratePlanId) =>
  (!rule.roomTypeId || rule.roomTypeId === roomTypeId) && (!rule.ratePlanId || rule.ratePlanId === ratePlanId);

/**
 * The dynamic price of one night (pure). Returns { price, percent, applied: [{ name, percent }] }.
 * settings: { minPercent, maxPercent, minPrice, maxPrice }
 */
export const priceForNight = ({ basePrice, rules, holidays = [], settings, ctx, roomTypeId, ratePlanId }) => {
  const applied = [];
  for (const r of rules) {
    if (inScope(r, roomTypeId, ratePlanId) && ruleMatches(r, ctx)) applied.push({ name: r.name || r.type, percent: r.adjustment });
  }
  for (const h of holidays) {
    if (ymdLocal(h.date) === ymdLocal(ctx.date)) applied.push({ name: h.name, percent: roundMoney(h.multiplier * 100) });
  }
  const raw = applied.reduce((s, a) => s + a.percent, 0);
  const percent = Math.min(settings.maxPercent, Math.max(settings.minPercent, raw));
  let price = roundMoney(toMoney(basePrice) * (1 + percent / 100));
  if (settings.minPrice != null && price < toMoney(settings.minPrice)) price = toMoney(settings.minPrice);
  if (settings.maxPrice != null && price > toMoney(settings.maxPrice)) price = toMoney(settings.maxPrice);
  return { price, percent, applied };
};

const DEFAULT_SETTINGS = { enabled: false, minPercent: -30, maxPercent: 50, minPrice: null, maxPrice: null, applyHolidays: true, horizonDays: 90 };

export const getSettings = async (hotelId) => {
  const row = await prisma.dynamicPricingSetting.findUnique({ where: { hotelId } });
  return { ...DEFAULT_SETTINGS, ...(row || {}), hotelId };
};

const isChannelManaged = async (hotel) => {
  if (hotel.integrationMode !== 'CHANNEL_MANAGER') return false;
  const integration = await prisma.channelIntegration.findUnique({ where: { hotelId: hotel.id }, select: { status: true } });
  return integration?.status === 'ACTIVE';
};

/** Removes the property's future dynamic prices (back to base price or manual rates). */
const clearDynamic = async (hotelId, from) => {
  const { count } = await prisma.dailyRate.deleteMany({ where: { source: 'DYNAMIC', date: { gte: from }, ratePlan: { roomType: { hotelId } } } });
  return count;
};

/** Works out and saves dynamic prices for one property. Returns a summary. */
export const recomputeHotel = async (hotelId) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const hotel = await prisma.hotel.findUnique({ where: { id: hotelId }, select: { id: true, city: true, integrationMode: true, isDeleted: true } });
  if (!hotel) throw Object.assign(new Error('Property not found'), { status: 404 });
  const settings = await getSettings(hotelId);

  const finish = async (summary) => {
    const data = { lastRunAt: new Date(), lastRunSummary: summary };
    await prisma.dynamicPricingSetting.upsert({ where: { hotelId }, update: data, create: { hotelId, ...data } });
    return summary;
  };

  if (!settings.enabled || hotel.isDeleted) {
    return finish({ status: 'OFF', cleared: await clearDynamic(hotelId, today) });
  }
  if (await isChannelManaged(hotel)) {
    return finish({ status: 'CHANNEL_MANAGER', cleared: await clearDynamic(hotelId, today) });
  }

  const horizon = Math.min(Math.max(settings.horizonDays || 90, 7), 365);
  const end = new Date(today);
  end.setDate(end.getDate() + horizon);
  const days = getDatesInRange(today, end);

  const [roomTypes, rules, holidays] = await Promise.all([
    prisma.roomType.findMany({
      where: { hotelId, isActive: true },
      select: { id: true, totalInventory: true, ratePlans: { where: { isActive: true }, select: { id: true, basePrice: true } } }
    }),
    prisma.pricingRule.findMany({ where: { hotelId, isActive: true } }),
    settings.applyHolidays
      ? prisma.holidayCalendar.findMany({ where: { isActive: true, date: { gte: today, lt: end } } })
      : [],
  ]);
  const cityHolidays = holidays.filter((h) => !h.city || h.city.trim().toLowerCase() === (hotel.city || '').trim().toLowerCase());
  const rtIds = roomTypes.map((r) => r.id);
  const rpIds = roomTypes.flatMap((r) => r.ratePlans.map((p) => p.id));
  const [inventory, existingRates] = await Promise.all([
    prisma.inventory.findMany({ where: { roomTypeId: { in: rtIds }, date: { in: days } }, select: { roomTypeId: true, date: true, totalRooms: true, bookedRooms: true } }),
    prisma.dailyRate.findMany({ where: { ratePlanId: { in: rpIds }, date: { in: days } }, select: { id: true, ratePlanId: true, date: true, price: true, source: true } }),
  ]);
  const invMap = new Map(inventory.map((i) => [`${i.roomTypeId}|${key(i.date)}`, i]));
  const rateMap = new Map(existingRates.map((r) => [`${r.ratePlanId}|${key(r.date)}`, r]));

  const creates = [];
  const updates = [];
  const deletes = [];
  let dynamicNights = 0;
  let skippedManual = 0;

  for (const rt of roomTypes) {
    for (const d of days) {
      const inv = invMap.get(`${rt.id}|${key(d)}`);
      const capacity = inv ? inv.totalRooms : rt.totalInventory;
      const occupancyPct = capacity > 0 ? ((inv?.bookedRooms || 0) / capacity) * 100 : 100;
      const ctx = { date: d, daysAhead: Math.round((d - today) / DAY), occupancyPct };
      for (const rp of rt.ratePlans) {
        if (!(toMoney(rp.basePrice) > 0)) continue;
        const existing = rateMap.get(`${rp.id}|${key(d)}`);
        if (existing && existing.source !== 'DYNAMIC') { skippedManual += 1; continue; }
        const { price, applied } = priceForNight({ basePrice: rp.basePrice, rules, holidays: cityHolidays, settings, ctx, roomTypeId: rt.id, ratePlanId: rp.id });
        const unchangedFromBase = applied.length === 0 && price === toMoney(rp.basePrice);
        if (unchangedFromBase) {
          if (existing) deletes.push(existing.id);
          continue;
        }
        dynamicNights += 1;
        if (!existing) creates.push({ ratePlanId: rp.id, date: d, price, source: 'DYNAMIC' });
        else if (toMoney(existing.price) !== price) updates.push({ id: existing.id, price });
      }
    }
  }

  await prisma.$transaction(async (tx) => {
    if (deletes.length) await tx.dailyRate.deleteMany({ where: { id: { in: deletes }, source: 'DYNAMIC' } });
    if (creates.length) await tx.dailyRate.createMany({ data: creates, skipDuplicates: true });
    for (const u of updates) await tx.dailyRate.update({ where: { id: u.id }, data: { price: u.price } });
  }, { timeout: 120000 });

  return finish({
    status: 'ON',
    nights: days.length,
    ratePlans: rpIds.length,
    dynamicNights,
    keptManual: skippedManual,
    changed: creates.length + updates.length + deletes.length,
    rules: rules.length,
    holidays: cityHolidays.length,
  });
};

/**
 * Explains the next nights for one rate plan without saving: base price, the rules that apply and
 * the resulting price (or the manual / channel-manager rate that takes precedence).
 */
export const previewRatePlan = async (hotelId, ratePlanId, nights = 14) => {
  const plan = await prisma.ratePlan.findFirst({
    where: { id: ratePlanId, roomType: { hotelId } },
    select: { id: true, name: true, basePrice: true, roomType: { select: { id: true, name: true, totalInventory: true } } }
  });
  if (!plan) throw Object.assign(new Error('Rate plan not found'), { status: 404 });
  const hotel = await prisma.hotel.findUnique({ where: { id: hotelId }, select: { city: true } });
  const settings = await getSettings(hotelId);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = new Date(today);
  end.setDate(end.getDate() + Math.min(Math.max(Number(nights) || 14, 1), 60));
  const days = getDatesInRange(today, end);
  const [rules, holidays, inventory, rates] = await Promise.all([
    prisma.pricingRule.findMany({ where: { hotelId, isActive: true } }),
    settings.applyHolidays ? prisma.holidayCalendar.findMany({ where: { isActive: true, date: { gte: today, lt: end } } }) : [],
    prisma.inventory.findMany({ where: { roomTypeId: plan.roomType.id, date: { in: days } } }),
    prisma.dailyRate.findMany({ where: { ratePlanId, date: { in: days } } }),
  ]);
  const cityHolidays = holidays.filter((h) => !h.city || h.city.trim().toLowerCase() === (hotel?.city || '').trim().toLowerCase());
  const invMap = new Map(inventory.map((i) => [key(i.date), i]));
  const rateMap = new Map(rates.map((r) => [key(r.date), r]));
  return {
    ratePlan: { id: plan.id, name: plan.name, roomType: plan.roomType.name, basePrice: toMoney(plan.basePrice) },
    enabled: settings.enabled,
    nights: days.map((d) => {
      const inv = invMap.get(key(d));
      const capacity = inv ? inv.totalRooms : plan.roomType.totalInventory;
      const occupancyPct = capacity > 0 ? ((inv?.bookedRooms || 0) / capacity) * 100 : 100;
      const ctx = { date: d, daysAhead: Math.round((d - today) / DAY), occupancyPct };
      const calc = priceForNight({ basePrice: plan.basePrice, rules, holidays: cityHolidays, settings, ctx, roomTypeId: plan.roomType.id, ratePlanId: plan.id });
      const rate = rateMap.get(key(d));
      const override = rate && rate.source !== 'DYNAMIC' ? { price: toMoney(rate.price), source: rate.source } : null;
      return {
        date: key(d),
        occupancy: Math.round(occupancyPct),
        dynamicPrice: calc.price,
        percent: calc.percent,
        applied: calc.applied,
        override,
        guestPrice: override ? override.price : settings.enabled ? calc.price : toMoney(plan.basePrice),
      };
    })
  };
};

/** Recomputes every property with dynamic pricing on. */
export const recomputeAll = async () => {
  // Admin → System control can pause automatic pricing for every hotel
  if (await isDynamicPricingPaused()) return 0;
  const enabled = await prisma.dynamicPricingSetting.findMany({ where: { enabled: true }, select: { hotelId: true } });
  let ok = 0;
  for (const { hotelId } of enabled) {
    try { await recomputeHotel(hotelId); ok += 1; } catch (err) { console.error(`[DynamicPricing] ${hotelId}:`, err.message); }
  }
  return ok;
};

// Debounced recompute after bookings, so a burst of bookings triggers one run per property.
const pending = new Map();
export const scheduleRecompute = (hotelId) => {
  if (!hotelId || process.env.NODE_ENV === 'test') return;
  clearTimeout(pending.get(hotelId));
  const timer = setTimeout(async () => {
    pending.delete(hotelId);
    try {
      const s = await prisma.dynamicPricingSetting.findUnique({ where: { hotelId }, select: { enabled: true } });
      if (s?.enabled && !(await isDynamicPricingPaused())) await recomputeHotel(hotelId);
    } catch (err) {
      console.error('[DynamicPricing] recompute after booking failed:', err.message);
    }
  }, 5000);
  timer.unref?.();
  pending.set(hotelId, timer);
};

const ONE_HOUR = 60 * 60 * 1000;
/** Hourly run inside the API process (keeps the rolling horizon and last-minute rules current). */
export const startDynamicPricingJob = () => {
  const run = () => recomputeAll()
    .then((n) => { if (n) console.log(`[DynamicPricing] Updated ${n} propert${n === 1 ? 'y' : 'ies'}`); })
    .catch((err) => console.error('[DynamicPricing] failed:', err.message));
  const first = setTimeout(run, 30 * 1000);
  first.unref?.();
  const timer = setInterval(run, ONE_HOUR);
  timer.unref?.();
  return timer;
};

export default { RULE_TYPES, normalizeCondition, ruleMatches, priceForNight, getSettings, recomputeHotel, previewRatePlan, recomputeAll, scheduleRecompute, startDynamicPricingJob };
