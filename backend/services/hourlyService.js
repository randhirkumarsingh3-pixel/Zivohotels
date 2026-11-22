/**
 * Hourly stays: availability, price and booking (rules in domains/hourly.js).
 *
 * Rooms for hourly use per room type per day: RoomType.hourlyRooms, or the day's
 * HourlyAllocation (rooms / stopSell). Hourly bookings that hold rooms: confirmed, checked in, or
 * still within their 30 minutes to pay. They never touch the night inventory.
 *
 * Booking runs under a Postgres advisory lock per room type and day, so two guests can't both
 * take the last slot.
 */
import prisma from '../config/db.js';
import { getSystemConfig } from '../config/systemConfig.js';
import { PUBLIC_HOTEL_STATUSES } from '../constants/hotelStatus.js';
import { uniqueBookingRef } from '../utils/bookingRef.js';
import { membershipFor, memberDiscounts } from './membershipService.js';
import { resolveBest, redeem, displayOffers } from './promotionService.js';

import {
  platformHourly, hotelHourly, isBookable, checkSlot, startTimes, roomsNeeded, hourlyPrice, priceHourly,
  istDate, istYmd, slotLabel, hourlyRefund,
} from '../domains/hourly.js';

/** What the guest sees of an applied offer */
const offerSummary = (promotion) => (promotion ? {
  id: promotion.id, name: promotion.name, code: promotion.code, label: promotion.label,
  discountAmount: promotion.discountAmount, fundedBy: promotion.fundedBy, platform: promotion.platform,
} : null);

export class HourlyError extends Error {
  constructor(message, statusCode = 400) { super(message); this.statusCode = statusCode; }
}

export const getPlatformHourly = async () => platformHourly((await getSystemConfig()).hourly_settings || {});

export const HOLDING = (now = new Date()) => ({
  stayType: 'HOURLY',
  OR: [
    { status: { in: ['CONFIRMED', 'CHECKED_IN'] } },
    { status: 'PENDING', expiresAt: { gt: now } },
  ],
});

const dayRange = (ymd) => ({ from: istDate(ymd, '00:00'), to: new Date(istDate(ymd, '00:00').getTime() + 86400000) });

/** Rooms for hourly use on a day: { roomTypeId: rooms } (0 when closed or switched off). */
const roomsForDay = async (roomTypes, ymd, db = prisma) => {
  const overrides = await db.hourlyAllocation.findMany({ where: { roomTypeId: { in: roomTypes.map((r) => r.id) }, date: new Date(`${ymd}T00:00:00Z`) } });
  const byType = new Map(overrides.map((o) => [o.roomTypeId, o]));
  return Object.fromEntries(roomTypes.map((rt) => {
    const o = byType.get(rt.id);
    const n = !rt.hourlyEnabled ? 0 : o ? (o.stopSell ? 0 : o.rooms) : rt.hourlyRooms;
    return [rt.id, Math.max(0, n || 0)];
  }));
};

/** Hourly slots holding rooms that day, per room type (a day's window plus the next day's start). */
const slotsForDay = async (roomTypeIds, ymd, db = prisma) => {
  const { from, to } = dayRange(ymd);
  const rows = await db.booking.findMany({
    where: { ...HOLDING(), roomTypeId: { in: roomTypeIds }, slotStart: { lt: to }, slotEnd: { gt: from } },
    select: { roomTypeId: true, slotStart: true, slotEnd: true },
  });
  const out = {};
  for (const r of rows) (out[r.roomTypeId] ||= []).push({ start: r.slotStart, end: r.slotEnd });
  return out;
};

export const loadHotel = (hotelId) => prisma.hotel.findUnique({
  where: { id: hotelId },
  select: {
    id: true, name: true, city: true, status: true, hourlySettings: true, memberDiscountPercent: true,
    roomTypes: {
      where: { isActive: true },
      select: { id: true, name: true, description: true, maxOccupancy: true, baseOccupancy: true, bedType: true, roomSize: true, viewType: true, amenities: true, images: true, hourlyEnabled: true, hourlyRooms: true, hourlyPrices: true },
    },
  },
});

/** The settings guests see (no internal approval flags). */
const publicSettings = (s) => ({
  openFrom: s.openFrom, openTo: s.openTo, durations: s.durations, cleaningMinutes: s.cleaningMinutes,
  leadMinutes: s.leadMinutes, freeCancelHours: s.freeCancelHours, extraHourPrice: s.extraHourPrice,
});

/**
 * What a hotel offers by the hour on a date for a duration: each room type with its price and
 * the start times still free, and all start times free in any room type.
 */
export const hotelHourlyOffer = async (hotelId, { date, hours } = {}, now = new Date()) => {
  const hotel = await loadHotel(hotelId);
  if (!hotel) throw new HourlyError('Hotel not found', 404);
  const platform = await getPlatformHourly();
  const settings = hotelHourly(hotel.hourlySettings, platform);
  if (!isBookable(settings, platform) || !PUBLIC_HOTEL_STATUSES.includes(hotel.status)) {
    return { available: false, hotelId, settings: publicSettings(settings), roomTypes: [], startTimes: [] };
  }
  const ymd = date || istYmd(now);
  const h = settings.durations.includes(Number(hours)) ? Number(hours) : settings.durations[0];
  const types = hotel.roomTypes.filter((rt) => rt.hourlyEnabled && hourlyPrice(rt, h));
  const rooms = await roomsForDay(types, ymd);
  const slots = await slotsForDay(types.map((t) => t.id), ymd);
  const candidates = startTimes(ymd, h, settings, now);
  const roomTypes = types.map((rt) => {
    const free = candidates.filter((st) => {
      const { start, end } = checkSlot({ date: ymd, start: st, hours: h }, settings, now);
      return rooms[rt.id] > 0 && roomsNeeded(slots[rt.id] || [], { start, end }, settings.cleaningMinutes) <= rooms[rt.id];
    });
    return {
      id: rt.id, name: rt.name, description: rt.description, maxOccupancy: rt.maxOccupancy || 2, bedType: rt.bedType, roomSize: rt.roomSize, viewType: rt.viewType,
      amenities: rt.amenities, images: rt.images,
      price: hourlyPrice(rt, h),
      prices: Object.fromEntries(settings.durations.map((d) => [d, hourlyPrice(rt, d)]).filter(([, p]) => p)),
      startTimes: free,
    };
  });
  // Best automatic offer for hourly stays on each room's price (what checkout will take off)
  const day = new Date(`${ymd}T00:00:00`);
  const offers = await displayOffers({
    hotelId, checkIn: day, checkOut: new Date(day.getTime() + 86400000), stayType: 'HOURLY',
    plans: roomTypes.map((rt) => ({ roomTypeId: rt.id, ratePlanId: rt.id, nightlyPrice: rt.price })),
  });
  roomTypes.forEach((rt) => {
    const o = offers[rt.id];
    if (o) rt.offer = { name: o.name, label: o.label, discount: o.discountTotal, priceAfter: rt.price - o.discountTotal };
  });
  return {
    available: roomTypes.some((r) => r.startTimes.length > 0),
    hotelId, date: ymd, hours: h, settings: publicSettings(settings),
    memberDiscountPercent: Number(hotel.memberDiscountPercent) || 0,
    startTimes: [...new Set(roomTypes.flatMap((r) => r.startTimes))].sort(),
    roomTypes,
  };
};

/** Hotels offering hourly stays: does it have the room type free for the slot, and its lowest price. */
export const hourlyFromPrice = (hotel, hours, platform) => {
  const settings = hotelHourly(hotel.hourlySettings, platform);
  if (!isBookable(settings, platform)) return null;
  const h = settings.durations.includes(Number(hours)) ? Number(hours) : settings.durations[0];
  const prices = (hotel.roomTypes || []).filter((rt) => rt.hourlyEnabled && rt.hourlyRooms > 0).map((rt) => hourlyPrice(rt, h)).filter(Boolean);
  return prices.length ? { hours: h, price: Math.min(...prices), durations: settings.durations } : null;
};

/** Checks the request and works out the price (with member discounts for signed-in guests). */
const prepare = async ({ hotelId, roomTypeId, date, start, hours, adults = 2, children = 0, userId, couponCode }, now = new Date()) => {
  const hotel = await loadHotel(hotelId);
  if (!hotel || !PUBLIC_HOTEL_STATUSES.includes(hotel.status)) throw new HourlyError('Hotel not found', 404);
  const platform = await getPlatformHourly();
  const settings = hotelHourly(hotel.hourlySettings, platform);
  if (!isBookable(settings, platform)) throw new HourlyError('This hotel does not offer hourly stays right now.');
  const roomType = hotel.roomTypes.find((r) => r.id === roomTypeId);
  if (!roomType || !roomType.hourlyEnabled) throw new HourlyError('This room is not available by the hour.');
  const slot = checkSlot({ date, start, hours }, settings, now);
  if (!slot.ok) throw new HourlyError(slot.error);
  const price = hourlyPrice(roomType, Number(hours));
  if (!price) throw new HourlyError(`This room has no price for ${hours} hours.`);
  const a = Math.max(1, Number(adults) || 1);
  const c = Math.max(0, Number(children) || 0);
  if (a + c > (roomType.maxOccupancy || 2)) throw new HourlyError(`${roomType.name} fits up to ${roomType.maxOccupancy || 2} guests.`);

  const membership = await membershipFor(userId);
  // Offers switched on for hourly stays (automatic, or the code the guest entered); the stay
  // counts as one night on its date for the offer's dates and conditions
  const day = new Date(`${date}T00:00:00`);
  const { promotion, codeStatus } = await resolveBest({
    hotelId, roomTypeId, ratePlanId: null, checkIn: day, checkOut: new Date(day.getTime() + 86400000),
    subtotal: price, userId, code: couponCode, membership, stayType: 'HOURLY', now,
  });
  const promoDiscount = promotion?.discountAmount || 0;
  const member = memberDiscounts(membership, hotel.memberDiscountPercent, price - promoDiscount);
  const taxRules = await prisma.taxRule.findMany({ where: { isActive: true }, orderBy: { effectiveFrom: 'desc' } });
  const pricing = priceHourly({ price, promotionDiscount: promoDiscount, memberHotel: member.hotel, memberZivo: member.zivo, taxRules });
  return { hotel, settings, roomType, slot, hours: Number(hours), adults: a, children: c, pricing, membership, member, promotion, codeStatus };
};

const freeRoomsOk = async (db, { roomType, date, slot, settings }) => {
  const rooms = (await roomsForDay([roomType], date, db))[roomType.id];
  const slots = (await slotsForDay([roomType.id], date, db))[roomType.id] || [];
  return rooms > 0 && roomsNeeded(slots, slot, settings.cleaningMinutes) <= rooms;
};

/** Price and availability for one slot (the hotel page and checkout show it before booking). */
export const quoteHourly = async (input) => {
  const p = await prepare(input);
  const available = await freeRoomsOk(prisma, { roomType: p.roomType, date: input.date, slot: p.slot, settings: p.settings });
  return {
    available,
    hotel: { id: p.hotel.id, name: p.hotel.name, city: p.hotel.city },
    roomType: { id: p.roomType.id, name: p.roomType.name, maxOccupancy: p.roomType.maxOccupancy },
    slot: { date: input.date, start: input.start, hours: p.hours, startsAt: p.slot.start, endsAt: p.slot.end, label: slotLabel(p.slot.start, p.slot.end, p.hours) },
    freeCancelHours: p.settings.freeCancelHours,
    ...p.pricing,
    memberHotelDiscount: p.member.hotel, memberZivoDiscount: p.member.zivo,
    promotion: offerSummary(p.promotion), promoCodeStatus: p.codeStatus,
  };
};

/**
 * Books a slot: checked again under a lock, then a PENDING booking with 30 minutes to pay online
 * (the existing payment flow confirms it).
 */
export const createHourlyBooking = async (input, { userId, requestId } = {}) => {
  const p = await prepare({ ...input, userId });
  const guestName = String(input.guestName || '').trim();
  const guestEmail = String(input.guestEmail || '').trim();
  const guestPhone = String(input.guestPhone || '').trim();
  if (input.couponCode && p.codeStatus && !p.codeStatus.ok && !p.promotion) throw new HourlyError(p.codeStatus.message);
  if (guestName.length < 2) throw new HourlyError('Enter the name of the guest checking in.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestEmail)) throw new HourlyError('Enter a valid email for the booking.');
  if (guestPhone.replace(/\D/g, '').length < 10) throw new HourlyError('Enter a valid mobile number for the booking.');

  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`hourly:${p.roomType.id}:${input.date}`}))`;
    if (!(await freeRoomsOk(tx, { roomType: p.roomType, date: input.date, slot: p.slot, settings: p.settings }))) {
      throw new HourlyError('This room is not free at that time (each stay is followed by cleaning). Choose another start time or room.', 409);
    }
    const label = slotLabel(p.slot.start, p.slot.end, p.hours);
    const booking = await tx.booking.create({
      data: {
        bookingRef: await uniqueBookingRef(tx),
        guestName, guestEmail, guestPhone,
        stayType: 'HOURLY', slotStart: p.slot.start, slotEnd: p.slot.end, hours: p.hours,
        checkIn: p.slot.start, checkOut: p.slot.end,
        guests: p.adults + p.children, adults: p.adults, children: p.children, rooms: 1, extraBeds: 0,
        totalAmount: p.pricing.totalAmount, baseAmount: p.pricing.baseAmount, taxAmount: p.pricing.taxAmount, roomPrice: p.pricing.roomPrice,
        hotelId: p.hotel.id, roomTypeId: p.roomType.id, ratePlanId: null,
        paymentType: 'PREPAID', status: 'PENDING', expiresAt: new Date(Date.now() + 30 * 60000),
        couponCode: p.promotion?.code || null,
        requestId: requestId || null, userId: userId || null,
        metadata: {
          pricingVersion: 'HOURLY-V1',
          hourly: { date: input.date, start: input.start, hours: p.hours, label, freeCancelHours: p.settings.freeCancelHours, cleaningMinutes: p.settings.cleaningMinutes },
          memberDiscountAmount: p.pricing.memberDiscountAmount,
          discountAmount: p.pricing.promotionDiscountAmount + p.pricing.memberDiscountAmount,
          // Same shape as nightly bookings: the settlement pays the hotel for a Zivo-funded offer
          promotion: p.promotion ? { ...offerSummary(p.promotion), discountAmount: p.pricing.promotionDiscountAmount } : null,
          membership: p.membership && p.pricing.memberDiscountAmount > 0 ? { plan: p.membership.plan.name, isPaid: p.membership.isPaid, hotelDiscount: p.member.hotel, zivoDiscount: p.member.zivo } : null,
          taxPercentage: p.pricing.taxPercentage,
        },
      },
    });
    await tx.bookingRoom.create({
      data: {
        bookingId: booking.id, roomNumber: 1, roomTypeId: p.roomType.id, ratePlanId: null,
        adults: p.adults, children: p.children, guestName,
        roomPrice: p.pricing.roomPrice, extraGuestCharges: 0, mealCharges: 0, extraBedCharges: 0, subtotal: p.pricing.roomPrice,
      },
    });
    if (p.promotion && p.pricing.promotionDiscountAmount > 0) {
      await redeem(tx, { promotionId: p.promotion.id, bookingId: booking.id, userId, hotelId: p.hotel.id, discountAmount: p.pricing.promotionDiscountAmount });
    }
    return booking;
  });
};

/** Guest cancellation of an hourly stay: full refund until freeCancelHours before the start. */
export const hourlyGuestRefund = (booking, now = new Date()) => {
  const freeCancelHours = Number(booking.metadata?.hourly?.freeCancelHours ?? 2);
  const { refundAmount, free } = hourlyRefund({ slotStart: booking.slotStart, paidAmount: booking.paidAmount, freeCancelHours }, now);
  return { refundAmount, policyApplied: free ? `HOURLY_FREE_${freeCancelHours}H` : 'HOURLY_LATE_NO_REFUND', memberWaiver: 0, freeCancelHours };
};

// ─── Hotel side (extranet) ───────────────────────────────────────────────────────────────────

/** The hotel's hourly setup: settings and each room type's hourly rooms and prices. */
export const getHotelHourlySetup = async (hotelId) => {
  const hotel = await loadHotel(hotelId);
  if (!hotel) throw new HourlyError('Hotel not found', 404);
  const platform = await getPlatformHourly();
  return {
    platform: { enabled: platform.enabled, durations: platform.durations, maxHours: platform.maxHours },
    settings: hotelHourly(hotel.hourlySettings, platform),
    roomTypes: hotel.roomTypes.map((rt) => ({ id: rt.id, name: rt.name, hourlyEnabled: rt.hourlyEnabled, hourlyRooms: rt.hourlyRooms, hourlyPrices: rt.hourlyPrices || {} })),
  };
};

/** Saves the hotel's hourly settings and room types. Approval stays as ZivoPlus set it. */
export const saveHotelHourlySetup = async (hotelId, body = {}) => {
  const hotel = await prisma.hotel.findUnique({ where: { id: hotelId }, select: { hourlySettings: true, roomTypes: { select: { id: true, totalInventory: true } } } });
  if (!hotel) throw new HourlyError('Hotel not found', 404);
  const platform = await getPlatformHourly();
  const s = body.settings || {};
  const next = hotelHourly({ ...(hotel.hourlySettings || {}), ...s, approved: Boolean(hotel.hourlySettings?.approved) }, platform);
  if (next.enabled && !next.durations.length) throw new HourlyError('Choose at least one duration that fits your hourly opening hours.');
  const types = new Map(hotel.roomTypes.map((r) => [r.id, r]));
  const updates = [];
  for (const rt of Array.isArray(body.roomTypes) ? body.roomTypes : []) {
    const own = types.get(rt.id);
    if (!own) continue;
    const rooms = Math.max(0, Math.min(Number(own.totalInventory) || 0, Math.round(Number(rt.hourlyRooms) || 0)));
    const prices = {};
    for (const d of next.durations) {
      const v = Math.round(Number(rt.hourlyPrices?.[d] ?? rt.hourlyPrices?.[String(d)]) || 0);
      if (v > 0) prices[String(d)] = v;
    }
    if (rt.hourlyEnabled && (!rooms || !Object.keys(prices).length)) {
      throw new HourlyError('Each room type offered by the hour needs at least 1 room and a price for a duration.');
    }
    updates.push(prisma.roomType.update({ where: { id: rt.id }, data: { hourlyEnabled: Boolean(rt.hourlyEnabled), hourlyRooms: rooms, hourlyPrices: prices } }));
  }
  const { approved: _a, ...saved } = next;
  await prisma.$transaction([
    prisma.hotel.update({ where: { id: hotelId }, data: { hourlySettings: { ...saved, approved: Boolean(hotel.hourlySettings?.approved), requestedAt: next.enabled && !hotel.hourlySettings?.approved ? (hotel.hourlySettings?.requestedAt || new Date().toISOString()) : hotel.hourlySettings?.requestedAt || null } } }),
    ...updates,
  ]);
  return getHotelHourlySetup(hotelId);
};

/** Hourly rooms per room type per day for a date range (the calendar). */
export const getAllocations = async (hotelId, from, days = 14) => {
  const types = await prisma.roomType.findMany({ where: { hotelId, isActive: true }, select: { id: true, name: true, hourlyEnabled: true, hourlyRooms: true } });
  const start = new Date(`${from}T00:00:00Z`);
  const dates = Array.from({ length: Math.min(60, Math.max(1, days)) }, (_, i) => new Date(start.getTime() + i * 86400000).toISOString().slice(0, 10));
  const overrides = await prisma.hourlyAllocation.findMany({ where: { roomTypeId: { in: types.map((t) => t.id) }, date: { gte: start, lte: new Date(`${dates[dates.length - 1]}T00:00:00Z`) } } });
  const key = (id, d) => `${id}|${d}`;
  const map = new Map(overrides.map((o) => [key(o.roomTypeId, o.date.toISOString().slice(0, 10)), o]));
  return {
    dates,
    roomTypes: types.filter((t) => t.hourlyEnabled).map((t) => ({
      id: t.id, name: t.name, defaultRooms: t.hourlyRooms,
      days: dates.map((d) => { const o = map.get(key(t.id, d)); return { date: d, rooms: o ? o.rooms : t.hourlyRooms, stopSell: Boolean(o?.stopSell), custom: Boolean(o) }; }),
    })),
  };
};

/** Sets one day's hourly rooms / closes it for a room type (null rooms = back to the default). */
export const setAllocation = async (hotelId, { roomTypeId, date, rooms, stopSell }) => {
  const rt = await prisma.roomType.findFirst({ where: { id: roomTypeId, hotelId }, select: { id: true, totalInventory: true } });
  if (!rt) throw new HourlyError('Room type not found', 404);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) throw new HourlyError('Choose a date.');
  const d = new Date(`${date}T00:00:00Z`);
  if ((rooms === null || rooms === undefined) && !stopSell) {
    await prisma.hourlyAllocation.deleteMany({ where: { roomTypeId, date: d } });
    return { roomTypeId, date, reset: true };
  }
  const n = Math.max(0, Math.min(Number(rt.totalInventory) || 0, Math.round(Number(rooms) || 0)));
  return prisma.hourlyAllocation.upsert({
    where: { roomTypeId_date: { roomTypeId, date: d } },
    update: { rooms: n, stopSell: Boolean(stopSell) },
    create: { roomTypeId, date: d, rooms: n, stopSell: Boolean(stopSell) },
  });
};

/** A day's hourly bookings per room type, for the extranet's day timeline. */
export const dayTimeline = async (hotelId, ymd) => {
  const types = await prisma.roomType.findMany({ where: { hotelId, isActive: true, hourlyEnabled: true }, select: { id: true, name: true, hourlyEnabled: true, hourlyRooms: true } });
  const rooms = await roomsForDay(types, ymd);
  const { from, to } = dayRange(ymd);
  const bookings = await prisma.booking.findMany({
    where: { hotelId, stayType: 'HOURLY', status: { in: ['PENDING', 'CONFIRMED', 'CHECKED_IN', 'COMPLETED'] }, slotStart: { lt: to }, slotEnd: { gt: from } },
    select: { id: true, bookingRef: true, guestName: true, guestPhone: true, roomTypeId: true, slotStart: true, slotEnd: true, hours: true, status: true, expiresAt: true },
    orderBy: { slotStart: 'asc' },
  });
  const hotel = await prisma.hotel.findUnique({ where: { id: hotelId }, select: { hourlySettings: true } });
  const settings = hotelHourly(hotel?.hourlySettings, await getPlatformHourly());
  return {
    date: ymd, openFrom: settings.openFrom, openTo: settings.openTo, cleaningMinutes: settings.cleaningMinutes,
    roomTypes: types.map((t) => ({
      id: t.id, name: t.name, rooms: rooms[t.id],
      bookings: bookings.filter((b) => b.roomTypeId === t.id && !(b.status === 'PENDING' && b.expiresAt && b.expiresAt <= new Date())),
    })),
  };
};
