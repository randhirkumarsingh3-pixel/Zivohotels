/**
 * ZivoPlus for Business: rates agreed between a company and a hotel (ZivoPlus proposes, the hotel
 * accepts), how they price company bookings, and where the company's travellers are.
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
const retry = async (fn) => { for (let i = 0; i < 12; i += 1) { const r = await fn(); if (r.status !== 429) return r; await sleep(5000); } return fn(); };
const login = async (email, password) => ({ headers: { Authorization: `Bearer ${(await retry(() => api.post('/auth/login', { email, password }))).data.data.token}` } });
const istToday = () => new Date(Date.now() + 5.5 * 3600000).toISOString().slice(0, 10);
const inDays = (n) => { const d = new Date(`${istToday()}T00:00:00.000Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

describe('Business: agreed company rates and where travellers are', function () {
  this.timeout(180000);
  const tag = Date.now().toString().slice(-6);
  const password = `Rate!${crypto.randomUUID().slice(0, 10)}x9`;
  const as = {}; const m = {}; const email = (k) => `${k}.r${tag}@example.com`;
  let admin; let hotelSide; let org; let hotel; let room; let saved = {}; let percentRate; let fixedRate;
  const stay = (n, nights = 1, extra = {}) => ({ hotelId: hotel.id, checkIn: inDays(n), checkOut: inDays(n + nights), roomLines: [{ roomTypeId: room.id, ratePlanId: room.ratePlans[0].id, adults: 1 }], guestPhone: '9810012345', ...extra });
  const quote = async (n, nights = 1) => { const r = await api.post(`/business/${org.id}/quote`, stay(n, nights), as.admin); expect(r.status, JSON.stringify(r.data)).to.equal(200); return r.data.data; };

  before(async () => {
    admin = await login('admin@zivoplus.com', 'admin123');
    saved.settings = await prisma.systemConfig.findUnique({ where: { key: 'business_settings' } });
    await api.put('/admin/business-settings', { corporate: { enabled: true, holdHours: 24, requireAgreement: false } }, admin);
    const users = {};
    for (const [k, name] of [['admin', 'Ritu Menon'], ['traveller', 'Arjun Nair']]) users[k] = await prisma.user.create({ data: { name, email: email(k), password: await bcrypt.hash(password, 10), role: 'CUSTOMER', status: 'ACTIVE', emailVerifiedAt: new Date() } });
    org = await prisma.organisation.create({ data: { kind: 'CORPORATE', code: `ZB-R${tag}`, name: `Orbit Labs ${tag}`, legalName: `Orbit Labs Private Limited ${tag}`, incorporationType: 'PVT_LTD', pan: `AABCO${tag.slice(2)}K`, gstin: `29AABCO${tag.slice(2)}K1Z5`, address: '2 MG Road', city: 'Bengaluru', state: 'Karnataka', pincode: '560001', billingEmail: `ap.r${tag}@example.com`, phone: '9845011133', status: 'ACTIVE', createdById: users.admin.id } });
    m.admin = await prisma.orgMember.create({ data: { organisationId: org.id, userId: users.admin.id, role: 'ADMIN' } });
    m.traveller = await prisma.orgMember.create({ data: { organisationId: org.id, userId: users.traveller.id, role: 'TRAVELLER', costCenter: 'Field Sales' } });
    as.admin = await login(email('admin'), password);
    as.traveller = await login(email('traveller'), password);
    const hotels = await prisma.hotel.findMany({ where: { status: { in: ['LIVE', 'ACTIVE'] }, isDeleted: false }, include: { roomTypes: { where: { isActive: { not: false } }, include: { ratePlans: { where: { isActive: true, basePrice: { gt: 0 } } } } } } });
    hotel = hotels.find((h) => h.roomTypes.some((rt) => rt.ratePlans.length));
    room = hotel.roomTypes.find((rt) => rt.ratePlans.length);
    saved.rate = await prisma.hotelBusinessRate.findUnique({ where: { hotelId: hotel.id } });
    await prisma.hotelBusinessRate.upsert({ where: { hotelId: hotel.id }, update: { corporateEnabled: true, corporateDiscountPct: 5 }, create: { hotelId: hotel.id, corporateEnabled: true, corporateDiscountPct: 5 } });
    // The hotel's owner answers proposals in the extranet (a test password, put back afterwards)
    const owner = await prisma.user.findUnique({ where: { id: hotel.ownerId } });
    saved.owner = { id: owner.id, password: owner.password };
    await prisma.user.update({ where: { id: owner.id }, data: { password: await bcrypt.hash(password, 10) } });
    hotelSide = await login(owner.email, password);
    await api.post(`/admin/organisations/${org.id}/ledger`, { type: 'PAYMENT', amount: 300000, note: 'NEFT UTR 5566778899', reference: `UTR-R${tag}` }, admin);
  });

  after(async () => {
    await prisma.user.update({ where: { id: saved.owner.id }, data: { password: saved.owner.password } }).catch(() => {});
    if (saved.settings) await prisma.systemConfig.update({ where: { key: 'business_settings' }, data: { value: saved.settings.value } }).catch(() => {});
    else await prisma.systemConfig.deleteMany({ where: { key: 'business_settings' } }).catch(() => {});
    if (saved.rate) await prisma.hotelBusinessRate.update({ where: { hotelId: hotel.id }, data: { corporateEnabled: saved.rate.corporateEnabled, corporateDiscountPct: saved.rate.corporateDiscountPct } }).catch(() => {});
    else await prisma.hotelBusinessRate.deleteMany({ where: { hotelId: hotel.id } }).catch(() => {});
  });

  it('checks a proposal, and it does nothing until the hotel accepts', async () => {
    const base = { hotelId: hotel.id, validFrom: inDays(0), validTo: inDays(60) };
    const bad = [
      [{ ...base, kind: 'FIXED', value: 2000 }, /one room type/],
      [{ ...base, kind: 'PERCENT', value: 0 }, /between 1% and 60%/],
      [{ ...base, kind: 'PERCENT', value: 10, validTo: inDays(-1) }, /end date|already have ended/],
      [{ ...base, kind: 'PERCENT', value: 10, validTo: inDays(900) }, /two years/],
    ];
    for (const [body, msg] of bad) {
      const r = await api.post(`/admin/organisations/${org.id}/rates`, body, admin);
      expect(r.status, JSON.stringify(body)).to.equal(400);
      expect(r.data.message).to.match(msg);
    }
    const r = await api.post(`/admin/organisations/${org.id}/rates`, { ...base, kind: 'PERCENT', value: 20, notes: 'Annual deal' }, admin);
    expect(r.status, JSON.stringify(r.data)).to.equal(200);
    percentRate = r.data.data;
    expect(percentRate).to.include({ status: 'PROPOSED', kind: 'PERCENT', value: 20, label: '20% off all rooms' });
    const again = await api.post(`/admin/organisations/${org.id}/rates`, { ...base, kind: 'PERCENT', value: 25, validFrom: inDays(10) }, admin);
    expect(again.status).to.equal(409);
    // Only the general 5% while it waits
    const q = await quote(5);
    expect(q.business.agreedRate).to.equal(undefined);
    expect(q.price.discount).to.equal(Math.round(q.price.roomCharges * 0.05));
    const n = await prisma.notification.count({ where: { hotelId: hotel.id, type: 'CORPORATE_RATE_PROPOSED' } });
    expect(n).to.be.greaterThan(0);
  });

  it('the hotel accepts in the extranet, and company bookings get the agreed rate', async () => {
    const list = await api.get(`/extranet/business-rates/${hotel.id}/contracts`, hotelSide);
    expect(list.status).to.equal(200);
    expect(list.data.data.map((x) => x.id)).to.include(percentRate.id);
    const noNote = await api.post(`/extranet/business-rates/${hotel.id}/contracts/${percentRate.id}/decision`, { decision: 'DECLINE' }, hotelSide);
    expect(noNote.status).to.equal(400);
    const ok = await api.post(`/extranet/business-rates/${hotel.id}/contracts/${percentRate.id}/decision`, { decision: 'ACCEPT' }, hotelSide);
    expect(ok.status, JSON.stringify(ok.data)).to.equal(200);
    expect(ok.data.data.status).to.equal('ACTIVE');
    const twice = await api.post(`/extranet/business-rates/${hotel.id}/contracts/${percentRate.id}/decision`, { decision: 'ACCEPT' }, hotelSide);
    expect(twice.status).to.equal(409);

    const q = await quote(5);
    expect(q.price.discount).to.equal(Math.round(q.price.roomCharges * 0.2));
    expect(q.business.agreedRate.rateIds).to.deep.equal([percentRate.id]);
    expect(q.offer.agreedRates.map((x) => x.label)).to.deep.equal(['20% off all rooms']);
    // Outside the dates: the general discount; partly inside: each night its own
    const later = await quote(70);
    expect(later.business.agreedRate).to.equal(undefined);
    expect(later.price.discount).to.equal(Math.round(later.price.roomCharges * 0.05));
    const across = await quote(60, 2);
    expect(across.price.discount).to.equal(Math.round(across.price.roomCharges * 0.5 * 0.2) + Math.round(across.price.roomCharges * 0.5 * 0.05));

    const mine = await api.get(`/business/${org.id}/agreed-rates`, as.traveller);
    expect(mine.data.data.map((x) => x.id)).to.deep.equal([percentRate.id]);
    const rates = await api.get(`/business/${org.id}/rates?hotelIds=${hotel.id}`, as.admin);
    expect(rates.data.data[0].agreedRates.map((x) => x.id)).to.include(percentRate.id);
  });

  it('a fixed rate per night for one room type, whichever is better for the company', async () => {
    const q0 = await quote(8);
    const perNight = Math.round(q0.price.roomCharges);
    const r = await api.post(`/admin/organisations/${org.id}/rates`, { hotelId: hotel.id, roomTypeId: room.id, kind: 'FIXED', value: Math.max(300, perNight - Math.round(perNight * 0.4)), validFrom: inDays(0), validTo: inDays(30) }, admin);
    expect(r.status, JSON.stringify(r.data)).to.equal(200);
    fixedRate = r.data.data;
    expect(fixedRate.roomTypeName).to.equal(room.name);
    await api.post(`/extranet/business-rates/${hotel.id}/contracts/${fixedRate.id}/decision`, { decision: 'ACCEPT' }, hotelSide);
    const q = await quote(8);
    expect(q.business.agreedRate.rateIds).to.deep.equal([fixedRate.id]);
    expect(q.price.discount).to.be.greaterThan(Math.round(q.price.roomCharges * 0.2));

    // Booked at that price, paid from the account, the rate kept on the booking
    const b = await api.post(`/business/${org.id}/bookings`, stay(8), as.admin);
    expect(b.status, JSON.stringify(b.data)).to.equal(201);
    expect(b.data.data.status).to.equal('CONFIRMED');
    expect(b.data.data.total).to.equal(q.price.total);
    expect(b.data.data.business.agreedRate.rateIds).to.deep.equal([fixedRate.id]);
  });

  it('ZivoPlus ends a rate and the general discount applies again', async () => {
    const noNote = await api.post(`/admin/organisations/${org.id}/rates/${fixedRate.id}/end`, {}, admin);
    expect(noNote.status).to.equal(400);
    const end = await api.post(`/admin/organisations/${org.id}/rates/${fixedRate.id}/end`, { note: 'Hotel renovation' }, admin);
    expect(end.data.data.status).to.equal('ENDED');
    const q = await quote(8);
    expect(q.business.agreedRate.rateIds).to.deep.equal([percentRate.id]);
    const all = await api.get(`/admin/organisations/${org.id}/rates`, admin);
    expect(all.data.data.map((x) => x.status).sort()).to.deep.equal(['ACTIVE', 'ENDED']);
  });

  it('shows where travellers are: staying now, arriving and checked out, by city, and as CSV', async () => {
    const today = await api.post(`/business/${org.id}/bookings`, stay(0, 2, { travellerMemberId: m.traveller.id }), as.admin);
    expect(today.status, JSON.stringify(today.data)).to.equal(201);
    const past = await api.post(`/business/${org.id}/bookings`, stay(3, 1, { travellerMemberId: m.traveller.id }), as.admin);
    // Make one a stay that ended two days ago
    await prisma.booking.update({ where: { id: past.data.data.id }, data: { checkIn: new Date(`${inDays(-3)}T00:00:00.000Z`), checkOut: new Date(`${inDays(-2)}T00:00:00.000Z`), status: 'COMPLETED' } });

    const denied = await api.get(`/business/${org.id}/travellers`, as.traveller);
    expect(denied.status).to.equal(403);
    const r = await api.get(`/business/${org.id}/travellers?days=14`, as.admin);
    expect(r.status, JSON.stringify(r.data)).to.equal(200);
    const t = r.data.data;
    expect(t.staying.map((x) => x.bookingRef)).to.deep.equal([today.data.data.bookingRef]);
    expect(t.staying[0].traveller).to.include({ name: 'Arjun Nair', costCenter: 'Field Sales' });
    expect(t.staying[0].hotel.name).to.equal(hotel.name);
    expect(t.arriving.length).to.be.greaterThan(0);
    expect(t.recent.map((x) => x.bookingRef)).to.deep.equal([past.data.data.bookingRef]);
    expect(t.byCity).to.deep.equal([{ city: hotel.city, count: 1 }]);
    const other = await api.get(`/business/${org.id}/travellers?city=Nowhere`, as.admin);
    expect(other.data.data.staying).to.deep.equal([]);

    // Raw bytes: the file starts with the UTF-8 byte order mark so Excel reads names correctly
    const csv = await api.get(`/business/${org.id}/travellers.csv?days=14`, { ...as.admin, responseType: 'arraybuffer' });
    expect(csv.status).to.equal(200);
    expect(csv.headers['content-type']).to.match(/text\/csv/);
    const bytes = Buffer.from(csv.data);
    expect([...bytes.subarray(0, 3)]).to.deep.equal([0xef, 0xbb, 0xbf]);
    csv.data = bytes.toString('utf8');
    expect(csv.data).to.include('Staying now,Arjun Nair').and.include(today.data.data.bookingRef);
  });
});
