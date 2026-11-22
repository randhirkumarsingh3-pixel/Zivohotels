import { Prisma } from '@prisma/client';
import prisma from '../config/db.js';
import { PUBLIC_HOTEL_STATUSES } from '../constants/hotelStatus.js';
import { cityNames, cityNamesForTyping, distanceKm, parseLatLng, NEAR_ME_RADIUS_KM } from '../utils/places.js';
import { hotelsNear } from '../services/hotelPlaceMatch.js';

const escapeLike = (s) => s.replace(/[\\%_]/g, (c) => `\\${c}`);
const titleCase = (s) => String(s || '').trim().replace(/\s+/g, ' ').toLowerCase().replace(/(^|[\s-])\p{L}/gu, (m) => m.toUpperCase());
const isPlaceholder = (c) => !c || /^default/i.test(c);

/**
 * Suggestions while typing in "Where to?": cities, areas and hotels that are live on ZivoPlus.
 * A city is suggested under the name its hotels use, whichever name was typed (Bangalore finds
 * Bengaluru). Areas come from the hotels' address details (e.g. Marathahalli, Bengaluru).
 */
export const searchAll = async (req, res, next) => {
  try {
    const searchQuery = String(req.query.q || '').trim().slice(0, 80);
    if (searchQuery.length < 2) return res.json([]);

    const names = cityNamesForTyping(searchQuery);
    const patterns = names.map((n) => `%${escapeLike(n)}%`);

    const rows = await prisma.$queryRaw`
      SELECT id, name, city, location,
        "integrationSettings"->'addressDetails'->>'area' AS area,
        GREATEST(similarity(name, ${searchQuery}), similarity(city, ${searchQuery}), similarity(location, ${searchQuery})) AS score
      FROM "Hotel"
      WHERE ("isDeleted" = false OR "isDeleted" IS NULL)
        AND "status"::text IN (${Prisma.join(PUBLIC_HOTEL_STATUSES)})
        AND (
          name % ${searchQuery} OR city % ${searchQuery}
          OR name ILIKE ANY(${patterns}::text[])
          OR city ILIKE ANY(${patterns}::text[])
          OR location ILIKE ANY(${patterns}::text[])
          OR landmark ILIKE ANY(${patterns}::text[])
          OR "integrationSettings"->'addressDetails'->>'area' ILIKE ANY(${patterns}::text[])
        )
      ORDER BY score DESC
      LIMIT 40`;

    const lowerNames = names.map((n) => n.toLowerCase());
    const hit = (text) => { const t = String(text || '').toLowerCase(); return lowerNames.some((n) => t.includes(n)); };
    const cities = new Map();
    const areas = new Map();
    const hotels = [];
    for (const h of rows) {
      const city = titleCase(h.city);
      if (!isPlaceholder(city) && (hit(city) || cityNames(city).some((n) => hit(n)))) {
        // One suggestion per city, whichever of its names its hotels use (Bangalore / Bengaluru):
        // the current official name when it's one of a pair
        const key = cityNames(city)[0].toLowerCase();
        if (!cities.has(key)) cities.set(key, { type: 'city', label: cityNames(city)[0], value: cityNames(city)[0] });
      }
      const area = titleCase(h.area);
      if (area && hit(area)) {
        areas.set(`${area}|${city}`.toLowerCase(), { type: 'area', label: isPlaceholder(city) ? area : `${area}, ${city}`, value: area });
      }
      if (hotels.length < 6 && (hit(h.name) || Number(h.score) > 0.3)) {
        hotels.push({ type: 'hotel', label: h.name, sublabel: isPlaceholder(city) ? undefined : city, id: h.id, slug: h.id });
      }
    }
    return res.json([...cities.values(), ...areas.values(), ...hotels].slice(0, 10));
  } catch (error) {
    next(error);
  }
};

/** Cities with the most live hotels (shown before anything is typed). */
export const getPopularCities = async (req, res, next) => {
  try {
    const rows = await prisma.hotel.findMany({
      where: { status: { in: PUBLIC_HOTEL_STATUSES }, isDeleted: false },
      select: { city: true },
    });
    const counts = new Map();
    for (const { city } of rows) {
      // Bangalore and Bengaluru hotels count as one city, under its current name
      const c = titleCase(city);
      if (!isPlaceholder(c)) { const name = cityNames(c)[0]; counts.set(name, (counts.get(name) || 0) + 1); }
    }
    const popular = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 6)
      .map(([city, count]) => ({ type: 'city', label: city, value: city, count }));
    return res.json(popular);
  } catch (error) {
    next(error);
  }
};

/**
 * "Use current location": hotels near the guest. The first item searches all hotels within
 * NEAR_ME_RADIUS_KM (results sorted by distance); the rest are the nearest hotels.
 * Hotels without a map pin can't be found this way.
 */
export const searchNearby = async (req, res, next) => {
  try {
    const point = parseLatLng(req.query.lat, req.query.lng);
    if (!point) {
      return res.status(400).json({ success: false, message: 'Latitude and longitude required' });
    }
    const near = await hotelsNear(point);
    if (!near.size) return res.json([]);

    const ids = [...near.keys()].slice(0, 5);
    const hotels = await prisma.hotel.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, city: true, latitude: true, longitude: true } });
    const nearest = hotels
      .map((h) => ({ type: 'hotel', label: h.name, sublabel: `${(Math.round(distanceKm(point.lat, point.lng, h.latitude, h.longitude) * 10) / 10)} km away`, id: h.id, slug: h.id, d: near.get(h.id) }))
      .sort((a, b) => a.d - b.d)
      .map(({ d: _d, ...h }) => h);

    return res.json([
      { type: 'near', label: 'Hotels near me', value: 'near', lat: point.lat, lng: point.lng, count: near.size, radiusKm: NEAR_ME_RADIUS_KM },
      ...nearest,
    ]);
  } catch (error) {
    next(error);
  }
};
