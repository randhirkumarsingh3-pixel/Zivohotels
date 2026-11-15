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

/**
 * Sets rooms to sell and/or stop-sell for a room type over a date range.
 * Rooms to sell can't be below rooms already booked or above the physical count.
 */
export const updateInventory = async ({ roomTypeId, start, end, weekdays, totalRooms, stopSell }) => {
  const roomType = await prisma.roomType.findUnique({ where: { id: roomTypeId }, select: { id: true, totalInventory: true } });
  if (!roomType) throw Object.assign(new Error('Room type not found'), { status: 404 });
  const days = onWeekdays(daysBetween(start, end), weekdays);
  if (days.length === 0) return { updated: 0 };
  const total = totalRooms === undefined || totalRooms === null || totalRooms === '' ? undefined : Number(totalRooms);
  if (total !== undefined && (!Number.isInteger(total) || total < 0)) throw Object.assign(new Error('Rooms to sell must be a whole number, 0 or more'), { status: 400 });
  if (total !== undefined && total > roomType.totalInventory) {
    throw Object.assign(new Error(`Rooms to sell can't be more than the ${roomType.totalInventory} rooms of this type`), { status: 400 });
  }
  if (total === undefined && stopSell === undefined) throw Object.assign(new Error('Nothing to update'), { status: 400 });

  return prisma.$transaction(async (tx) => {
    const existing = await tx.inventory.findMany({ where: { roomTypeId, date: { in: days } } });
    const byDate = new Map(existing.map((i) => [key(i.date), i]));
    const tooLow = total !== undefined ? existing.filter((i) => (i.bookedRooms || 0) > total) : [];
    if (tooLow.length) {
      const first = tooLow.sort((a, b) => a.date - b.date)[0];
      throw Object.assign(new Error(`${first.bookedRooms} room(s) are already booked on ${first.date.toDateString()}; rooms to sell can't be lower than that`), { status: 400 });
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
    return { updated: days.length };
  }, { timeout: 30000 });
};

/** Sets (price) or clears (price null -> back to base price) a rate plan's price over a date range. */
export const updateRates = async ({ ratePlanId, start, end, weekdays, price, source = 'MANUAL' }) => {
  const plan = await prisma.ratePlan.findUnique({ where: { id: ratePlanId }, select: { id: true } });
  if (!plan) throw Object.assign(new Error('Rate plan not found'), { status: 404 });
  const days = onWeekdays(daysBetween(start, end), weekdays);
  if (days.length === 0) return { updated: 0 };
  if (price === null || price === '') {
    const { count } = await prisma.dailyRate.deleteMany({ where: { ratePlanId, date: { in: days } } });
    return { updated: count, cleared: true };
  }
  const value = roundMoney(Number(price));
  if (!(value > 0)) throw Object.assign(new Error('Enter a price above ₹0'), { status: 400 });
  await prisma.$transaction(days.map((d) => prisma.dailyRate.upsert({
    where: { ratePlanId_date: { ratePlanId, date: d } },
    update: { price: value, source },
    create: { ratePlanId, date: d, price: value, source }
  })));
  return { updated: days.length };
};

export default { getCalendar, updateInventory, updateRates, dailyRatesFor, stopSellNights, stayNightlyPrice, daysBetween };
