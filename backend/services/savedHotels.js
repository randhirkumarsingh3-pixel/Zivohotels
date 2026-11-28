/**
 * Saved hotels and price-drop alerts.
 *
 * A guest saves a hotel (heart on hotel cards and pages), with the dates and guests they were
 * looking at when there are any. For saved hotels with future dates and alerts on, the lowest price
 * for those dates (the checkout price, service fee included: googleHotelsService.priceStay) is
 * checked every few hours; when it falls at least 5% and ₹100 below the price they saved at (or
 * the last price they were told about), they get an email and a notification, at most once a day
 * per hotel. Past dates stop the checks.
 */
import prisma from '../config/db.js';
import { PUBLIC_HOTEL_STATUSES } from '../constants/hotelStatus.js';
import { priceStay } from './googleHotelsService.js';
import { notifyUser } from './notifyService.js';
import { emailLayout, inr } from './emailLayout.js';
import { hotelSlug } from '../utils/hotelSlug.js';
import { escapeHtml } from '../utils/html.js';

const DAY = 86400000;
const fail = (m, statusCode = 400) => Object.assign(new Error(m), { statusCode });
const dayOf = (d) => new Date(d).toISOString().slice(0, 10);
const istToday = () => new Date(Date.now() + 5.5 * 3600000).toISOString().slice(0, 10);
const MAX_SAVED = 100;
export const DROP_PCT = 5;
export const DROP_MIN = 100;
const CHECK_EVERY = 6 * 3600000;

/** Lowest total for the stay (all rooms), or null when nothing can be booked. */
export const lowestPrice = async (hotelId, checkIn, checkOut, adults = 2, rooms = 1) => {
  const nights = Math.round((new Date(`${dayOf(checkOut)}T00:00:00Z`) - new Date(`${dayOf(checkIn)}T00:00:00Z`)) / DAY);
  if (!(nights > 0)) return null;
  const perRoom = Math.max(1, Math.ceil(adults / Math.max(1, rooms)));
  const prices = await priceStay(hotelId, dayOf(checkIn), nights, perRoom, 0).catch(() => null);
  if (!prices?.length) return null;
  return Math.min(...prices.map((p) => p.total)) * Math.max(1, rooms);
};

const stayInput = (input) => {
  const out = { checkIn: null, checkOut: null, adults: 2, rooms: 1 };
  if (input.checkIn && input.checkOut) {
    const a = String(input.checkIn).slice(0, 10); const b = String(input.checkOut).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(a) || !/^\d{4}-\d{2}-\d{2}$/.test(b) || b <= a) throw fail('Choose check-in before check-out.');
    if (a >= istToday()) { out.checkIn = new Date(`${a}T00:00:00Z`); out.checkOut = new Date(`${b}T00:00:00Z`); }
  }
  out.adults = Math.min(20, Math.max(1, Number(input.adults) || 2));
  out.rooms = Math.min(10, Math.max(1, Number(input.rooms) || 1));
  return out;
};

const view = (s, priceNow) => ({
  id: s.id, hotelId: s.hotelId, alerts: s.alerts,
  checkIn: s.checkIn ? dayOf(s.checkIn) : null, checkOut: s.checkOut ? dayOf(s.checkOut) : null, adults: s.adults, rooms: s.rooms,
  savedPrice: s.savedPrice != null ? Number(s.savedPrice) : null,
  priceNow: priceNow !== undefined ? priceNow : (s.lastPrice != null ? Number(s.lastPrice) : null),
  lastCheckedAt: s.lastCheckedAt, lastAlertAt: s.lastAlertAt, createdAt: s.createdAt,
  datesPassed: Boolean(s.checkIn && dayOf(s.checkIn) < istToday()),
  hotel: s.hotel ? {
    id: s.hotel.id, slug: hotelSlug(s.hotel), name: s.hotel.name, city: s.hotel.city, area: s.hotel.location || null,
    image: s.hotel.media?.[0]?.url || null, reviewScore: s.hotel.reviewScore, reviewCount: s.hotel.reviewCount,
    bookable: PUBLIC_HOTEL_STATUSES.includes(s.hotel.status) && !s.hotel.isDeleted,
  } : null,
});

const hotelSelect = { id: true, name: true, city: true, location: true, status: true, isDeleted: true, reviewScore: true, reviewCount: true, media: { select: { url: true }, take: 1, orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }] } };

/** Hotel ids the guest saved (for the hearts). */
export const savedIds = async (userId) => (await prisma.savedHotel.findMany({ where: { userId }, select: { hotelId: true } })).map((s) => s.hotelId);

/** The guest's saved hotels, newest first, with today's price for their dates. */
export const listSaved = async (userId) => {
  const rows = await prisma.savedHotel.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, include: { hotel: { select: hotelSelect } } });
  return Promise.all(rows.map(async (s) => {
    if (!s.checkIn || dayOf(s.checkIn) < istToday() || !PUBLIC_HOTEL_STATUSES.includes(s.hotel.status)) return view(s, s.checkIn ? null : undefined);
    const now = await lowestPrice(s.hotelId, s.checkIn, s.checkOut, s.adults, s.rooms).catch(() => null);
    return view(s, now);
  }));
};

/** Save (or update the dates of) a hotel. */
export const saveHotel = async (userId, input = {}) => {
  const hotelId = String(input.hotelId || '');
  const hotel = await prisma.hotel.findFirst({ where: { id: hotelId, isDeleted: false, status: { in: PUBLIC_HOTEL_STATUSES } }, select: { id: true } });
  if (!hotel) throw fail('Hotel not found.', 404);
  const existing = await prisma.savedHotel.findUnique({ where: { userId_hotelId: { userId, hotelId } } });
  if (!existing && await prisma.savedHotel.count({ where: { userId } }) >= MAX_SAVED) throw fail(`You can save up to ${MAX_SAVED} hotels. Remove one first.`, 409);
  const stay = stayInput(input);
  const price = stay.checkIn ? await lowestPrice(hotelId, stay.checkIn, stay.checkOut, stay.adults, stay.rooms).catch(() => null) : null;
  const sameStay = existing && dayOf(existing.checkIn || 0) === dayOf(stay.checkIn || 0) && dayOf(existing.checkOut || 0) === dayOf(stay.checkOut || 0) && existing.adults === stay.adults && existing.rooms === stay.rooms;
  const data = {
    ...stay, ...(input.alerts !== undefined ? { alerts: Boolean(input.alerts) } : {}),
    // New dates: the price to compare against starts again
    ...(sameStay ? {} : { savedPrice: price, lastPrice: price, lastCheckedAt: stay.checkIn ? new Date() : null, lastAlertPrice: null, lastAlertAt: null }),
  };
  const s = await prisma.savedHotel.upsert({ where: { userId_hotelId: { userId, hotelId } }, create: { userId, hotelId, ...data }, update: data, include: { hotel: { select: hotelSelect } } });
  return view(s, stay.checkIn ? price : undefined);
};

export const setAlerts = async (userId, hotelId, alerts) => {
  const s = await prisma.savedHotel.findUnique({ where: { userId_hotelId: { userId, hotelId: String(hotelId) } } });
  if (!s) throw fail('Not in your saved hotels.', 404);
  return view(await prisma.savedHotel.update({ where: { id: s.id }, data: { alerts: Boolean(alerts) }, include: { hotel: { select: hotelSelect } } }));
};

export const removeSaved = async (userId, hotelId) => {
  await prisma.savedHotel.deleteMany({ where: { userId, hotelId: String(hotelId) } });
  return { removed: true };
};

const day = (d) => new Date(d).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

const sendAlert = async (s, hotel, was, now) => {
  const link = `/hotel/${hotelSlug(hotel)}?checkin=${dayOf(s.checkIn)}&checkout=${dayOf(s.checkOut)}&guests=${s.adults}&rooms=${s.rooms}`;
  const saving = Math.round(was - now);
  const html = await emailLayout({
    title: `Price drop at ${hotel.name}`,
    eyebrow: 'Saved hotel',
    preheader: `Now ${inr(now)} for your dates, ${inr(saving)} less.`,
    body: `<p>The price for your dates at <b>${escapeHtml(hotel.name)}</b>${hotel.city ? `, ${escapeHtml(hotel.city)}` : ''} has dropped.</p>`,
    rows: [
      ['Dates', `${day(s.checkIn)} → ${day(s.checkOut)}`],
      ['Guests', `${s.adults} adult${s.adults === 1 ? '' : 's'}, ${s.rooms} room${s.rooms === 1 ? '' : 's'}`],
      ['Was', inr(was)],
      ['Now', `<b>${inr(now)}</b> (${inr(saving)} less, GST included)`],
    ],
    cta: { label: 'See the hotel', href: link },
    cta2: { label: 'My saved hotels', href: '/saved' },
    note: 'Prices change with demand and can go up again. Turn these emails off for a hotel in My saved hotels.',
  });
  await notifyUser(s.userId, {
    type: 'PRICE_DROP', title: `Price drop at ${hotel.name}`, message: `Now ${inr(now)} for ${day(s.checkIn)} → ${day(s.checkOut)} (was ${inr(was)}).`, link,
    metadata: { hotelId: hotel.id, was, now },
    email: { subject: `Price drop at ${hotel.name}: now ${inr(now)} for your dates`, html, jobType: 'SEND_PRICE_DROP' },
  });
};

/** One round of checks (from the job): saved hotels with future dates and alerts on, oldest checked first. */
export const checkPriceDrops = async ({ limit = 150 } = {}) => {
  const today = new Date(`${istToday()}T00:00:00Z`);
  const due = await prisma.savedHotel.findMany({
    where: { alerts: true, checkIn: { gte: today }, OR: [{ lastCheckedAt: null }, { lastCheckedAt: { lt: new Date(Date.now() - CHECK_EVERY) } }], hotel: { isDeleted: false, status: { in: PUBLIC_HOTEL_STATUSES } } },
    orderBy: { lastCheckedAt: { sort: 'asc', nulls: 'first' } }, take: limit,
    include: { hotel: { select: { id: true, name: true, city: true } } },
  });
  let alerts = 0;
  for (const s of due) {
    const now = await lowestPrice(s.hotelId, s.checkIn, s.checkOut, s.adults, s.rooms).catch(() => null);
    const data = { lastCheckedAt: new Date(), lastPrice: now };
    const base = s.lastAlertPrice != null ? Number(s.lastAlertPrice) : s.savedPrice != null ? Number(s.savedPrice) : null;
    const recent = s.lastAlertAt && Date.now() - new Date(s.lastAlertAt).getTime() < DAY;
    if (now != null && base == null) data.savedPrice = now; // saved while sold out: start from the first price seen
    if (now != null && base != null && !recent && now <= base * (1 - DROP_PCT / 100) && base - now >= DROP_MIN) {
      await sendAlert(s, s.hotel, base, now).catch((e) => console.error('[PriceDrop] alert failed:', e.message));
      Object.assign(data, { lastAlertPrice: now, lastAlertAt: new Date() });
      alerts += 1;
    }
    await prisma.savedHotel.update({ where: { id: s.id }, data });
  }
  return { checked: due.length, alerts };
};

/** Every hour (only the jobs process): checks what is due (each saved stay about every 6 hours). */
export const startPriceAlertJob = () => {
  const run = () => checkPriceDrops().catch((e) => console.error('[PriceDrop] check failed:', e.message));
  setTimeout(run, 90 * 1000).unref();
  setInterval(run, 3600 * 1000).unref();
};

export default { savedIds, listSaved, saveHotel, setAlerts, removeSaved, checkPriceDrops, startPriceAlertJob, lowestPrice };
