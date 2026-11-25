/**
 * ZivoPlus for Business and Partner Hub: the shared business core, end to end.
 *  - admin turns the portals on; a guest account applies for its company (PAN / GSTIN checked)
 *  - KYC upload is private to the organisation; it can't invite or top up before approval
 *  - ZivoPlus asks for more, the company corrects it, ZivoPlus approves and sets credit terms
 *  - the account: payments, bookings on credit, overdue puts credit on hold, online top-up
 *  - members and roles; an agency applies without GSTIN; hotels set business rates
 */
import axios from 'axios';
import { expect } from 'chai';
import minimist from 'minimist';
import crypto from 'crypto';
import prisma from '../../config/db.js';
import bcrypt from '../../utils/bcrypt.js';
import { gstCheckDigit } from '../../services/verification/kyc.js';
import { postEntry } from '../../services/business/orgLedger.js';
import { rememberTopup } from '../../services/business/organisationService.js';

const argv = minimist(process.argv.slice(2));
const API = `${argv.url || process.env.E2E_URL || 'http://localhost:5000'}/api/v1`;
const api = axios.create({ baseURL: API, validateStatus: () => true });
const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });
const retry = async (fn) => { for (let i = 0; i < 12; i += 1) { const r = await fn(); if (r.status !== 429) return r; await sleep(5000); } return fn(); };
const login = async (email, password) => ({ headers: { Authorization: `Bearer ${(await retry(() => api.post('/auth/login', { email, password }))).data.data.token}` } });
const PDF = `data:application/pdf;base64,${Buffer.from('%PDF-1.4\n% kyc test\n%%EOF\n').toString('base64')}`;
const gstin = (state, pan) => { const f = `${state}${pan}1Z`; return f + gstCheckDigit(f); };

describe('Business core: organisations, accounts, business rates', function () {
  this.timeout(180000);
  const tag = Date.now().toString().slice(-6);
  const password = `Biz!${crypto.randomUUID().slice(0, 10)}x9`;
  const PAN = `AABC${'BCDEFGHJKL'[Number(tag[5])]}${tag.slice(2, 6)}F`; // company PAN (4th letter C)
  let admin; let owner; let ownerUser; let other; let hotelOwner; let org; let savedSettings;

  const company = (extra = {}) => ({
    kind: 'CORPORATE', name: `Acme Travel Desk ${tag}`, legalName: `Acme Industries Private Limited ${tag}`, incorporationType: 'PVT_LTD',
    pan: PAN, gstin: gstin('29', PAN), address: '42 Residency Road, Ashok Nagar', city: 'Bengaluru', state: 'Karnataka', pincode: '560025',
    billingEmail: `accounts.${tag}@example.com`, phone: '+91 98450 12345', ...extra,
  });

  before(async () => {
    admin = await login('admin@zivoplus.com', 'admin123');
    hotelOwner = await login('extranet@zivotechretreat.com', 'ZivoExtranet@2026');
    const mk = async (name, email) => prisma.user.create({ data: { name, email, password: await bcrypt.hash(password, 10), role: 'CUSTOMER', status: 'ACTIVE', emailVerifiedAt: new Date() } });
    ownerUser = await mk('Meera Iyer', `meera.${tag}@example.com`);
    await mk('Ravi Kumar', `ravi.${tag}@example.com`);
    owner = await login(ownerUser.email, password);
    other = await login(`ravi.${tag}@example.com`, password);
    savedSettings = await prisma.systemConfig.findUnique({ where: { key: 'business_settings' } });
  });

  after(async () => {
    if (savedSettings) await prisma.systemConfig.update({ where: { key: 'business_settings' }, data: { value: savedSettings.value } }).catch(() => {});
    else await prisma.systemConfig.deleteMany({ where: { key: 'business_settings' } }).catch(() => {});
  });

  describe('Applying', () => {
    it('is closed until ZivoPlus opens the portals', async () => {
      await prisma.systemConfig.deleteMany({ where: { key: 'business_settings' } });
      expect((await api.get('/business/info')).data.data.corporate.enabled).to.equal(false);
      expect((await api.post('/business/apply', company(), owner)).status).to.equal(403);
      expect((await api.put('/admin/business-settings', { corporate: { enabled: true } }, owner)).status).to.equal(403);
      const r = await api.put('/admin/business-settings', { corporate: { enabled: true }, agency: { enabled: true }, credit: { maxLimit: 200000, holdWhenOverdue: true } }, admin);
      expect(r.status, JSON.stringify(r.data)).to.equal(200);
      expect((await api.put('/admin/business-settings', { agency: { defaultMarkupPct: 60, maxMarkupPct: 50 } }, admin)).status).to.equal(400);
      expect((await api.get('/business/info')).data.data.corporate.enabled).to.equal(true);
    });

    it('checks PAN and GSTIN, and needs a guest account', async () => {
      expect((await api.post('/business/apply', company(), {})).status).to.equal(401);
      expect((await api.post('/business/apply', company({ pan: 'ABCDE1234' }), owner)).data.message).to.match(/PAN has/);
      expect((await api.post('/business/apply', company({ pan: 'AABPZ1234F' }), owner)).data.message).to.match(/belongs to an individual/);
      expect((await api.post('/business/apply', company({ gstin: '' }), owner)).data.message).to.match(/GSTIN/);
      expect((await api.post('/business/apply', company({ state: 'Maharashtra' }), owner)).data.message).to.match(/registered in Karnataka/);
      expect((await api.post('/business/apply', company(), hotelOwner)).status).to.equal(403);
    });

    it('creates the organisation in review with the applicant as admin', async () => {
      const r = await api.post('/business/apply', company(), owner);
      expect(r.status, JSON.stringify(r.data)).to.equal(201);
      org = r.data.data;
      expect(org).to.include({ kind: 'CORPORATE', status: 'IN_REVIEW', pan: PAN });
      expect(org.code).to.match(/^ZB-\d{6}$/);
      expect(org.terms).to.include({ paymentMode: 'PREPAID', invoiceMode: 'ON_BEHALF' });
      expect((await api.post('/business/apply', company(), owner)).status).to.equal(409);
      expect((await api.post('/business/apply', company(), other)).data.message).to.match(/already exists/);
      const mine = (await api.get('/business/mine', owner)).data.data;
      expect(mine.map((m) => [m.role, m.organisation.id])).to.deep.include(['ADMIN', org.id]);
      expect((await api.get(`/business/${org.id}`, other)).status).to.equal(404);
    });

    it('KYC files are private; inviting and top-ups wait for approval', async () => {
      expect((await api.post(`/business/${org.id}/documents`, { type: 'PAN_CARD', fileName: 'pan.txt', file: 'data:text/plain;base64,aGVsbG8=' }, owner)).status).to.equal(415);
      const d = await api.post(`/business/${org.id}/documents`, { type: 'PAN_CARD', fileName: 'pan.pdf', file: PDF }, owner);
      expect(d.status, JSON.stringify(d.data)).to.equal(201);
      const f = await api.get(`/business/${org.id}/documents/${d.data.data.id}/file`, { ...owner, responseType: 'arraybuffer' });
      expect(Buffer.from(f.data).subarray(0, 5).toString()).to.equal('%PDF-');
      expect((await api.get(`/business/${org.id}/documents/${d.data.data.id}/file`, other)).status).to.equal(404);
      expect((await api.get(`/admin/organisations/${org.id}/documents/${d.data.data.id}/file`, { ...admin, responseType: 'arraybuffer' })).status).to.equal(200);
      expect((await api.post(`/business/${org.id}/members`, { email: `x.${tag}@example.com`, name: 'X Y', role: 'BOOKER' }, owner)).status).to.equal(409);
      expect((await api.post(`/business/${org.id}/topup`, { amount: 5000 }, owner)).status).to.equal(409);
    });
  });

  describe('Review by ZivoPlus', () => {
    it('lists it for review; asking for more needs a note; the company fixes it and it comes back', async () => {
      const list = (await api.get('/admin/organisations', { ...admin, params: { status: 'IN_REVIEW', search: PAN } })).data.data;
      expect(list.organisations.map((o) => o.id)).to.include(org.id);
      expect(list.counts.CORPORATE.IN_REVIEW).to.be.at.least(1);
      expect((await api.post(`/admin/organisations/${org.id}/decision`, { status: 'ON_HOLD' }, admin)).status).to.equal(400);
      expect((await api.post(`/admin/organisations/${org.id}/decision`, { status: 'ON_HOLD', note: 'Please upload the GST certificate.' }, admin)).data.data.status).to.equal('ON_HOLD');
      const v = (await api.get(`/business/${org.id}`, owner)).data.data;
      expect(v).to.include({ status: 'ON_HOLD', statusNote: 'Please upload the GST certificate.' });
      expect((await api.post(`/business/${org.id}/documents`, { type: 'GST_CERTIFICATE', fileName: 'gst.pdf', file: PDF }, owner)).status).to.equal(201);
      const u = await api.put(`/business/${org.id}`, { phone: '+91 98450 99999' }, owner);
      expect(u.status, JSON.stringify(u.data)).to.equal(200);
      expect(u.data.data.status).to.equal('IN_REVIEW');
    });

    it('approves it and sets credit terms within the maximum', async () => {
      const a = await api.post(`/admin/organisations/${org.id}/decision`, { status: 'ACTIVE' }, admin);
      expect(a.status, JSON.stringify(a.data)).to.equal(200);
      expect(a.data.data.status).to.equal('ACTIVE');
      expect((await api.put(`/admin/organisations/${org.id}/terms`, { paymentMode: 'CREDIT', creditLimit: 900000 }, admin)).data.message).to.match(/up to/);
      const t = await api.put(`/admin/organisations/${org.id}/terms`, { paymentMode: 'BOTH', creditLimit: 50000, creditDays: 15, invoiceMode: 'ZIVO_SUPPLIER' }, admin);
      expect(t.status, JSON.stringify(t.data)).to.equal(200);
      expect(t.data.data.terms).to.include({ paymentMode: 'BOTH', creditLimit: 50000, creditDays: 15, invoiceMode: 'ZIVO_SUPPLIER' });
      // After approval, legal details are locked
      expect((await api.put(`/business/${org.id}`, { legalName: 'Something Else Pvt Ltd' }, owner)).status).to.equal(409);
    });
  });

  describe('Account', () => {
    it('payments add to the balance; credit adds to what can be spent', async () => {
      expect((await api.get(`/business/${org.id}/account`, owner)).data.data.summary).to.include({ balance: 0, creditLimit: 50000, available: 50000 });
      expect((await api.post(`/admin/organisations/${org.id}/ledger`, { type: 'PAYMENT', amount: 10000, note: 'x' }, admin)).status).to.equal(400);
      const p = await api.post(`/admin/organisations/${org.id}/ledger`, { type: 'PAYMENT', amount: 10000, note: 'NEFT UTR 1234567890', reference: `UTR-${tag}` }, admin);
      expect(p.status, JSON.stringify(p.data)).to.equal(200);
      expect((await api.post(`/admin/organisations/${org.id}/ledger`, { type: 'PAYMENT', amount: 10000, note: 'NEFT UTR 1234567890', reference: `UTR-${tag}` }, admin)).status).to.equal(409);
      expect((await api.get(`/business/${org.id}/account`, owner)).data.data.summary).to.include({ balance: 10000, walletBalance: 10000, available: 60000 });
    });

    it('a booking can\'t spend more than is available; overdue credit is put on hold', async () => {
      try { await postEntry({ organisationId: org.id, type: 'BOOKING', amount: -70000, reference: `BK-${tag}-big` }); expect.fail('should refuse'); } catch (e) { expect(e.statusCode).to.equal(402); }
      await postEntry({ organisationId: org.id, type: 'BOOKING', amount: -20000, reference: `BK-${tag}-1`, dueAt: new Date(Date.now() - 86400000) });
      const s = (await api.get(`/business/${org.id}/account`, owner)).data.data.summary;
      expect(s).to.include({ balance: -10000, creditUsed: 10000, overdueAmount: 10000, creditOnHold: true, available: 0 });
      try { await postEntry({ organisationId: org.id, type: 'BOOKING', amount: -100, reference: `BK-${tag}-2` }); expect.fail('should refuse'); } catch (e) { expect(e.message).to.match(/on hold/); }
      await api.post(`/admin/organisations/${org.id}/ledger`, { type: 'PAYMENT', amount: 10000, note: 'NEFT UTR 99887766', reference: `UTR-${tag}-2` }, admin);
      expect((await api.get(`/business/${org.id}/account`, owner)).data.data.summary).to.include({ balance: 0, overdueAmount: 0, creditOnHold: false, available: 50000 });
    });

    it('online top-up: checks the amount and the payment signature, credits once', async () => {
      expect((await api.post(`/business/${org.id}/topup`, { amount: 10 }, owner)).status).to.equal(400);
      const orderId = `order_biz_${tag}`; const paymentId = `pay_biz_${tag}`;
      await rememberTopup(org.id, orderId, { amount: 25000, userId: ownerUser.id });
      expect((await api.post(`/business/${org.id}/topup/confirm`, { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: 'bad' }, owner)).status).to.equal(400);
      const sig = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET).update(`${orderId}|${paymentId}`).digest('hex');
      const c = await api.post(`/business/${org.id}/topup/confirm`, { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: sig }, owner);
      expect(c.status, JSON.stringify(c.data)).to.equal(200);
      expect(c.data.data.summary.balance).to.equal(25000);
      expect((await api.post(`/business/${org.id}/topup/confirm`, { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: sig }, owner)).status).to.equal(404);
      expect((await api.get(`/business/${org.id}/account`, owner)).data.data.entries.filter((e) => e.type === 'TOPUP')).to.have.length(1);
    });
  });

  describe('Members', () => {
    let booker; let financeMember;
    it('invites new and existing people with a role', async () => {
      expect((await api.post(`/business/${org.id}/members`, { email: 'extranet@zivotechretreat.com', role: 'BOOKER' }, owner)).data.message).to.match(/hotel or ZivoPlus staff/);
      const n = await api.post(`/business/${org.id}/members`, { email: `new.${tag}@example.com`, name: 'Neha Shah', role: 'BOOKER' }, owner);
      expect(n.status, JSON.stringify(n.data)).to.equal(201);
      booker = n.data.data;
      expect(booker.user.invited).to.equal(true);
      if (process.env.EMAIL_TEST_MODE === 'true') expect(n.data.data.inviteLink).to.match(/accept-invite\?token=.+&next=%2Fbusiness/);
      const e = await api.post(`/business/${org.id}/members`, { email: `ravi.${tag}@example.com`, role: 'FINANCE' }, owner);
      expect(e.status).to.equal(201);
      financeMember = e.data.data;
      expect((await api.post(`/business/${org.id}/members`, { email: `ravi.${tag}@example.com`, role: 'FINANCE' }, owner)).status).to.equal(409);
    });

    it('roles decide what each can see and do', async () => {
      const v = (await api.get(`/business/${org.id}`, other)).data.data;
      expect(v.myRole).to.equal('FINANCE');
      expect(v.account.balance).to.equal(25000);
      expect((await api.get(`/business/${org.id}/account`, other)).status).to.equal(200);
      expect((await api.post(`/business/${org.id}/members`, { email: `z.${tag}@example.com`, name: 'Z Z', role: 'ADMIN' }, other)).status).to.equal(403);
      await api.patch(`/business/${org.id}/members/${financeMember.id}`, { role: 'TRAVELLER' }, owner);
      expect((await api.get(`/business/${org.id}/account`, other)).status).to.equal(403);
      expect((await api.get(`/business/${org.id}`, other)).data.data.account).to.equal(null);
    });

    it('keeps at least one active admin', async () => {
      const me = (await api.get(`/business/${org.id}/members`, owner)).data.data.find((m) => m.user.email === ownerUser.email);
      expect((await api.patch(`/business/${org.id}/members/${me.id}`, { role: 'BOOKER' }, owner)).status).to.equal(409);
      expect((await api.delete(`/business/${org.id}/members/${me.id}`, owner)).status).to.equal(409);
      expect((await api.delete(`/business/${org.id}/members/${booker.id}`, owner)).status).to.equal(200);
    });

    it('a suspended organisation can\'t spend', async () => {
      expect((await api.post(`/admin/organisations/${org.id}/decision`, { status: 'SUSPENDED', note: 'Unpaid invoices' }, admin)).data.data.status).to.equal('SUSPENDED');
      expect((await api.get(`/business/${org.id}/account`, owner)).data.data.summary.available).to.equal(0);
      expect((await api.post(`/admin/organisations/${org.id}/decision`, { status: 'ACTIVE' }, admin)).data.data.status).to.equal('ACTIVE');
      const d = (await api.get(`/admin/organisations/${org.id}`, admin)).data.data;
      expect(d.history.map((h) => h.action)).to.include.members(['ORG_APPLIED', 'ORG_ON_HOLD', 'ORG_ACTIVE', 'ORG_SUSPENDED', 'ORG_TERMS_UPDATED', 'ORG_LEDGER_ENTRY']);
    });
  });

  describe('Travel agents and hotels', () => {
    it('an agency can apply without GSTIN (optional for agents by default)', async () => {
      const panP = `ABCP${'KLMNPQRSTV'[Number(tag[5])]}${tag.slice(2, 6)}Q`;
      const r = await api.post('/business/apply', { kind: 'AGENCY', name: `Wanderlust Tours ${tag}`, legalName: `Ravi Kumar ${tag}`, incorporationType: 'INDIVIDUAL', pan: panP, address: '7 MG Road, Camp', city: 'Pune', state: 'Maharashtra', pincode: '411001', billingEmail: `tours.${tag}@example.com`, phone: '9822012345' }, other);
      expect(r.status, JSON.stringify(r.data)).to.equal(201);
      expect(r.data.data.code).to.match(/^ZP-\d{6}$/);
      expect(r.data.data.terms).to.include({ pricingModel: 'BOTH', defaultMarkupPct: 10, tdsPct: 2 });
    });

    it('hotels opt in to business rates for their own property only', async () => {
      const props = (await api.get('/extranet/properties', hotelOwner)).data.data;
      const mine = props[0].id;
      const g = await api.get(`/extranet/business-rates/${mine}`, hotelOwner);
      expect(g.status, JSON.stringify(g.data)).to.equal(200);
      expect(g.data.data).to.include({ corporateEnabled: false, agentEnabled: false, corporateOpen: true });
      expect((await api.put(`/extranet/business-rates/${mine}`, { agentEnabled: true, agentDiscountPct: 0 }, hotelOwner)).status).to.equal(400);
      expect((await api.put(`/extranet/business-rates/${mine}`, { corporateEnabled: true, corporateDiscountPct: 70 }, hotelOwner)).status).to.equal(400);
      const s = await api.put(`/extranet/business-rates/${mine}`, { corporateEnabled: true, corporateDiscountPct: 8, agentEnabled: true, agentDiscountPct: 12 }, hotelOwner);
      expect(s.data.data).to.include({ corporateEnabled: true, corporateDiscountPct: 8, agentEnabled: true, agentDiscountPct: 12 });
      const notMine = await prisma.hotel.findFirst({ where: { id: { notIn: props.map((p) => p.id) } }, select: { id: true } });
      if (notMine) expect((await api.get(`/extranet/business-rates/${notMine.id}`, hotelOwner)).status).to.be.oneOf([403, 404]);
      expect((await api.get(`/extranet/business-rates/${mine}`, owner)).status).to.equal(403);
      await api.put(`/extranet/business-rates/${mine}`, { corporateEnabled: false, agentEnabled: false }, hotelOwner);
    });
  });
});
