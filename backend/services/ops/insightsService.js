/**
 * Admin → Demand forecasting and Admin → Revenue per search. Everything comes from what actually
 * happened on ZivoPlus: guest searches (SearchLog), hotel page views, bookings, room counts and
 * prices. No made-up numbers: when there isn't enough history, the page says so.
 */
import prisma from '../../config/db.js';
import { STAY_BOOKING_STATUSES } from '../../constants/bookingStatus.js';
import { cityNames } from '../../utils/places.js';

const DAY = 86400000;
const LIVE = ['LIVE', 'ACTIVE'];
const utcDay = (d = new Date()) => { const x = new Date(d); x.setUTCHours(0, 0, 0, 0); return x; };
const addDays = (d, n) => new Date(utcDay(d).getTime() + n * DAY);
const iso = (d) => utcDay(d).toISOString().slice(0, 10);
const num = (v) => Number(v || 0);
const round = (n, d = 0) => Math.round(n * 10 ** d) / 10 ** d;
const canonCity = (name) => (cityNames(name)[0] || String(name || '').trim()) || 'Unknown';
const clampInt = (v, lo, hi, dflt) => { const n = parseInt(v, 10); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt; };

/** Hotels in scope: live, not deleted, optionally one city (either of its names) or one hotel. */
const hotelsInScope = async ({ city, hotelId }) => {
  const where = { isDeleted: { not: true }, status: { in: LIVE } };
  if (hotelId) where.id = hotelId;
  else if (city) where.city = { in: cityNames(city), mode: 'insensitive' };
  return prisma.hotel.findMany({ where, select: { id: true, name: true, city: true }, take: 2000 });
};

const placeFilter = (city) => (city ? cityNames(city).map((c) => c.toLowerCase()) : null);

// ─── Revenue per search ──────────────────────────────────────────────────────

export const searchRevenue = async ({ days: daysIn, city } = {}) => {
  const days = clampInt(daysIn, 1, 180, 30);
  const end = new Date();
  const start = addDays(end, -(days - 1));
  const prevStart = addDays(start, -days);
  const places = placeFilter(city);
  const hotels = city ? await hotelsInScope({ city }) : null;
  const hotelIds = hotels ? hotels.map((h) => h.id) : null;

  const searchWhere = (from, to) => ({ createdAt: { gte: from, lt: to }, ...(places ? { place: { in: places, mode: 'insensitive' } } : {}) });
  const bookingWhere = (from, to) => ({ createdAt: { gte: from, lt: to }, status: { in: STAY_BOOKING_STATUSES }, ...(hotelIds ? { hotelId: { in: hotelIds } } : {}) });

  const [searches, prevSearches, sessionsRows, views, starts, bookings, prevBookings, zeroResults, byPlace, leadRows] = await Promise.all([
    prisma.searchLog.count({ where: searchWhere(start, end) }),
    prisma.searchLog.count({ where: searchWhere(prevStart, start) }),
    prisma.searchLog.findMany({ where: { ...searchWhere(start, end), sessionId: { not: null } }, distinct: ['sessionId'], select: { sessionId: true }, take: 100000 }),
    prisma.hotelView.count({ where: { createdAt: { gte: start, lt: end }, ...(hotelIds ? { hotelId: { in: hotelIds } } : {}) } }),
    prisma.analyticsEvent.count({ where: { eventType: 'BOOKING_STARTED', createdAt: { gte: start, lt: end }, ...(hotelIds ? { hotelId: { in: hotelIds } } : {}) } }),
    prisma.booking.findMany({ where: bookingWhere(start, end), select: { id: true, totalAmount: true, createdAt: true, sessionId: true, hotelId: true, hotel: { select: { city: true } } }, take: 100000 }),
    prisma.booking.aggregate({ where: bookingWhere(prevStart, start), _sum: { totalAmount: true }, _count: { _all: true } }),
    prisma.searchLog.groupBy({ by: ['place'], where: { ...searchWhere(start, end), results: 0 }, _count: { _all: true }, orderBy: { _count: { place: 'desc' } }, take: 10 }),
    prisma.searchLog.groupBy({ by: ['place'], where: searchWhere(start, end), _count: { _all: true }, _avg: { results: true, nights: true, guests: true }, orderBy: { _count: { place: 'desc' } }, take: 200 }),
    prisma.$queryRaw`SELECT GREATEST(0, ("checkIn" - ("createdAt" AT TIME ZONE 'UTC')::date))::int AS lead, count(*)::int AS n
                     FROM "SearchLog" WHERE "createdAt" >= ${start} AND "createdAt" < ${end} GROUP BY 1`,
  ]);

  const revenue = bookings.reduce((s, b) => s + num(b.totalAmount), 0);
  const prevRevenue = num(prevBookings._sum.totalAmount);
  const searchSessions = new Set(sessionsRows.map((r) => r.sessionId));
  const fromSearch = bookings.filter((b) => b.sessionId && searchSessions.has(b.sessionId));

  // Per day
  const series = [];
  const byDay = new Map();
  for (let i = 0; i < days; i += 1) byDay.set(iso(addDays(start, i)), { searches: 0, bookings: 0, revenue: 0 });
  if (places) {
    // With a city filter: count that city's searches per day
    const rows = await prisma.searchLog.findMany({ where: searchWhere(start, end), select: { createdAt: true }, take: 200000 });
    rows.forEach((r) => { const k = iso(r.createdAt); if (byDay.has(k)) byDay.get(k).searches += 1; });
  } else {
    const dayCounts = await prisma.$queryRaw`SELECT ("createdAt" AT TIME ZONE 'UTC')::date AS d, count(*)::int AS n FROM "SearchLog"
        WHERE "createdAt" >= ${start} AND "createdAt" < ${end} GROUP BY 1`;
    dayCounts.forEach((r) => { const k = iso(r.d); if (byDay.has(k)) byDay.get(k).searches = r.n; });
  }
  bookings.forEach((b) => { const k = iso(b.createdAt); if (byDay.has(k)) { const d = byDay.get(k); d.bookings += 1; d.revenue += num(b.totalAmount); } });
  for (const [day, d] of byDay) series.push({ day, ...d, revenue: round(d.revenue), rps: d.searches ? round(d.revenue / d.searches, 2) : null });

  // Per city: searches typed for the city, bookings at hotels in it
  const cityAgg = new Map();
  byPlace.forEach((p) => {
    const c = p.place === 'Near me' ? 'Near me' : canonCity(p.place);
    const cur = cityAgg.get(c) || { city: c, searches: 0, zero: 0, resultsSum: 0, bookings: 0, revenue: 0 };
    cur.searches += p._count._all; cur.resultsSum += num(p._avg.results) * p._count._all;
    cityAgg.set(c, cur);
  });
  zeroResults.forEach((z) => { const c = z.place === 'Near me' ? 'Near me' : canonCity(z.place); if (cityAgg.has(c)) cityAgg.get(c).zero += z._count._all; });
  bookings.forEach((b) => {
    const c = canonCity(b.hotel?.city);
    const cur = cityAgg.get(c) || { city: c, searches: 0, zero: 0, resultsSum: 0, bookings: 0, revenue: 0 };
    cur.bookings += 1; cur.revenue += num(b.totalAmount);
    cityAgg.set(c, cur);
  });
  const cities = [...cityAgg.values()].map((c) => ({
    city: c.city, searches: c.searches, bookings: c.bookings, revenue: round(c.revenue),
    avgResults: c.searches ? round(c.resultsSum / c.searches, 1) : null,
    zeroResultPct: c.searches ? round((c.zero / c.searches) * 100) : null,
    conversionPct: c.searches ? round((c.bookings / c.searches) * 100, 2) : null,
    rps: c.searches ? round(c.revenue / c.searches, 2) : null,
  })).sort((a, b) => b.searches - a.searches || b.revenue - a.revenue).slice(0, 25);

  const leadBuckets = [['Same day', 0, 0], ['1–3 days', 1, 3], ['4–7 days', 4, 7], ['8–14 days', 8, 14], ['15–30 days', 15, 30], ['31+ days', 31, 10000]]
    .map(([label, lo, hi]) => ({ label, searches: leadRows.filter((r) => r.lead >= lo && r.lead <= hi).reduce((s, r) => s + r.n, 0) }));

  const pct = (a, b) => (b ? round(((a - b) / b) * 100) : null);
  return {
    period: { days, from: iso(start), to: iso(end), city: city || null },
    totals: {
      searches, visits: searchSessions.size, hotelViews: views, checkoutsStarted: starts,
      bookings: bookings.length, bookingsFromSearch: fromSearch.length, revenue: round(revenue),
      rps: searches ? round(revenue / searches, 2) : null,
      conversionPct: searches ? round((bookings.length / searches) * 100, 2) : null,
      avgBooking: bookings.length ? round(revenue / bookings.length) : null,
      change: { searches: pct(searches, prevSearches), revenue: pct(revenue, prevRevenue), bookings: pct(bookings.length, prevBookings._count._all) },
    },
    funnel: [
      { step: 'Searches', count: searches },
      { step: 'Hotel page views', count: views },
      { step: 'Checkouts started', count: starts },
      { step: 'Bookings', count: bookings.length },
    ],
    series, cities,
    zeroResults: zeroResults.map((z) => ({ place: z.place, searches: z._count._all })),
    leadTime: leadBuckets,
    notes: [
      'Revenue is the booking value (room price with GST) of confirmed, in-house and completed bookings made in the period.',
      'A search counts once per visit for the same place, dates and guests within 30 minutes; changing filters or sorting doesn\'t add searches.',
      'Hotel page views and checkouts started are reported by the website, so visitors who block tracking aren\'t counted.',
    ],
  };
};

// ─── Demand forecasting ──────────────────────────────────────────────────────

export const forecast = async ({ days: daysIn, city, hotelId } = {}) => {
  const horizon = clampInt(daysIn, 7, 90, 30);
  const today = utcDay();
  const end = addDays(today, horizon); // exclusive
  const hotels = await hotelsInScope({ city, hotelId });
  const ids = hotels.map((h) => h.id);
  const empty = { period: { days: horizon, from: iso(today), to: iso(addDays(end, -1)), city: city || null, hotelId: hotelId || null }, nights: [], cities: [], hotels: [], totals: null, model: { historyNights: 0, historyBookings: 0, confidence: 'none' }, suggestions: [] };
  if (!ids.length) return empty;

  const roomTypes = await prisma.roomType.findMany({ where: { hotelId: { in: ids }, isActive: true }, select: { id: true, hotelId: true, totalInventory: true } });
  const rtIds = roomTypes.map((r) => r.id);

  // Capacity per night and hotel: the calendar's room count (0 when closed), else the room type's total
  const inv = rtIds.length ? await prisma.inventory.findMany({ where: { roomTypeId: { in: rtIds }, date: { gte: today, lt: end } }, select: { roomTypeId: true, date: true, totalRooms: true, stopSell: true } }) : [];
  const invMap = new Map(inv.map((i) => [`${i.roomTypeId}|${iso(i.date)}`, i]));
  const nightsList = Array.from({ length: horizon }, (_, i) => addDays(today, i));
  const cap = new Map(); // `${hotelId}|${day}` -> rooms
  for (const rt of roomTypes) {
    for (const n of nightsList) {
      const k = iso(n);
      const row = invMap.get(`${rt.id}|${k}`);
      const c = row ? (row.stopSell ? 0 : row.totalRooms) : (rt.totalInventory || 0);
      const key = `${rt.hotelId}|${k}`;
      cap.set(key, (cap.get(key) || 0) + c);
    }
  }

  // Bookings: on the books for the horizon, and history (last 90 nights) for the pickup curve
  const histStart = addDays(today, -90);
  const bookings = await prisma.booking.findMany({
    where: { hotelId: { in: ids }, stayType: { not: 'HOURLY' }, status: { in: STAY_BOOKING_STATUSES }, checkOut: { gt: histStart }, checkIn: { lt: end } },
    select: { id: true, hotelId: true, checkIn: true, checkOut: true, rooms: true, totalAmount: true, createdAt: true, bookingRooms: { select: { cancelledAt: true } } },
    take: 100000,
  });

  const otb = new Map(); const otbRev = new Map(); // future, per hotel|day
  const leadHist = new Map(); // lead days -> rooms (history)
  const weekdayFinal = Array(7).fill(0); const weekdayNights = Array(7).fill(0);
  let histRooms = 0; let historyBookings = 0;
  const weekAgo = new Date(Date.now() - 7 * DAY); const twoWeeksAgo = new Date(Date.now() - 14 * DAY);
  let pace7 = 0; let pacePrev7 = 0;
  for (let i = 0; i < 90; i += 1) weekdayNights[addDays(histStart, i).getUTCDay()] += 1;

  for (const b of bookings) {
    const rooms = b.bookingRooms?.length ? b.bookingRooms.filter((r) => !r.cancelledAt).length : (b.rooms || 1);
    if (!rooms) continue;
    const ci = utcDay(b.checkIn); const co = utcDay(b.checkOut);
    const nights = Math.max(1, Math.round((co - ci) / DAY));
    const perNight = num(b.totalAmount) / nights / rooms;
    let countedHistory = false;
    for (let d = ci; d < co; d = addDays(d, 1)) {
      const k = iso(d);
      if (d >= today && d < end) {
        const key = `${b.hotelId}|${k}`;
        otb.set(key, (otb.get(key) || 0) + rooms);
        otbRev.set(key, (otbRev.get(key) || 0) + perNight * rooms);
        if (b.createdAt >= weekAgo) pace7 += rooms; else if (b.createdAt >= twoWeeksAgo) pacePrev7 += rooms;
      } else if (d >= histStart && d < today) {
        const lead = Math.max(0, Math.floor((d - utcDay(b.createdAt)) / DAY));
        leadHist.set(lead, (leadHist.get(lead) || 0) + rooms);
        weekdayFinal[d.getUTCDay()] += rooms;
        histRooms += rooms; countedHistory = true;
      }
    }
    if (countedHistory) historyBookings += 1;
  }

  // Pickup: on average, how many room nights still get booked for a night k days ahead
  // (from the last 90 nights), split by weekday
  const histNights = 90;
  const pickupAt = (k) => { let s = 0; for (const [lead, r] of leadHist) if (lead < k) s += r; return s / histNights; };
  const avgFinal = histRooms / histNights;
  const weekdayFactor = (wd) => (avgFinal > 0 && weekdayNights[wd] ? (weekdayFinal[wd] / weekdayNights[wd]) / avgFinal : 1);
  const confidence = historyBookings >= 60 ? 'good' : historyBookings >= 15 ? 'fair' : historyBookings > 0 ? 'low' : 'none';

  // Searches for each night (made in the last 30 days, for these places)
  const placeNames = city ? cityNames(city).map((c) => c.toLowerCase()) : hotelId ? cityNames(hotels[0].city).map((c) => c.toLowerCase()) : null;
  const searchRows = await prisma.searchLog.findMany({
    where: { createdAt: { gte: new Date(Date.now() - 30 * DAY) }, checkIn: { lt: end, gte: addDays(today, -60) }, hourly: false, ...(placeNames ? { place: { in: placeNames, mode: 'insensitive' } } : {}) },
    select: { checkIn: true, nights: true, place: true }, take: 200000,
  });
  const searchNight = new Map();
  for (const s of searchRows) {
    const n = Math.max(1, s.nights);
    for (let i = 0; i < n; i += 1) { const d = addDays(s.checkIn, i); if (d >= today && d < end) { const k = iso(d); searchNight.set(k, (searchNight.get(k) || 0) + 1); } }
  }

  // Totals per night across the hotels in scope
  const share = hotels.length === 1 ? 1 : null; // per-hotel pickup: split the total by capacity share
  const totalCap = (k) => ids.reduce((s, id) => s + (cap.get(`${id}|${k}`) || 0), 0);
  const nights = nightsList.map((d) => {
    const k = iso(d);
    const c = totalCap(k);
    const booked = ids.reduce((s, id) => s + (otb.get(`${id}|${k}`) || 0), 0);
    const rev = ids.reduce((s, id) => s + (otbRev.get(`${id}|${k}`) || 0), 0);
    const lead = Math.round((d - today) / DAY);
    const expected = confidence === 'none' ? 0 : pickupAt(lead + 1) * weekdayFactor(d.getUTCDay()) * (share ?? 1);
    const fc = Math.min(c, booked + expected);
    return {
      date: k, weekday: d.toLocaleDateString('en-IN', { weekday: 'short', timeZone: 'UTC' }), leadDays: lead,
      capacity: c, booked, occupancyPct: c ? round((booked / c) * 100) : null,
      forecastRooms: round(fc, 1), forecastPct: c ? round((fc / c) * 100) : null,
      adr: booked ? round(rev / booked) : null, revenueOnBooks: round(rev), searches: searchNight.get(k) || 0,
      closed: c === 0,
    };
  });

  // Per city and per hotel (next 14 nights)
  const window14 = nightsList.slice(0, Math.min(14, horizon)).map(iso);
  const perHotel = hotels.map((h) => {
    const c = window14.reduce((s, k) => s + (cap.get(`${h.id}|${k}`) || 0), 0);
    const b = window14.reduce((s, k) => s + (otb.get(`${h.id}|${k}`) || 0), 0);
    const r = window14.reduce((s, k) => s + (otbRev.get(`${h.id}|${k}`) || 0), 0);
    return { id: h.id, name: h.name, city: canonCity(h.city), capacity: c, booked: b, occupancyPct: c ? round((b / c) * 100) : null, adr: b ? round(r / b) : null };
  }).sort((a, b) => (b.occupancyPct ?? -1) - (a.occupancyPct ?? -1));
  const cityMap = new Map();
  perHotel.forEach((h) => { const cur = cityMap.get(h.city) || { city: h.city, hotels: 0, capacity: 0, booked: 0 }; cur.hotels += 1; cur.capacity += h.capacity; cur.booked += h.booked; cityMap.set(h.city, cur); });
  const cities = [...cityMap.values()].map((c) => ({ ...c, occupancyPct: c.capacity ? round((c.booked / c.capacity) * 100) : null })).sort((a, b) => b.booked - a.booked);

  // Totals and plain suggestions (rules, shown with their reason; nothing is applied automatically)
  const sum = (k) => nights.reduce((s, n) => s + (n[k] || 0), 0);
  const capT = sum('capacity'); const bookedT = sum('booked'); const fcT = sum('forecastRooms');
  const next7 = nights.slice(0, 7);
  const cap7 = next7.reduce((s, n) => s + n.capacity, 0);
  const totals = {
    capacity: capT, booked: bookedT, occupancyPct: capT ? round((bookedT / capT) * 100) : null,
    forecastPct: capT ? round((fcT / capT) * 100) : null,
    occupancy7Pct: cap7 ? round((next7.reduce((s, n) => s + n.booked, 0) / cap7) * 100) : null,
    forecast7Pct: cap7 ? round((next7.reduce((s, n) => s + n.forecastRooms, 0) / cap7) * 100) : null,
    revenueOnBooks: round(sum('revenueOnBooks')), adr: bookedT ? round(sum('revenueOnBooks') / bookedT) : null,
    searches: sum('searches'), pace7, pacePrev7, paceChangePct: pacePrev7 ? round(((pace7 - pacePrev7) / pacePrev7) * 100) : null,
  };
  const suggestions = [];
  const high = nights.filter((n) => n.capacity && n.forecastPct >= 85 && n.leadDays >= 2);
  if (high.length) suggestions.push({ tone: 'up', title: `${high.length} night${high.length === 1 ? '' : 's'} expected to be 85%+ full`, detail: `${high.slice(0, 5).map((n) => `${n.weekday} ${n.date.slice(5)}`).join(', ')}${high.length > 5 ? '…' : ''}. Consider raising prices or ending discounts for these dates in the calendar.` });
  const low = nights.filter((n) => n.capacity && n.forecastPct !== null && n.forecastPct < 30 && n.leadDays <= 14 && n.leadDays >= 1);
  if (low.length) suggestions.push({ tone: 'down', title: `${low.length} night${low.length === 1 ? '' : 's'} in the next 2 weeks look under 30% full`, detail: 'A short promotion or a price drop for these dates may help. Searches for them are shown in the table.' });
  const searchedNotBooked = nights.filter((n) => n.searches >= 5 && n.booked === 0 && n.capacity > 0).slice(0, 5);
  if (searchedNotBooked.length) suggestions.push({ tone: 'info', title: 'Searched but not booked', detail: `${searchedNotBooked.map((n) => n.date.slice(5)).join(', ')} had 5+ searches and no bookings yet. Check prices and photos for these dates.` });
  const closed = nights.filter((n) => n.closed);
  if (closed.length) suggestions.push({ tone: 'warn', title: `${closed.length} night${closed.length === 1 ? ' has' : 's have'} no rooms for sale`, detail: 'Every room is closed (stop sell) or set to 0 on these dates. Open them in the calendar if that wasn\'t intended.' });
  if (confidence === 'low' || confidence === 'none') suggestions.push({ tone: 'info', title: 'The forecast needs more booking history', detail: `It is based on ${historyBookings} booking${historyBookings === 1 ? '' : 's'} from the last 90 days. Until there are more, rely on rooms already booked and on searches.` });

  return {
    period: { days: horizon, from: iso(today), to: iso(addDays(end, -1)), city: city || null, hotelId: hotelId || null, hotels: hotels.length },
    totals, nights, cities, hotels: perHotel.slice(0, 50), suggestions,
    model: { historyNights: histNights, historyBookings, confidence, method: 'Rooms already booked, plus the average number of rooms still booked that close to arrival over the last 90 nights, adjusted for the day of the week.' },
  };
};

export default { searchRevenue, forecast };
