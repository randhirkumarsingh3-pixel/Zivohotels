/**
 * Group stays (ZivoPlus for Business / Partner Hub): the travel desk asks for 9 to 60 rooms, the
 * hotel quotes a rate per room type (or declines), the desk books it from the account, then fills
 * in the rooming list.
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

describe('Business: group stays (request, hotel quote, booking, rooming list)', function () {
  this.timeout(180000);
  const tag = Date.now().toString().slice(-6);
  const password = `Grp!${crypto.randomUUID().slice(0, 10)}x9`;
  const as = {}; const email = (k) => `${k}.g${tag}@example.com`;
  let admin; let hotelSide; let org; let hotel; let std; let suite; let saved = {}; let request; let booking;

  before(async () => {
    admin = await login('admin@zivoplus.com', 'admin123');
    saved.settings = await prisma.systemConfig.findUnique({ where: { key: 'business_settings' } });
    await api.put('/admin/business-settings', { corporate: { enabled: true, holdHours: 24, requireAgreement: false } }, admin);
    const users = {};
    for (const [k, name] of [['desk', 'Kavya Reddy'], ['traveller', 'Ishaan Gupta']]) users[k] = await prisma.user.create({ data: { name, email: email(k), password: await bcrypt.hash(password, 10), role: 'CUSTOMER', status: 'ACTIVE', emailVerifiedAt: new Date() } });
    org = await prisma.organisation.create({ data: { kind: 'CORPORATE', code: `ZB-G${tag}`, name: `Vertex Systems ${tag}`, legalName: `Vertex Systems Private Limited ${tag}`, incorporationType: 'PVT_LTD', pan: `AABCV${tag.slice(2)}K`, gstin: `29AABCV${tag.slice(2)}K1Z5`, address: '5 Residency Road', city: 'Bengaluru', state: 'Karnataka', pincode: '560025', billingEmail: `ap.g${tag}@example.com`, phone: '9845011144', status: 'ACTIVE', createdById: users.desk.id } });
    await prisma.orgMember.create({ data: { organisationId: org.id, userId: users.desk.id, role: 'BOOKER' } });
    await prisma.orgMember.create({ data: { organisationId: org.id, userId: users.traveller.id, role: 'TRAVELLER' } });
    as.desk = await login(email('desk'), password);
    as.traveller = await login(email('traveller'), password);
    // A hotel with enough rooms: two room types, 9+ rooms between them
    const hotels = await prisma.hotel.findMany({ where: { status: { in: ['LIVE', 'ACTIVE'] }, isDeleted: false }, include: { roomTypes: { where: { isActive: true }, include: { ratePlans: { where: { isActive: true, basePrice: { gt: 0 } } } } } } });
    hotel = hotels.find((h) => h.roomTypes.filter((rt) => rt.ratePlans.length).reduce((t, rt) => t + rt.totalInventory, 0) >= 12);
    [std, suite] = [...hotel.roomTypes].filter((rt) => rt.ratePlans.length).sort((a, b) => b.totalInventory - a.totalInventory);
    const owner = await prisma.user.findUnique({ where: { id: hotel.ownerId } });
    saved.owner = { id: owner.id, password: owner.password };
    await prisma.user.update({ where: { id: owner.id }, data: { password: await bcrypt.hash(password, 10) } });
    hotelSide = await login(owner.email, password);
    await api.post(`/admin/organisations/${org.id}/ledger`, { type: 'PAYMENT', amount: 1000000, note: 'NEFT UTR 1122334455', reference: `UTR-G${tag}` }, admin);
  });

  after(async () => {
    await prisma.user.update({ where: { id: saved.owner.id }, data: { password: saved.owner.password } }).catch(() => {});
    if (saved.settings) await prisma.systemConfig.update({ where: { key: 'business_settings' }, data: { value: saved.settings.value } }).catch(() => {});
    else await prisma.systemConfig.deleteMany({ where: { key: 'business_settings' } }).catch(() => {});
  });

  const ask = (lines, extra = {}) => api.post(`/business/${org.id}/groups`, { hotelId: hotel.id, checkIn: inDays(50), checkOut: inDays(52), lines, purpose: 'Sales kickoff', notes: 'Need a meeting room for 40', ...extra }, as.desk);

  it('checks a request: size, dates, guests per room, who may ask', async () => {
    const few = await ask([{ roomTypeId: std.id, rooms: 4, adults: 2 }]);
    expect(few.status).to.equal(400); expect(few.data.message).to.match(/9 rooms or more/);
    const many = await ask([{ roomTypeId: std.id, rooms: 61, adults: 1 }]);
    expect(many.data.message).to.match(/up to 60/);
    const crowd = await ask([{ roomTypeId: std.id, rooms: 10, adults: (std.maxOccupancy || 2) + 1 }]);
    expect(crowd.data.message).to.match(/guests per room/);
    const today = await ask([{ roomTypeId: std.id, rooms: 10, adults: 1 }], { checkIn: istToday(), checkOut: inDays(1) });
    expect(today.data.message).to.match(/from tomorrow/);
    const trav = await api.post(`/business/${org.id}/groups`, { hotelId: hotel.id, checkIn: inDays(50), checkOut: inDays(52), lines: [{ roomTypeId: std.id, rooms: 10, adults: 1 }], purpose: 'x x x' }, as.traveller);
    expect(trav.status).to.equal(403);
    const hotels = await api.get(`/business/${org.id}/groups/hotels?q=${encodeURIComponent(hotel.name)}`, as.desk);
    expect(hotels.data.data.map((h) => h.id)).to.include(hotel.id);
  });

  it('the desk asks; the hotel sees it and quotes a rate per room type', async () => {
    const stdRooms = Math.min(std.totalInventory, 7); const suiteRooms = 10 - stdRooms;
    const r = await ask([{ roomTypeId: std.id, rooms: stdRooms, adults: 2 }, { roomTypeId: suite.id, rooms: suiteRooms, adults: 2 }]);
    expect(r.status, JSON.stringify(r.data)).to.equal(201);
    request = r.data.data;
    expect(request).to.include({ status: 'SUBMITTED', rooms: 10, nights: 2 });
    expect(await prisma.notification.count({ where: { hotelId: hotel.id, type: 'GROUP_REQUEST' } })).to.be.greaterThan(0);

    const list = await api.get(`/extranet/business-rates/${hotel.id}/groups`, hotelSide);
    const mine = list.data.data.find((x) => x.id === request.id);
    expect(mine.organisation.name).to.equal(org.name);
    expect(mine.ratePlans[std.id].map((p) => p.id)).to.include(std.ratePlans[0].id);

    const missing = await api.post(`/extranet/business-rates/${hotel.id}/groups/${request.id}/quote`, { lines: [{ roomTypeId: std.id, ratePlanId: std.ratePlans[0].id, nightlyRate: 3000 }], validUntil: inDays(10) }, hotelSide);
    expect(missing.status).to.equal(400); expect(missing.data.message).to.match(/Quote a rate for/);
    const late = await api.post(`/extranet/business-rates/${hotel.id}/groups/${request.id}/quote`, { lines: [{ roomTypeId: std.id, ratePlanId: std.ratePlans[0].id, nightlyRate: 3000 }, { roomTypeId: suite.id, ratePlanId: suite.ratePlans[0].id, nightlyRate: 4000 }], validUntil: inDays(60) }, hotelSide);
    expect(late.data.message).to.match(/before check-in/);
    const q = await api.post(`/extranet/business-rates/${hotel.id}/groups/${request.id}/quote`, { lines: [{ roomTypeId: std.id, ratePlanId: std.ratePlans[0].id, nightlyRate: 3000 }, { roomTypeId: suite.id, ratePlanId: suite.ratePlans[0].id, nightlyRate: 4000 }], validUntil: inDays(10), note: 'Meeting room included' }, hotelSide);
    expect(q.status, JSON.stringify(q.data)).to.equal(200);
    expect(q.data.data.status).to.equal('QUOTED');
    expect(q.data.data.quote.total).to.equal((3000 * stdRooms + 4000 * suiteRooms) * 2);
  });

  it('the desk sees the exact price, a traveller cannot book it, the desk books and pays', async () => {
    const mine = await api.get(`/business/${org.id}/groups`, as.desk);
    expect(mine.data.data.requests.find((x) => x.id === request.id).quote.note).to.equal('Meeting room included');
    const p = await api.get(`/business/${org.id}/groups/${request.id}/price`, as.desk);
    expect(p.status, JSON.stringify(p.data)).to.equal(200);
    const quoted = request.rooms && (await api.get(`/business/${org.id}/groups`, as.desk)).data.data.requests.find((x) => x.id === request.id).quote.total;
    expect(p.data.data.price.beforeTax).to.equal(Math.min(quoted, p.data.data.price.roomCharges));
    expect(p.data.data.canPayNow).to.equal(true);

    const trav = await api.post(`/business/${org.id}/groups/${request.id}/accept`, { leadName: 'Kavya Reddy', leadPhone: '9845011144' }, as.traveller);
    expect(trav.status).to.equal(403);
    const noLead = await api.post(`/business/${org.id}/groups/${request.id}/accept`, {}, as.desk);
    expect(noLead.status).to.equal(400);
    const ok = await api.post(`/business/${org.id}/groups/${request.id}/accept`, { leadName: 'Kavya Reddy', leadPhone: '9845011144' }, as.desk);
    expect(ok.status, JSON.stringify(ok.data)).to.equal(201);
    booking = ok.data.data.booking;
    expect(booking.status).to.equal('CONFIRMED');
    expect(booking.rooms).to.equal(10);
    expect(booking.total).to.equal(p.data.data.price.total);
    expect(booking.business).to.include({ model: 'GROUP', groupRequestId: request.id });
    expect(ok.data.data.request).to.include({ status: 'ACCEPTED', bookingId: booking.id });
    const again = await api.post(`/business/${org.id}/groups/${request.id}/accept`, { leadName: 'Kavya Reddy', leadPhone: '9845011144' }, as.desk);
    expect(again.status).to.equal(409);
    const entry = await prisma.orgLedgerEntry.findFirst({ where: { organisationId: org.id, type: 'BOOKING', bookingId: booking.id } });
    expect(Number(entry.amount)).to.equal(-booking.total);
  });

  it('fills in the rooming list; the hotel sees the names', async () => {
    const r = await api.get(`/business/${org.id}/bookings/${booking.id}/rooming-list`, as.desk);
    expect(r.data.data.rooms).to.have.length(10);
    expect(r.data.data.editable).to.equal(true);
    const blank = await api.put(`/business/${org.id}/bookings/${booking.id}/rooming-list`, { rooms: [{ roomNumber: 2, guestName: ' ' }] }, as.desk);
    expect(blank.status).to.equal(400);
    const names = r.data.data.rooms.map((x) => ({ roomNumber: x.roomNumber, guestName: `Guest ${x.roomNumber} Sharma` }));
    const s = await api.put(`/business/${org.id}/bookings/${booking.id}/rooming-list`, { rooms: names }, as.desk);
    expect(s.status, JSON.stringify(s.data)).to.equal(200);
    expect(s.data.data.changed).to.equal(10);
    const rows = await prisma.bookingRoom.findMany({ where: { bookingId: booking.id }, orderBy: { roomNumber: 'asc' } });
    expect(rows.map((x) => x.guestName)).to.deep.equal(names.map((x) => x.guestName));
    expect(await prisma.notification.count({ where: { hotelId: hotel.id, type: 'ROOMING_LIST_UPDATED' } })).to.be.greaterThan(0);
  });

  it('the hotel declines another request with a reason; the desk cancels one', async () => {
    const r1 = (await ask([{ roomTypeId: std.id, rooms: 9, adults: 1 }], { checkIn: inDays(80), checkOut: inDays(81) })).data.data;
    const noNote = await api.post(`/extranet/business-rates/${hotel.id}/groups/${r1.id}/decline`, {}, hotelSide);
    expect(noNote.status).to.equal(400);
    const d = await api.post(`/extranet/business-rates/${hotel.id}/groups/${r1.id}/decline`, { note: 'Fully booked for a wedding' }, hotelSide);
    expect(d.data.data).to.include({ status: 'DECLINED', declineNote: 'Fully booked for a wedding' });
    const r2 = (await ask([{ roomTypeId: std.id, rooms: 9, adults: 1 }], { checkIn: inDays(90), checkOut: inDays(91) })).data.data;
    const c = await api.post(`/business/${org.id}/groups/${r2.id}/cancel`, {}, as.desk);
    expect(c.data.data.status).to.equal('CANCELLED');
    const q = await api.post(`/extranet/business-rates/${hotel.id}/groups/${r2.id}/quote`, { lines: [{ roomTypeId: std.id, ratePlanId: std.ratePlans[0].id, nightlyRate: 3000 }], validUntil: inDays(10) }, hotelSide);
    expect(q.status).to.equal(409);
  });

  it('a quote for more rooms than the hotel has free cannot be booked, and stays open', async () => {
    const r = (await ask([{ roomTypeId: std.id, rooms: std.totalInventory + 1, adults: 1 }], { checkIn: inDays(100), checkOut: inDays(101) })).data.data;
    await api.post(`/extranet/business-rates/${hotel.id}/groups/${r.id}/quote`, { lines: [{ roomTypeId: std.id, ratePlanId: std.ratePlans[0].id, nightlyRate: 2500 }], validUntil: inDays(20) }, hotelSide);
    const b = await api.post(`/business/${org.id}/groups/${r.id}/accept`, { leadName: 'Kavya Reddy', leadPhone: '9845011144' }, as.desk);
    expect(b.status).to.be.within(400, 499);
    const after = await prisma.groupRequest.findUnique({ where: { id: r.id } });
    expect(after.status).to.equal('QUOTED');
  });
});
