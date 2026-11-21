/**
 * Hourly stays endpoints: what a hotel offers by the hour, hourly search, price and booking for
 * guests; setup, day rooms and the day timeline for hotels; platform rules and approval for admins.
 */
import prisma from '../config/db.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { COVER_PHOTO_FIRST } from '../constants/coverPhoto.js';
import { PUBLIC_HOTEL_STATUSES } from '../constants/hotelStatus.js';
import { mediaService } from '../services/MediaService.js';
import { cityNames } from '../utils/places.js';
import {
  HourlyError, hotelHourlyOffer, quoteHourly, createHourlyBooking, getPlatformHourly, hourlyFromPrice,
  getHotelHourlySetup, saveHotelHourlySetup, getAllocations, setAllocation, dayTimeline,
} from '../services/hourlyService.js';
import { platformHourly, hotelHourly, isBookable, istYmd } from '../domains/hourly.js';
import { notifyAdmins, notifyHotel } from '../services/notifyService.js';

const fail = (res, e) => {
  if (e instanceof HourlyError) return res.status(e.statusCode).json({ success: false, message: e.message });
  throw e;
};
const wrap = (fn) => asyncHandler(async (req, res) => { try { await fn(req, res); } catch (e) { fail(res, e); } });

// ─── Guests ──────────────────────────────────────────────────────────────────────────────────

/** GET /hotels/:id/hourly?date=&hours= */
export const hotelOffer = wrap(async (req, res) => {
  res.json({ success: true, data: await hotelHourlyOffer(req.params.id, { date: req.query.date, hours: req.query.hours }) });
});

/**
 * GET /hotels/search/hourly?city=&date=&start=&hours=&guests=
 * Hotels in the city offering hourly stays; each says whether the slot is free and its price.
 */
export const searchHourly = wrap(async (req, res) => {
  const platform = await getPlatformHourly();
  if (!platform.enabled) return res.json({ success: true, data: { hotels: [], hourly: { enabled: false } } });
  const city = String(req.query.city || '').trim();
  const names = city ? cityNames(city) : [];
  const date = String(req.query.date || istYmd(new Date()));
  const hours = Number(req.query.hours) || 3;
  const start = String(req.query.start || '');
  const guests = Math.max(1, Number(req.query.guests) || 1);
  const hotels = await prisma.hotel.findMany({
    where: {
      status: { in: PUBLIC_HOTEL_STATUSES },
      ...(names.length ? { OR: [...names.map((n) => ({ city: { equals: n, mode: 'insensitive' } })), { location: { contains: city, mode: 'insensitive' } }, { name: { contains: city, mode: 'insensitive' } }] } : {}),
    },
    select: {
      id: true, name: true, city: true, location: true, rating: true, reviewScore: true, reviewCount: true, amenities: true, memberDiscountPercent: true, hourlySettings: true,
      media: { ...COVER_PHOTO_FIRST, select: { url: true }, take: 1 },
      roomTypes: { where: { isActive: true, hourlyEnabled: true }, select: { id: true, maxOccupancy: true, hourlyEnabled: true, hourlyRooms: true, hourlyPrices: true } },
    },
    take: 100,
  });
  const out = [];
  for (const h of hotels) {
    const from = hourlyFromPrice(h, hours, platform);
    if (!from || from.hours !== hours) continue;
    const settings = hotelHourly(h.hourlySettings, platform);
    // Free at the requested start in a room big enough (no start: any free time that day)
    const offer = await hotelHourlyOffer(h.id, { date, hours });
    const fits = offer.roomTypes.filter((rt) => (rt.maxOccupancy || 2) >= guests);
    const freeAt = start ? fits.filter((rt) => rt.startTimes.includes(start)) : fits.filter((rt) => rt.startTimes.length);
    const signed = await mediaService.signHotelUrls(h).catch(() => h);
    const ratingNum = Number(h.rating) || 0;
    out.push({
      id: h.id, name: h.name, city: h.city, location: h.location,
      image: signed.media?.[0]?.url || '',
      starRating: Number.isInteger(ratingNum) && ratingNum >= 1 && ratingNum <= 5 ? ratingNum : 0,
      reviewScore: h.reviewScore, reviewCount: h.reviewCount, amenities: h.amenities, memberDiscountPercent: h.memberDiscountPercent,
      price: freeAt.length ? Math.min(...freeAt.map((r) => r.price)) : from.price,
      hourly: { hours, start: start || null, date, available: freeAt.length > 0, durations: settings.durations, openFrom: settings.openFrom, openTo: settings.openTo, nextStart: !start && freeAt.length ? [...new Set(freeAt.flatMap((r) => r.startTimes))].sort()[0] : null },
      badges: { isSoldOut: freeAt.length === 0 },
    });
  }
  out.sort((a, b) => Number(b.hourly.available) - Number(a.hourly.available) || a.price - b.price);
  res.json({ success: true, data: { hotels: out, hourly: { enabled: true, durations: platform.durations } } });
});

/** POST /bookings/hourly/preview { hotelId, roomTypeId, date, start, hours, adults, children } */
export const previewHourly = wrap(async (req, res) => {
  res.json({ success: true, data: await quoteHourly({ ...req.body, userId: req.user?.id || null }) });
});

/** POST /bookings/hourly — creates the booking (pending payment, 30 minutes). */
export const bookHourly = wrap(async (req, res) => {
  const booking = await createHourlyBooking(req.body || {}, { userId: req.user.id, requestId: req.id });
  res.status(201).json({ success: true, data: { booking: { id: booking.id, bookingRef: booking.bookingRef, totalAmount: booking.totalAmount, expiresAt: booking.expiresAt, slotStart: booking.slotStart, slotEnd: booking.slotEnd, hours: booking.hours } } });
});

// ─── Hotels (extranet) ───────────────────────────────────────────────────────────────────────

export const extranetGetSetup = wrap(async (req, res) => res.json({ success: true, data: await getHotelHourlySetup(req.scopedHotelId) }));

export const extranetSaveSetup = wrap(async (req, res) => {
  const before = await prisma.hotel.findUnique({ where: { id: req.scopedHotelId }, select: { name: true, hourlySettings: true } });
  const data = await saveHotelHourlySetup(req.scopedHotelId, req.body || {});
  // First switch-on: ZivoHotels reviews it before guests can book
  if (data.settings.enabled && !data.settings.approved && !before?.hourlySettings?.enabled) {
    notifyAdmins({
      type: 'HOURLY_REQUESTED', title: `Hourly stays to approve: ${before?.name}`,
      message: `${before?.name} switched on hourly stays (${data.settings.durations.join(', ')} hours, ${data.settings.openFrom}–${data.settings.openTo}). Approve it in Properties → Hourly stays.`,
      link: '/admin/hourly', metadata: { hotelId: req.scopedHotelId },
    }).catch(() => {});
  }
  res.json({ success: true, message: 'Hourly settings saved.', data });
});

export const extranetAllocations = wrap(async (req, res) => {
  const from = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.from || '')) ? req.query.from : istYmd(new Date());
  res.json({ success: true, data: await getAllocations(req.scopedHotelId, from, Number(req.query.days) || 14) });
});

export const extranetSetAllocation = wrap(async (req, res) => {
  res.json({ success: true, data: await setAllocation(req.scopedHotelId, req.body || {}) });
});

export const extranetTimeline = wrap(async (req, res) => {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.date || '')) ? req.query.date : istYmd(new Date());
  res.json({ success: true, data: await dayTimeline(req.scopedHotelId, date) });
});

// ─── Admin ───────────────────────────────────────────────────────────────────────────────────

/** GET /admin/hourly — platform rules and every property that switched hourly stays on. */
export const adminOverview = wrap(async (req, res) => {
  const saved = await prisma.systemConfig.findUnique({ where: { key: 'hourly_settings' } });
  const platform = platformHourly(saved?.value || {});
  const hotels = await prisma.hotel.findMany({
    where: { hourlySettings: { not: null } },
    select: { id: true, name: true, city: true, status: true, hourlySettings: true, roomTypes: { where: { hourlyEnabled: true }, select: { name: true, hourlyRooms: true, hourlyPrices: true } } },
    orderBy: { name: 'asc' },
  });
  const since = new Date(Date.now() - 30 * 86400000);
  const counts = await prisma.booking.groupBy({ by: ['hotelId'], where: { stayType: 'HOURLY', status: { in: ['CONFIRMED', 'CHECKED_IN', 'COMPLETED'] }, createdAt: { gte: since } }, _count: { _all: true }, _sum: { totalAmount: true } });
  const byHotel = new Map(counts.map((c) => [c.hotelId, c]));
  res.json({
    success: true,
    data: {
      platform,
      hotels: hotels.map((h) => {
        const s = hotelHourly(h.hourlySettings, platform);
        const c = byHotel.get(h.id);
        return { id: h.id, name: h.name, city: h.city, status: h.status, settings: s, live: isBookable(s, platform), requestedAt: h.hourlySettings?.requestedAt || null, roomTypes: h.roomTypes, bookings30d: c?._count._all || 0, revenue30d: Number(c?._sum.totalAmount || 0) };
      }).filter((h) => h.settings.enabled || h.settings.approved),
    },
  });
});

/** PUT /admin/hourly/settings — platform rules. */
export const adminSaveSettings = wrap(async (req, res) => {
  const value = platformHourly(req.body || {});
  await prisma.systemConfig.upsert({ where: { key: 'hourly_settings' }, update: { value }, create: { key: 'hourly_settings', value } });
  res.json({ success: true, message: 'Hourly stay rules saved.', data: value });
});

/** PUT /admin/hourly/hotels/:id { approved } — approve (or pause) a property's hourly stays. */
export const adminApproveHotel = wrap(async (req, res) => {
  const hotel = await prisma.hotel.findUnique({ where: { id: req.params.id }, select: { id: true, name: true, hourlySettings: true } });
  if (!hotel) return res.status(404).json({ success: false, message: 'Hotel not found' });
  const approved = Boolean(req.body?.approved);
  await prisma.hotel.update({ where: { id: hotel.id }, data: { hourlySettings: { ...(hotel.hourlySettings || {}), approved, approvedAt: approved ? new Date().toISOString() : null, approvedBy: approved ? req.user.id : null } } });
  notifyHotel(hotel.id, {
    type: approved ? 'HOURLY_APPROVED' : 'HOURLY_PAUSED',
    title: approved ? 'Hourly stays approved' : 'Hourly stays paused',
    message: approved ? 'Guests can now book your rooms by the hour.' : 'ZivoHotels paused hourly bookings for your property. Contact partner support for details.',
  }).catch(() => {});
  res.json({ success: true, message: approved ? 'Approved: guests can book this property by the hour.' : 'Hourly stays paused for this property.' });
});

