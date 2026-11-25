/**
 * Partner Hub extras, end to end:
 *  - agreement templates for agents and companies (Admin → Agreement template, by kind)
 *  - an agency's agreement is prepared when ZivoPlus approves it; with "require a signed
 *    agreement" on, it can't book until an admin of the agency signs (emailed code)
 *  - the agency's logo on its vouchers (re-encoded PNG)
 *  - monthly incentive slabs on completed room nights, credited once, less TDS
 */
import axios from 'axios';
import { expect } from 'chai';
import minimist from 'minimist';
import crypto from 'crypto';
import sharp from 'sharp';
import prisma from '../../config/db.js';
import bcrypt from '../../utils/bcrypt.js';
import { transitionBookingStatus } from '../../services/bookingStateMachine.js';
import { agencyVoucherHtml, loadVoucherData } from '../../services/voucherService.js';
import { brandingFor } from '../../services/business/organisationService.js';

const argv = minimist(process.argv.slice(2));
const API = `${argv.url || process.env.E2E_URL || 'http://localhost:5000'}/api/v1`;
const api = axios.create({ baseURL: API, validateStatus: () => true });
const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });
const retry = async (fn) => { for (let i = 0; i < 12; i += 1) { const r = await fn(); if (r.status !== 429) return r; await sleep(5000); } return fn(); };
const login = async (email, password) => ({ headers: { Authorization: `Bearer ${(await retry(() => api.post('/auth/login', { email, password }))).data.data.token}` } });
const ymd = (d) => d.toISOString().slice(0, 10);
const inDays = (n) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + n); return ymd(d); };

describe('Partner Hub extras: agreement, logo, incentives', function () {
  this.timeout(180000);
  const tag = Date.now().toString().slice(-6);
  const password = `Ext!${crypto.randomUUID().slice(0, 10)}x9`;
  let admin; let agent; let staffer; let agentUser; let org; let hotel; let room;
  const saved = {};

  before(async () => {
    admin = await login('admin@zivoplus.com', 'admin123');
    for (const key of ['business_settings', 'agent_agreement_template', 'finance_settings']) saved[key] = await prisma.systemConfig.findUnique({ where: { key } });
    const fin = saved.finance_settings?.value || {};
    const company = { ...(fin.company || {}), legalName: 'ZivoPlus Hospitality Private Limited', address: '1 MG Road, Bengaluru 560001', gstin: '29AAPFU0939F1ZV', stateCode: '29' };
    await prisma.systemConfig.upsert({ where: { key: 'finance_settings' }, update: { value: { ...fin, company } }, create: { key: 'finance_settings', value: { company } } });
    await api.put('/admin/business-settings', { agency: { enabled: true, requireAgreement: true, pricingModel: 'NET', defaultMarkupPct: 10, maxMarkupPct: 40, incentives: { enabled: false } } }, admin);
    agentUser = await prisma.user.create({ data: { name: 'Lata Kapoor', email: `lata.${tag}@example.com`, password: await bcrypt.hash(password, 10), role: 'CUSTOMER', status: 'ACTIVE', emailVerifiedAt: new Date() } });
    const staffUser = await prisma.user.create({ data: { name: 'Vik Sen', email: `vik.${tag}@example.com`, password: await bcrypt.hash(password, 10), role: 'CUSTOMER', status: 'ACTIVE', emailVerifiedAt: new Date() } });
    agent = await login(agentUser.email, password);
    staffer = await login(staffUser.email, password);
    const panP = `ABCP${'KLMNPQRSTV'[Number(tag[5])]}${tag.slice(2, 6)}Q`;
    const r = await api.post('/business/apply', { kind: 'AGENCY', name: `Skyline Trips ${tag}`, legalName: `Lata Kapoor ${tag}`, incorporationType: 'INDIVIDUAL', pan: panP, address: '9 Residency Road', city: 'Bengaluru', state: 'Karnataka', pincode: '560025', billingEmail: `acc.${tag}@example.com`, phone: '9845033333' }, agent);
    expect(r.status, JSON.stringify(r.data)).to.equal(201);
    org = r.data.data;
    await prisma.orgMember.create({ data: { organisationId: org.id, userId: staffUser.id, role: 'BOOKER' } });
    const hotels = await prisma.hotel.findMany({ where: { status: { in: ['LIVE', 'ACTIVE'] }, isDeleted: false }, include: { roomTypes: { where: { isActive: { not: false } }, include: { ratePlans: { where: { isActive: true, basePrice: { gt: 0 } } } } } } });
    hotel = hotels.find((h) => h.roomTypes.some((rt) => rt.ratePlans.length));
    room = hotel.roomTypes.find((rt) => rt.ratePlans.length);
    saved.rate = await prisma.hotelBusinessRate.findUnique({ where: { hotelId: hotel.id } });
    await prisma.hotelBusinessRate.upsert({ where: { hotelId: hotel.id }, update: { agentEnabled: true, agentDiscountPct: 10 }, create: { hotelId: hotel.id, agentEnabled: true, agentDiscountPct: 10 } });
  });

  after(async () => {
    for (const key of ['business_settings', 'agent_agreement_template', 'finance_settings']) {
      if (saved[key]) await prisma.systemConfig.update({ where: { key }, data: { value: saved[key].value } }).catch(() => {});
      else await prisma.systemConfig.deleteMany({ where: { key } }).catch(() => {});
    }
    if (saved.rate) await prisma.hotelBusinessRate.update({ where: { hotelId: hotel.id }, data: { agentEnabled: saved.rate.agentEnabled, agentDiscountPct: saved.rate.agentDiscountPct } }).catch(() => {});
    else await prisma.hotelBusinessRate.deleteMany({ where: { hotelId: hotel.id } }).catch(() => {});
  });

  it('agreement templates exist for hotels, agents and companies', async () => {
    const t = (await api.get('/admin/agreement-template?kind=AGENCY', admin)).data.data;
    expect(t.kinds.map((k) => k.kind)).to.deep.equal(['HOTEL', 'AGENCY', 'CORPORATE']);
    expect(t.template.title).to.equal('Travel Agent Agreement');
    expect(t.fields.map((f) => f[0])).to.include.members(['partnerLegalName', 'pricingModel', 'tdsRate']);
    expect((await api.put('/admin/agreement-template?kind=AGENCY', { ...t.template, sections: [{ heading: 'X', body: '{{propertyName}}' }] }, admin)).data.message).to.match(/Unknown field/);
    const sections = [...t.template.sections, { heading: '10. Brand use', body: 'The Agent may say it books ZivoPlus hotels, account {{accountCode}}.' }];
    const s = await api.put('/admin/agreement-template?kind=AGENCY', { ...t.template, sections }, admin);
    expect(s.status, JSON.stringify(s.data)).to.equal(200);
    expect((await api.get('/admin/agreement-template', admin)).data.data.template.title).to.equal('Property Listing Agreement');
    expect((await api.get('/admin/agreement-template?kind=CORPORATE', admin)).data.data.template.title).to.equal('Corporate Travel Agreement');
  });

  it('approval prepares the agreement; booking waits for the signature', async () => {
    expect((await api.post(`/admin/organisations/${org.id}/decision`, { status: 'ACTIVE' }, admin)).status).to.equal(200);
    await api.post(`/admin/organisations/${org.id}/ledger`, { type: 'PAYMENT', amount: 100000, note: 'NEFT UTR 4433221100', reference: `UTR-X${tag}` }, admin);
    const v = (await api.get(`/business/${org.id}/agreement`, agent)).data.data;
    expect(v).to.include({ exists: true, required: true, status: 'PENDING_SIGNATURE', canSign: true, title: 'Travel Agent Agreement' });
    expect(v.reference).to.match(/^ZIV-BAG-\d{4}-\d{6}$/);
    expect(v.html).to.include(`Lata Kapoor ${tag}`).and.include(org.code).and.include('Brand use').and.not.include('class="miss"');
    const q = await api.post(`/business/${org.id}/quote`, { hotelId: hotel.id, checkIn: inDays(40), checkOut: inDays(41), roomLines: [{ roomTypeId: room.id, ratePlanId: room.ratePlans[0].id, adults: 1 }] }, agent);
    expect(q.status).to.equal(409);
    expect(q.data.message).to.match(/Sign your agreement/);
    expect((await api.get(`/admin/organisations/${org.id}`, admin)).data.data.agreement).to.include({ status: 'PENDING_SIGNATURE' });
    const pdf = await api.get(`/business/${org.id}/agreement/pdf`, { ...agent, responseType: 'arraybuffer' });
    expect(Buffer.from(pdf.data).subarray(0, 4).toString()).to.equal('%PDF');
  });

  it('only an admin of the agency signs, with the emailed code; then booking opens', async () => {
    const v = (await api.get(`/business/${org.id}/agreement`, agent)).data.data;
    expect((await api.get(`/business/${org.id}/agreement`, staffer)).data.data.canSign).to.equal(false);
    expect((await api.post(`/business/${org.id}/agreement/code`, {}, staffer)).status).to.equal(403);
    const c = await api.post(`/business/${org.id}/agreement/code`, {}, agent);
    expect(c.status, JSON.stringify(c.data)).to.equal(200);
    let code = c.data.data.testCode;
    if (!code) code = null;
    expect((await api.post(`/business/${org.id}/agreement/sign`, { name: 'Lata Kapoor', code: code || '000000', consent: true, contentHash: 'old' }, agent)).status).to.equal(409);
    expect((await api.post(`/business/${org.id}/agreement/sign`, { name: 'Lata Kapoor', code: code || '000000', consent: false, contentHash: v.contentHash }, agent)).status).to.equal(400);
    if (code) {
      const s = await api.post(`/business/${org.id}/agreement/sign`, { name: 'Lata Kapoor', code, consent: true, contentHash: v.contentHash }, agent);
      expect(s.status, JSON.stringify(s.data)).to.equal(200);
      expect(s.data.data.status).to.equal('SIGNED');
    } else {
      // Codes are emailed for real here: record the signature directly to continue
      await prisma.orgAgreement.update({ where: { organisationId: org.id }, data: { status: 'SIGNED', signedAt: new Date(), signatureMethod: 'EMAIL_OTP', signerName: 'Lata Kapoor', signerEmail: agentUser.email } });
    }
    expect((await api.get(`/business/${org.id}/agreement`, agent)).data.data).to.include({ status: 'SIGNED', canSign: false });
    expect((await api.post(`/admin/organisations/${org.id}/agreement`, {}, admin)).status).to.equal(409);
    const q = await api.post(`/business/${org.id}/quote`, { hotelId: hotel.id, checkIn: inDays(40), checkOut: inDays(41), roomLines: [{ roomTypeId: room.id, ratePlanId: room.ratePlans[0].id, adults: 1 }] }, agent);
    expect(q.status, JSON.stringify(q.data)).to.equal(200);
  });

  it('the agency\'s logo goes on its vouchers, re-encoded as PNG', async () => {
    expect((await api.post(`/business/${org.id}/branding/logo`, { file: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=' }, agent)).status).to.equal(400);
    expect((await api.post(`/business/${org.id}/branding/logo`, { file: `data:image/png;base64,${Buffer.from('not an image').toString('base64')}` }, agent)).status).to.equal(400);
    const png = await sharp({ create: { width: 800, height: 400, channels: 3, background: { r: 200, g: 30, b: 60 } } }).jpeg().toBuffer();
    expect((await api.post(`/business/${org.id}/branding/logo`, { file: `data:image/jpeg;base64,${png.toString('base64')}` }, staffer)).status).to.equal(403);
    const r = await api.post(`/business/${org.id}/branding/logo`, { file: `data:image/jpeg;base64,${png.toString('base64')}` }, agent);
    expect(r.status, JSON.stringify(r.data)).to.equal(200);
    expect(r.data.data.logo).to.match(/^data:image\/png;base64,/);
    const meta = await sharp(Buffer.from(r.data.data.logo.split(',')[1], 'base64')).metadata();
    expect(meta.width).to.be.at.most(360);
    expect(meta.height).to.be.at.most(120);
    const b = await api.post(`/business/${org.id}/bookings`, { hotelId: hotel.id, checkIn: inDays(42), checkOut: inDays(43), roomLines: [{ roomTypeId: room.id, ratePlanId: room.ratePlans[0].id, adults: 1 }], guestName: 'Om Prakash', guestPhone: '9845044444' }, agent);
    expect(b.status, JSON.stringify(b.data)).to.equal(201);
    const fresh = await prisma.organisation.findUnique({ where: { id: org.id } });
    const html = agencyVoucherHtml(await loadVoucherData(b.data.data.id), { agency: brandingFor(fresh), price: 'NONE' });
    expect(html).to.include('<img src="data:image/png;base64,');
    expect((await api.delete(`/business/${org.id}/branding/logo`, agent)).data.data.logo).to.equal(null);
  });

  it('incentive slabs: the month\'s completed room nights earn a bonus, credited once, less TDS', async () => {
    expect((await api.put('/admin/business-settings', { agency: { incentives: { enabled: true, slabs: [{ name: 'Silver', minRoomNights: 0, bonusPct: 1 }] } } }, admin)).status).to.equal(400);
    const s = await api.put('/admin/business-settings', { agency: { incentives: { enabled: true, slabs: [{ name: 'Gold', minRoomNights: 2, bonusPct: 3 }, { name: 'Silver', minRoomNights: 1, bonusPct: 2 }] } } }, admin);
    expect(s.status, JSON.stringify(s.data)).to.equal(200);
    expect(s.data.data.agency.incentives.slabs.map((x) => x.name)).to.deep.equal(['Silver', 'Gold']);
    const b = await api.post(`/business/${org.id}/bookings`, { hotelId: hotel.id, checkIn: inDays(45), checkOut: inDays(46), roomLines: [{ roomTypeId: room.id, ratePlanId: room.ratePlans[0].id, adults: 1 }], guestName: 'Ira Das', guestPhone: '9845055555' }, agent);
    expect(b.status, JSON.stringify(b.data)).to.equal(201);
    const adminUser = await prisma.user.findUnique({ where: { email: 'admin@zivoplus.com' } });
    await transitionBookingStatus(b.data.data.id, 'CHECKED_IN', adminUser.id);
    await transitionBookingStatus(b.data.data.id, 'COMPLETED', adminUser.id);
    const done = await prisma.booking.findUnique({ where: { id: b.data.data.id } });
    const out = new Date(new Date(done.checkOut).getTime() + 330 * 60000);
    const month = `${out.getUTCFullYear()}-${String(out.getUTCMonth() + 1).padStart(2, '0')}`;
    const p = (await api.get(`/business/${org.id}/incentives`, agent)).data.data;
    expect(p).to.include({ enabled: true });
    expect((await api.post('/admin/business-settings/incentives/run', { month }, staffer)).status).to.equal(403);
    const r = await api.post('/admin/business-settings/incentives/run', { month }, admin);
    expect(r.status, JSON.stringify(r.data)).to.equal(200);
    const mine = r.data.data.credited.find((x) => x.organisationId === org.id);
    expect(mine).to.include({ slab: 'Silver', roomNights: 1 });
    expect(mine.bonus).to.equal(Math.round(Number(done.baseAmount) * 2) / 100);
    const again = await api.post('/admin/business-settings/incentives/run', { month }, admin);
    expect(again.data.data.credited.find((x) => x.organisationId === org.id)).to.equal(undefined);
    const entries = (await api.get(`/business/${org.id}/account`, agent)).data.data.entries;
    expect(entries.filter((e) => e.type === 'INCENTIVE')).to.have.length(1);
    expect(entries.find((e) => e.reference === `TDS-INC-${month}`).amount).to.equal(-mine.tds);
    expect((await prisma.organisation.findUnique({ where: { id: org.id } })).tier).to.equal('SILVER');
  });
});
