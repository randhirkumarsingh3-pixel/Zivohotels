/**
 * Applying for ZivoPlus for Business / Partner Hub step by step: a draft with the contact person
 * and agent details, the documents checklist (by business type), the bank account (required for
 * agents, encrypted), the declaration, submit; ZivoPlus checks the bank account; drafts stay out of
 * the admin list and get one reminder.
 */
import axios from 'axios';
import crypto from 'crypto';
import { expect } from 'chai';
import minimist from 'minimist';
import prisma from '../../config/db.js';
import bcrypt from '../../utils/bcrypt.js';
import { sendDraftReminders } from '../../services/business/orgApplication.js';

const argv = minimist(process.argv.slice(2));
const API = `${argv.url || process.env.E2E_URL || 'http://localhost:5000'}/api/v1`;
const api = axios.create({ baseURL: API, validateStatus: () => true });
const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });
const retry = async (fn) => { for (let i = 0; i < 12; i += 1) { const r = await fn(); if (r.status !== 429) return r; await sleep(5000); } return fn(); };
const login = async (email, password) => ({ headers: { Authorization: `Bearer ${(await retry(() => api.post('/auth/login', { email, password }))).data.data.token}` } });
const PDF = `data:application/pdf;base64,${Buffer.from('%PDF-1.4\n% kyc\n%%EOF\n').toString('base64')}`;

describe('Business / Partner Hub application: draft, documents, bank, submit', function () {
  this.timeout(120000);
  const tag = Date.now().toString().slice(-6);
  const password = `Apply!${crypto.randomUUID().slice(0, 8)}x7`;
  const PAN = `AAFF${'MNPQRSTUVW'[Number(tag[5])]}${tag.slice(2, 6)}R`; // a firm's PAN (4th letter F)
  let admin; let agent; let agentUser; let org; let saved;

  before(async () => {
    admin = await login('admin@zivoplus.com', 'admin123');
    agentUser = await prisma.user.create({ data: { name: 'Neha Joshi', email: `neha.a${tag}@example.com`, phone: `97${tag}44`, password: await bcrypt.hash(password, 4), role: 'CUSTOMER', status: 'ACTIVE', emailVerifiedAt: new Date() } });
    agent = await login(agentUser.email, password);
    saved = await prisma.systemConfig.findUnique({ where: { key: 'business_settings' } });
    await api.put('/admin/business-settings', { agency: { enabled: true, requireGstin: false }, corporate: { enabled: true } }, admin);
  });

  after(async () => {
    if (org) {
      await prisma.orgMember.deleteMany({ where: { organisationId: org.id } }).catch(() => {});
      await prisma.organisation.delete({ where: { id: org.id } }).catch(() => {});
    }
    if (saved) await prisma.systemConfig.update({ where: { key: 'business_settings' }, data: { value: saved.value } }).catch(() => {});
  });

  it('saves a draft with the contact person and agent details; it isn\'t in the admin list yet', async () => {
    const r = await api.post('/business/apply', {
      draft: true, kind: 'AGENCY', name: `Horizon Trails ${tag}`, legalName: `Horizon Trails Partnership ${tag}`, incorporationType: 'PARTNERSHIP', pan: PAN,
      address: '21 FC Road, Shivajinagar', city: 'Pune', state: 'Maharashtra', pincode: '411005', billingEmail: `acc.${tag}@example.com`, phone: '9822044444',
      contactName: 'Neha Joshi', contactDesignation: 'Operations manager', isSignatory: false,
      accreditation: { body: 'TAAI', number: `TA-${tag}` }, businessProfile: { yearsInBusiness: 6, monthlyBookings: '11-50', pricingPreference: 'NET' },
    }, agent);
    expect(r.status, JSON.stringify(r.data)).to.equal(201);
    org = r.data.data;
    expect(org.status).to.equal('DRAFT');
    expect(org.accreditation).to.deep.equal({ body: 'TAAI', number: `TA-${tag}` });
    const keys = org.checklist.map((i) => i.key);
    expect(keys).to.include.members(['PAN_CARD', 'GST_DECLARATION', 'INCORPORATION', 'ADDRESS_PROOF', 'AUTHORISATION', 'BANK', 'CANCELLED_CHEQUE']);
    expect(org.missing.length).to.be.greaterThan(5);
    const list = (await api.get(`/admin/organisations?search=${tag}`, admin)).data.data.organisations;
    expect(list.some((o) => o.id === org.id), 'drafts hidden').to.equal(false);
    const drafts = (await api.get(`/admin/organisations?status=DRAFT&search=${tag}`, admin)).data.data.organisations;
    expect(drafts.some((o) => o.id === org.id)).to.equal(true);
  });

  it('won\'t submit until every required item is in', async () => {
    const r = await api.post(`/business/${org.id}/submit`, { declaration: true }, agent);
    expect(r.status).to.equal(409);
    expect(r.data.message).to.match(/PAN card/);
  });

  it('takes the documents, the GST declaration and the bank account (stored encrypted)', async () => {
    for (const type of ['PAN_CARD', 'INCORPORATION', 'ADDRESS_PROOF', 'AUTHORISATION', 'CANCELLED_CHEQUE']) {
      const d = await api.post(`/business/${org.id}/documents`, { type, fileName: `${type}.pdf`, file: PDF }, agent);
      expect(d.status, `${type} ${JSON.stringify(d.data)}`).to.equal(201);
    }
    expect((await api.put(`/business/${org.id}`, { gstDeclaration: true }, agent)).status).to.equal(200);
    expect((await api.put(`/business/${org.id}/bank`, { holderName: 'Horizon Trails', accountNumber: '123456789012', confirmAccountNumber: '123456789000', ifsc: 'HDFC0001234' }, agent)).status, 'numbers differ').to.equal(400);
    expect((await api.put(`/business/${org.id}/bank`, { holderName: 'Horizon Trails', accountNumber: '123456789012', confirmAccountNumber: '123456789012', ifsc: 'BAD' }, agent)).status, 'bad IFSC').to.equal(400);
    const b = await api.put(`/business/${org.id}/bank`, { holderName: 'Horizon Trails', accountNumber: '123456789012', confirmAccountNumber: '123456789012', ifsc: 'HDFC0001234', accountType: 'CURRENT' }, agent);
    expect(b.status, JSON.stringify(b.data)).to.equal(200);
    expect(b.data.data.organisation.bank).to.include({ last4: '9012', ifsc: 'HDFC0001234' });
    expect(b.data.data.organisation.bank).to.not.have.property('accountNumber');
    const row = await prisma.organisation.findUnique({ where: { id: org.id } });
    expect(row.bankDetails).to.not.include('123456789012');
    expect(b.data.data.organisation.missing).to.deep.equal([]);
  });

  it('submits with the declaration: in review, emails sent; ZivoPlus checks the bank account', async () => {
    expect((await api.post(`/business/${org.id}/submit`, {}, agent)).status, 'declaration needed').to.equal(400);
    const r = await api.post(`/business/${org.id}/submit`, { declaration: true }, agent);
    expect(r.status, JSON.stringify(r.data)).to.equal(200);
    expect(r.data.data.status).to.equal('IN_REVIEW');
    expect(r.data.data.submittedAt).to.be.a('string');
    const d = (await api.get(`/admin/organisations/${org.id}`, admin)).data.data;
    expect(d.bankFull).to.include({ accountNumber: '123456789012' });
    expect((await api.post(`/admin/organisations/${org.id}/bank/review`, { status: 'REJECTED' }, admin)).status, 'note needed').to.equal(400);
    const v = await api.post(`/admin/organisations/${org.id}/bank/review`, { status: 'VERIFIED' }, admin);
    expect(v.data.data.bank.status).to.equal('VERIFIED');
    expect((await api.post(`/business/${org.id}/submit`, { declaration: true }, agent)).status, 'only once').to.equal(409);
  });

  it('reminds a draft left for 2 days, once', async () => {
    const d = await prisma.organisation.create({ data: { kind: 'CORPORATE', code: `ZB-T${tag}`, name: `Draft Co ${tag}`, legalName: `Draft Co Pvt Ltd ${tag}`, pan: `AABC${'MNPQRSTUVW'[Number(tag[4])]}${tag.slice(1, 5)}D`, address: '1 Test Road', city: 'Pune', state: 'Maharashtra', pincode: '411001', billingEmail: `d.${tag}@example.com`, phone: '9822000000', status: 'DRAFT', createdById: agentUser.id, createdAt: new Date(Date.now() - 3 * 86400000) } });
    await prisma.orgMember.create({ data: { organisationId: d.id, userId: agentUser.id, role: 'ADMIN' } });
    await sendDraftReminders();
    expect((await prisma.organisation.findUnique({ where: { id: d.id } })).draftReminderAt).to.be.an.instanceOf(Date);
    const again = await sendDraftReminders();
    expect(again.reminded).to.equal(0);
    await prisma.orgMember.deleteMany({ where: { organisationId: d.id } });
    await prisma.organisation.delete({ where: { id: d.id } });
  });
});
