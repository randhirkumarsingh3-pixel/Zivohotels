/**
 * Google Hotels end to end against a running API (sample data from prisma/seed.js): the feeds are
 * hidden until switched on and only answer at the secret address; the hotel list, prices that
 * equal checkout's (same stay, same room and plan), unknown hotels as unavailable, the changes
 * (hint) feed, and a hotel leaving the feeds by its own choice (extranet) or ZivoPlus'. Settings
 * and the hotel's choices are put back afterwards.
 */
import axios from 'axios';
import { expect } from 'chai';
import minimist from 'minimist';
import prisma from '../../config/db.js';

const argv = minimist(process.argv.slice(2));
const BASE = argv.url || process.env.E2E_URL || 'http://localhost:5000';
const api = axios.create({ baseURL: `${BASE}/api/v1`, validateStatus: () => true });
const raw = axios.create({ baseURL: BASE, validateStatus: () => true, headers: { 'Content-Type': 'application/xml' } });
const login = async (email, password) => {
  const r = await api.post('/auth/login', { email, password });
  expect(r.status, JSON.stringify(r.data)).to.equal(200);
  return { headers: { Authorization: `Bearer ${r.data.data.token}` } };
};
const ymd = (d) => d.toISOString().slice(0, 10);
const inDays = (n) => ymd(new Date(Date.now() + n * 86400000));

describe('Google Hotels end to end', function () {
  this.timeout(60000);
  let hotel; let admin; let owner; let saved; let savedIntegration; let token;
  const feed = (path, body) => (body === undefined ? raw.get(`/google/${token}/${path}`) : raw.post(`/google/${token}/${path}`, body));
  const listed = async () => (await feed('hotel-list.xml')).data;

  before(async () => {
    hotel = await prisma.hotel.findFirst({
      where: { status: { in: ['LIVE', 'ACTIVE'] }, isDeleted: false, owner: { email: 'extranet@zivotechretreat.com' }, roomTypes: { some: { isActive: true, ratePlans: { some: { isActive: true, basePrice: { gt: 0 } } } } } },
      select: { id: true, integrationSettings: true },
    });
    savedIntegration = hotel.integrationSettings;
    saved = await prisma.systemConfig.findUnique({ where: { key: 'google_hotels' } });
    admin = await login('admin@zivoplus.com', process.env.SEED_ADMIN_PASSWORD || 'admin123');
    owner = await login('extranet@zivotechretreat.com', process.env.SEED_OWNER_PASSWORD || 'ZivoExtranet@2026');
    const g = { ...(savedIntegration?.googleHotels || {}) }; delete g.optIn; delete g.adminExcluded;
    await prisma.hotel.update({ where: { id: hotel.id }, data: { integrationSettings: { ...(savedIntegration || {}), googleHotels: g } } });
  });
  after(async () => {
    await prisma.hotel.update({ where: { id: hotel.id }, data: { integrationSettings: savedIntegration ?? undefined } });
    if (saved) await prisma.systemConfig.update({ where: { key: 'google_hotels' }, data: { value: saved.value } });
    else await prisma.systemConfig.deleteMany({ where: { key: 'google_hotels' } });
  });

  it('keeps the feeds hidden until they are switched on, and only at the secret address', async () => {
    const off = await api.put('/admin/google', { enabled: false, includeNewHotels: true, maxNights: 14 }, admin);
    expect(off.status, JSON.stringify(off.data)).to.equal(200);
    token = (await api.get('/admin/google', admin)).data.data.settings.token;
    expect(token).to.be.a('string').with.length.greaterThan(20);
    expect((await feed('hotel-list.xml')).status).to.equal(404);
    expect((await api.put('/admin/google', { enabled: true, includeNewHotels: true, maxNights: 14 }, admin)).status).to.equal(200);
    expect((await feed('hotel-list.xml')).status).to.equal(200);
    expect((await raw.get('/google/wrong-token/hotel-list.xml')).status).to.equal(404);
    expect((await api.get('/admin/google', owner)).status).to.equal(403);
  });

  it('lists live hotels and the landing page', async () => {
    const list = await listed();
    expect(list).to.include(`<id>${hotel.id}</id>`);
    const pos = await feed('pos.xml');
    expect(pos.status).to.equal(200);
    expect(pos.data).to.include('PARTNER-HOTEL-ID');
  });

  it('gives Google the same price as checkout', async () => {
    const checkin = inDays(20);
    const r = await feed('query', `<?xml version="1.0"?><Query><Checkin>${checkin}</Checkin><Nights>2</Nights><PropertyList><Property>${hotel.id}</Property></PropertyList><Context><Occupancy>2</Occupancy></Context></Query>`);
    expect(r.status).to.equal(200);
    const bundle = /<RoomBundle>\s*<RoomID>([^<]+)<\/RoomID>\s*<PackageID>([^<]+)<\/PackageID>\s*<Baserate currency="INR">([\d.]+)<\/Baserate>\s*<Tax currency="INR">([\d.]+)<\/Tax>/.exec(r.data);
    expect(bundle, r.data).to.not.equal(null);
    const [, roomTypeId, ratePlanId, baserate, tax] = bundle;
    const p = await api.post('/bookings/preview', { hotelId: hotel.id, roomTypeId, ratePlanId, checkIn: checkin, checkOut: inDays(22), adults: 2, children: 0, rooms: 1, extraBeds: 0, paymentType: 'PREPAID' });
    // Google shows the public price (signed out); signed-in guests then pay their lower sign-in price
    expect(p.status, JSON.stringify(p.data)).to.equal(200);
    expect(Number(baserate)).to.be.closeTo(Number(p.data.data.baseAmount), 0.01);
    expect(Number(tax)).to.be.closeTo(Number(p.data.data.taxAmount), 0.01);
  });

  it('answers unknown hotels as unavailable', async () => {
    const r = await feed('query', `<Query><Checkin>${inDays(20)}</Checkin><Nights>1</Nights><PropertyList><Property>not-a-hotel</Property></PropertyList></Query>`);
    expect(r.status).to.equal(200);
    expect(r.data).to.match(/<Property>not-a-hotel<\/Property>[\s\S]*?<Unavailable>/);
  });

  it('tells Google which hotels changed', async () => {
    await prisma.hotel.update({ where: { id: hotel.id }, data: { updatedAt: new Date() } });
    const r = await feed('hint', `<HintRequest><LastFetchTime>${new Date(Date.now() - 60000).toISOString()}</LastFetchTime></HintRequest>`);
    expect(r.status).to.equal(200);
    expect(r.data).to.include(`<Property>${hotel.id}</Property>`);
  });

  it("drops a hotel that opts out in the extranet, or that ZivoPlus leaves out", async () => {
    const mine = await api.get(`/extranet/google?hotelId=${hotel.id}`, owner);
    expect(mine.status, JSON.stringify(mine.data)).to.equal(200);
    expect(mine.data.data.included).to.equal(true);
    expect((await api.put(`/extranet/google?hotelId=${hotel.id}`, { optIn: false }, owner)).status).to.equal(200);
    expect(await listed()).to.not.include(`<id>${hotel.id}</id>`);
    expect((await api.put(`/extranet/google?hotelId=${hotel.id}`, { optIn: true }, owner)).status).to.equal(200);
    expect(await listed()).to.include(`<id>${hotel.id}</id>`);
    expect((await api.put(`/admin/google/hotels/${hotel.id}`, { excluded: true }, admin)).status).to.equal(200);
    expect(await listed()).to.not.include(`<id>${hotel.id}</id>`);
    expect((await api.get(`/extranet/google?hotelId=${hotel.id}`, owner)).data.data.adminExcluded).to.equal(true);
  });
});
