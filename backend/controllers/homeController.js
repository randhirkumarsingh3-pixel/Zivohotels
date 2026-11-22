import prisma from '../config/db.js';
import { cityNames } from '../utils/places.js';
import { COVER_PHOTO_FIRST } from '../constants/coverPhoto.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { PUBLIC_HOTEL_STATUSES } from '../constants/hotelStatus.js';
import { promotionLabel } from '../domains/promotionDomain.js';
import { getConfig as loyaltyConfig } from '../services/loyaltyService.js';
import { getShared, setShared } from '../utils/sharedCache.js';

/**
 * GET /api/v1/public/home: everything the home page shows, from live data only.
 *   cities      live hotels per city (popular destination chips and counts)
 *   topRated    live hotels, best guest score first (hotels without reviews after), with the
 *               lowest base nightly price
 *   offers      active offers guests can see (automatic and code), with their conditions
 *   reviews     recent approved reviews of 4+ stars with written comments (shown only if 3+)
 *   signup      the Zivo Rewards sign-up bonus, if the programme is on and the bonus is set
 *   membership  the cheapest paid plan's headline benefits, and how many hotels give member prices
 *   rewards     how Zivo Rewards points are earned and used; areas: localities with hotels
 * Cached for 5 minutes (the same for every visitor; nothing personal in it).
 */
const CACHE_KEY = 'public-home-v1';
const firstAndInitial = (name) => {
  const parts = String(name || 'Guest').trim().split(/\s+/);
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.` : parts[0];
};
const titleCase = (s) => String(s || '').trim().toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

export const getHomeFeed = asyncHandler(async (req, res) => {
  const cached = await getShared(CACHE_KEY);
  if (cached) return res.json({ success: true, data: cached, requestId: req.id });

  const now = new Date();
  const hotels = await prisma.hotel.findMany({
    where: { status: { in: PUBLIC_HOTEL_STATUSES }, isDeleted: false },
    select: {
      id: true, name: true, city: true, location: true, latitude: true, longitude: true, landmark: true, rating: true, reviewScore: true, reviewCount: true,
      memberDiscountPercent: true, integrationSettings: true,
      media: { ...COVER_PHOTO_FIRST, select: { url: true } },
      roomTypes: { where: { isActive: true }, select: { ratePlans: { where: { isActive: true }, select: { basePrice: true } } } },
    },
  });

  // Cities, case-insensitively grouped
  // (with the average map pin of its hotels, so "Near me" can pick the nearest city)
  const byCity = new Map();
  // Only hotels guests can book (a plan with a price): search leaves the others out, so the city
  // chips' counts would promise hotels that aren't there
  const bookable = (h) => h.roomTypes.some((rt) => rt.ratePlans.some((p) => Number(p.basePrice) > 0));
  for (const h of hotels.filter(bookable)) {
    // Bangalore / Bengaluru hotels are one city, under its current name
    const c = cityNames(titleCase(h.city))[0] || '';
    if (!c || /^default/i.test(c)) continue;
    const e = byCity.get(c) || { count: 0, lat: 0, lng: 0, pins: 0 };
    e.count += 1;
    if (Number.isFinite(h.latitude) && Number.isFinite(h.longitude) && (h.latitude || h.longitude)) { e.lat += h.latitude; e.lng += h.longitude; e.pins += 1; }
    byCity.set(c, e);
  }
  // Areas inside cities, for the "Explore hotels" links (e.g. Kurla West, Mumbai)
  const byArea = new Map();
  for (const h of hotels.filter(bookable)) {
    const area = String(h.integrationSettings?.addressDetails?.area || '').trim();
    const city = cityNames(titleCase(h.city))[0] || '';
    if (!area || !city || /^default/i.test(city)) continue;
    const k = `${area}|${city}`;
    byArea.set(k, (byArea.get(k) || 0) + 1);
  }
  const areas = [...byArea.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, count]) => { const [area, city] = k.split('|'); return { area, city, count }; });

  const cities = [...byCity.entries()].sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0]))
    .map(([name, e]) => ({ name, count: e.count, ...(e.pins ? { lat: Math.round((e.lat / e.pins) * 1e4) / 1e4, lng: Math.round((e.lng / e.pins) * 1e4) / 1e4 } : {}) }));

  const topRated = hotels.map((h) => {
    const prices = h.roomTypes.flatMap((rt) => rt.ratePlans.map((p) => Number(p.basePrice))).filter((n) => n > 0);
    const area = h.integrationSettings?.addressDetails?.area || h.landmark || '';
    return {
      id: h.id, name: h.name, city: h.city,
      location: [area, h.city].filter(Boolean).join(', ') || h.location,
      image: h.media[0]?.url || null,
      starRating: Number.isInteger(h.rating) && h.rating >= 1 && h.rating <= 5 ? h.rating : null,
      reviewScore: h.reviewScore || 0, reviewCount: h.reviewCount || 0,
      startingPrice: prices.length ? Math.min(...prices) : 0,
      memberDiscountPercent: h.memberDiscountPercent || 0,
    };
  }).filter((h) => h.startingPrice > 0)
    .sort((a, b) => (b.reviewCount > 0) - (a.reviewCount > 0) || b.reviewScore - a.reviewScore || b.reviewCount - a.reviewCount)
    .slice(0, 10);

  // Offers anyone can see: active, bookable today, for a live hotel or for all hotels
  const liveIds = new Set(hotels.map((h) => h.id));
  const hotelName = new Map(hotels.map((h) => [h.id, h.name]));
  const promos = await prisma.promotion.findMany({
    where: {
      isActive: true,
      AND: [
        { OR: [{ bookStart: null }, { bookStart: { lte: now } }] },
        { OR: [{ bookEnd: null }, { bookEnd: { gte: now } }] },
        { OR: [{ stayEnd: null }, { stayEnd: { gte: now } }] },
      ],
    },
    orderBy: [{ fundedBy: 'desc' }, { value: 'desc' }],
    take: 30,
  });
  const offers = promos
    .filter((p) => (p.hotelId ? liveIds.has(p.hotelId) : true))
    .filter((p) => !p.hotelIds?.length || p.hotelIds.some((id) => liveIds.has(id)))
    .slice(0, 8)
    .map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description || null,
      label: promotionLabel(p),
      code: p.code || null,
      maxDiscount: p.maxDiscount != null ? Number(p.maxDiscount) : null,
      minBookingAmount: p.minBookingAmount != null ? Number(p.minBookingAmount) : null,
      minNights: p.minNights > 1 ? p.minNights : null,
      firstBookingOnly: p.firstBookingOnly,
      audience: p.audience,
      bookEnd: p.bookEnd,
      stayStart: p.stayStart, stayEnd: p.stayEnd,
      hotelId: p.hotelId || (p.hotelIds?.length === 1 ? p.hotelIds[0] : null),
      hotelName: p.hotelId ? hotelName.get(p.hotelId) : (p.hotelIds?.length === 1 ? hotelName.get(p.hotelIds[0]) : null),
      scope: p.hotelId || p.hotelIds?.length ? (p.hotelIds?.length > 1 ? `${p.hotelIds.filter((id) => liveIds.has(id)).length} hotels` : 'One hotel') : 'All hotels',
    }));

  const reviewRows = await prisma.review.findMany({
    where: { status: 'APPROVED', rating: { gte: 4 }, comment: { not: null }, hotelId: { in: [...liveIds] } },
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: { id: true, rating: true, title: true, comment: true, createdAt: true, user: { select: { name: true } }, hotel: { select: { id: true, name: true, city: true } }, booking: { select: { checkIn: true } } },
  });
  const reviews = reviewRows.filter((r) => String(r.comment).trim().length >= 30).slice(0, 6).map((r) => ({
    id: r.id, rating: r.rating, title: r.title, comment: String(r.comment).trim().slice(0, 280),
    guest: firstAndInitial(r.user?.name), hotelId: r.hotel.id, hotelName: r.hotel.name, city: r.hotel.city,
    stayedAt: r.booking?.checkIn || r.createdAt,
  }));

  const loyalty = await loyaltyConfig().catch(() => null);
  const rewards = loyalty?.enabled ? {
    earnPointsPer100: Number(loyalty.earnPointsPer100) || 0, pointValue: Number(loyalty.pointValue) || 1,
    expiryMonths: Number(loyalty.expiryMonths) || 0, maxRedeemPercent: Number(loyalty.maxRedeemPercent) || 0,
    tiers: (loyalty.tiers || []).map((t) => ({ name: t.name, multiplier: Number(t.multiplier) || 1 })),
  } : null;
  const signup = loyalty?.enabled && loyalty.signupBonusPoints > 0 ? { points: loyalty.signupBonusPoints, worth: Math.round(loyalty.signupBonusPoints * (Number(loyalty.pointValue) || 1)) } : null;

  const paid = await prisma.membershipPlan.findFirst({ where: { isActive: true, isFree: false }, orderBy: [{ price: 'asc' }] });
  const memberHotels = hotels.filter((h) => (h.memberDiscountPercent || 0) > 0).length;
  const b = paid?.benefits || {};
  const membership = {
    memberHotels,
    paidPlan: paid ? {
      code: paid.code, name: paid.name, price: Number(paid.price), durationDays: paid.durationDays,
      zivoDiscountPercent: Number(b.zivoDiscountPercent) || 0, zivoDiscountMax: Number(b.zivoDiscountMax) || 0,
      pointsMultiplier: Number(b.pointsMultiplier) || 1, freeCancelExtraHours: Number(b.freeCancelExtraHours) || 0,
    } : null,
  };

  const data = { cities, areas, rewards, topRated, offers, reviews: reviews.length >= 3 ? reviews : [], signup, membership, hotelCount: hotels.length };
  setShared(CACHE_KEY, data, 5 * 60 * 1000);
  res.json({ success: true, data, requestId: req.id });
});
