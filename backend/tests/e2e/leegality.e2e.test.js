/**
 * Aadhaar eSign through Leegality, end to end against a stand-in Leegality server started here.
 * The API must run with LEEGALITY_BASE_URL=http://127.0.0.1:<LEEGALITY_MOCK_PORT, default 5099>,
 * LEEGALITY_AUTH_TOKEN and LEEGALITY_PRIVATE_SALT (the same values as this test; see the PR
 * workflow). Skipped when the API isn't pointed at the stand-in.
 *
 *  - admin switches signing to Aadhaar eSign with a workflow ID; owners then can't use the email code
 *  - the owner's "Sign with Aadhaar" sends the agreement PDF to Leegality and returns the signing link
 *  - webhooks with a wrong mac are refused; a genuine one makes us read the document back,
 *    store Leegality's signed PDF and audit trail, and mark the agreement signed
 *  - a declined signature is recorded; admin "Check Leegality" works without a webhook
 */
import http from 'http';
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

const PORT = Number(process.env.LEEGALITY_MOCK_PORT || 5099);
const TOKEN = process.env.LEEGALITY_AUTH_TOKEN || 'ci-leegality-token';
const SALT = process.env.LEEGALITY_PRIVATE_SALT || 'ci-leegality-salt';
const mac = (id) => crypto.createHmac('sha1', SALT).update(id).digest('hex');
const SIGNED_PDF = Buffer.from('%PDF-1.4\n% signed by leegality stand-in\n%%EOF\n');
const AUDIT_PDF = Buffer.from('%PDF-1.4\n% audit trail stand-in\n%%EOF\n');

// ─── Stand-in Leegality ──────────────────────────────────────────────────────
const docs = new Map(); // documentId → { status, invitation }
const requests = [];
const mock = http.createServer((req, res) => {
  const send = (code, body, type = 'application/json') => { res.writeHead(code, { 'Content-Type': type }); res.end(type === 'application/json' ? JSON.stringify(body) : body); };
  let raw = '';
  req.on('data', (c) => { raw += c; });
  req.on('end', () => {
    const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
    if (url.pathname === '/files/signed.pdf') return send(200, SIGNED_PDF, 'application/pdf');
    if (url.pathname === '/files/audit.pdf') return send(200, AUDIT_PDF, 'application/pdf');
    if (req.headers['x-auth-token'] !== TOKEN) return send(401, { status: 0, messages: [{ code: 'auth', message: 'Invalid token' }] });
    if (req.method === 'POST' && url.pathname === '/api/v3.0/sign/request') {
      const body = JSON.parse(raw || '{}');
      requests.push(body);
      const documentId = `doc${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
      const inv = body.invitees[0];
      docs.set(documentId, { status: 'SENT', invitation: { name: inv.name, email: inv.email, invitationStatus: { signed: false, rejected: false, expired: false } } });
      return send(200, { status: 1, messages: [], data: { documentId, irn: body.irn, invitees: [{ name: inv.name, email: inv.email, signUrl: `https://sandbox.leegality.com/sign/${documentId}`, expiryDate: '31-12-2099' }] } });
    }
    if (req.method === 'GET' && url.pathname === '/api/v3.3/document/details') {
      const d = docs.get(url.searchParams.get('documentId'));
      if (!d) return send(200, { status: 0, messages: [{ message: 'Document not found' }] });
      const done = d.status === 'COMPLETED';
      return send(200, { status: 1, messages: [], data: {
        document: { status: d.status },
        file: done && url.searchParams.get('file') === 'true' ? `http://127.0.0.1:${PORT}/files/signed.pdf` : null,
        auditTrail: done && url.searchParams.get('auditTrail') === 'true' ? `http://127.0.0.1:${PORT}/files/audit.pdf` : null,
        invitations: [d.invitation],
      } });
    }
    return send(404, { status: 0, messages: [{ message: 'not found' }] });
  });
});
const signAt = (documentId) => {
  const d = docs.get(documentId);
  d.status = 'COMPLETED';
  d.invitation.invitationStatus = { signed: true, rejected: false, expired: false, signDate: '25-11-2026 14:30:00' };
  d.invitation.usedSignatureType = 'AADHAAR';
  d.invitation.certificateData = { name: 'Asha Rao', yob: '1985', gender: 'F', state: 'Karnataka', pincode: '560038', title: '1234', serialNumber: 'SN123' };
};

describe('Aadhaar eSign through Leegality', function () {
  this.timeout(180000);
  let admin; let owner; let ownerUser; let hotel; let view; let savedFinance; let savedSigning; let active = false;
  const password = `Lgl!${crypto.randomUUID().slice(0, 10)}x9`;

  before(async function () {
    await new Promise((r, j) => { mock.once('error', j); mock.listen(PORT, '127.0.0.1', r); });
    admin = { headers: { Authorization: `Bearer ${(await login('admin@zivoplus.com', 'admin123')).data.data.token}` } };
    const s = (await api.get('/admin/agreement-template/signing', admin)).data.data;
    if (!s?.leegality?.configured) { console.log('      (API not set up with a Leegality stand-in: skipped)'); this.skip(); }
    active = true;
    const email = `lgl.owner.${Date.now()}@example.com`;
    ownerUser = await prisma.user.create({ data: { name: 'Asha Rao', email, phone: '+919876543210', password: await bcrypt.hash(password, 10), role: 'OWNER', status: 'ACTIVE', emailVerifiedAt: new Date() } });
    owner = { headers: { Authorization: `Bearer ${(await login(email, password)).data.data.token}` } };
    hotel = await prisma.hotel.create({ data: {
      name: `Aadhaar Sign Inn ${Date.now() % 10000}`, location: 'Indiranagar', city: 'Bengaluru', state: 'Karnataka', pincode: '560038', ownerId: ownerUser.id, status: 'DRAFT',
      legalName: 'Asha Hospitality Private Limited', pan: 'AAPFU0939F', incorporationType: 'PARTNERSHIP', gstin: '29AAPFU0939F1ZQ',
      integrationSettings: { addressDetails: { houseNo: '12, 100 Feet Road', area: 'Indiranagar' } },
    } });
    const b = await api.post('/verification/bank-account', { hotelId: hotel.id, accountName: 'Asha Hospitality Private Limited', accountNumber: '50100123456789', ifscCode: 'HDFC0001234' }, owner);
    expect(b.status, JSON.stringify(b.data)).to.equal(200);
    savedFinance = await prisma.systemConfig.findUnique({ where: { key: 'finance_settings' } });
    const fin = savedFinance?.value || {};
    const company = { ...(fin.company || {}), legalName: 'ZivoPlus Hospitality Private Limited', address: '1 MG Road, Bengaluru 560001', gstin: '29AAPFU0939F1ZV', stateCode: '29' };
    await prisma.systemConfig.upsert({ where: { key: 'finance_settings' }, update: { value: { ...fin, company } }, create: { key: 'finance_settings', value: { company } } });
    savedSigning = await prisma.systemConfig.findUnique({ where: { key: 'agreement_signing' } });
    await prisma.hotel.update({ where: { id: hotel.id }, data: { status: 'PENDING_AGREEMENT' } });
    const p = await api.post(`/admin/agreements/${hotel.id}/prepare`, { commissionRate: 12, payoutCycle: 'Weekly' }, admin);
    expect(p.status, JSON.stringify(p.data)).to.equal(200);
  });

  after(async () => {
    await new Promise((r) => { mock.close(() => r()); });
    if (!active) return;
    if (savedFinance) await prisma.systemConfig.update({ where: { key: 'finance_settings' }, data: { value: savedFinance.value } }).catch(() => {});
    if (savedSigning) await prisma.systemConfig.update({ where: { key: 'agreement_signing' }, data: { value: savedSigning.value } }).catch(() => {});
    else await prisma.systemConfig.deleteMany({ where: { key: 'agreement_signing' } }).catch(() => {});
  });

  it('admin chooses Aadhaar eSign with a workflow ID; owners only see the Aadhaar option', async () => {
    expect((await api.put('/admin/agreement-template/signing', { method: 'LEEGALITY_AADHAAR', leegalityProfileId: '' }, admin)).status).to.equal(400);
    expect((await api.put('/admin/agreement-template/signing', { method: 'LEEGALITY_AADHAAR', leegalityProfileId: 'wf1' }, owner)).status).to.equal(403);
    const r = await api.put('/admin/agreement-template/signing', { method: 'LEEGALITY_AADHAAR', leegalityProfileId: 'WkFlow01', allowEmailFallback: false }, admin);
    expect(r.status, JSON.stringify(r.data)).to.equal(200);
    expect(r.data.data.active).to.equal('LEEGALITY_AADHAAR');
    view = (await api.get(`/extranet/agreement/${hotel.id}`, owner)).data.data;
    expect(view.signing).to.include({ method: 'LEEGALITY_AADHAAR', emailFallback: false });
    expect((await api.post(`/extranet/agreement/${hotel.id}/code`, {}, owner)).status).to.equal(409);
  });

  it('"Sign with Aadhaar" needs consent and sends the exact agreement to Leegality', async () => {
    expect((await api.post(`/extranet/agreement/${hotel.id}/aadhaar`, { consent: false, contentHash: view.contentHash }, owner)).status).to.equal(400);
    expect((await api.post(`/extranet/agreement/${hotel.id}/aadhaar`, { consent: true, contentHash: 'old' }, owner)).status).to.equal(409);
    const r = await api.post(`/extranet/agreement/${hotel.id}/aadhaar`, { consent: true, contentHash: view.contentHash }, owner);
    expect(r.status, JSON.stringify(r.data)).to.equal(200);
    expect(r.data.data.signUrl).to.match(/^https:\/\/sandbox\.leegality\.com\/sign\//);
    const sent = requests.at(-1);
    expect(sent.profileId).to.equal('WkFlow01');
    expect(sent.invitees[0]).to.include({ email: ownerUser.email, phone: '9876543210' });
    expect(Buffer.from(sent.file.file, 'base64').subarray(0, 5).toString()).to.equal('%PDF-');
    // Asking again for the same text reuses the request
    const again = await api.post(`/extranet/agreement/${hotel.id}/aadhaar`, { consent: true, contentHash: view.contentHash }, owner);
    expect(again.data.data.documentId).to.equal(r.data.data.documentId);
    expect(requests.length).to.equal(1);
  });

  it('refuses webhooks without the right mac; a genuine one stores the signed PDF and audit trail', async () => {
    const ag = await prisma.agreement.findUnique({ where: { hotelId: hotel.id } });
    const documentId = ag.leegalityDocumentId;
    signAt(documentId);
    expect((await api.post('/webhooks/leegality', { documentId, mac: 'f'.repeat(40), webhookType: 'Success' })).status).to.equal(401);
    expect((await api.post('/webhooks/leegality', { documentId })).status).to.equal(401);
    expect((await prisma.agreement.findUnique({ where: { hotelId: hotel.id } })).status).to.equal('PENDING_SIGNATURE');
    // Unknown document: acknowledged, nothing changes
    expect((await api.post('/webhooks/leegality', { documentId: 'docunknown', mac: mac('docunknown') })).status).to.equal(200);

    const r = await api.post('/webhooks/leegality', { documentId, mac: mac(documentId), webhookType: 'Success', documentStatus: 'Completed', request: { email: ownerUser.email, action: 'Signed' } });
    expect(r.status, JSON.stringify(r.data)).to.equal(200);
    const a = await prisma.agreement.findUnique({ where: { hotelId: hotel.id } });
    expect(a).to.include({ status: 'SIGNED', signatureMethod: 'AADHAAR_ESIGN', leegalityStatus: 'COMPLETED', signerName: 'Asha Rao' });
    expect(a.signerCertificate).to.include({ aadhaarLast4: '1234', provider: 'Leegality' });
    expect(new Date(a.signedAt).toISOString()).to.equal('2026-11-25T09:00:00.000Z');
    expect((await prisma.hotel.findUnique({ where: { id: hotel.id } })).status).to.equal('READY_FOR_GO_LIVE');

    const pdf = await api.get(`/extranet/agreement/${hotel.id}/pdf`, { ...owner, responseType: 'arraybuffer' });
    expect(Buffer.from(pdf.data).equals(SIGNED_PDF)).to.equal(true);
    const audit = await api.get(`/extranet/agreement/${hotel.id}/audit-trail`, { ...owner, responseType: 'arraybuffer' });
    expect(Buffer.from(audit.data).equals(AUDIT_PDF)).to.equal(true);
    expect((await api.get(`/admin/agreements/${hotel.id}/audit-trail`, { ...admin, responseType: 'arraybuffer' })).status).to.equal(200);
    // A repeat webhook is harmless
    expect((await api.post('/webhooks/leegality', { documentId, mac: mac(documentId) })).status).to.equal(200);
    const list = (await api.get('/admin/agreements', admin)).data.data.find((x) => x.hotelId === hotel.id);
    expect(list.signatureMethod).to.equal('AADHAAR_ESIGN');
    expect(list).not.to.have.property('leegalitySignUrl');
  });

  it('a declined signature is recorded, and "Check Leegality" works without a webhook', async () => {
    // Prepare a fresh agreement for the same property (cancel the signed one first)
    const ag = await prisma.agreement.findUnique({ where: { hotelId: hotel.id } });
    expect((await api.delete(`/admin/agreements/${ag.id}`, admin)).status).to.equal(200);
    await prisma.hotel.update({ where: { id: hotel.id }, data: { status: 'PENDING_AGREEMENT' } });
    expect((await api.post(`/admin/agreements/${hotel.id}/prepare`, { commissionRate: 12 }, admin)).status).to.equal(200);
    view = (await api.get(`/extranet/agreement/${hotel.id}`, owner)).data.data;
    expect(view.signing.leegalityStatus).to.equal(null);
    const r = await api.post(`/extranet/agreement/${hotel.id}/aadhaar`, { consent: true, contentHash: view.contentHash }, owner);
    expect(r.status, JSON.stringify(r.data)).to.equal(200);
    docs.get(r.data.data.documentId).invitation.invitationStatus = { signed: false, rejected: true, expired: false };
    const c = await api.post(`/admin/agreements/${hotel.id}/refresh`, {}, admin);
    expect(c.status, JSON.stringify(c.data)).to.equal(200);
    expect(c.data.data).to.include({ status: 'PENDING_SIGNATURE', leegalityStatus: 'REJECTED' });
    // Starting again makes a new request
    const again = await api.post(`/extranet/agreement/${hotel.id}/aadhaar`, { consent: true, contentHash: view.contentHash }, owner);
    expect(again.data.data.documentId).not.to.equal(r.data.data.documentId);
  });
});
