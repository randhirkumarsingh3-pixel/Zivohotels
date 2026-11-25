import prisma from '../config/db.js';
import { getDatesInRange } from '../utils/dateUtils.js';
import { roundMoney, toMoney } from '../utils/money.js';

/**
 * ARI: availability, rates and inventory for a property, per day.
 *
 *  - Inventory (room type x date): rooms to sell (totalRooms), booked, available, stop-sell.
 *    A date with no row sells the room type's physical count (RoomType.totalInventory).
 *  - DailyRate (rate plan x date): the price for that night; without one the rate plan's base
 *    price applies.
 *
 * Used by Admin -> Inventory & Rates, the extranet, the channel-manager ARI endpoint, and the
 * booking engine (pricing, availability, search) so every screen shows the same numbers.
 * Dates are calendar days stored the same way the booking engine stores them (getDatesInRange).
 */

const MAX_DAYS = 366;
const key = (d) => new Date(d).toISOString();

/** Calendar days from start to end, both inclusive. */
export const daysBetween = (start, end) => {
  const endExclusive = new Date(end);
  endExclusive.setDate(endExclusive.getDate() + 1);
  const days = getDatesInRange(start, endExclusive);
  if (days.length === 0) throw Object.assign(new Error('The end date must be on or after the start date'), { status: 400 });
  if (days.length > MAX_DAYS) throw Object.assign(new Error(`Choose at most ${MAX_DAYS} days at a time`), { status: 400 });
  return days;
};

/** Days filtered to the chosen weekdays (0 = Sunday ... 6 = Saturday); all days if none given. */
const onWeekdays = (days, weekdays) =>
  Array.isArray(weekdays) && weekdays.length ? days.filter((d) => weekdays.includes(d.getDay())) : days;

/** Daily rate overrides for a rate plan over the stay nights: { [isoDate]: price }. */
export const dailyRatesFor = async (ratePlanId, nights, db = prisma) => {
  if (!ratePlanId || nights.length === 0) return {};
  const rows = await db.dailyRate.findMany({
    where: { ratePlanId, date: { in: nights } },
    select: { date: true, price: true }
  });
  return Object.fromEntries(rows.map((r) => [key(r.date), toMoney(r.price)]));
};

/** Nights in the stay that are closed for sale. */
export const stopSellNights = async (roomTypeId, nights, db = prisma) => {
  if (nights.length === 0) return [];
  const rows = await db.inventory.findMany({
    where: { roomTypeId, date: { in: nights }, stopSell: true },
    select: { date: true }
  });
  return rows.map((r) => r.date);
};

/**
 * Average nightly price of a rate plan for a stay (base occupancy, before tax and discounts),
 * honouring daily rates. Used for search results and the hotel page so they match checkout.
 */
export const stayNightlyPrice = (basePrice, nights, overrides) => {
  if (!nights.length) return toMoney(basePrice);
  const total = nights.reduce((sum, d) => sum + (overrides[key(d)] ?? toMoney(basePrice)), 0);
  return roundMoney(total / nights.length);
};

/**
 * Nightly price of a rate plan as guests see it on search and the hotel page: the room price for
 * the stay plus the plan's meals for the adults a room holds at its base occupancy. Checkout adds
 * meals per adult the same way (pricingDomain), so a meal plan shows the price the guest pays.
 */
export const planNightlyPrice = (ratePlan, roomType, nights, overrides) => {
  const room = stayNightlyPrice(ratePlan.basePrice, nights, overrides);
  const meals = ratePlan.mealPlan && !['NONE', 'EP'].includes(ratePlan.mealPlan)
    ? toMoney(ratePlan.mealPriceAdult || 0) * (roomType?.baseOccupancy || 2)
    : 0;
  return room > 0 ? roundMoney(room + meals) : room;
};

/** Calendar for a property: room types with per-day inventory and per-day prices for each rate plan. */
export const getCalendar = async (hotelId, start, end) => {
  const days = daysBetween(start, end);
  const roomTypes = await prisma.roomType.findMany({
    where: { hotelId, isActive: true },
    orderBy: { name: 'asc' },
    select: {
      id: true, name: true, totalInventory: true,
      ratePlans: { where: { isActive: true }, orderBy: { name: 'asc' }, select: { id: true, name: true, mealPlan: true, basePrice: true } }
    }
  });
  const rtIds = roomTypes.map((r) => r.id);
  const rpIds = roomTypes.flatMap((r) => r.ratePlans.map((p) => p.id));
  const [inv, rates] = await Promise.all([
    prisma.inventory.findMany({ where: { roomTypeId: { in: rtIds }, date: { in: days } } }),
    prisma.dailyRate.findMany({ where: { ratePlanId: { in: rpIds }, date: { in: days } }, select: { ratePlanId: true, date: true, price: true, source: true } }),
  ]);
  const invMap = new Map(inv.map((i) => [`${i.roomTypeId}|${key(i.date)}`, i]));
  const rateMap = new Map(rates.map((r) => [`${r.ratePlanId}|${key(r.date)}`, r]));

  return {
    days: days.map(key),
    roomTypes: roomTypes.map((rt) => ({
      id: rt.id,
      name: rt.name,
      physicalRooms: rt.totalInventory,
      inventory: days.map((d) => {
        const row = invMap.get(`${rt.id}|${key(d)}`);
        const total = row ? row.totalRooms : rt.totalInventory;
        const booked = row?.bookedRooms || 0;
        return { date: key(d), totalRooms: total, bookedRooms: booked, availableRooms: Math.max(0, total - booked), stopSell: Boolean(row?.stopSell), isDefault: !row };
      }),
      ratePlans: rt.ratePlans.map((rp) => ({
        id: rp.id,
        name: rp.name,
        mealPlan: rp.mealPlan,
        basePrice: toMoney(rp.basePrice),
        rates: days.map((d) => {
          const r = rateMap.get(`${rp.id}|${key(d)}`);
          return { date: key(d), price: r ? toMoney(r.price) : toMoney(rp.basePrice), isOverride: Boolean(r), source: r?.source || null };
        })
      }))
    }))
  };
};

const parseRooms = (totalRooms) => {
  const total = totalRooms === undefined || totalRooms === null || totalRooms === '' ? undefined : (totalRooms === 'ALL' ? 'ALL' : Number(totalRooms));
  if (total !== undefined && total !== 'ALL' && (!Number.isInteger(total) || total < 0)) throw Object.assign(new Error('Rooms to sell must be a whole number, 0 or more'), { status: 400 });
  return total;
};

/**
 * Rooms to sell and/or stop-sell for one room type on the given days, inside a transaction.
 * totalRooms 'ALL' means every room of the type. Rooms to sell can't be below rooms already booked
 * or above the physical count.
 */
const applyInventory = async (tx, { roomTypeId, days, totalRooms, stopSell }) => {
  const roomType = await tx.roomType.findUnique({ where: { id: roomTypeId }, select: { id: true, name: true, totalInventory: true } });
  if (!roomType) throw Object.assign(new Error('Room type not found'), { status: 404 });
  const parsed = parseRooms(totalRooms);
  const total = parsed === 'ALL' ? roomType.totalInventory : parsed;
  if (total !== undefined && total > roomType.totalInventory) {
    throw Object.assign(new Error(`${roomType.name}: rooms to sell can't be more than its ${roomType.totalInventory} rooms`), { status: 400 });
  }
  if (total === undefined && stopSell === undefined) throw Object.assign(new Error('Nothing to update'), { status: 400 });
  if (days.length === 0) return 0;

  const existing = await tx.inventory.findMany({ where: { roomTypeId, date: { in: days } } });
  const byDate = new Map(existing.map((i) => [key(i.date), i]));
  const tooLow = total !== undefined ? existing.filter((i) => (i.bookedRooms || 0) > total) : [];
  if (tooLow.length) {
    const first = tooLow.sort((a, b) => a.date - b.date)[0];
    throw Object.assign(new Error(`${roomType.name}: ${first.bookedRooms} room(s) are already booked on ${first.date.toDateString()}; rooms to sell can't be lower than that`), { status: 400 });
  }
  for (const d of days) {
    const row = byDate.get(key(d));
    const nextTotal = total ?? row?.totalRooms ?? roomType.totalInventory;
    const booked = row?.bookedRooms || 0;
    const data = {
      totalRooms: nextTotal,
      availableRooms: Math.max(0, nextTotal - booked),
      ...(stopSell !== undefined ? { stopSell: Boolean(stopSell) } : {})
    };
    if (row) await tx.inventory.update({ where: { id: row.id }, data });
    else await tx.inventory.create({ data: { roomTypeId, date: d, bookedRooms: 0, ...data, stopSell: Boolean(stopSell) } });
  }
  return days.length;
};

/**
 * Prices for one rate plan on the given days, inside a transaction:
 *  - price: a number sets that price; null resets to the base price (removes daily rates).
 *  - adjustPercent: changes each day's current price (daily rate, or base) by that percentage.
 */
const applyRates = async (tx, { ratePlanId, days, price, adjustPercent, source = 'MANUAL' }) => {
  const plan = await tx.ratePlan.findUnique({ where: { id: ratePlanId }, select: { id: true, name: true, basePrice: true } });
  if (!plan) throw Object.assign(new Error('Rate plan not found'), { status: 404 });
  if (days.length === 0) return 0;
  if (adjustPercent !== undefined && adjustPercent !== null && adjustPercent !== '') {
    const pct = Number(adjustPercent);
    if (!Number.isFinite(pct) || pct <= -100 || pct > 500) throw Object.assign(new Error('Choose a change between -99% and +500%'), { status: 400 });
    const current = await dailyRatesFor(ratePlanId, days, tx);
    for (const d of days) {
      const value = roundMoney((current[key(d)] ?? toMoney(plan.basePrice)) * (1 + pct / 100));
      if (!(value > 0)) throw Object.assign(new Error(`${plan.name} has no price to change on ${d.toDateString()}`), { status: 400 });
      await tx.dailyRate.upsert({
        where: { ratePlanId_date: { ratePlanId, date: d } },
        update: { price: value, source },
        create: { ratePlanId, date: d, price: value, source }
      });
    }
    return days.length;
  }
  if (price === null || price === '') {
    const { count } = await tx.dailyRate.deleteMany({ where: { ratePlanId, date: { in: days } } });
    return count;
  }
  const value = roundMoney(Number(price));
  if (!(value > 0)) throw Object.assign(new Error('Enter a price above ₹0'), { status: 400 });
  for (const d of days) {
    await tx.dailyRate.upsert({
      where: { ratePlanId_date: { ratePlanId, date: d } },
      update: { price: value, source },
      create: { ratePlanId, date: d, price: value, source }
    });
  }
  return days.length;
};

/** Sets rooms to sell and/or stop-sell for a room type over a date range. */
export const updateInventory = async ({ roomTypeId, start, end, weekdays, totalRooms, stopSell }) => {
  const days = onWeekdays(daysBetween(start, end), weekdays);
  const updated = await prisma.$transaction((tx) => applyInventory(tx, { roomTypeId, days, totalRooms, stopSell }), { timeout: 30000 });
  return { updated };
};

/** Sets (price) or clears (price null -> back to base price) a rate plan's price over a date range. */
export const updateRates = async ({ ratePlanId, start, end, weekdays, price, adjustPercent, source = 'MANUAL' }) => {
  const days = onWeekdays(daysBetween(start, end), weekdays);
  const updated = await prisma.$transaction((tx) => applyRates(tx, { ratePlanId, days, price, adjustPercent, source }), { timeout: 30000 });
  return price === null || price === '' ? { updated, cleared: true } : { updated };
};

/**
 * Bulk update for one property: the same availability and/or price change for several room types
 * and rate plans over a date range (optionally only some weekdays). All or nothing: if any part is
 * refused (e.g. rooms to sell below bookings on some date) nothing is saved.
 *   inventory: { roomTypeIds, totalRooms?: number | 'ALL', stopSell?: boolean }
 *   rates:     { ratePlanIds, price?: number | null (reset), adjustPercent?: number }
 */
export const bulkUpdate = async ({ hotelId, start, end, weekdays, inventory, rates }) => {
  const days = onWeekdays(daysBetween(start, end), weekdays);
  const roomTypeIds = [...new Set(inventory?.roomTypeIds || [])];
  const ratePlanIds = [...new Set(rates?.ratePlanIds || [])];
  if (!roomTypeIds.length && !ratePlanIds.length) throw Object.assign(new Error('Choose at least one room type or rate plan'), { status: 400 });
  if (days.length === 0) throw Object.assign(new Error('No days match the chosen weekdays in this date range'), { status: 400 });

  const [rtCount, rpCount] = await Promise.all([
    prisma.roomType.count({ where: { id: { in: roomTypeIds }, hotelId } }),
    prisma.ratePlan.count({ where: { id: { in: ratePlanIds }, roomType: { hotelId } } }),
  ]);
  if (rtCount !== roomTypeIds.length || rpCount !== ratePlanIds.length) {
    throw Object.assign(new Error('Some of the chosen rooms or rate plans are not part of this property'), { status: 400 });
  }
  if (ratePlanIds.length && rates.price === undefined && (rates.adjustPercent === undefined || rates.adjustPercent === '')) {
    throw Object.assign(new Error('Enter a price, a % change, or choose reset to base price'), { status: 400 });
  }

  return prisma.$transaction(async (tx) => {
    let inventoryDays = 0;
    let rateDays = 0;
    for (const roomTypeId of roomTypeIds) {
      inventoryDays += await applyInventory(tx, { roomTypeId, days, totalRooms: inventory.totalRooms, stopSell: inventory.stopSell });
    }
    for (const ratePlanId of ratePlanIds) {
      rateDays += await applyRates(tx, { ratePlanId, days, price: rates.price, adjustPercent: rates.adjustPercent });
    }
    return { days: days.length, roomTypes: roomTypeIds.length, ratePlans: ratePlanIds.length, inventoryDays, rateDays };
  }, { timeout: 120000 });
};

export default { getCalendar, updateInventory, updateRates, bulkUpdate, dailyRatesFor, stopSellNights, stayNightlyPrice, daysBetween };
