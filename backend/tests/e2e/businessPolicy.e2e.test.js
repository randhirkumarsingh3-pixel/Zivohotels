/**
 * ZivoPlus for Business: travel policy, approvals and spend reports, end to end.
 *  - the company admin sets grades with nightly caps; over the cap needs a reason, and approval
 *  - a trip needing approval is held, the traveller's approver approves (paid from the account)
 *    or rejects (rooms released); nobody approves their own trip
 *  - bookers book for colleagues (their grade applies); travellers only for themselves
 *  - spend report and the GST CSV for input tax credit
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

describe('Business: travel policy, approvals, spend reports', function () {
  this.timeout(180000);
  const tag = Date.now().toString().slice(-6);
  const password = `Pol!${crypto.randomUUID().slice(0, 10)}x9`;
  const as = {}; const m = {};
  let org; let hotel; let room; let perNight; let savedSettings; let savedRate;
  const stay = (n, extra = {}) => ({ hotelId: hotel.id, checkIn: inDays(n), checkOut: inDays(n + 1), roomLines: [{ roomTypeId: room.id, ratePlanId: room.ratePlans[0].id, adults: 1, children: 0 }], guestPhone: '9810012345', ...extra });

  before(async () => {
    const admin = await login('admin@zivoplus.com', 'admin123');
    savedSettings = await prisma.systemConfig.findUnique({ where: { key: 'business_settings' } });
    await api.put('/admin/business-settings', { corporate: { enabled: true, holdHours: 24 } }, admin);
    const people = { admin: ['Anita Rao', 'ADMIN'], traveller: ['Tara Iyer', 'TRAVELLER'], approver: ['Prakash Nair', 'APPROVER'], booker: ['Bina Shah', 'BOOKER'], senior: ['Sunil Menon', 'TRAVELLER'] };
    const users = {};
    for (const [k, [name]] of Object.entries(people)) users[k] = await prisma.user.create({ data: { name, email: `${k}.${tag}@example.com`, password: await bcrypt.hash(password, 10), role: 'CUSTOMER', status: 'ACTIVE', emailVerifiedAt: new Date() } });
    org = await prisma.organisation.create({ data: {
      kind: 'CORPORATE', code: `ZB-P${tag}`, name: `Orbit Labs ${tag}`, legalName: `Orbit Labs Private Limited ${tag}`, incorporationType: 'PVT_LTD', pan: `AABCO${tag.slice(2)}K`, gstin: `29AABCO${tag.slice(2)}K1Z5`,
      address: '5 Brigade Road', city: 'Bengaluru', state: 'Karnataka', pincode: '560025', billingEmail: `ap.${tag}@example.com`, phone: '9845098450', status: 'ACTIVE', createdById: users.admin.id,
    } });
    for (const [k, [, role]] of Object.entries(people)) m[k] = await prisma.orgMember.create({ data: { organisationId: org.id, userId: users[k].id, role } });
    for (const k of Object.keys(people)) as[k] = await login(users[k].email, password);
    const hotels = await prisma.hotel.findMany({ where: { status: { in: ['LIVE', 'ACTIVE'] }, isDeleted: false }, include: { roomTypes: { where: { isActive: { not: false } }, include: { ratePlans: { where: { isActive: true, basePrice: { gt: 0 } } } } } } });
    hotel = hotels.find((h) => h.roomTypes.some((rt) => rt.ratePlans.length));
    room = hotel.roomTypes.find((rt) => rt.ratePlans.length);
    savedRate = await prisma.hotelBusinessRate.findUnique({ where: { hotelId: hotel.id } });
    await prisma.hotelBusinessRate.upsert({ where: { hotelId: hotel.id }, update: { corporateEnabled: true, corporateDiscountPct: 10 }, create: { hotelId: hotel.id, corporateEnabled: true, corporateDiscountPct: 10 } });
    await api.post(`/admin/organisations/${org.id}/ledger`, { type: 'PAYMENT', amount: 300000, note: 'NEFT UTR 1122334455', reference: `UTR-P${tag}` }, admin);
  });

  after(async () => {
    if (savedSettings) await prisma.systemConfig.update({ where: { key: 'business_settings' }, data: { value: savedSettings.value } }).catch(() => {});
    else await prisma.systemConfig.deleteMany({ where: { key: 'business_settings' } }).catch(() => {});
    if (savedRate) await prisma.hotelBusinessRate.update({ where: { hotelId: hotel.id }, data: { corporateEnabled: savedRate.corporateEnabled, corporateDiscountPct: savedRate.corporateDiscountPct } }).catch(() => {});
    else await prisma.hotelBusinessRate.deleteMany({ where: { hotelId: hotel.id } }).catch(() => {});
  });

  it('the admin sets grades with nightly caps; members get a grade, an approver and a cost centre', async () => {
    const q = (await api.post(`/business/${org.id}/quote`, stay(30), as.admin)).data.data;
    perNight = Math.round(q.price.beforeTax);
    expect(q.policy).to.include({ enabled: false });
    const body = { enabled: true, approval: 'OUT_OF_POLICY', requireReason: true, metroCities: [hotel.city], defaultGrade: 'STANDARD', grades: [{ key: 'STANDARD', name: 'Standard', capMetro: perNight - 100, capOther: perNight - 100 }, { key: 'SENIOR', name: 'Senior', capMetro: perNight + 500, capOther: perNight + 500 }] };
    expect((await api.put(`/business/${org.id}/policy`, body, as.traveller)).status).to.equal(403);
    expect((await api.put(`/business/${org.id}/policy`, { ...body, grades: [{ name: 'X', capMetro: 10, capOther: 10 }] }, as.admin)).status).to.equal(400);
    const r = await api.put(`/business/${org.id}/policy`, body, as.admin);
    expect(r.status, JSON.stringify(r.data)).to.equal(200);
    expect((await api.get(`/business/${org.id}/policy`, as.traveller)).data.data.grades).to.have.length(2);
    expect((await api.patch(`/business/${org.id}/members/${m.traveller.id}`, { approverMemberId: m.traveller.id }, as.admin)).status).to.equal(400);
    expect((await api.patch(`/business/${org.id}/members/${m.traveller.id}`, { grade: 'NOPE' }, as.admin)).status).to.equal(400);
    const u = await api.patch(`/business/${org.id}/members/${m.traveller.id}`, { grade: 'STANDARD', approverMemberId: m.approver.id, costCenter: 'Sales South' }, as.admin);
    expect(u.data.data).to.include({ grade: 'STANDARD', approverMemberId: m.approver.id, costCenter: 'Sales South' });
    await api.patch(`/business/${org.id}/members/${m.senior.id}`, { grade: 'SENIOR', costCenter: 'Leadership' }, as.admin);
  });

  let pending;
  it('over the cap: needs a reason, then waits for the traveller\'s approver (held, not paid)', async () => {
    const q = (await api.post(`/business/${org.id}/quote`, stay(30), as.traveller)).data.data;
    expect(q.policy).to.include({ enabled: true, within: false, cap: perNight - 100, needsApproval: true, gradeName: 'Standard', metro: true });
    expect(q.needsApproval).to.equal(true);
    expect(q.traveller).to.include({ name: 'Tara Iyer', costCenter: 'Sales South' });
    expect((await api.post(`/business/${org.id}/bookings`, stay(30), as.traveller)).data.message).to.match(/over the .* limit for Standard/);
    const r = await api.post(`/business/${org.id}/bookings`, stay(30, { policyReason: 'Client site is next door' }), as.traveller);
    expect(r.status, JSON.stringify(r.data)).to.equal(201);
    pending = r.data.data;
    expect(pending.status).to.equal('PENDING');
    expect(pending.business.approval).to.include({ status: 'PENDING' });
    expect(pending.business.approval.approverMemberIds).to.deep.equal([m.approver.id]);
    expect(pending.guestName).to.equal('Tara Iyer');
    expect((await api.post(`/business/${org.id}/bookings/${pending.id}/pay`, {}, as.traveller)).status).to.equal(409);
    expect((await api.get(`/business/${org.id}/approvals`, as.approver)).data.data.map((b) => b.id)).to.include(pending.id);
    expect((await api.get(`/business/${org.id}/approvals`, as.booker)).data.data.map((b) => b.id)).not.to.include(pending.id);
    expect((await api.post(`/business/${org.id}/approvals/${pending.id}`, { decision: 'APPROVE' }, as.booker)).status).to.equal(403);
    expect((await api.post(`/business/${org.id}/approvals/${pending.id}`, { decision: 'APPROVE' }, as.traveller)).status).to.equal(403);
  });

  it('the approver approves: confirmed and paid from the company account', async () => {
    const before = (await api.get(`/business/${org.id}/account`, as.admin)).data.data.summary.balance;
    const r = await api.post(`/business/${org.id}/approvals/${pending.id}`, { decision: 'APPROVE', note: 'OK for this client' }, as.approver);
    expect(r.status, JSON.stringify(r.data)).to.equal(200);
    expect(r.data.data.status).to.equal('CONFIRMED');
    expect(r.data.data.business.approval).to.include({ status: 'APPROVED', note: 'OK for this client' });
    expect((await api.get(`/business/${org.id}/account`, as.admin)).data.data.summary.balance).to.equal(before - pending.total);
    expect((await api.post(`/business/${org.id}/approvals/${pending.id}`, { decision: 'APPROVE' }, as.approver)).status).to.equal(409);
  });

  it('the approver rejects (with a reason): the hold is released', async () => {
    const r = await api.post(`/business/${org.id}/bookings`, stay(33, { policyReason: 'Conference venue' }), as.traveller);
    expect(r.status, JSON.stringify(r.data)).to.equal(201);
    expect((await api.post(`/business/${org.id}/approvals/${r.data.data.id}`, { decision: 'REJECT' }, as.approver)).status).to.equal(400);
    const x = await api.post(`/business/${org.id}/approvals/${r.data.data.id}`, { decision: 'REJECT', note: 'Choose a hotel within policy' }, as.approver);
    expect(x.status, JSON.stringify(x.data)).to.equal(200);
    expect(x.data.data.status).to.equal('CANCELLED');
    expect(x.data.data.business.approval.status).to.equal('REJECTED');
  });

  it('within policy books straight away; bookers book for colleagues; travellers only for themselves', async () => {
    const s = await api.post(`/business/${org.id}/bookings`, stay(36), as.senior);
    expect(s.status, JSON.stringify(s.data)).to.equal(201);
    expect(s.data.data.status).to.equal('CONFIRMED');
    expect(s.data.data.business.policy).to.include({ within: true, gradeName: 'Senior' });
    expect((await api.post(`/business/${org.id}/quote`, stay(36, { travellerMemberId: m.senior.id }), as.traveller)).status).to.equal(403);
    const b = await api.post(`/business/${org.id}/bookings`, stay(37, { travellerMemberId: m.senior.id }), as.booker);
    expect(b.status, JSON.stringify(b.data)).to.equal(201);
    expect(b.data.data).to.include({ status: 'CONFIRMED', guestName: 'Sunil Menon' });
    expect(b.data.data.business.traveller).to.include({ name: 'Sunil Menon', costCenter: 'Leadership' });
    // An admin is never held for approval, but still gives a reason when over the cap
    const a = await api.post(`/business/${org.id}/bookings`, stay(38, { travellerMemberId: m.traveller.id, policyReason: 'Urgent client visit' }), as.admin);
    expect(a.data.data.status).to.equal('CONFIRMED');
  });

  it('spend report and the GST CSV', async () => {
    const q = { from: inDays(0), to: inDays(60) };
    expect((await api.get(`/business/${org.id}/reports/spend`, { ...as.traveller, params: q })).status).to.equal(403);
    const r = await api.get(`/business/${org.id}/reports/spend`, { ...as.admin, params: q });
    expect(r.status, JSON.stringify(r.data)).to.equal(200);
    const t = r.data.data.totals;
    expect(t.bookings).to.equal(4);
    expect(t.outOfPolicy).to.equal(2);
    expect(t.savings).to.be.above(0);
    expect(r.data.data.byCostCenter.map((g) => g.key)).to.include.members(['Sales South', 'Leadership']);
    expect(r.data.data.outOfPolicy.map((x) => x.reason)).to.include('Client site is next door');
    const csv = await api.get(`/business/${org.id}/reports/spend.csv`, { ...as.admin, params: q, responseType: 'text' });
    expect(csv.status).to.equal(200);
    expect(csv.headers['content-type']).to.match(/text\/csv/);
    const lines = csv.data.replace(/^﻿/, '').trim().split('\n');
    expect(lines[0]).to.include('Invoice number').and.include('Hotel GSTIN').and.include('Your GSTIN');
    expect(lines).to.have.length(5);
    expect(csv.data).to.include(org.gstin).and.include(pending.bookingRef);
  });
});
