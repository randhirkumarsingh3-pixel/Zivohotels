/**
 * Which public hotels a search covers: a place typed by the guest (city, area, landmark or state,
 * either name of a renamed city), or a map point ("near me").
 */
import { Prisma } from '@prisma/client';
import prisma from '../config/db.js';
import { PUBLIC_HOTEL_STATUSES } from '../constants/hotelStatus.js';
import { cityNames, distanceKm, NEAR_ME_RADIUS_KM } from '../utils/places.js';

const escapeLike = (s) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/**
 * Ids of public hotels whose city, address, area, landmark, state or name matches the place (a
 * locality is often only in the hotel's name, e.g. "Z Stays Marathahalli").
 */
export const hotelIdsForPlace = async (place) => {
  const names = cityNames(place);
  if (!names.length) return [];
  const contains = names.map((n) => `%${escapeLike(n)}%`);
  const exact = names.map(escapeLike);
  const rows = await prisma.$queryRaw`
    SELECT id FROM "Hotel"
    WHERE ("isDeleted" = false OR "isDeleted" IS NULL)
      AND "status"::text IN (${Prisma.join(PUBLIC_HOTEL_STATUSES)})
      AND (
        city ILIKE ANY(${contains}::text[])
        OR name ILIKE ANY(${contains}::text[])
        OR location ILIKE ANY(${contains}::text[])
        OR landmark ILIKE ANY(${contains}::text[])
        OR "integrationSettings"->'addressDetails'->>'area' ILIKE ANY(${contains}::text[])
        OR state ILIKE ANY(${exact}::text[])
      )
    LIMIT 200`;
  return rows.map((r) => r.id);
};

/** Public hotels with a map pin within the radius: Map of id -> distance in km, nearest first. */
export const hotelsNear = async ({ lat, lng }, radiusKm = NEAR_ME_RADIUS_KM) => {
  const dLat = radiusKm / 111;
  const dLng = radiusKm / (111 * Math.max(Math.cos((lat * Math.PI) / 180), 0.01));
  const rows = await prisma.hotel.findMany({
    where: {
      status: { in: PUBLIC_HOTEL_STATUSES },
      isDeleted: false,
      latitude: { gte: lat - dLat, lte: lat + dLat },
      longitude: { gte: lng - dLng, lte: lng + dLng },
    },
    select: { id: true, latitude: true, longitude: true },
    take: 500,
  });
  return new Map(rows
    .map((h) => [h.id, distanceKm(lat, lng, h.latitude, h.longitude)])
    .filter(([, d]) => d <= radiusKm)
    .sort((a, b) => a[1] - b[1]));
};
