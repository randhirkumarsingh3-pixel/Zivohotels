/**
 * SEO end to end against a running API (sample data from prisma/seed.js): readable hotel
 * addresses (and old ones moving to them), filled-in pages (title, description, official address,
 * structured data, content), city pages, sitemaps, and Admin → SEO (a hotel's own title, hiding a
 * hotel, redirects). Settings and the hotel's SEO fields are put back afterwards.
 */
import axios from 'axios';
import { expect } from 'chai';
import minimist from 'minimist';
import prisma from '../../config/db.js';
import { hotelSlug } from '../../utils/hotelSlug.js';

const argv = minimist(process.argv.slice(2));
const BASE = argv.url || process.env.E2E_URL || 'http://localhost:5000';
const api = axios.create({ baseURL: `${BASE}/api/v1`, validateStatus: () => true });
const raw = axios.create({ baseURL: BASE, validateStatus: () => true, maxRedirects: 0 });
const page = (path) => raw.get(`/seo/page?path=${encodeURIComponent(path)}`);
const ld = (html) => [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map((m) => JSON.parse(m[1]));

describe('SEO end to end', function () {
  this.timeout(30000);
  let hotel; let slug; let admin; let savedSettings; let savedIntegration;

  before(async () => {
    hotel = await prisma.hotel.findFirst({ where: { status: { in: ['LIVE', 'ACTIVE'] }, isDeleted: false, roomTypes: { some: { isActive: true } } }, select: { id: true, name: true, city: true, integrationSettings: true } });
    slug = hotelSlug(hotel);
    savedIntegration = hotel.integrationSettings;
    savedSettings = await prisma.systemConfig.findUnique({ where: { key: 'seo_settings' } });
    const r = await api.post('/auth/login', { email: 'admin@zivoplus.com', password: process.env.SEED_ADMIN_PASSWORD || 'admin123' });
    admin = { headers: { Authorization: `Bearer ${r.data.data.token}` } };
  });
  after(async () => {
    await prisma.hotel.update({ where: { id: hotel.id }, data: { integrationSettings: savedIntegration ?? undefined } });
    if (savedSettings) await prisma.systemConfig.update({ where: { key: 'seo_settings' }, data: { value: savedSettings.value } });
    else await prisma.systemConfig.deleteMany({ where: { key: 'seo_settings' } });
  });

  it('serves hotels at readable addresses, and old addresses move to them', async () => {
    const byId = await api.get(`/hotels/${hotel.id}`);
    expect(byId.data.data.slug).to.equal(slug);
    const bySlug = await api.get(`/hotels/${slug}`);
    expect(bySlug.status).to.equal(200);
    expect(bySlug.data.data.id).to.equal(hotel.id);
    const old = await page(`/hotel/${hotel.id}`);
    expect(old.status).to.equal(301);
    expect(old.headers.location).to.equal(`/hotel/${slug}`);
    const renamed = await raw.get(`/seo/page?path=${encodeURIComponent(`/hotel/old-name-${hotel.id.slice(0, 8)}`)}&checkin=2026-12-10`);
    expect(renamed.status).to.equal(301);
    expect(renamed.headers.location).to.equal(`/hotel/${slug}?checkin=2026-12-10`);
  });

  it('fills a hotel page with its title, description, official address, structured data and content', async () => {
    const r = await page(`/hotel/${slug}`);
    expect(r.status).to.equal(200);
    expect(r.data).to.match(new RegExp(`<title>${hotel.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^<]*\\| ZivoPlus</title>`));
    expect(r.data).to.match(/<meta name="description" content="[^"]{40,}"/);
    expect(r.data).to.include(`/hotel/${slug}" />`);
    const types = ld(r.data).map((d) => d['@type']);
    expect(types).to.include('BreadcrumbList');
    expect(types.some((t) => ['Hotel', 'Resort'].includes(t))).to.equal(true);
    expect(r.data).to.include(`<h1 class="mt-2 text-3xl font-bold text-navy-900">`);
    // Same headers as the rest of the website: nothing that blocks photos, maps or the payment script
    expect(r.headers['content-security-policy']).to.equal(undefined);
    expect(r.headers['cross-origin-opener-policy']).to.equal(undefined);
  });

  it('has city pages and sitemaps listing the readable addresses', async () => {
    const places = await raw.get('/sitemaps/places.xml');
    const city = /\/hotels-in-([a-z0-9-]+)</.exec(places.data)[1];
    const r = await page(`/hotels-in-${city}`);
    expect(r.status).to.equal(200);
    expect(ld(r.data).map((d) => d['@type'])).to.include.members(['BreadcrumbList', 'ItemList', 'FAQPage']);
    expect((await api.get(`/public/places/${city}`)).data.data.count).to.be.greaterThan(0);
    expect((await page('/hotels-in-nowhere-at-all')).status).to.equal(404);
    const index = await raw.get('/sitemap.xml');
    expect(index.data).to.include('/sitemaps/hotels.xml');
    const hotels = await raw.get('/sitemaps/hotels.xml');
    expect(hotels.data).to.include(`/hotel/${slug}</loc>`);
  });

  it('uses a hotel\'s own title, hides a hotel, and applies redirects from Admin → SEO', async () => {
    expect((await api.put(`/admin/seo/hotels/${hotel.id}`, { title: 'E2E custom title', description: 'E2E custom description for search.' }, admin)).status).to.equal(200);
    let r = await page(`/hotel/${slug}`);
    expect(r.data).to.include('<title>E2E custom title</title>');
    await api.put(`/admin/seo/hotels/${hotel.id}`, { noindex: true }, admin);
    r = await page(`/hotel/${slug}`);
    expect(r.data).to.include('<meta name="robots" content="noindex');
    expect((await raw.get('/sitemaps/hotels.xml')).data).to.not.include(`/hotel/${slug}</loc>`);

    const settings = (await api.get('/admin/seo', admin)).data.data.settings;
    expect((await api.put('/admin/seo', { ...settings, redirects: [{ from: '/e2e-old', to: '/help' }] }, admin)).status).to.equal(200);
    const moved = await page('/e2e-old');
    expect(moved.status).to.equal(301);
    expect(moved.headers.location).to.equal('/help');
    const preview = (await api.get('/admin/seo/preview?path=/help', admin)).data.data;
    expect(preview.title).to.include('Help');
  });
});
