/**
 * Admin operations pages, end to end: System control (switches really stop bookings, payments
 * and the site; staff can still sign in), System health, Revenue per search (searches are
 * recorded once per visit; a booking with a visit id goes through), Demand forecasting (a booking
 * shows on its night), Experiments (set up, run, a visitor gets a version, results count it) and
 * Fraud & risk (review needs a note; blocking stops sign-in; unblocking restores it).
 */
import axios from 'axios';
import { expect } from 'chai';
import minimist from 'minimist';
import crypto from 'crypto';
import prisma from '../../config/db.js';
import bcrypt from '../../utils/bcrypt.js';

const argv = minimist(process.argv.slice(2));
const API = `${argv.url || process.env.E2E_URL || 'http://localhost:5000'}/api/v1`;
const api = axios.create({ baseURL: API, validateStatus: () => true });
const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });
const inDays = (n) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const retry = async (fn) => { for (let i = 0; i < 12; i += 1) { const r = await fn(); if (r.status !== 429) return r; await sleep(5000); } return fn(); };
const login = (email, password) => retry(() => api.post('/auth/login', { email, password }));

describe('Admin operations pages', function () {
  this.timeout(240000);
  let admin; let owner; let hotel; let roomType; let ratePlan; let testUser; let guest;
  const sid = `e2e-${crypto.randomUUID()}`;
  const password = `Ops!${crypto.randomUUID().slice(0, 10)}x9`;
  const sw = (key, on, reason = 'End-to-end test of the switch') => api.put(`/admin/control/${key}`, { on, reason }, admin);

  before(async () => {
    const a = await login('admin@zivoplus.com', 'admin123');
    admin = { headers: { Authorization: `Bearer ${a.data.data.token}` } };
    const o = await login('extranet@zivotechretreat.com', 'ZivoExtranet@2026');
    owner = { headers: { Authorization: `Bearer ${o.data.data.token}` } };
    hotel = await prisma.hotel.findFirst({ where: { ownerId: o.data.data.user.id, status: { in: ['LIVE', 'ACTIVE'] }, isDeleted: false } });
    roomType = await prisma.roomType.findFirst({ where: { hotelId: hotel.id, isActive: true }, include: { ratePlans: { where: { isActive: true } } } });
    ratePlan = roomType.ratePlans[0];
    const email = `ops.${Date.now()}@example.com`;
    testUser = await prisma.user.create({ data: { name: 'Ops Test Guest', email, password: await bcrypt.hash(password, 10), role: 'CUSTOMER', status: 'ACTIVE', emailVerifiedAt: new Date() } });
    const g = await login(email, password);
    expect(g.status, JSON.stringify(g.data)).to.equal(200);
    guest = { headers: { Authorization: `Bearer ${g.data.data.token}`, 'x-session-id': sid } };
  });

  after(async () => {
    for (const k of ['maintenanceMode', 'isBookingDisabled', 'isPaymentDisabled', 'dynamicPricingPaused']) await sw(k, false, 'Reset after end-to-end test').catch(() => {});
    await sw('experimentsEnabled', true, 'Reset after end-to-end test').catch(() => {});
  });

  describe('System control', () => {
    it('lists the switches and refuses a change without a reason', async () => {
      const r = await api.get('/admin/control', admin);
      expect(r.status).to.equal(200);
      expect(r.data.data.switches.map((s) => s.key)).to.include.members(['maintenanceMode', 'isBookingDisabled', 'isPaymentDisabled', 'dynamicPricingPaused', 'experimentsEnabled']);
      expect((await api.put('/admin/control/isBookingDisabled', { on: true }, admin)).status).to.equal(400);
      expect((await api.put('/admin/control/nope', { on: true, reason: 'testing it' }, admin)).status).to.equal(400);
    });

    it('is refused to hotel accounts', async () => {
      expect((await api.get('/admin/control', owner)).status).to.equal(403);
      expect((await api.put('/admin/control/maintenanceMode', { on: true, reason: 'not allowed' }, owner)).status).to.equal(403);
    });

    it('pausing bookings refuses new bookings but keeps prices visible, and is logged', async () => {
      expect((await sw('isBookingDisabled', true)).status).to.equal(200);
      try {
      const b = await api.post('/bookings', {}, guest);
      expect(b.status).to.equal(403);
      expect(b.data.code).to.equal('BOOKINGS_PAUSED');
      const p = await api.post('/bookings/preview', { hotelId: hotel.id, roomTypeId: roomType.id, ratePlanId: ratePlan.id, rooms: 1, adults: 2, children: 0, checkIn: inDays(40), checkOut: inDays(41), paymentType: 'PREPAID' });
      expect(p.status, JSON.stringify(p.data)).to.equal(200);
      const cfg = await api.get('/system/config');
      expect(cfg.data.data.isBookingDisabled).to.equal(true);
      } finally {
        expect((await sw('isBookingDisabled', false)).status).to.equal(200);
      }
      const log = await api.get('/admin/control/log', admin);
      expect(log.data.data[0]).to.include({ key: 'isBookingDisabled', on: false });
      expect(log.data.data[0].by).to.equal('admin@zivoplus.com');
    });

    it('pausing payments refuses new online payments', async () => {
      await sw('isPaymentDisabled', true);
      try {
        const r = await api.post('/payments/create-order', { bookingId: 'x' }, guest);
        expect(r.status).to.equal(403);
        expect(r.data.code).to.equal('PAYMENTS_PAUSED');
      } finally { await sw('isPaymentDisabled', false); }
    });

    it('maintenance closes the site with the message, but staff can sign in and use admin', async () => {
      await api.put('/admin/control/maintenanceMode', { on: true, reason: 'End-to-end test of maintenance', message: 'Back in ten minutes' }, admin);
      const s = await api.get(`/hotels/search?city=${encodeURIComponent(hotel.city)}&checkIn=${inDays(40)}&checkOut=${inDays(41)}`);
      expect(s.status).to.equal(503);
      expect(s.data).to.include({ code: 'MAINTENANCE', message: 'Back in ten minutes' });
      expect((await login('admin@zivoplus.com', 'admin123')).status).to.equal(200);
      expect((await api.get('/admin/health', admin)).status).to.equal(200);
      expect((await api.get('/system/config')).data.data.maintenanceMode).to.equal(true);
      await sw('maintenanceMode', false);
      expect((await api.get(`/hotels/search?city=${encodeURIComponent(hotel.city)}&checkIn=${inDays(40)}&checkOut=${inDays(41)}`)).status).to.equal(200);
    });
  });

  describe('System health', () => {
    it('reports every check with a status', async () => {
      const r = await api.get('/admin/health', admin);
      expect(r.status).to.equal(200);
      const { checks, overall } = r.data.data;
      expect(overall).to.be.oneOf(['ok', 'warn', 'down']);
      expect(checks.database.status).to.equal('ok');
      expect(checks.database.latencyMs).to.be.a('number');
      for (const k of ['redis', 'jobs', 'invoices', 'disk', 'traffic', 'processes', 'switches']) expect(checks[k].status, k).to.be.oneOf(['ok', 'warn', 'down']);
      expect(checks.traffic.requests60m).to.be.greaterThan(0);
      expect(checks.processes.list.length).to.be.greaterThan(0);
    });
  });

  describe('Revenue per search and demand forecasting', () => {
    const place = `OpsTown${Date.now() % 100000}`;
    it('records a search once per visit, including searches that find nothing', async () => {
      for (let i = 0; i < 3; i += 1) {
        const r = await api.get(`/hotels/search?city=${place}&checkIn=${inDays(40)}&checkOut=${inDays(42)}&guests=2&sort=${['PRICE_LOW', 'RATING', 'RECOMMENDED'][i]}`, { headers: { 'x-session-id': sid } });
        expect(r.status).to.equal(200);
      }
      await sleep(4500); // written in batches every few seconds
      const rows = await prisma.searchLog.findMany({ where: { place } });
      expect(rows).to.have.length(1);
      expect(rows[0]).to.include({ sessionId: sid, nights: 2, guests: 2, results: 0 });
      const r = await api.get(`/admin/insights/search-revenue?days=7&city=${place}`, admin);
      expect(r.status).to.equal(200);
      expect(r.data.data.totals.searches).to.equal(1);
      const all = await api.get('/admin/insights/search-revenue?days=7', admin);
      expect(all.data.data.zeroResults.map((z) => z.place)).to.include(place);
    });

    it('a booking made in a visit goes through and shows on its night in the forecast', async () => {
      await api.get(`/hotels/search?city=${encodeURIComponent(hotel.city)}&checkIn=${inDays(20)}&checkOut=${inDays(21)}&guests=2`, { headers: { 'x-session-id': sid } });
      const before = (await api.get(`/admin/insights/forecast?days=30&hotelId=${hotel.id}`, admin)).data.data.nights.find((n) => n.date === inDays(20));
      const b = await retry(() => api.post('/bookings', {
        hotelId: hotel.id, roomTypeId: roomType.id, ratePlanId: ratePlan.id, rooms: 1, adults: 2, children: 0, checkIn: inDays(20), checkOut: inDays(21), paymentType: 'PAY_AT_HOTEL',
        guestName: 'Ops Test Guest', guestEmail: testUser.email, guestPhone: '9876501234', roomLines: [{ roomTypeId: roomType.id, ratePlanId: ratePlan.id, adults: 2, children: 0, guestName: 'Ops Test Guest' }],
      }, guest));
      expect(b.status, JSON.stringify(b.data)).to.be.oneOf([200, 201]);
      const booking = await prisma.booking.findFirst({ where: { userId: testUser.id }, orderBy: { createdAt: 'desc' } });
      expect(booking.sessionId).to.equal(sid);
      if (booking.status !== 'CONFIRMED') await prisma.booking.update({ where: { id: booking.id }, data: { status: 'CONFIRMED' } });
      const f = await api.get(`/admin/insights/forecast?days=30&hotelId=${hotel.id}`, admin);
      expect(f.status).to.equal(200);
      expect(f.data.data.nights).to.have.length(30);
      const night = f.data.data.nights.find((n) => n.date === inDays(20));
      expect(night.booked).to.equal(before.booked + 1);
      expect(night.capacity).to.be.greaterThan(0);
      const rps = await api.get('/admin/insights/search-revenue?days=7', admin);
      expect(rps.data.data.totals.bookingsFromSearch).to.be.greaterThan(0);
      await prisma.booking.update({ where: { id: booking.id }, data: { status: 'CANCELLED', cancelledAt: new Date() } });
    });

    it('is refused to hotel accounts', async () => {
      expect((await api.get('/admin/insights/forecast', owner)).status).to.equal(403);
    });
  });

  describe('Experiments', () => {
    let exp;
    const name = `e2e_test_${Date.now() % 100000}`;
    after(async () => { if (exp) await prisma.experiment.delete({ where: { id: exp.id } }).catch(() => {}); });

    it('checks the versions add up to 100 and include control', async () => {
      expect((await api.post('/admin/experiments', { name, variants: [{ name: 'control', weight: 50 }, { name: 'b', weight: 40 }] }, admin)).status).to.equal(400);
      expect((await api.post('/admin/experiments', { name, variants: [{ name: 'a', weight: 50 }, { name: 'b', weight: 50 }] }, admin)).status).to.equal(400);
      const r = await api.post('/admin/experiments', { name, traffic: 100, variants: [{ name: 'control', weight: 0 }, { name: 'variantA', weight: 100 }] }, admin);
      expect(r.status, JSON.stringify(r.data)).to.equal(201);
      exp = r.data.data;
      expect(exp.status).to.equal('DRAFT');
    });

    it('a running test gives a visitor a version, and results count the visit and booking', async () => {
      expect((await api.patch(`/admin/experiments/${exp.id}`, { status: 'ACTIVE' }, admin)).status).to.equal(200);
      let v;
      for (let i = 0; i < 15; i += 1) { // running tests are cached for up to a minute per process
        v = await api.get('/experiments', { headers: { 'x-session-id': sid } });
        if (v.data.data?.[name]) break;
        await sleep(5000);
      }
      expect(v.data.data[name]).to.equal('variantA');
      await api.post('/analytics/track', { eventType: 'HOTEL_VIEWED', metadata: {}, hotelId: hotel.id, city: hotel.city, experiments: { [name]: 'variantA' } }, { headers: { 'x-session-id': sid } });
      await api.post('/analytics/track', { eventType: 'BOOKING_COMPLETED', metadata: { bookingId: 'none' }, hotelId: hotel.id, experiments: { [name]: 'variantA' } }, { headers: { 'x-session-id': sid } });
      await sleep(1500);
      const r = await api.get(`/admin/experiments/${exp.id}/results`, admin);
      expect(r.status).to.equal(200);
      const a = r.data.data.variants.find((x) => x.name === 'variantA');
      expect(a.visitors).to.equal(1);
      expect(a.viewers).to.equal(1);
      expect(a.bookings).to.equal(1);
      expect(r.data.data.verdict.text).to.match(/Too early/);
    });

    it('can\'t change versions while running; ends with a winner; only drafts can be deleted', async () => {
      expect((await api.patch(`/admin/experiments/${exp.id}`, { variants: [{ name: 'control', weight: 50 }, { name: 'variantA', weight: 50 }] }, admin)).status).to.equal(400);
      expect((await api.delete(`/admin/experiments/${exp.id}`, admin)).status).to.equal(400);
      const r = await api.patch(`/admin/experiments/${exp.id}`, { status: 'CONCLUDED', winner: 'variantA' }, admin);
      expect(r.status).to.equal(200);
      expect(r.data.data).to.include({ status: 'CONCLUDED', winner: 'variantA' });
      expect((await api.patch(`/admin/experiments/${exp.id}`, { status: 'ACTIVE' }, admin)).status).to.equal(400);
    });

    it('switching experiments off in System control turns every test off', async () => {
      await sw('experimentsEnabled', false);
      const list = await api.get('/admin/experiments', admin);
      expect(list.data.data.experimentsOn).to.equal(false);
      await sw('experimentsEnabled', true);
    });
  });

  describe('Fraud & risk', () => {
    it('lists accounts to review with reasons', async () => {
      const r = await api.get('/admin/risk?days=30', admin);
      expect(r.status).to.equal(200);
      expect(r.data.data.totals).to.have.keys(['toReview', 'high', 'blockedAccounts', 'blockedIps', 'failedPayments', 'refunds', 'refundAmount', 'suspiciousIps24h']);
      r.data.data.queue.forEach((a) => { expect(a.reasons.length).to.be.greaterThan(0); expect(a.score).to.be.within(20, 100); });
    });

    it('blocking needs a note, signs the person out and stops sign-in; unblocking restores it', async () => {
      expect((await api.post(`/admin/risk/accounts/${testUser.id}/review`, { decision: 'BLOCKED' }, admin)).status).to.equal(400);
      expect((await api.post(`/admin/risk/accounts/${testUser.id}/review`, { decision: 'BLOCKED', note: 'End-to-end test' }, admin)).status).to.equal(200);
      expect((await api.get('/bookings/my-bookings', guest)).status).to.equal(401);
      expect((await login(testUser.email, password)).status).to.equal(403);
      const d = await api.get(`/admin/risk/accounts/${testUser.id}`, admin);
      expect(d.data.data.decisions[0].decision).to.equal('BLOCKED');
      expect((await api.post(`/admin/risk/accounts/${testUser.id}/review`, { decision: 'UNBLOCKED', note: 'End-to-end test done' }, admin)).status).to.equal(200);
      expect((await login(testUser.email, password)).status).to.equal(200);
    });

    it('refuses to review staff accounts and checks internet addresses', async () => {
      const staff = await prisma.user.findFirst({ where: { email: 'admin@zivoplus.com' } });
      expect((await api.post(`/admin/risk/accounts/${staff.id}/review`, { decision: 'BLOCKED', note: 'should not work' }, admin)).status).to.equal(400);
      expect((await api.post('/admin/risk/ips', { ip: 'not an ip; drop', block: true }, admin)).status).to.equal(400);
      expect((await api.post('/admin/risk/ips', { ip: '203.0.113.77', block: true }, admin)).status).to.equal(200);
      expect((await api.post('/admin/risk/ips', { ip: '203.0.113.77', block: false }, admin)).status).to.equal(200);
    });

    it('is refused to hotel accounts', async () => {
      expect((await api.get('/admin/risk', owner)).status).to.equal(403);
    });
  });
});
