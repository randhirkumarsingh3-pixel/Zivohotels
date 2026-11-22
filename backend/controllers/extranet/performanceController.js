import prisma from '../../config/db.js';
import { PUBLIC_HOTEL_STATUSES } from '../../constants/hotelStatus.js';

/**
 * GET /extranet/performance?days=30|90: how the property is doing on ZivoPlus, from live data.
 *   funnel     page views (and unique visitors), booking starts, bookings, conversion
 *   money      revenue, room nights, average daily rate (bookings made in the period, cancelled
 *              and no-show excluded), and the cancellation rate
 *   occupancy  room nights sold out of room nights on sale, for the period's past nights
 *   leadTime   average days between booking and check-in
 *   rank       position among live hotels in the same city by page views
 *   series     views and bookings per day
 *   previous   the same figures for the period before, for the change arrows
 *   tips       suggestions that follow from the property's own data
 */
const DAY = 86400000;
const IST = 330 * 60000;
const istDay = (d) => new Date(new Date(d).getTime() + IST).toISOString().slice(0, 10);

const periodStats = async (hotelId, from, to) => {
  const [views, visitors, starts, bookings] = await Promise.all([
    prisma.analyticsEvent.count({ where: { hotelId, eventType: 'HOTEL_VIEWED', createdAt: { gte: from, lt: to } } }),
    prisma.analyticsEvent.groupBy({ by: ['sessionId'], where: { hotelId, eventType: 'HOTEL_VIEWED', createdAt: { gte: from, lt: to } } }).then((r) => r.length),
    prisma.analyticsEvent.count({ where: { hotelId, eventType: 'BOOKING_STARTED', createdAt: { gte: from, lt: to } } }),
    prisma.booking.findMany({ where: { hotelId, createdAt: { gte: from, lt: to }, status: { not: 'PENDING' } }, select: { status: true, totalAmount: true, rooms: true, checkIn: true, checkOut: true, createdAt: true } }),
  ]);
  const kept = bookings.filter((b) => !['CANCELLED', 'NO_SHOW'].includes(b.status));
  const nights = (b) => Math.max(1, Math.round((new Date(b.checkOut) - new Date(b.checkIn)) / DAY)) * (b.rooms || 1);
  const revenue = kept.reduce((s, b) => s + Number(b.totalAmount || 0), 0);
  const roomNights = kept.reduce((s, b) => s + nights(b), 0);
  const cancelled = bookings.filter((b) => b.status === 'CANCELLED').length;
  const lead = kept.length ? kept.reduce((s, b) => s + Math.max(0, (new Date(b.checkIn) - new Date(b.createdAt)) / DAY), 0) / kept.length : null;
  return {
    views, visitors, starts, bookings: kept.length, cancelled,
    conversion: visitors ? Math.round((kept.length / visitors) * 1000) / 10 : null,
    revenue: Math.round(revenue), roomNights, adr: roomNights ? Math.round(revenue / roomNights) : null,
    cancellationRate: bookings.length ? Math.round((cancelled / bookings.length) * 1000) / 10 : null,
    leadTimeDays: lead == null ? null : Math.round(lead * 10) / 10,
  };
};

export const getPerformance = async (req, res) => {
  try {
    const hotelId = req.scopedHotelId;
    const days = [7, 30, 90].includes(Number(req.query.days)) ? Number(req.query.days) : 30;
    const now = new Date();
    const from = new Date(now.getTime() - days * DAY);
    const prevFrom = new Date(from.getTime() - days * DAY);

    const hotel = await prisma.hotel.findUnique({ where: { id: hotelId }, select: { city: true, memberDiscountPercent: true, reviewCount: true, reviewScore: true } });
    if (!hotel) return res.status(404).json({ success: false, message: 'Property not found' });

    const [current, previous, viewEvents, bookingRows, inventories, cityHotels, photos, activePromos] = await Promise.all([
      periodStats(hotelId, from, now),
      periodStats(hotelId, prevFrom, from),
      prisma.analyticsEvent.findMany({ where: { hotelId, eventType: 'HOTEL_VIEWED', createdAt: { gte: from } }, select: { createdAt: true } }),
      prisma.booking.findMany({ where: { hotelId, createdAt: { gte: from }, status: { notIn: ['PENDING', 'CANCELLED', 'NO_SHOW'] } }, select: { createdAt: true } }),
      prisma.inventory.findMany({ where: { date: { gte: from, lt: now }, roomType: { hotelId, isActive: { not: false } } }, select: { totalRooms: true, availableRooms: true, stopSell: true } }),
      prisma.hotel.findMany({ where: { city: { equals: hotel.city, mode: 'insensitive' }, status: { in: PUBLIC_HOTEL_STATUSES }, isDeleted: false }, select: { id: true } }),
      prisma.hotelImage.count({ where: { hotelId } }),
      prisma.promotion.count({ where: { isActive: true, OR: [{ hotelId }, { hotelIds: { has: hotelId } }] } }),
    ]);

    // Occupancy over the period's past nights (nights with inventory rows)
    const onSale = inventories.reduce((s, i) => s + (i.stopSell ? 0 : i.totalRooms), 0);
    const sold = inventories.reduce((s, i) => s + Math.max(0, (i.stopSell ? 0 : i.totalRooms) - i.availableRooms), 0);
    const occupancy = onSale ? Math.round((sold / onSale) * 1000) / 10 : null;

    // Rank by page views among live hotels in the city
    let rank = null;
    if (cityHotels.length > 1) {
      const counts = await prisma.analyticsEvent.groupBy({ by: ['hotelId'], where: { hotelId: { in: cityHotels.map((h) => h.id) }, eventType: 'HOTEL_VIEWED', createdAt: { gte: from } }, _count: { _all: true } });
      const byId = new Map(counts.map((c) => [c.hotelId, c._count._all]));
      const ordered = cityHotels.map((h) => ({ id: h.id, v: byId.get(h.id) || 0 })).sort((a, b) => b.v - a.v);
      rank = { position: ordered.findIndex((h) => h.id === hotelId) + 1, of: ordered.length, city: hotel.city };
    }

    // Daily series (India days)
    const series = [];
    for (let i = days - 1; i >= 0; i -= 1) series.push({ date: istDay(new Date(now.getTime() - i * DAY)), views: 0, bookings: 0 });
    const idx = new Map(series.map((d, i) => [d.date, i]));
    viewEvents.forEach((e) => { const i = idx.get(istDay(e.createdAt)); if (i != null) series[i].views += 1; });
    bookingRows.forEach((b) => { const i = idx.get(istDay(b.createdAt)); if (i != null) series[i].bookings += 1; });

    const tips = [
      photos < 5 && { key: 'photos', text: `You have ${photos} photo${photos === 1 ? '' : 's'}. Listings with 5 or more, including rooms and bathroom, get more clicks.`, link: 'EDIT_LISTING' },
      current.visitors >= 20 && current.conversion != null && current.conversion < 2 && { key: 'conversion', text: `${current.visitors} people viewed your page but ${current.bookings} booked. Check your prices against nearby hotels, or add an offer.`, link: '/extranet/promotions' },
      !(hotel.memberDiscountPercent > 0) && { key: 'member', text: 'Offer a member price: signed-in guests see it in search, which helps you stand out.', link: '/extranet/member-prices' },
      activePromos === 0 && { key: 'promo', text: 'You have no active promotion. Automatic offers show a discounted price on search results.', link: '/extranet/promotions' },
      !(hotel.reviewCount > 0) && { key: 'reviews', text: 'No guest reviews yet. Guests can review from the day after check-in; good service and quick replies help.', link: '/extranet/reviews' },
      current.cancellationRate != null && current.cancellationRate > 20 && { key: 'cancel', text: `${current.cancellationRate}% of bookings in this period were cancelled. A pay-now rate with a lower price can reduce cancellations.`, link: '/extranet/rooms' },
    ].filter(Boolean);

    res.json({ success: true, data: { days, current: { ...current, occupancy }, previous, rank, series, tips } });
  } catch (error) {
    console.error('Error building performance:', error);
    res.status(500).json({ success: false, message: 'Could not load performance' });
  }
};
