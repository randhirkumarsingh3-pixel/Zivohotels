/**
 * Google Hotels: the feed addresses Google calls (secret token in the address), Admin → Google
 * Hotels, and the hotel's own opt-in (Extranet). See services/googleHotelsService.js.
 */
import prisma from '../config/db.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import google from '../services/googleHotelsService.js';

const sendXml = (res, body) => res.type('application/xml; charset=utf-8').set('Cache-Control', 'no-store').send(body);
const guard = (fn) => asyncHandler(async (req, res) => {
  if (!(await google.tokenOk(req.params.token))) return res.status(404).end(); // not enabled, or a wrong token
  return fn(req, res);
});

// ── Feeds (Google) ───────────────────────────────────────────────────────────────────────────
export const hotelList = guard(async (req, res) => { google.noteFetch('hotelList'); sendXml(res, await google.hotelListXml()); });
export const pointOfSale = guard(async (req, res) => { google.noteFetch('pos'); sendXml(res, await google.posXml()); });
export const query = guard(async (req, res) => sendXml(res, await google.transactionXml(typeof req.body === 'string' ? req.body : '')));
export const hint = guard(async (req, res) => sendXml(res, await google.hintXml(typeof req.body === 'string' ? req.body : '')));

// ── Admin → Google Hotels ────────────────────────────────────────────────────────────────────
const feedUrls = (s) => {
  const base = `${String(process.env.FRONTEND_URL || '').replace(/\/$/, '')}/google/${s.token}`;
  return { hotelList: `${base}/hotel-list.xml`, pointOfSale: `${base}/pos.xml`, query: `${base}/query`, hint: `${base}/hint` };
};

export const adminGet = asyncHandler(async (req, res) => {
  const settings = await google.getGoogleSettings();
  const rows = await prisma.hotel.findMany({
    where: { isDeleted: false, status: { in: ['LIVE', 'ACTIVE'] } },
    select: { id: true, name: true, city: true, location: true, pincode: true, latitude: true, longitude: true, integrationSettings: true },
    orderBy: { name: 'asc' },
  });
  res.json({
    success: true,
    data: {
      settings,
      urls: settings.token ? feedUrls(settings) : null,
      fetches: await google.fetchStatus(),
      hotels: rows.map((h) => ({
        id: h.id, name: h.name, city: h.city, included: google.isIncluded(h, settings),
        adminExcluded: Boolean(h.integrationSettings?.googleHotels?.adminExcluded),
        hotelChoice: typeof h.integrationSettings?.googleHotels?.optIn === 'boolean' ? h.integrationSettings.googleHotels.optIn : null,
        problems: google.listingProblems(h),
      })),
    },
  });
});

export const adminSave = asyncHandler(async (req, res) => {
  const settings = await google.saveGoogleSettings(req.body || {}, { regenerateToken: Boolean(req.body?.regenerateToken) });
  await prisma.auditLog.create({ data: { action: 'GOOGLE_HOTELS_SETTINGS', entityType: 'SYSTEM', entityId: 'google_hotels', userId: req.user.id, requestId: req.id, details: { enabled: settings.enabled, regeneratedToken: Boolean(req.body?.regenerateToken) } } }).catch(() => {});
  res.json({ success: true, data: { settings, urls: feedUrls(settings) } });
});

export const adminSetHotel = asyncHandler(async (req, res) => {
  const h = await prisma.hotel.findUnique({ where: { id: req.params.id }, select: { id: true, integrationSettings: true } });
  if (!h) return res.status(404).json({ success: false, message: 'Hotel not found' });
  const g = { ...(h.integrationSettings?.googleHotels || {}), adminExcluded: Boolean(req.body?.excluded) };
  await prisma.hotel.update({ where: { id: h.id }, data: { integrationSettings: { ...(h.integrationSettings || {}), googleHotels: g } } });
  return res.json({ success: true, data: g });
});

/** What Google would get for one hotel: 1 night, tomorrow by default (Admin preview). */
export const adminSample = asyncHandler(async (req, res) => {
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const checkin = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.checkin || '')) ? req.query.checkin : tomorrow;
  const nights = Math.max(1, Math.min(14, Number(req.query.nights) || 1));
  const body = `<?xml version="1.0" encoding="UTF-8"?><Query><Checkin>${checkin}</Checkin><Nights>${nights}</Nights><PropertyList><Property>${String(req.params.id).replace(/[^a-z0-9-]/gi, '')}</Property></PropertyList></Query>`;
  res.json({ success: true, data: { query: body, transaction: await google.transactionXml(body) } });
});

export const adminAccuracy = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await google.accuracyCheck({ samples: 10 }) });
});

// ── Extranet: the hotel's own choice ─────────────────────────────────────────────────────────
export const extranetGet = asyncHandler(async (req, res) => {
  const [settings, h] = await Promise.all([google.getGoogleSettings(), prisma.hotel.findUnique({ where: { id: req.scopedHotelId }, select: { id: true, location: true, city: true, pincode: true, latitude: true, longitude: true, integrationSettings: true } })]);
  res.json({ success: true, data: { live: settings.enabled, included: google.isIncluded(h, settings), adminExcluded: Boolean(h.integrationSettings?.googleHotels?.adminExcluded), optIn: h.integrationSettings?.googleHotels?.optIn ?? null, problems: google.listingProblems(h) } });
});

export const extranetSet = asyncHandler(async (req, res) => {
  const h = await prisma.hotel.findUnique({ where: { id: req.scopedHotelId }, select: { id: true, integrationSettings: true } });
  const g = { ...(h.integrationSettings?.googleHotels || {}), optIn: Boolean(req.body?.optIn) };
  await prisma.hotel.update({ where: { id: h.id }, data: { integrationSettings: { ...(h.integrationSettings || {}), googleHotels: g } } });
  res.json({ success: true, data: g });
});
