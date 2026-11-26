/**
 * ZivoPlus for Business, managed travel: employee import, trip requests for the travel desk,
 * approvals in steps (manager, then finance above an amount) and stand-in approvers.
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
const ymd = (d) => d.toISOString().slice(0, 10);
const inDays = (n) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + n); return ymd(d); };

describe('Business: employee import, trip requests, approval steps, stand-ins', function () {
  this.timeout(180000);
  const tag = Date.now().toString().slice(-6);
  const password = `Desk!${crypto.randomUUID().slice(0, 10)}x9`;
  const as = {}; const m = {}; const email = (k) => `${k}.${tag}@example.com`;
  let org; let hotel; let room; let saved = {};
  const stay = (n, extra = {}) => ({ hotelId: hotel.id, checkIn: inDays(n), checkOut: inDays(n + 1), roomLines: [{ roomTypeId: room.id, ratePlanId: room.ratePlans[0].id, adults: 1 }], guestPhone: '9810012345', ...extra });

  before(async () => {
    const admin = await login('admin@zivoplus.com', 'admin123');
    saved = { settings: await prisma.systemConfig.findUnique({ where: { key: 'business_settings' } }) };
    await api.put('/admin/business-settings', { corporate: { enabled: true, holdHours: 24, requireAgreement: false } }, admin);
    const people = { admin: ['Ira Bose', 'ADMIN'], desk: ['Dev Sharma', 'BOOKER'], traveller: ['Tanvi Rao', 'TRAVELLER'], manager: ['Manoj Pillai', 'APPROVER'], finance: ['Farida Ali', 'FINANCE'], standin: ['Kabir Das', 'APPROVER'] };
    const users = {};
    for (const [k, [name]] of Object.entries(people)) users[k] = await prisma.user.create({ data: { name, email: email(k), password: await bcrypt.hash(password, 10), role: 'CUSTOMER', status: 'ACTIVE', emailVerifiedAt: new Date() } });
    org = await prisma.organisation.create({ data: { kind: 'CORPORATE', code: `ZB-D${tag}`, name: `Nimbus Corp ${tag}`, legalName: `Nimbus Corp Private Limited ${tag}`, incorporationType: 'PVT_LTD', pan: `AABCN${tag.slice(2)}K`, gstin: `29AABCN${tag.slice(2)}K1Z5`, address: '8 Lavelle Road', city: 'Bengaluru', state: 'Karnataka', pincode: '560001', billingEmail: `ap.${tag}@example.com`, phone: '9845011122', status: 'ACTIVE', createdById: users.admin.id } });
    for (const [k, [, role]] of Object.entries(people)) m[k] = await prisma.orgMember.create({ data: { organisationId: org.id, userId: users[k].id, role } });
    for (const k of Object.keys(people)) as[k] = await login(email(k), password);
    const hotels = await prisma.hotel.findMany({ where: { status: { in: ['LIVE', 'ACTIVE'] }, isDeleted: false }, include: { roomTypes: { where: { isActive: { not: false } }, include: { ratePlans: { where: { isActive: true, basePrice: { gt: 0 } } } } } } });
    hotel = hotels.find((h) => h.roomTypes.some((rt) => rt.ratePlans.length));
    room = hotel.roomTypes.find((rt) => rt.ratePlans.length);
    saved.rate = await prisma.hotelBusinessRate.findUnique({ where: { hotelId: hotel.id } });
    await prisma.hotelBusinessRate.upsert({ where: { hotelId: hotel.id }, update: { corporateEnabled: true, corporateDiscountPct: 5 }, create: { hotelId: hotel.id, corporateEnabled: true, corporateDiscountPct: 5 } });
    await api.post(`/admin/organisations/${org.id}/ledger`, { type: 'PAYMENT', amount: 300000, note: 'NEFT UTR 9988776655', reference: `UTR-D${tag}` }, admin);
    // Policy: everyone over the cap needs the manager; anything over ₹1,000 also finance
    const q = (await api.post(`/business/${org.id}/quote`, stay(30), as.admin)).data.data;
    const cap = Math.round(q.price.beforeTax) - 100;
    const p = await api.put(`/business/${org.id}/policy`, { enabled: true, approval: 'OUT_OF_POLICY', requireReason: false, metroCities: [hotel.city], financeApprovalAbove: 1000, grades: [{ key: 'STANDARD', name: 'Standard', capMetro: cap, capOther: cap }] }, as.admin);
    expect(p.status, JSON.stringify(p.data)).to.equal(200);
    await api.patch(`/business/${org.id}/members/${m.traveller.id}`, { approverMemberId: m.manager.id }, as.admin);
  });

  after(async () => {
    if (saved.settings) await prisma.systemConfig.update({ where: { key: 'business_settings' }, data: { value: saved.settings.value } }).catch(() => {});
    else await prisma.systemConfig.deleteMany({ where: { key: 'business_settings' } }).catch(() => {});
    if (saved.rate) await prisma.hotelBusinessRate.update({ where: { hotelId: hotel.id }, data: { corporateEnabled: saved.rate.corporateEnabled, corporateDiscountPct: saved.rate.corporateDiscountPct } }).catch(() => {});
    else await prisma.hotelBusinessRate.deleteMany({ where: { hotelId: hotel.id } }).catch(() => {});
  });

  it('imports employees from CSV: preview with row errors, then invites and updates', async () => {
    const bad = `name,email,role,grade,approver_email,cost_centre\nNew Person,new.${tag}@example.com,PILOT,STANDARD,${email('manager')},Ops\nNo Email,,TRAVELLER,,,\nTanvi Rao,${email('traveller')},TRAVELLER,GOLD,,Sales\nGhost,ghost.${tag}@example.com,TRAVELLER,,nobody.${tag}@example.com,`;
    expect((await api.post(`/business/${org.id}/members/import`, { csv: bad }, as.traveller)).status).to.equal(403);
    const pv = (await api.post(`/business/${org.id}/members/import`, { csv: bad }, as.admin)).data.data;
    expect(pv.preview).to.equal(true);
    expect(pv.summary.errors).to.equal(4);
    expect(pv.rows[0].errors.join(' ')).to.match(/role must be/);
    expect(pv.rows[2].errors.join(' ')).to.match(/grade "GOLD"/);
    expect(pv.rows[3].errors.join(' ')).to.match(/approver_email/);
    expect((await api.post(`/business/${org.id}/members/import`, { csv: bad, commit: true }, as.admin)).status).to.equal(400);
    const good = `Name,Email,Role,Grade,Approver Email,Cost Centre\n"Rao, Nikhil",nikhil.${tag}@example.com,traveller,STANDARD,${email('manager')},Ops\nTanvi Rao,${email('traveller')},TRAVELLER,STANDARD,${email('manager')},"Sales, South"`;
    const ok = await api.post(`/business/${org.id}/members/import`, { csv: good, commit: true }, as.admin);
    expect(ok.status, JSON.stringify(ok.data)).to.equal(200);
    expect(ok.data.data.summary).to.deep.equal({ invite: 1, update: 1, errors: 0 });
    const list = (await api.get(`/business/${org.id}/members`, as.admin)).data.data;
    const nik = list.find((x) => x.user.email === `nikhil.${tag}@example.com`);
    expect(nik).to.include({ role: 'TRAVELLER', grade: 'STANDARD', costCenter: 'Ops', approverMemberId: m.manager.id });
    expect(nik.user.name).to.equal('Rao, Nikhil');
    expect(list.find((x) => x.id === m.traveller.id)).to.include({ costCenter: 'Sales, South' });
  });

  let trip;
  it('trip requests: the traveller asks, the travel desk books it (linked) or declines', async () => {
    expect((await api.post(`/business/${org.id}/trips`, { city: 'Pune', checkIn: inDays(40), checkOut: inDays(41), purpose: '' }, as.traveller)).status).to.equal(400);
    expect((await api.post(`/business/${org.id}/trips`, { city: 'Pune', checkIn: inDays(40), checkOut: inDays(41), purpose: 'Visit', travellerMemberId: m.finance.id }, as.traveller)).status).to.equal(403);
    const r = await api.post(`/business/${org.id}/trips`, { city: hotel.city, checkIn: inDays(40), checkOut: inDays(41), purpose: 'Client workshop', notes: 'Near the office' }, as.traveller);
    expect(r.status, JSON.stringify(r.data)).to.equal(201);
    trip = r.data.data;
    expect(trip).to.include({ status: 'SUBMITTED', traveller: 'Tanvi Rao', requester: 'Tanvi Rao' });
    const desk = (await api.get(`/business/${org.id}/trips`, { ...as.desk, params: { status: 'SUBMITTED' } })).data.data;
    expect(desk.desk).to.equal(true);
    expect(desk.trips.map((t) => t.id)).to.include(trip.id);
    expect((await api.get(`/business/${org.id}/trips`, as.finance)).data.data.trips.map((t) => t.id)).not.to.include(trip.id);
    expect((await api.post(`/business/${org.id}/trips/${trip.id}/decline`, { note: 'No' }, as.traveller)).status).to.equal(403);
    // Booking it for someone else is refused; for its traveller it links the booking
    expect((await api.post(`/business/${org.id}/bookings`, stay(40, { tripRequestId: trip.id, travellerMemberId: m.finance.id }), as.desk)).status).to.equal(400);
    const b = await api.post(`/business/${org.id}/bookings`, stay(40, { tripRequestId: trip.id, travellerMemberId: m.traveller.id }), as.desk);
    expect(b.status, JSON.stringify(b.data)).to.equal(201);
    expect(b.data.data.business).to.include({ tripRequestId: trip.id, tripPurpose: 'Client workshop' });
    const after = (await api.get(`/business/${org.id}/trips`, as.traveller)).data.data.trips.find((t) => t.id === trip.id);
    expect(after).to.include({ status: 'BOOKED', bookingId: b.data.data.id, handledBy: 'Dev Sharma' });
    expect((await api.post(`/business/${org.id}/bookings`, stay(40, { tripRequestId: trip.id, travellerMemberId: m.traveller.id }), as.desk)).status).to.equal(409);
    const t2 = (await api.post(`/business/${org.id}/trips`, { city: 'Goa', checkIn: inDays(45), checkOut: inDays(47), purpose: 'Offsite' }, as.traveller)).data.data;
    const d = await api.post(`/business/${org.id}/trips/${t2.id}/decline`, { note: 'Offsite moved online' }, as.desk);
    expect(d.data.data).to.include({ status: 'DECLINED', handlerNote: 'Offsite moved online' });
    const t3 = (await api.post(`/business/${org.id}/trips`, { city: 'Delhi', checkIn: inDays(50), checkOut: inDays(51), purpose: 'Audit' }, as.traveller)).data.data;
    expect((await api.post(`/business/${org.id}/trips/${t3.id}/cancel`, {}, as.finance)).status).to.equal(403);
    expect((await api.post(`/business/${org.id}/trips/${t3.id}/cancel`, {}, as.traveller)).data.data.status).to.equal('CANCELLED');
  });

  it('approval in steps: the manager, then finance; each only at their step', async () => {
    const q = (await api.post(`/business/${org.id}/quote`, stay(55), as.traveller)).data.data;
    expect(q.approvalSteps).to.deep.equal(['Manager', 'Finance']);
    const r = await api.post(`/business/${org.id}/bookings`, stay(55), as.traveller);
    expect(r.status, JSON.stringify(r.data)).to.equal(201);
    const id = r.data.data.id;
    expect(r.data.data.business.approval).to.include({ current: 0 });
    expect((await api.get(`/business/${org.id}/approvals`, as.finance)).data.data.map((b) => b.id)).not.to.include(id);
    expect((await api.post(`/business/${org.id}/approvals/${id}`, { decision: 'APPROVE' }, as.finance)).status).to.equal(403);
    const a1 = await api.post(`/business/${org.id}/approvals/${id}`, { decision: 'APPROVE', note: 'Client visit' }, as.manager);
    expect(a1.status, JSON.stringify(a1.data)).to.equal(200);
    expect(a1.data.data.status).to.equal('PENDING');
    expect(a1.data.data.business.approval).to.include({ current: 1, status: 'PENDING' });
    expect((await api.post(`/business/${org.id}/approvals/${id}`, { decision: 'APPROVE' }, as.manager)).status).to.equal(403);
    expect((await api.get(`/business/${org.id}/approvals`, as.finance)).data.data.map((b) => b.id)).to.include(id);
    const a2 = await api.post(`/business/${org.id}/approvals/${id}`, { decision: 'APPROVE' }, as.finance);
    expect(a2.status, JSON.stringify(a2.data)).to.equal(200);
    expect(a2.data.data.status).to.equal('CONFIRMED');
    expect(a2.data.data.business.approval.history.map((h) => [h.key, h.by])).to.deep.equal([['MANAGER', 'Manoj Pillai'], ['FINANCE', 'Farida Ali']]);
  });

  it('a stand-in approves while the approver is away', async () => {
    expect((await api.put(`/business/${org.id}/members/${m.manager.id}/delegate`, { delegateMemberId: m.standin.id, delegateUntil: inDays(3) }, as.traveller)).status).to.equal(403);
    expect((await api.put(`/business/${org.id}/members/${m.manager.id}/delegate`, { delegateMemberId: m.manager.id, delegateUntil: inDays(3) }, as.manager)).status).to.equal(400);
    expect((await api.put(`/business/${org.id}/members/${m.manager.id}/delegate`, { delegateMemberId: m.standin.id, delegateUntil: inDays(200) }, as.manager)).status).to.equal(400);
    const d = await api.put(`/business/${org.id}/members/${m.manager.id}/delegate`, { delegateMemberId: m.standin.id, delegateUntil: inDays(3) }, as.manager);
    expect(d.status, JSON.stringify(d.data)).to.equal(200);
    expect(d.data.data.delegateMemberId).to.equal(m.standin.id);
    const r = await api.post(`/business/${org.id}/bookings`, stay(58), as.traveller);
    const id = r.data.data.id;
    expect((await api.get(`/business/${org.id}/approvals`, as.standin)).data.data.map((b) => b.id)).to.include(id);
    const a = await api.post(`/business/${org.id}/approvals/${id}`, { decision: 'APPROVE' }, as.standin);
    expect(a.status, JSON.stringify(a.data)).to.equal(200);
    expect(a.data.data.business.approval.history[0].by).to.equal('Kabir Das');
    // Ending the stand-in: they no longer see the manager's approvals
    await api.put(`/business/${org.id}/members/${m.manager.id}/delegate`, { delegateMemberId: null }, as.manager);
    const r2 = await api.post(`/business/${org.id}/bookings`, stay(61), as.traveller);
    expect((await api.get(`/business/${org.id}/approvals`, as.standin)).data.data.map((b) => b.id)).not.to.include(r2.data.data.id);
  });
});
