/**
 * Admin → SEO: page title / description templates, verification codes, redirects, IndexNow,
 * per-hotel titles / descriptions / hide from search, and a preview of any public page.
 */
import prisma from '../config/db.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import seo from '../services/seoService.js';
import { hotelSlug } from '../utils/hotelSlug.js';
import { PUBLIC_HOTEL_STATUSES } from '../constants/hotelStatus.js';

export const getSeo = asyncHandler(async (req, res) => {
  const [settings, hotels, places, total, hidden] = await Promise.all([
    seo.getSeoSettings(), seo.liveHotels(), seo.places(),
    prisma.hotel.count({ where: { status: { in: PUBLIC_HOTEL_STATUSES }, isDeleted: false } }),
    prisma.hotel.count({ where: { status: { in: PUBLIC_HOTEL_STATUSES }, isDeleted: false, integrationSettings: { path: ['seo', 'noindex'], equals: true } } }),
  ]);
  const placeList = Object.values(places);
  res.json({
    success: true,
    data: {
      settings,
      status: {
        site: seo.site(), indexing: seo.indexingAllowed(),
        liveHotels: total, inSitemap: hotels.length, hidden,
        cities: placeList.filter((p) => !p.area).length, areas: placeList.filter((p) => p.area).length,
        withoutDescription: await prisma.hotel.count({ where: { status: { in: PUBLIC_HOTEL_STATUSES }, isDeleted: false, OR: [{ description: null }, { description: '' }] } }),
      },
    },
  });
});

export const putSeo = asyncHandler(async (req, res) => {
  const settings = await seo.saveSeoSettings(req.body || {}, req.user.id);
  await prisma.auditLog.create({ data: { action: 'SEO_SETTINGS_UPDATED', entityType: 'SYSTEM', entityId: 'seo_settings', userId: req.user.id, requestId: req.id, details: {} } }).catch(() => {});
  seo.seoChanged(null).catch(() => {});
  res.json({ success: true, data: settings });
});

/** Hotels with their search title, description and hide-from-search switch. */
export const listSeoHotels = asyncHandler(async (req, res) => {
  const q = String(req.query.q || '').trim();
  const rows = await prisma.hotel.findMany({
    where: { isDeleted: false, ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { city: { contains: q, mode: 'insensitive' } }] } : {}) },
    select: { id: true, name: true, city: true, status: true, description: true, integrationSettings: true },
    orderBy: { name: 'asc' }, take: 50,
  });
  const out = await Promise.all(rows.map(async (h) => {
    const page = PUBLIC_HOTEL_STATUSES.includes(h.status) ? await seo.pageFor(`/hotel/${hotelSlug(h)}`) : null;
    return {
      id: h.id, name: h.name, city: h.city, status: h.status, path: `/hotel/${hotelSlug(h)}`,
      descriptionWords: String(h.description || '').split(/\s+/).filter(Boolean).length,
      override: h.integrationSettings?.seo || {},
      shown: page && page.status === 200 ? { title: page.title, description: page.description } : null,
    };
  }));
  res.json({ success: true, data: out });
});

export const putSeoHotel = asyncHandler(async (req, res) => {
  const h = await prisma.hotel.findUnique({ where: { id: req.params.id }, select: { id: true, integrationSettings: true } });
  if (!h) return res.status(404).json({ success: false, message: 'Hotel not found' });
  const b = req.body || {};
  const value = {
    title: String(b.title || '').trim().slice(0, 120) || undefined,
    description: String(b.description || '').trim().slice(0, 300) || undefined,
    noindex: Boolean(b.noindex) || undefined,
  };
  await prisma.hotel.update({ where: { id: h.id }, data: { integrationSettings: { ...(h.integrationSettings || {}), seo: value } } });
  await prisma.auditLog.create({ data: { action: 'SEO_HOTEL_UPDATED', entityType: 'HOTEL', entityId: h.id, userId: req.user.id, requestId: req.id, details: value } }).catch(() => {});
  seo.seoChanged(h.id).catch(() => {});
  return res.json({ success: true, data: value });
});

/** What a public address shows search engines (title, description, official address, redirect). */
export const previewSeo = asyncHandler(async (req, res) => {
  const path = String(req.query.path || '/').replace(/^https?:\/\/[^/]+/, '') || '/';
  const [p, qs] = path.split('?');
  const page = await seo.pageFor(p, Object.fromEntries(new URLSearchParams(qs || '')));
  res.json({ success: true, data: { status: page.status, redirect: page.redirect || null, title: page.title || null, description: page.description || null, canonical: page.canonical ? `${seo.site()}${page.canonical}` : null, noindex: Boolean(page.noindex) || !seo.indexingAllowed(), structuredData: (page.jsonLd || []).map((d) => d['@type']) } });
});
