/**
 * Content score (0-100): how complete and guest-ready a property's listing is. Six sections, each
 * with checks worth points; every missing check comes with a short tip and the editor section that
 * fixes it. Pure (contentScore) so it can be unit-tested; propertyOverview loads the data.
 *
 *   Basics 20 · Location 15 · Photos 25 · Rooms 20 · Amenities 10 · Policies 10
 */
import prisma from '../config/db.js';

const words = (s) => String(s || '').split(/\s+/).filter(Boolean).length;
const filled = (v) => v !== undefined && v !== null && String(v).trim() !== '';
const share = (list, test) => (list.length ? list.filter(test).length / list.length : 0);

/** A check: full points when done, or a share of them (0..1) for partly done. */
const check = (key, label, points, done, tip) => {
  const part = typeof done === 'number' ? Math.max(0, Math.min(1, done)) : (done ? 1 : 0);
  return { key, label, points, earned: Math.round(points * part * 10) / 10, done: part >= 1, tip: part >= 1 ? null : tip };
};

export const SECTIONS = [
  { key: 'basics', label: 'Basic information', step: 1 },
  { key: 'location', label: 'Location', step: 2 },
  { key: 'amenities', label: 'Amenities', step: 3 },
  { key: 'rooms', label: 'Rooms & rate plans', step: 4 },
  { key: 'photos', label: 'Photos', step: 5 },
  { key: 'policies', label: 'Policies & house rules', step: 6 },
];

/**
 * @param {object} p
 * @param {object} p.hotel  Hotel row (with integrationSettings)
 * @param {Array}  p.rooms  active room types: { id, name, description, roomSize, bedType, maxOccupancy, priced, photoCount }
 * @param {Array}  p.photos hotel photos: { category, isPrimary }
 * @param {boolean} p.hasCancellationPolicy
 */
export const contentScore = ({ hotel = {}, rooms = [], photos = [], hasCancellationPolicy = false }) => {
  const s = hotel.integrationSettings || {};
  const contact = s.contactInfo || {};
  const address = s.addressDetails || {};
  const rules = s.policyRules || {};
  const amenities = Array.isArray(hotel.amenities) ? hotel.amenities : [];
  const nearby = Array.isArray(hotel.nearbyPlaces) ? hotel.nearbyPlaces : [];
  const lat = Number(hotel.latitude); const lng = Number(hotel.longitude);
  const pinned = Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0);
  const desc = words(hotel.description);
  const categories = new Set(photos.map((p) => String(p.category || '').toUpperCase()).filter(Boolean));
  const answeredRules = Object.values(rules).filter((v) => (Array.isArray(v) ? v.length : filled(v) || v === false)).length;

  const checks = {
    basics: [
      check('name', 'Property name', 2, filled(hotel.name), 'Add the property name'),
      check('stars', 'Star rating', 3, Number(hotel.rating) >= 1 && Number(hotel.rating) <= 5, 'Choose the star rating'),
      check('type', 'Property type', 2, filled(hotel.type), 'Choose the property type (hotel, resort, homestay…)'),
      check('description', 'Description of at least 150 words', 8, desc >= 150 ? 1 : desc / 150,
        `Describe the property in your own words: ${desc} of 150 words so far (rooms, the area, what guests like)`),
      check('contact', 'Reception phone and email', 5, (filled(contact.receptionPhone) ? 0.5 : 0) + (filled(contact.receptionEmail) ? 0.5 : 0),
        'Add the reception phone and email guests can reach'),
    ],
    location: [
      check('pin', 'Map pin', 5, pinned, 'Set the property on the map so it shows in "near me" searches'),
      check('area', 'Area or locality', 4, filled(address.area), 'Add the area or locality, e.g. Koramangala'),
      check('landmark', 'Nearby landmark', 2, filled(hotel.landmark), 'Add a landmark guests know, e.g. near the metro station'),
      check('nearby', "At least 3 places in What's nearby", 4, Math.min(nearby.length, 3) / 3, `Add nearby places (${nearby.length} of 3): stations, airport, attractions`),
    ],
    photos: [
      check('count5', 'At least 5 photos', 8, Math.min(photos.length, 5) / 5, `Add photos (${photos.length} of 5 needed to go live)`),
      check('count15', 'At least 15 photos', 5, photos.length >= 15 ? 1 : Math.max(0, photos.length - 5) / 10, `Add more photos: listings with 15 or more get more bookings (${photos.length} so far)`),
      check('cover', 'A cover photo', 3, photos.some((p) => p.isPrimary), 'Choose the photo guests see first'),
      check('roomPhotos', 'Photos for every room type', 6, rooms.length ? share(rooms, (r) => r.photoCount > 0) : 0,
        `Add photos to each room type (${rooms.filter((r) => r.photoCount > 0).length} of ${rooms.length} have them)`),
      check('variety', 'Photos of 3 kinds (rooms, outside, facilities, food)', 3, Math.min(categories.size, 3) / 3, 'Show more than rooms: the building, the lobby, facilities, food'),
    ],
    rooms: [
      check('roomDesc', 'Every room type has a description', 5, rooms.length ? share(rooms, (r) => words(r.description) >= 15) : 0, 'Describe each room type in a sentence or two (at least 15 words)'),
      check('roomSize', 'Room size', 3, rooms.length ? share(rooms, (r) => filled(r.roomSize)) : 0, 'Add the size of each room type (sq ft)'),
      check('bedType', 'Bed type', 3, rooms.length ? share(rooms, (r) => filled(r.bedType)) : 0, 'Add the bed type of each room type'),
      check('occupancy', 'Maximum guests', 3, rooms.length ? share(rooms, (r) => Number(r.maxOccupancy) > 0) : 0, 'Set how many guests each room type takes'),
      check('priced', 'A price for every room type', 6, rooms.length ? share(rooms, (r) => r.priced) : 0, 'Give every room type a rate plan with a price; unpriced rooms never show in search'),
    ],
    amenities: [
      check('amen5', 'At least 5 amenities', 5, Math.min(amenities.length, 5) / 5, `Tick the amenities you offer (${amenities.length} so far)`),
      check('amen12', 'At least 12 amenities', 5, amenities.length >= 12 ? 1 : Math.max(0, amenities.length - 5) / 7, 'Guests filter by amenities: tick everything you offer (12 or more)'),
    ],
    policies: [
      check('times', 'Check-in and check-out times', 3, filled(hotel.checkInTime) && filled(hotel.checkOutTime), 'Set check-in and check-out times'),
      check('cancellation', 'Cancellation policy', 3, hasCancellationPolicy, 'Choose a cancellation policy'),
      check('rules', 'At least 3 house rules answered', 4, Math.min(answeredRules, 3) / 3, 'Answer the house rules (ID, couples, pets, smoking…)'),
    ],
  };

  const sections = SECTIONS.map((sec) => {
    const list = checks[sec.key];
    const max = list.reduce((t, c) => t + c.points, 0);
    const earned = list.reduce((t, c) => t + c.earned, 0);
    return { ...sec, score: Math.round(earned), max, checks: list };
  });
  const score = Math.round(sections.reduce((t, x) => t + x.checks.reduce((a, c) => a + c.earned, 0), 0));
  // The fixes worth the most points first
  const nextSteps = sections.flatMap((x) => x.checks.filter((c) => !c.done).map((c) => ({ section: x.key, step: x.step, tip: c.tip, gain: Math.round((c.points - c.earned) * 10) / 10 })))
    .sort((a, b) => b.gain - a.gain);
  return { score, label: score >= 85 ? 'Excellent' : score >= 70 ? 'Good' : score >= 50 ? 'Fair' : 'Needs work', sections, nextSteps };
};

/** Everything the extranet property header and content score page show, for one hotel. */
export const propertyOverview = async (hotelId) => {
  const hotel = await prisma.hotel.findUnique({
    where: { id: hotelId },
    select: {
      id: true, name: true, type: true, rating: true, city: true, status: true, description: true, amenities: true,
      nearbyPlaces: true, latitude: true, longitude: true, landmark: true, checkInTime: true, checkOutTime: true,
      integrationSettings: true, reviewScore: true, reviewCount: true,
      cancellationPolicy: { select: { id: true } },
      media: { select: { category: true, isPrimary: true } },
      roomTypes: {
        where: { isActive: { not: false } },
        select: {
          id: true, name: true, description: true, roomSize: true, bedType: true, maxOccupancy: true,
          _count: { select: { images: true } },
          ratePlans: { where: { isActive: true, basePrice: { gt: 0 } }, select: { id: true }, take: 1 },
        },
      },
    },
  });
  if (!hotel) return null;
  const rooms = hotel.roomTypes.map((r) => ({ ...r, priced: r.ratePlans.length > 0, photoCount: r._count.images }));
  const content = contentScore({ hotel, rooms, photos: hotel.media, hasCancellationPolicy: Boolean(hotel.cancellationPolicy) || Boolean(hotel.integrationSettings?.cancellationPolicy) });
  return {
    hotel: {
      id: hotel.id, name: hotel.name, type: hotel.type ? hotel.type.charAt(0).toUpperCase() + hotel.type.slice(1) : 'Hotel', stars: Number(hotel.rating) >= 1 && Number(hotel.rating) <= 5 ? Math.round(Number(hotel.rating)) : null,
      area: hotel.integrationSettings?.addressDetails?.area || null, city: hotel.city, status: hotel.status,
    },
    // Guest rating from ZivoPlus reviews only (verified stays)
    rating: { score: hotel.reviewCount > 0 && hotel.reviewScore != null ? Number(hotel.reviewScore) : null, count: hotel.reviewCount || 0 },
    content,
  };
};

export default { contentScore, propertyOverview, SECTIONS };
