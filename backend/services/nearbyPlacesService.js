import crypto from 'crypto';
import prisma from '../config/db.js';
import { createNotification } from './notificationService.js';

/**
 * What's nearby a property: transit, attractions, landmarks and restaurants, with the distance
 * from the property's map pin (straight line).
 *
 * Suggestions come from OpenStreetMap's free search (Nominatim): one search per kind of place in
 * a box around the pin, about 40 seconds per property (one request per second, as its usage policy
 * asks). Overpass was tried first but its public servers were at capacity. Owners review them in the Location step
 * (remove, rename, change type, hide) and add places by searching OpenStreetMap's address search
 * (Nominatim) or by typing a name and distance. Saved on Hotel.nearbyPlaces.
 *
 * A job fills nearby places once for properties that have a map pin but none yet, and asks the
 * owner to review them.
 */

export const CATEGORIES = ['TRANSIT', 'ATTRACTION', 'LANDMARK', 'RESTAURANT'];
const PER_CATEGORY = 12;
const MAX_PLACES = 80;
const UA = 'ZivoPlus/1.0 (property nearby places)';
const fail = (message, status = 400) => Object.assign(new Error(message), { status });

/** Straight-line distance in km (haversine), one decimal. */
export const distanceKm = (lat1, lng1, lat2, lng2) => {
  const R = 6371;
  const rad = (d) => (d * Math.PI) / 180;
  const a = Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(a)) * 10) / 10;
};

/** OpenStreetMap tags -> { category, type } (null = not shown). */
export const classify = (t = {}) => {
  if (t.aeroway === 'aerodrome') return { category: 'TRANSIT', type: 'Airport' };
  if (t.station === 'subway' || t.railway === 'subway_entrance' || (t.public_transport === 'station' && t.subway === 'yes')) return { category: 'TRANSIT', type: 'Metro Station' };
  if (t.railway === 'station' || t.railway === 'halt') return { category: 'TRANSIT', type: 'Railway Station' };
  if (t.amenity === 'bus_station') return { category: 'TRANSIT', type: 'Bus Station' };
  if (t.highway === 'bus_stop') return { category: 'TRANSIT', type: 'Bus Stop' };

  if (['restaurant', 'fast_food'].includes(t.amenity)) return { category: 'RESTAURANT', type: 'Restaurant' };
  if (t.amenity === 'cafe') return { category: 'RESTAURANT', type: 'Cafe' };
  if (['bar', 'pub', 'nightclub'].includes(t.amenity)) return { category: 'RESTAURANT', type: 'Nightlife' };

  if (t.shop === 'mall') return { category: 'ATTRACTION', type: 'Shopping' };
  if (t.natural === 'beach') return { category: 'ATTRACTION', type: 'Beach' };
  if (['museum', 'gallery'].includes(t.tourism)) return { category: 'ATTRACTION', type: 'Museum' };
  if (['zoo', 'aquarium', 'theme_park'].includes(t.tourism)) return { category: 'ATTRACTION', type: 'Park' };
  if (['monument', 'memorial', 'fort', 'castle'].includes(t.historic)) return { category: 'ATTRACTION', type: 'Monument' };
  if (['theatre', 'cinema'].includes(t.amenity)) return { category: 'ATTRACTION', type: t.amenity === 'cinema' ? 'Cinema' : 'Theatre' };
  if (t.amenity === 'place_of_worship') return { category: 'ATTRACTION', type: 'Religious Place' };
  if (t.natural === 'water' || t.water === 'lake') return { category: 'ATTRACTION', type: 'Water Body' };
  if (t.leisure === 'park') return { category: 'ATTRACTION', type: 'Park' };
  if (t.tourism === 'attraction' || t.tourism === 'viewpoint') return { category: 'ATTRACTION', type: 'Attraction' };

  if (t.office === 'diplomatic' || t.amenity === 'embassy') return { category: 'LANDMARK', type: 'Embassy' };
  if (t.amenity === 'hospital') return { category: 'LANDMARK', type: 'Hospital' };
  if (['university', 'college'].includes(t.amenity)) return { category: 'LANDMARK', type: 'College' };
  if (t.leisure === 'stadium') return { category: 'LANDMARK', type: 'Stadium' };
  if (t.office || t.building === 'commercial' || t.building === 'office') return { category: 'LANDMARK', type: 'Business Center' };
  if (['suburb', 'neighbourhood', 'quarter'].includes(t.place)) return { category: 'LANDMARK', type: 'Locality' };
  return null;
};

/**
 * Searches for each kind of place inside a box around the pin (OpenStreetMap's Nominatim search;
 * fast and reliable, used at most one request per second as its usage policy asks). Each entry:
 * [search words, radius km, category, type when OSM's own type isn't recognised].
 */
const SEARCHES = [
  ['railway station', 6, 'TRANSIT', 'Railway Station'],
  ['metro station', 6, 'TRANSIT', 'Metro Station'],
  ['bus station', 4, 'TRANSIT', 'Bus Station'],
  ['bus stop', 1, 'TRANSIT', 'Bus Stop'],
  ['airport', 40, 'TRANSIT', 'Airport'],
  ['mall', 8, 'ATTRACTION', 'Shopping'],
  ['beach', 12, 'ATTRACTION', 'Beach'],
  ['museum', 10, 'ATTRACTION', 'Museum'],
  ['tourist attraction', 10, 'ATTRACTION', 'Attraction'],
  ['monument', 10, 'ATTRACTION', 'Monument'],
  ['temple', 5, 'ATTRACTION', 'Religious Place'],
  ['park', 4, 'ATTRACTION', 'Park'],
  ['theatre', 6, 'ATTRACTION', 'Theatre'],
  ['lake', 10, 'ATTRACTION', 'Water Body'],
  ['hospital', 4, 'LANDMARK', 'Hospital'],
  ['college', 4, 'LANDMARK', 'College'],
  ['embassy', 6, 'LANDMARK', 'Embassy'],
  ['consulate', 6, 'LANDMARK', 'Embassy'],
  ['stadium', 6, 'LANDMARK', 'Stadium'],
  ['restaurant', 1.5, 'RESTAURANT', 'Restaurant'],
  ['cafe', 1.5, 'RESTAURANT', 'Cafe'],
  ['bar', 1.5, 'RESTAURANT', 'Nightlife'],
];

const fetchWithTimeout = async (url, options, ms) => {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try { return await fetch(url, { ...options, signal: ctrl.signal }); } finally { clearTimeout(timer); }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const boxAround = (lat, lng, km) => {
  const dLat = km / 111;
  const dLng = km / (111 * Math.cos((lat * Math.PI) / 180));
  return `${lng - dLng},${lat + dLat},${lng + dLng},${lat - dLat}`;
};

// All OpenStreetMap searches share one queue so the whole server stays at one request per second.
let queue = Promise.resolve();
let lastCall = 0;
const throttled = (fn) => {
  const run = queue.then(async () => {
    const wait = lastCall + 1100 - Date.now();
    if (wait > 0) await sleep(wait);
    lastCall = Date.now();
    return fn();
  });
  queue = run.catch(() => {});
  return run;
};

const nominatim = (params) => throttled(async () => {
  const res = await fetchWithTimeout(`https://nominatim.openstreetmap.org/search?${new URLSearchParams({ format: 'json', ...params })}`, { headers: { 'User-Agent': UA, 'Accept-Language': 'en' } }, 15000);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
});

/** Names that are just a kind of place ("park 2", "Bus Stop", "temple") aren't worth showing. */
const GENERIC = /^(the )?(park|garden|playground|bus ?stop|bus station|stop|temple|mandir|church|mosque|masjid|restaurant|cafe|bar|hospital|clinic|college|school|mall|beach|lake|museum|monument|station|parking)( ?(no\.? ?)?\d+[a-z]?)?$/i;
export const isGenericName = (name) => GENERIC.test(String(name).trim()) || String(name).trim().length < 3;

/** Nearby places from OpenStreetMap around a point, nearest first, up to 12 per category. */
export const suggest = async (lat, lng) => {
  const la = Number(lat); const ln = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(ln) || (la === 0 && ln === 0)) throw fail('Set the property on the map first');
  const elements = [];
  let failures = 0;
  for (const [words, km, category, type] of SEARCHES) {
    try {
      const rows = await nominatim({ q: words, viewbox: boxAround(la, ln, km), bounded: '1', limit: '12' });
      for (const r of rows) elements.push({ r, km, category, type });
    } catch {
      failures += 1;
    }
  }
  if (failures === SEARCHES.length) {
    console.error('[NearbyPlaces] OpenStreetMap search failed for every query');
    throw fail('The map service is unavailable right now. Try again in a few minutes, or add places yourself below.', 503);
  }
  const seen = new Set();
  const places = [];
  for (const { r, km, category, type } of elements) {
    const name = String(r.name || '').trim();
    const pLat = Number(r.lat); const pLng = Number(r.lon);
    if (!name || !Number.isFinite(pLat) || isGenericName(name)) continue;
    const known = classify({ [r.class]: r.type });
    const c = known && known.category === category ? known : { category, type };
    if (c.type === 'Railway Station' && /metro/i.test(name)) c.type = 'Metro Station';
    const dist = distanceKm(la, ln, pLat, pLng);
    if (dist > km * 1.15) continue; // the search box is square; keep it round
    const key = `${c.category}|${name.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    places.push({ id: `osm-${r.osm_type}-${r.osm_id}`, name: name.slice(0, 80), category: c.category, type: c.type, lat: pLat, lng: pLng, distanceKm: dist, source: 'OSM', visible: true });
  }
  // Nearest first, but no more than 4 of one type (so bus stops don't crowd out stations)
  return CATEGORIES.flatMap((cat) => {
    const perType = {};
    return places.filter((p) => p.category === cat).sort((a, b) => a.distanceKm - b.distanceKm)
      .filter((p) => { perType[p.type] = (perType[p.type] || 0) + 1; return perType[p.type] <= 4; })
      .slice(0, PER_CATEGORY);
  });
};

/** Search a place by name near the property (OpenStreetMap address search) for adding by hand. */
export const search = async (q, lat, lng) => {
  const query = String(q || '').trim();
  if (query.length < 3) throw fail('Type at least 3 letters');
  const la = Number(lat); const ln = Number(lng);
  const near = Number.isFinite(la) && Number.isFinite(ln) && (la || ln);
  const params = new URLSearchParams({ q: query, limit: '8', addressdetails: '0', ...(near ? { viewbox: `${ln - 0.3},${la + 0.3},${ln + 0.3},${la - 0.3}`, bounded: '1' } : {}) });
  try {
    const rows = await nominatim(Object.fromEntries(params));
    return rows.map((r) => {
      const c = classify({ [r.class]: r.type, ...(r.class === 'railway' ? { railway: r.type } : {}) });
      return {
        name: String(r.name || r.display_name.split(',')[0]).slice(0, 80),
        detail: r.display_name,
        lat: Number(r.lat), lng: Number(r.lon),
        category: c?.category || 'LANDMARK', type: c?.type || (r.type ? r.type.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase()) : 'Landmark'),
        distanceKm: near ? distanceKm(la, ln, Number(r.lat), Number(r.lon)) : null,
      };
    });
  } catch (e) {
    console.error('[NearbyPlaces] search failed:', e.message);
    throw fail('Place search is unavailable right now. Type the place and its distance instead.', 503);
  }
};

/**
 * Cleans the list the owner saved: known categories, short names, distance from the pin when the
 * place has coordinates (so moving the pin updates them), otherwise the distance they typed.
 */
export const normalizeList = (list, hotelLat, hotelLng) => {
  if (!Array.isArray(list)) return [];
  const hasPin = Number.isFinite(Number(hotelLat)) && Number.isFinite(Number(hotelLng)) && (Number(hotelLat) || Number(hotelLng));
  return list.slice(0, MAX_PLACES).map((p) => {
    const name = String(p?.name || '').trim().slice(0, 80);
    if (!name || !CATEGORIES.includes(p?.category)) return null;
    const lat = Number(p.lat); const lng = Number(p.lng);
    const hasCoords = Number.isFinite(lat) && Number.isFinite(lng) && p.lat !== null && p.lng !== null && p.lat !== '' && p.lng !== '';
    let dist = hasCoords && hasPin ? distanceKm(Number(hotelLat), Number(hotelLng), lat, lng) : Number(p.distanceKm);
    if (!Number.isFinite(dist) || dist < 0 || dist > 500) dist = null;
    return {
      id: String(p.id || crypto.randomUUID()).slice(0, 60),
      name, category: p.category,
      type: String(p.type || '').trim().slice(0, 40) || 'Place',
      lat: hasCoords ? lat : null, lng: hasCoords ? lng : null,
      distanceKm: dist == null ? null : Math.round(dist * 10) / 10,
      source: p.source === 'OSM' ? 'OSM' : 'MANUAL',
      visible: p.visible !== false,
    };
  }).filter(Boolean);
};

/** Guest view: visible places only, nearest first per category. */
export const publicList = (list) => (Array.isArray(list) ? list : [])
  .filter((p) => p && p.visible !== false && p.name)
  .map((p) => ({ name: p.name, category: p.category, type: p.type, distanceKm: p.distanceKm }))
  .sort((a, b) => (a.distanceKm ?? 999) - (b.distanceKm ?? 999));

// ── Fill once for properties with a pin and no nearby places (live properties included) ──

const pending = new Set();
export const autoFill = async (hotelId) => {
  const hotel = await prisma.hotel.findUnique({ where: { id: hotelId }, select: { id: true, name: true, latitude: true, longitude: true, nearbyPlaces: true, nearbyAutoFilledAt: true, isDeleted: true } });
  if (!hotel || hotel.isDeleted || hotel.nearbyAutoFilledAt || !hotel.latitude || !hotel.longitude) return 0;
  if (Array.isArray(hotel.nearbyPlaces) && hotel.nearbyPlaces.length) return 0;
  const places = await suggest(hotel.latitude, hotel.longitude);
  await prisma.hotel.update({ where: { id: hotelId }, data: { nearbyPlaces: places, nearbyAutoFilledAt: new Date() } });
  if (places.length) {
    await createNotification({
      hotelId, type: 'PROPERTY',
      title: "We added what's nearby",
      message: `${places.length} nearby places were added for ${hotel.name} from the map. Review them in Property Info → Location (remove or rename any, add your own).`,
      metadata: { count: places.length },
    });
  }
  return places.length;
};

/** After a pin is saved: fill in the background (map lookups can take a minute). */
export const scheduleAutoFill = (hotelId) => {
  if (!hotelId || pending.has(hotelId) || process.env.NODE_ENV === 'test') return;
  pending.add(hotelId);
  setTimeout(() => {
    autoFill(hotelId).catch((e) => console.error('[NearbyPlaces] auto-fill failed:', e.message)).finally(() => pending.delete(hotelId));
  }, 2000).unref?.();
};

export const runAutoFillJob = async () => {
  const hotels = await prisma.hotel.findMany({ where: { isDeleted: false, nearbyAutoFilledAt: null, latitude: { not: null }, longitude: { not: null } }, select: { id: true, nearbyPlaces: true } });
  let filled = 0;
  for (const h of hotels.filter((x) => !Array.isArray(x.nearbyPlaces) || x.nearbyPlaces.length === 0)) {
    try { if (await autoFill(h.id)) filled += 1; } catch (e) { console.error('[NearbyPlaces] job:', h.id, e.message); break; } // service busy: try next run
    await new Promise((r) => setTimeout(r, 5000)); // be gentle with the free servers
  }
  return filled;
};

export const startNearbyJob = () => {
  const run = () => runAutoFillJob().then((n) => { if (n) console.log(`[NearbyPlaces] filled ${n} propert${n === 1 ? 'y' : 'ies'}`); }).catch((e) => console.error('[NearbyPlaces] job failed:', e.message));
  const first = setTimeout(run, 60 * 1000);
  first.unref?.();
  const timer = setInterval(run, 6 * 60 * 60 * 1000);
  timer.unref?.();
  return timer;
};

export default { CATEGORIES, distanceKm, classify, suggest, search, normalizeList, publicList, autoFill, scheduleAutoFill, runAutoFillJob, startNearbyJob };
