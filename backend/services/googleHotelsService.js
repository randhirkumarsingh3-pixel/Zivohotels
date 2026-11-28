/**
 * Google Hotels (Hotel Center, free booking links): the feeds Google reads to show ZivoPlus'
 * price for a hotel in Search and Maps, with a "Visit site" button to our hotel page.
 *
 * - Hotel list (listings XML): every included live hotel with name, address, map pin and phone,
 *   so Google can match it to its Maps listing.
 * - Prices, "pull" model: Google POSTs a <Query> (hotels, check-in, nights, guests); we answer with
 *   a <Transaction> of prices worked out by the same engine as checkout (bookingService.previewBooking),
 *   so the price on Google is the price the guest pays: Baserate = the stay's total before taxes
 *   (offers and the pay-now discount included), Tax = GST. Rooms that can't be booked are left out;
 *   a hotel with none answers <Unavailable><NoVacancy/>.
 * - Hints: Google asks what changed since its last fetch; we list hotels whose prices or rooms
 *   changed, with the dates affected.
 * - Point of sale: the landing page address template (our hotel page with the dates and guests).
 *
 * All addresses carry a secret token (Admin → Google Hotels), shown only to admins.
 * Formats follow Google's Hotel Prices XML (Query / Transaction / Hint / PointsOfSale) and the
 * hotel list "listings" feed; check them with Hotel Center's feed tools when the account is set up.
 */
import crypto from 'crypto';
import prisma from '../config/db.js';
import { PUBLIC_HOTEL_STATUSES } from '../constants/hotelStatus.js';
import { bookingService } from './bookingService.js';
import { getShared, setShared, delShared } from '../utils/sharedCache.js';
import { redis } from '../config/redis.js';
import { cityNames } from '../utils/places.js';

const KEY = 'google_hotels';
export const DEFAULTS = {
  enabled: false,
  accountId: '', // Hotel Center account id (for reference)
  posId: 'zivoplus',
  token: '',
  includeNewHotels: true, // hotels are included unless excluded (admin) or opted out (extranet)
  maxNights: 14,
  maxAdvanceDays: 330,
};

const site = () => String(process.env.FRONTEND_URL || '').replace(/\/$/, '');
const xml = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const money = (n) => (Math.round(Number(n) * 100) / 100).toFixed(2);
const titleCase = (s) => String(s || '').trim().toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
const tag = (src, name) => { const m = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i').exec(src); return m ? m[1].trim() : null; };
const tags = (src, name) => [...String(src).matchAll(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'gi'))].map((m) => m[1].trim());

// ─── Settings and status ───────────────────────────────────────────────────────────────────────

export const getGoogleSettings = async () => {
  const row = await prisma.systemConfig.findUnique({ where: { key: KEY } }).catch(() => null);
  return { ...DEFAULTS, ...(row?.value && typeof row.value === 'object' ? row.value : {}) };
};

export const saveGoogleSettings = async (input = {}, { regenerateToken = false } = {}) => {
  const cur = await getGoogleSettings();
  const value = {
    enabled: input.enabled ?? cur.enabled,
    accountId: String(input.accountId ?? cur.accountId).trim().slice(0, 40),
    posId: (String(input.posId ?? cur.posId).trim().replace(/[^a-z0-9_-]/gi, '') || DEFAULTS.posId).slice(0, 40),
    includeNewHotels: input.includeNewHotels ?? cur.includeNewHotels,
    maxNights: Math.min(30, Math.max(1, Number(input.maxNights ?? cur.maxNights) || DEFAULTS.maxNights)),
    maxAdvanceDays: Math.min(500, Math.max(30, Number(input.maxAdvanceDays ?? cur.maxAdvanceDays) || DEFAULTS.maxAdvanceDays)),
    token: regenerateToken || !cur.token ? crypto.randomBytes(24).toString('hex') : cur.token,
  };
  value.enabled = Boolean(value.enabled);
  value.includeNewHotels = Boolean(value.includeNewHotels);
  await prisma.systemConfig.upsert({ where: { key: KEY }, update: { value }, create: { key: KEY, value, description: 'Admin → Google Hotels' } });
  return value;
};

/** Is this token the configured one (constant-time)? */
export const tokenOk = async (token) => {
  const s = await getGoogleSettings();
  if (!s.enabled || !s.token || !token) return false;
  const a = Buffer.from(String(s.token)); const b = Buffer.from(String(token));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

const STATUS_KEY = 'zivo:google:status';
const memoryStatus = {};
/** Records Google's fetches (last time and count per feed) for the admin screen. */
export const noteFetch = (feed, extra = {}) => {
  const now = new Date().toISOString();
  memoryStatus[feed] = { at: now, count: (memoryStatus[feed]?.count || 0) + 1, ...extra };
  if (redis?.isReady) {
    redis.hSet(STATUS_KEY, `${feed}:at`, now).catch(() => {});
    redis.hIncrBy(STATUS_KEY, `${feed}:count`, 1).catch(() => {});
    Object.entries(extra).forEach(([k, v]) => redis.hSet(STATUS_KEY, `${feed}:${k}`, String(v)).catch(() => {}));
  }
};
export const fetchStatus = async () => {
  if (!redis?.isReady) return memoryStatus;
  const raw = await redis.hGetAll(STATUS_KEY).catch(() => ({}));
  const out = {};
  for (const [k, v] of Object.entries(raw || {})) { const [feed, field] = k.split(':'); (out[feed] ||= {})[field] = field === 'count' ? Number(v) : v; }
  return out;
};

// ─── Hotels ────────────────────────────────────────────────────────────────────────────────────

/** Is a hotel in the Google feeds? Admin's choice wins, then the hotel's own (extranet), then the default. */
export const isIncluded = (hotel, settings) => {
  const g = hotel.integrationSettings?.googleHotels || {};
  if (g.adminExcluded) return false;
  if (typeof g.optIn === 'boolean') return g.optIn;
  return Boolean(settings.includeNewHotels);
};

export const includedHotels = async (settings) => {
  const rows = await prisma.hotel.findMany({
    where: { status: { in: PUBLIC_HOTEL_STATUSES }, isDeleted: false },
    select: {
      id: true, name: true, location: true, city: true, state: true, pincode: true, country: true, latitude: true, longitude: true,
      landmark: true, type: true, integrationSettings: true, updatedAt: true,
    },
    orderBy: { name: 'asc' },
  });
  return rows.filter((h) => isIncluded(h, settings));
};

/** What Google needs to match a hotel; missing pieces are listed so admins can fix them. */
export const listingProblems = (h) => [
  !h.location && 'street address',
  !h.city && 'city',
  !h.pincode && 'PIN code',
  (h.latitude == null || h.longitude == null) && 'map pin',
  !phoneOf(h) && 'reception phone',
].filter(Boolean);

function phoneOf(h) {
  const c = h.integrationSettings?.contactInfo || {};
  const p = String(c.receptionPhone || c.guestLandline || '').replace(/[^\d+]/g, '');
  if (!p) return null;
  return p.startsWith('+') ? p : `+91${p.replace(/^0/, '')}`;
}

/** Hotel list feed (listings XML). */
export const hotelListXml = async () => {
  const settings = await getGoogleSettings();
  const hotels = await includedHotels(settings);
  const listing = (h) => {
    const phone = phoneOf(h);
    return `  <listing>
    <id>${xml(h.id)}</id>
    <name>${xml(h.name)}</name>
    <address format="simple">
      ${h.location ? `<component name="addr1">${xml(h.location)}</component>` : ''}
      <component name="city">${xml(titleCase(cityNames(h.city)[0] || h.city))}</component>
      ${h.state ? `<component name="province">${xml(h.state)}</component>` : ''}
      ${h.pincode ? `<component name="postal_code">${xml(h.pincode)}</component>` : ''}
    </address>
    <country>IN</country>
    ${h.latitude != null ? `<latitude>${h.latitude}</latitude>` : ''}
    ${h.longitude != null ? `<longitude>${h.longitude}</longitude>` : ''}
    ${phone ? `<phone type="main">${xml(phone)}</phone>` : ''}
    <category>${xml((h.type || '').toLowerCase().includes('resort') ? 'resort' : 'hotel')}</category>
  </listing>`.replace(/\n\s*\n/g, '\n');
  };
  return `<?xml version="1.0" encoding="UTF-8"?>
<listings xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="http://www.gstatic.com/localfeed/local_feed.xsd">
  <language>en</language>
${hotels.map(listing).join('\n')}
</listings>
`;
};

/** Point of sale file: Google opens our hotel page with the dates and guests filled in. */
export const posXml = async () => {
  const s = await getGoogleSettings();
  const url = `${site()}/hotel/(PARTNER-HOTEL-ID)?checkin=(CHECKINYEAR)-(CHECKINMONTH)-(CHECKINDAY)&checkout=(CHECKOUTYEAR)-(CHECKOUTMONTH)-(CHECKOUTDAY)&guests=(NUM-ADULTS)&rooms=1&utm_source=google&utm_medium=hotel_ads`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<PointsOfSale>
  <PointOfSale id="${xml(s.posId)}">
    <Match status="yes" country="IN"/>
    <URL>${xml(url)}</URL>
  </PointOfSale>
</PointsOfSale>
`;
};

// ─── Prices ────────────────────────────────────────────────────────────────────────────────────

const ymd = (d) => new Date(d).toISOString().slice(0, 10);
const addDays = (s, n) => { const d = new Date(`${s}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return ymd(d); };
const MEALS = { BREAKFAST: 'Breakfast included', HALF_BOARD: 'Breakfast and dinner', FULL_BOARD: 'All meals', ALL_INCLUSIVE: 'All inclusive', NONE: 'Room only' };

/** Reads a Google <Query>: { properties, itineraries: [{ checkin, nights }], adults, children }. */
export const parseQuery = (body) => {
  const src = String(body || '');
  const properties = tags(tag(src, 'PropertyList') || '', 'Property');
  const nights = Number(tag(src, 'Nights')) || 1;
  const itineraries = [];
  const checkin = tag(src, 'Checkin');
  if (checkin) itineraries.push({ checkin, nights });
  // Ranges: every check-in from FirstDate to LastDate (for the given nights)
  const first = tag(src, 'FirstDate'); const last = tag(src, 'LastDate');
  if (first && last) for (let d = first, i = 0; d <= last && i < 60; d = addDays(d, 1), i += 1) itineraries.push({ checkin: d, nights });
  const ctx = tag(src, 'Context') || '';
  const details = tag(ctx, 'OccupancyDetails');
  const adults = Number(details ? tag(details, 'NumAdults') : tag(ctx, 'Occupancy')) || 2;
  const children = details ? (String(details).match(/<Child\b/gi) || []).length : 0;
  return { properties, itineraries, adults, children };
};

/** Prices for one hotel and stay: [{ roomTypeId, ratePlanId, room, plan, baserate, tax, refundableDays, meal }] (cached 10 minutes). */
export const priceStay = async (hotelId, checkin, nights, adults = 2, children = 0) => {
  const key = `google:price:${hotelId}:${checkin}:${nights}:${adults}:${children}`;
  const cached = await getShared(key);
  if (cached) return cached;
  const hotel = await prisma.hotel.findFirst({
    where: { id: hotelId, isDeleted: false, status: { in: PUBLIC_HOTEL_STATUSES } },
    select: { id: true, cancellationPolicy: { select: { policyCode: true } }, roomTypes: { where: { isActive: true }, select: { id: true, name: true, maxOccupancy: true, ratePlans: { where: { isActive: true }, select: { id: true, name: true, basePrice: true, mealPlan: true, cancellationPolicy: true } } } } },
  });
  if (!hotel) return null;
  const checkout = addDays(checkin, nights);
  const policy = hotel.cancellationPolicy?.policyCode || 'FREE_CANCEL_24H';
  const freeDays = { FREE_CANCEL_24H: 1, FREE_CANCEL_48H: 2, FREE_CANCEL_7D: 7 }[policy] ?? null;
  const out = [];
  for (const rt of hotel.roomTypes) {
    if ((rt.maxOccupancy || 2) < adults + children) continue;
    for (const rp of rt.ratePlans) {
      if (!(Number(rp.basePrice) > 0)) continue;
      try {
        const p = await bookingService.previewBooking({ hotelId, roomTypeId: rt.id, ratePlanId: rp.id, checkIn: checkin, checkOut: checkout, adults, children, rooms: 1, extraBeds: 0, paymentType: 'PREPAID' });
        out.push({
          roomTypeId: rt.id, ratePlanId: rp.id, room: rt.name, plan: rp.name, occupancy: adults + children,
          // ZivoPlus's service fee (when on) goes in OtherFees, so Google shows the full price
          baserate: Number(p.baseAmount), tax: Number(p.taxAmount), fees: Number(p.serviceFee?.amount || 0), total: Number(p.totalAmount) + Number(p.serviceFee?.amount || 0),
          refundableDays: /non.?refundable/i.test(rp.cancellationPolicy || '') ? null : freeDays,
          meal: rp.mealPlan || 'NONE',
        });
      } catch { /* sold out, closed or not for this many guests: not offered */ }
    }
  }
  setShared(key, out, 10 * 60 * 1000);
  return out;
};

/** Answers a Google <Query> with a <Transaction>. */
export const transactionXml = async (body) => {
  const settings = await getGoogleSettings();
  const q = parseQuery(body);
  const included = new Set((await includedHotels(settings)).map((h) => h.id));
  const today = ymd(new Date());
  const results = [];
  const roomData = new Map(); const packageData = new Map();
  for (const pid of q.properties.slice(0, 500)) {
    for (const it of q.itineraries) {
      const nights = Math.max(1, Math.min(settings.maxNights, it.nights));
      const head = `    <Property>${xml(pid)}</Property>\n    <Checkin>${xml(it.checkin)}</Checkin>\n    <Nights>${nights}</Nights>`;
      const tooFar = it.checkin < today || it.checkin > addDays(today, settings.maxAdvanceDays);
      const prices = !included.has(pid) || tooFar ? [] : (await priceStay(pid, it.checkin, nights, q.adults, q.children)) || [];
      if (!prices.length) { results.push(`  <Result>\n${head}\n    <Unavailable><NoVacancy/></Unavailable>\n  </Result>`); continue; }
      const best = prices.reduce((a, b) => (b.total < a.total ? b : a));
      const bundles = prices.map((p) => {
        roomData.set(`${pid}|${p.roomTypeId}`, { pid, id: p.roomTypeId, name: p.room, occupancy: p.occupancy });
        packageData.set(`${pid}|${p.ratePlanId}`, { pid, id: p.ratePlanId, name: `${p.plan} · ${MEALS[p.meal] || MEALS.NONE}`, breakfast: ['BREAKFAST', 'HALF_BOARD', 'FULL_BOARD', 'ALL_INCLUSIVE'].includes(p.meal), refundableDays: p.refundableDays });
        return `    <RoomBundle>
      <RoomID>${xml(p.roomTypeId)}</RoomID>
      <PackageID>${xml(p.ratePlanId)}</PackageID>
      <Baserate currency="INR">${money(p.baserate)}</Baserate>
      <Tax currency="INR">${money(p.tax)}</Tax>
      <OtherFees currency="INR">${money(p.fees || 0)}</OtherFees>
      <Occupancy>${p.occupancy}</Occupancy>
    </RoomBundle>`;
      });
      results.push(`  <Result>
${head}
    <Baserate currency="INR">${money(best.baserate)}</Baserate>
    <Tax currency="INR">${money(best.tax)}</Tax>
    <OtherFees currency="INR">${money(best.fees || 0)}</OtherFees>
    <AllowablePointsOfSale><PointOfSale id="${xml(settings.posId)}"/></AllowablePointsOfSale>
${bundles.join('\n')}
  </Result>`);
    }
  }
  const byHotel = {};
  for (const r of roomData.values()) (byHotel[r.pid] ||= { rooms: [], packages: [] }).rooms.push(r);
  for (const p of packageData.values()) (byHotel[p.pid] ||= { rooms: [], packages: [] }).packages.push(p);
  const dataSets = Object.entries(byHotel).map(([pid, d]) => `  <PropertyDataSet>
    <Property>${xml(pid)}</Property>
${d.rooms.map((r) => `    <RoomData>
      <RoomID>${xml(r.id)}</RoomID>
      <Name><Text text="${xml(r.name)}" language="en"/></Name>
      <Occupancy>${r.occupancy}</Occupancy>
    </RoomData>`).join('\n')}
${d.packages.map((p) => `    <PackageData>
      <PackageID>${xml(p.id)}</PackageID>
      <Name><Text text="${xml(p.name)}" language="en"/></Name>
      <BreakfastIncluded>${p.breakfast ? 1 : 0}</BreakfastIncluded>
      ${p.refundableDays != null ? `<Refundable available="1" refundable_until_days="${p.refundableDays}" refundable_until_time="12:00:00"/>` : '<Refundable available="0"/>'}
    </PackageData>`).join('\n')}
  </PropertyDataSet>`);
  noteFetch('query', { hotels: q.properties.length, itineraries: q.itineraries.length });
  return `<?xml version="1.0" encoding="UTF-8"?>
<Transaction timestamp="${new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')}" id="${crypto.randomUUID()}">
${results.join('\n')}
${dataSets.join('\n')}
</Transaction>
`;
};

/** Answers a Google <HintRequest>: hotels whose prices or rooms changed since its last fetch. */
export const hintXml = async (body) => {
  const settings = await getGoogleSettings();
  const lastRaw = tag(body, 'LastFetchTime');
  const since = lastRaw && !Number.isNaN(Date.parse(lastRaw)) ? new Date(lastRaw) : new Date(Date.now() - 3600000);
  const included = new Set((await includedHotels(settings)).map((h) => h.id));
  const today = ymd(new Date());
  // Daily rates changed (dates known); hotels and rooms edited (all dates)
  const [rates, hotels] = await Promise.all([
    prisma.dailyRate.findMany({ where: { updatedAt: { gt: since }, date: { gte: new Date(today) } }, select: { date: true, ratePlan: { select: { roomType: { select: { hotelId: true } } } } }, take: 5000 }),
    prisma.hotel.findMany({ where: { updatedAt: { gt: since }, id: { in: [...included] } }, select: { id: true } }),
  ]);
  const ranges = {};
  for (const r of rates) {
    const id = r.ratePlan?.roomType?.hotelId; if (!id || !included.has(id)) continue;
    const d = ymd(r.date); const cur = ranges[id];
    ranges[id] = cur ? { first: d < cur.first ? d : cur.first, last: d > cur.last ? d : cur.last } : { first: d, last: d };
  }
  for (const h of hotels) ranges[h.id] = { first: today, last: addDays(today, settings.maxAdvanceDays) };
  noteFetch('hint', { hotels: Object.keys(ranges).length });
  return `<?xml version="1.0" encoding="UTF-8"?>
<Hint>
${Object.entries(ranges).map(([id, r]) => `  <Item>
    <Property>${xml(id)}</Property>
    <FirstDate>${r.first}</FirstDate>
    <LastDate>${r.last}</LastDate>
  </Item>`).join('\n')}
</Hint>
`;
};

/**
 * Price accuracy check: for a few included hotels (2 nights, 2 weeks ahead, 2 adults), works the
 * price out again and compares it with what Google was last given (if it asked for that stay). Returns { checked, mismatches: [...] }.
 */
export const accuracyCheck = async ({ samples = 10 } = {}) => {
  const settings = await getGoogleSettings();
  const hotels = (await includedHotels(settings)).slice(0, samples);
  const checkin = addDays(ymd(new Date()), 14);
  const mismatches = []; let checked = 0;
  for (const h of hotels) {
    const key = `google:price:${h.id}:${checkin}:2:2:0`;
    const cached = await getShared(key);
    delShared(key);
    const fresh = (await priceStay(h.id, checkin, 2, 2, 0).catch(() => null)) || [];
    checked += 1;
    for (const c of cached || []) {
      const f = fresh.find((x) => x.ratePlanId === c.ratePlanId);
      if (!f || Math.abs(f.total - c.total) > 1) mismatches.push({ hotel: h.name, plan: c.plan, google: c.total, now: f ? f.total : null });
    }
  }
  return { checked, checkin, mismatches };
};

export default { getGoogleSettings, saveGoogleSettings, tokenOk, hotelListXml, posXml, transactionXml, hintXml, parseQuery, priceStay, includedHotels, listingProblems, isIncluded, fetchStatus, noteFetch, accuracyCheck };
