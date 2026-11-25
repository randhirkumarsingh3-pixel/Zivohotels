/**
 * Property onboarding checks and the listing agreement, end to end:
 *  - PAN / GSTIN / IFSC checks give real answers (no made-up names)
 *  - the payout account is saved and checked (₹1 test deposit when set up, else checked by hand
 *    against the cancelled cheque); owners can't change it after submitting
 *  - there is no automatic commission; a signed commission can't be changed silently
 *  - the agreement template is versioned; an agreement is prepared from it with the property's
 *    details, the owner signs with typed name + consent + emailed code, and gets a signed PDF
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
const login = (email, password) => retry(() => api.post('/auth/login', { email, password }));

describe('Onboarding checks and listing agreement', function () {
  this.timeout(180000);
  let admin; let owner; let other; let ownerUser; let hotel; let savedFinance; let savedTemplate;
  const password = `Agr!${crypto.randomUUID().slice(0, 10)}x9`;

  before(async () => {
    admin = { headers: { Authorization: `Bearer ${(await login('admin@zivoplus.com', 'admin123')).data.data.token}` } };
    const o = await login('extranet@zivotechretreat.com', 'ZivoExtranet@2026');
    other = { headers: { Authorization: `Bearer ${o.data.data.token}` } };
    const email = `agr.owner.${Date.now()}@example.com`;
    ownerUser = await prisma.user.create({ data: { name: 'Asha Agreement', email, password: await bcrypt.hash(password, 10), role: 'OWNER', status: 'ACTIVE', emailVerifiedAt: new Date() } });
    owner = { headers: { Authorization: `Bearer ${(await login(email, password)).data.data.token}` } };
    hotel = await prisma.hotel.create({ data: {
      name: `Agreement Test Inn ${Date.now() % 10000}`, location: 'Indiranagar', city: 'Bengaluru', state: 'Karnataka', pincode: '560038', ownerId: ownerUser.id, status: 'DRAFT',
      legalName: 'Asha Hospitality Private Limited', pan: 'AAPFU0939F', incorporationType: 'PARTNERSHIP', gstin: '29AAPFU0939F1ZQ',
      integrationSettings: { addressDetails: { houseNo: '12, 100 Feet Road', area: 'Indiranagar' } },
    } });
    // ZivoPlus company details are needed in every agreement
    savedFinance = await prisma.systemConfig.findUnique({ where: { key: 'finance_settings' } });
    const fin = savedFinance?.value || {};
    await prisma.systemConfig.upsert({ where: { key: 'finance_settings' }, update: { value: { ...fin, company: { ...(fin.company || {}), legalName: 'ZivoPlus Hospitality Private Limited', address: '1 MG Road, Bengaluru 560001', gstin: '29AAPFU0939F1ZV', stateCode: '29' } } }, create: { key: 'finance_settings', value: { company: { legalName: 'ZivoPlus Hospitality Private Limited', address: '1 MG Road, Bengaluru 560001', gstin: '29AAPFU0939F1ZV', stateCode: '29' } } } });
    savedTemplate = await prisma.systemConfig.findUnique({ where: { key: 'agreement_template' } });
  });

  after(async () => {
    if (savedFinance) await prisma.systemConfig.update({ where: { key: 'finance_settings' }, data: { value: savedFinance.value } }).catch(() => {});
    if (savedTemplate) await prisma.systemConfig.update({ where: { key: 'agreement_template' }, data: { value: savedTemplate.value } }).catch(() => {});
    else await prisma.systemConfig.deleteMany({ where: { key: 'agreement_template' } }).catch(() => {});
  });

  describe('PAN, GSTIN and IFSC checks', () => {
    it('PAN: format and holder type against the business type', async () => {
      const ok = (await api.post('/verification/pan', { pan: 'AAPFU0939F', incorporationType: 'PARTNERSHIP' }, owner)).data.data;
      expect(ok.ok).to.equal(true);
      const wrong = (await api.post('/verification/pan', { pan: 'AAPFU0939F', incorporationType: 'PVT_LTD' }, owner)).data.data;
      expect(wrong.ok).to.equal(false);
      expect(wrong.message).to.match(/firm or LLP/);
      expect((await api.post('/verification/pan', { pan: 'ABC123' }, owner)).data.data.ok).to.equal(false);
    });

    it('GSTIN: check digit, PAN inside it, and state', async () => {
      expect((await api.post('/verification/gstin', { gstin: '27AAPFU0939F1ZV', pan: 'AAPFU0939F', state: 'Maharashtra' }, owner)).data.data.ok).to.equal(true);
      expect((await api.post('/verification/gstin', { gstin: '27AAPFU0939F1ZX', pan: 'AAPFU0939F' }, owner)).data.data.message).to.match(/typo/);
      expect((await api.post('/verification/gstin', { gstin: '27AAPFU0939F1ZV', pan: 'ABCDE1234F' }, owner)).data.data.message).to.match(/registered to PAN/);
      expect((await api.post('/verification/gstin', { gstin: '27AAPFU0939F1ZV', pan: 'AAPFU0939F', state: 'Karnataka' }, owner)).data.data.message).to.match(/Maharashtra/);
    });

    it('IFSC: refuses a malformed code; never invents a branch', async () => {
      expect((await api.get('/verification/ifsc/HDFC123', owner)).data.data.ok).to.equal(false);
      const r = (await api.get('/verification/ifsc/HDFC0001234', owner)).data.data;
      expect(r.ok).to.equal(true);
      expect(r.bank).to.match(/HDFC/);
      if (r.source !== 'directory') expect(r.branch).to.equal(null);
    });
  });

  describe('Payout account', () => {
    it('is saved and checked for the owner\'s own draft property only', async () => {
      expect((await api.post('/verification/bank-account', { hotelId: hotel.id, accountName: 'Asha Hospitality Private Limited', accountNumber: '12', ifscCode: 'HDFC0001234' }, owner)).status).to.equal(400);
      expect((await api.post('/verification/bank-account', { hotelId: hotel.id, accountName: 'Asha Hospitality Private Limited', accountNumber: '50100123456789', ifscCode: 'HDFC0001234' }, other)).status).to.equal(403);
      const r = await api.post('/verification/bank-account', { hotelId: hotel.id, accountName: 'Asha Hospitality Private Limited', accountNumber: '50100123456789', ifscCode: 'HDFC0001234' }, owner);
      expect(r.status, JSON.stringify(r.data)).to.equal(200);
      expect(r.data.data.status).to.be.oneOf(['MANUAL', 'PENDING', 'VERIFIED', 'NAME_MISMATCH', 'FAILED']);
      expect(r.data.data.accountEnding).to.equal('••••6789');
      expect(JSON.stringify(r.data)).not.to.include('50100123456789');
    });

    it('ZivoPlus confirms it against the cancelled cheque (note required)', async () => {
      expect((await api.post(`/verification/bank-account/${hotel.id}/decision`, { status: 'VERIFIED' }, admin)).status).to.equal(400);
      expect((await api.post(`/verification/bank-account/${hotel.id}/decision`, { status: 'VERIFIED', note: 'x' }, owner)).status).to.equal(403);
      const r = await api.post(`/verification/bank-account/${hotel.id}/decision`, { status: 'VERIFIED', note: 'Matches the cancelled cheque' }, admin);
      expect(r.data.data.status).to.equal('VERIFIED');
    });

    it('is locked for the owner once the property is submitted', async () => {
      await prisma.hotel.update({ where: { id: hotel.id }, data: { status: 'IN_REVIEW' } });
      expect((await api.post('/verification/bank-account', { hotelId: hotel.id, accountName: 'Asha Hospitality Private Limited', accountNumber: '50100999999999', ifscCode: 'HDFC0001234' }, owner)).status).to.equal(409);
    });
  });

  describe('Agreement template', () => {
    it('only takes known fields, and each save is a new version', async () => {
      const t = (await api.get('/admin/agreement-template', admin)).data.data;
      expect(t.fields.map(([k]) => k)).to.include.members(['commissionRate', 'ownerLegalName', 'propertyName']);
      const bad = await api.put('/admin/agreement-template', { ...t.template, sections: [{ heading: 'X', body: 'Hello {{nope}}' }] }, admin);
      expect(bad.status).to.equal(400);
      expect(bad.data.message).to.include('{{nope}}');
      const saved = await api.put('/admin/agreement-template', { ...t.template, sections: [...t.template.sections, { heading: '9. Notices', body: 'Notices to {{ownerEmail}}.' }] }, admin);
      expect(saved.status).to.equal(200);
      expect(saved.data.data.template.version).to.equal((t.template.isDefault ? 1 : t.template.version) + 1);
      expect((await api.get('/admin/agreement-template', owner)).status).to.equal(403);
    });
  });

  describe('Prepare, sign, PDF', () => {
    let view; let code;
    it('there is no default commission: preparing needs one', async () => {
      const p = await api.post(`/admin/agreements/${hotel.id}/preview`, {}, admin);
      expect(p.data.data.missing.join(' ')).to.match(/Commission/);
      const r = await api.post(`/admin/agreements/${hotel.id}/prepare`, {}, admin);
      expect(r.status).to.equal(400);
      expect((await api.post(`/admin/agreements/${hotel.id}/prepare`, { commissionRate: 80 }, admin)).status).to.equal(400);
    });

    it('prepares it from the template with the property\'s details and sends it', async () => {
      await prisma.hotel.update({ where: { id: hotel.id }, data: { status: 'PENDING_AGREEMENT' } });
      const r = await api.post(`/admin/agreements/${hotel.id}/prepare`, { commissionRate: 11.5, payoutCycle: 'Weekly' }, admin);
      expect(r.status, JSON.stringify(r.data)).to.equal(200);
      expect(r.data.data.status).to.equal('PENDING_SIGNATURE');
      expect(r.data.data.reference).to.match(/^ZIV-AGR-\d{4}-\d{6}$/);
      expect(r.data.data.commissionRate).to.equal(11.5);
      view = (await api.get(`/extranet/agreement/${hotel.id}`, owner)).data.data;
      expect(view.canSign).to.equal(true);
      for (const s of ['Asha Hospitality Private Limited', '11.5', 'AAPFU0939F', 'Indiranagar', 'ending <b>6789</b>', 'Notices to']) expect(view.html).to.include(s);
      expect(view.html).not.to.include('class="miss"');
      expect((await api.get(`/extranet/agreement/${hotel.id}`, other)).status).to.equal(404);
    });

    it('signing needs consent, the current text and the emailed code', async () => {
      const c = await api.post(`/extranet/agreement/${hotel.id}/code`, {}, owner);
      expect(c.status, JSON.stringify(c.data)).to.equal(200);
      code = c.data.data.testCode;
      const otp = code ? null : await prisma.emailOTP.findFirst({ where: { email: ownerUser.email, purpose: 'AGREEMENT' }, orderBy: { createdAt: 'desc' } });
      expect(code || otp, 'a code was issued').to.exist;
      expect((await api.post(`/extranet/agreement/${hotel.id}/sign`, { name: 'Asha Rao', code, consent: false, contentHash: view.contentHash }, owner)).status).to.equal(400);
      expect((await api.post(`/extranet/agreement/${hotel.id}/sign`, { name: 'Asha Rao', code, consent: true, contentHash: 'old' }, owner)).status).to.equal(409);
      expect((await api.post(`/extranet/agreement/${hotel.id}/sign`, { name: 'Asha Rao', code: '000000', consent: true, contentHash: view.contentHash }, owner)).status).to.equal(400);
      expect((await api.post(`/extranet/agreement/${hotel.id}/code`, {}, other)).status).to.be.oneOf([403, 404]);
    });

    it('signs, moves the property to ready-for-go-live, and records the signature', async function () {
      if (!code) this.skip(); // email test mode off: the code went to a real inbox
      const r = await api.post(`/extranet/agreement/${hotel.id}/sign`, { name: 'Asha Rao', code, consent: true, contentHash: view.contentHash }, owner);
      expect(r.status, JSON.stringify(r.data)).to.equal(200);
      const a = await prisma.agreement.findUnique({ where: { hotelId: hotel.id } });
      expect(a).to.include({ status: 'SIGNED', signerName: 'Asha Rao', signerEmail: ownerUser.email, signatureMethod: 'EMAIL_OTP', contentHash: view.contentHash });
      expect(a.expiryAt).to.be.instanceOf(Date);
      expect((await prisma.hotel.findUnique({ where: { id: hotel.id } })).status).to.equal('READY_FOR_GO_LIVE');
      const pdf = await api.get(`/extranet/agreement/${hotel.id}/pdf`, { ...owner, responseType: 'arraybuffer' });
      expect(pdf.status).to.equal(200);
      expect(pdf.headers['content-type']).to.match(/pdf/);
      expect(Buffer.from(pdf.data).slice(0, 4).toString()).to.equal('%PDF');
      // Signed copies go to the owner with the PDF attached
      const job = await prisma.backgroundJob.findFirst({ where: { jobType: 'AGREEMENT_SIGNED' }, orderBy: { createdAt: 'desc' } });
      expect(job?.payload?.financeAttachments?.[0]).to.deep.include({ type: 'agreement', hotelId: hotel.id });
    });

    it('a signed agreement is never changed: preparing again and a new commission are refused', async function () {
      if (!code) this.skip();
      expect((await api.post(`/admin/agreements/${hotel.id}/prepare`, { commissionRate: 9 }, admin)).status).to.equal(409);
      const u = await api.put(`/hotels/${hotel.id}`, { commissionRate: 9 }, admin);
      expect(u.status).to.equal(409);
      expect((await prisma.agreement.findUnique({ where: { hotelId: hotel.id } })).commissionRate).to.equal(11.5);
    });

    it('the old one-click sign is retired', async () => {
      expect((await api.post(`/hotels/${hotel.id}/sign-agreement`, {}, owner)).status).to.equal(410);
    });
  });
});
