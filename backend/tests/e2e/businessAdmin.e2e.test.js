/**
 * Admin → Business & Partners: ZivoPlus adds a company and a travel agent on their behalf (their
 * admin gets a set-password link), corrects details, checks KYC files, adds team members, and sees
 * the overview, bookings and reports (with CSV). Only ZivoPlus staff can.
 */
import axios from 'axios';
import { expect } from 'chai';
import minimist from 'minimist';
import prisma from '../../config/db.js';
import { gstCheckDigit } from '../../services/verification/kyc.js';

const argv = minimist(process.argv.slice(2));
const API = `${argv.url || process.env.E2E_URL || 'http://localhost:5000'}/api/v1`;
const api = axios.create({ baseURL: API, validateStatus: () => true });
const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });
const retry = async (fn) => { for (let i = 0; i < 12; i += 1) { const r = await fn(); if (r.status !== 429) return r; await sleep(5000); } return fn(); };
const login = async (email, password) => ({ headers: { Authorization: `Bearer ${(await retry(() => api.post('/auth/login', { email, password }))).data.data.token}` } });
const gstin = (state, pan) => { const f = `${state}${pan}1Z`; return f + gstCheckDigit(f); };

describe('Admin: companies and travel agents end to end', function () {
  this.timeout(120000);
  const tag = Date.now().toString().slice(-6);
  const PAN = `AABC${'MNPQRSTUVW'[Number(tag[5])]}${tag.slice(2, 6)}K`;
  const AGENT_PAN = `AAFF${'MNPQRSTUVW'[Number(tag[4])]}${tag.slice(2, 6)}L`;
  let admin; let hotelOwner; let company; let agency;
  const created = [];

  before(async () => {
    admin = await login('admin@zivoplus.com', 'admin123');
    hotelOwner = await login('extranet@zivotechretreat.com', 'ZivoExtranet@2026');
  });

  after(async () => {
    for (const id of created) {
      await prisma.orgAgreement.deleteMany({ where: { organisationId: id } }).catch(() => {});
      await prisma.orgMember.deleteMany({ where: { organisationId: id } }).catch(() => {});
      await prisma.organisation.delete({ where: { id } }).catch(() => {});
    }
  });

  it('adds a company for them: its admin is invited by email; only staff can', async () => {
    const body = {
      kind: 'CORPORATE', name: `Nimbus Tech ${tag}`, legalName: `Nimbus Technologies Private Limited ${tag}`, incorporationType: 'PVT_LTD',
      pan: PAN, gstin: gstin('29', PAN), address: '12 Brigade Road', city: 'Bengaluru', state: 'Karnataka', pincode: '560001',
      billingEmail: `finance.${tag}@example.com`, phone: '+91 98450 11111', adminName: 'Anil Rao', adminEmail: `anil.${tag}@example.com`,
    };
    expect((await api.post('/admin/organisations', body, hotelOwner)).status).to.be.oneOf([401, 403]);
    expect((await api.post('/admin/organisations', { ...body, adminEmail: 'not-an-email' }, admin)).status).to.equal(400);
    const r = await api.post('/admin/organisations', body, admin);
    expect(r.status, JSON.stringify(r.data)).to.equal(200);
    company = r.data.data;
    created.push(company.id);
    expect(company.status).to.equal('IN_REVIEW');
    expect(company.members[0]).to.deep.include({ role: 'ADMIN' });
    expect(company.members[0].user).to.include({ email: `anil.${tag}@example.com`, invited: true });
    expect(r.data.data.inviteLink).to.match(/accept-invite\?token=/);
    // The same PAN again is refused
    expect((await api.post('/admin/organisations', { ...body, adminEmail: `other.${tag}@example.com` }, admin)).status).to.equal(409);
  });

  it('adds a travel agent already approved, with its agreement prepared', async () => {
    const r = await api.post('/admin/organisations', {
      kind: 'AGENCY', name: `Sunway Holidays ${tag}`, legalName: `Sunway Holidays LLP ${tag}`, incorporationType: 'LLP', pan: AGENT_PAN,
      address: '8 MG Road', city: 'Pune', state: 'Maharashtra', pincode: '411001', billingEmail: `desk.${tag}@example.com`, phone: '+91 98220 22222',
      adminName: 'Sana Shaikh', adminEmail: `sana.${tag}@example.com`, approve: true,
    }, admin);
    expect(r.status, JSON.stringify(r.data)).to.equal(200);
    agency = r.data.data;
    created.push(agency.id);
    expect(agency.status).to.equal('ACTIVE');
    expect(agency.code).to.match(/^ZP-/);
  });

  it('corrects details (legal ones too), with the change in the history', async () => {
    const r = await api.put(`/admin/organisations/${company.id}/profile`, { address: '14 Brigade Road, 2nd floor', phone: '+91 98450 99999' }, admin);
    expect(r.status, JSON.stringify(r.data)).to.equal(200);
    expect(r.data.data.address).to.equal('14 Brigade Road, 2nd floor');
    expect(r.data.data.history.some((h) => h.action === 'ORG_PROFILE_UPDATED_BY_STAFF')).to.equal(true);
    expect((await api.put(`/admin/organisations/${company.id}/profile`, { pan: 'BAD' }, admin)).status).to.equal(400);
  });

  it('checks KYC files: verified, or not acceptable with a note', async () => {
    const doc = { id: `doc-${tag}`, type: 'PAN_CARD', name: 'pan.pdf', key: 'none', mimeType: 'application/pdf', size: 10, uploadedAt: new Date().toISOString() };
    await prisma.organisation.update({ where: { id: company.id }, data: { documents: [doc] } });
    expect((await api.post(`/admin/organisations/${company.id}/documents/${doc.id}/review`, { status: 'REJECTED' }, admin)).status, 'note needed').to.equal(400);
    const bad = await api.post(`/admin/organisations/${company.id}/documents/${doc.id}/review`, { status: 'REJECTED', note: 'The scan is blurred' }, admin);
    expect(bad.data.data.documents[0].review).to.include({ status: 'REJECTED', note: 'The scan is blurred' });
    const ok = await api.post(`/admin/organisations/${company.id}/documents/${doc.id}/review`, { status: 'VERIFIED' }, admin);
    expect(ok.data.data.documents[0].review.status).to.equal('VERIFIED');
  });

  it('adds someone to the team', async () => {
    const r = await api.post(`/admin/organisations/${agency.id}/members`, { email: `ops.${tag}@example.com`, name: 'Ops Desk', role: 'BOOKER' }, admin);
    expect(r.status, JSON.stringify(r.data)).to.equal(200);
    expect(r.data.data.role).to.equal('BOOKER');
    expect((await api.post(`/admin/organisations/${agency.id}/members`, { email: `ops.${tag}@example.com`, name: 'Ops Desk', role: 'BOOKER' }, admin)).status).to.equal(409);
  });

  it('shows the overview, bookings and reports (with CSV)', async () => {
    const o = await api.get('/admin/organisations/overview', admin);
    expect(o.status, JSON.stringify(o.data)).to.equal(200);
    expect(o.data.data.waiting.some((w) => w.id === company.id)).to.equal(true);
    expect(o.data.data.counts.AGENCY.ACTIVE).to.be.at.least(1);
    expect(o.data.data.month.CORPORATE).to.have.keys(['bookings', 'value']);
    expect((await api.get('/admin/organisations/overview', hotelOwner)).status).to.be.oneOf([401, 403]);

    const b = await api.get(`/admin/organisations/${agency.id}/bookings`, admin);
    expect(b.status).to.equal(200);
    expect(b.data.data).to.include({ total: 0 });

    const rep = await api.get(`/admin/organisations/${agency.id}/report`, admin);
    expect(rep.status, JSON.stringify(rep.data)).to.equal(200);
    expect(rep.data.data.trend).to.have.length(6);
    expect(rep.data.data.totals).to.include({ bookings: 0 });
    expect(rep.data.data.commission.totals).to.include({ commission: 0 });
    const csv = await api.get(`/admin/organisations/${company.id}/report.csv`, admin);
    expect(csv.status).to.equal(200);
    expect(csv.headers['content-type']).to.include('text/csv');
    expect(String(csv.data)).to.include('Booking,Invoice number');
  });
});
