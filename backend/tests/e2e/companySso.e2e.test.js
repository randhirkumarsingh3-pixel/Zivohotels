/**
 * Company sign-in (ZivoPlus for Business): domain proof by DNS TXT, a test sign-in, then employees
 * signing in with Google Workspace or Microsoft, auto-join, and "company sign-in only".
 *
 * The API must run with SSO_MOCK_IDP_URL=http://127.0.0.1:<SSO_MOCK_PORT, default 5098>: this test
 * starts a stand-in identity provider there (authorize / token / signing keys for Google and
 * Microsoft, and the DNS TXT lookup). ID tokens are really signed (RS256) and checked by the API.
 */
import axios from 'axios';
import { expect } from 'chai';
import minimist from 'minimist';
import crypto from 'crypto';
import http from 'http';
import prisma from '../../config/db.js';
import bcrypt from '../../utils/bcrypt.js';

const argv = minimist(process.argv.slice(2));
const API = `${argv.url || process.env.E2E_URL || 'http://localhost:5000'}/api/v1`;
const api = axios.create({ baseURL: API, validateStatus: () => true, maxRedirects: 0 });
const PORT = Number(process.env.SSO_MOCK_PORT || 5098);
const MOCK = `http://127.0.0.1:${PORT}`;
const CLIENT = 'zivoplus-mock-client';

// --- The stand-in identity provider -------------------------------------------------------------
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const { privateKey: strangerKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const KID = 'mock-key-1';
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: KID, use: 'sig', alg: 'RS256' };
const codes = new Map(); // code -> { claims, challenge, issuer, key }
const txt = new Map(); // DNS name -> [values]
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const sign = (claims, key = privateKey) => {
  const head = b64({ alg: 'RS256', kid: KID, typ: 'JWT' }); const body = b64(claims);
  return `${head}.${body}.${crypto.sign('RSA-SHA256', Buffer.from(`${head}.${body}`), key).toString('base64url')}`;
};
const readBody = (req) => new Promise((r) => { let d = ''; req.on('data', (c) => { d += c; }); req.on('end', () => r(d)); });
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, MOCK);
  const json = (code, o) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
  if (url.pathname.endsWith('/jwks')) return json(200, { keys: [jwk] });
  if (url.pathname === '/dns') return json(200, { txt: txt.get(url.searchParams.get('name')) || [] });
  if (url.pathname.endsWith('/token') && req.method === 'POST') {
    const f = new URLSearchParams(await readBody(req));
    const c = codes.get(f.get('code'));
    if (!c || f.get('client_id') !== CLIENT || f.get('client_secret') !== 'zivoplus-mock-secret') return json(400, { error: 'invalid_grant' });
    codes.delete(f.get('code'));
    // PKCE: the verifier must match the challenge sent to /authorize
    if (crypto.createHash('sha256').update(f.get('code_verifier') || '').digest('base64url') !== c.challenge) return json(400, { error: 'invalid_grant', error_description: 'PKCE check failed' });
    return json(200, { id_token: sign({ iss: c.issuer, aud: CLIENT, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 600, ...c.claims }, c.key) });
  }
  return json(404, {});
});

/** Plays the provider's sign-in page: the person signs in as `claims`; returns the API's redirect. */
const signInAt = async (url, claims, { tid = null, tamper = {} } = {}) => {
  const u = new URL(url);
  const provider = u.pathname.startsWith('/google') ? 'google' : 'microsoft';
  const code = crypto.randomBytes(12).toString('hex');
  codes.set(code, {
    claims: { nonce: tamper.nonce ?? u.searchParams.get('nonce'), ...(tid ? { tid } : {}), ...claims },
    challenge: u.searchParams.get('code_challenge'),
    issuer: provider === 'google' ? `${MOCK}/google` : `${MOCK}/microsoft/${tid}`,
    key: tamper.key || privateKey,
  });
  const r = await api.get(`/auth/sso/callback?code=${code}&state=${encodeURIComponent(tamper.state ?? u.searchParams.get('state'))}`);
  return { status: r.status, location: r.headers.location || '', cookie: (r.headers['set-cookie'] || []).join(';'), state: u.searchParams.get('state') };
};
const errorOf = (location) => new URL(location, 'http://x').searchParams.get('sso_error') || '';

describe('Company sign-in (Google Workspace / Microsoft)', function () {
  this.timeout(60000);
  const tag = Date.now().toString().slice(-7);
  const domain = `acme${tag}.in`;
  const password = `Sso!${crypto.randomUUID().slice(0, 10)}x9`;
  let admin; let orgId; let otherOrgId; let staff; let staffUser;
  const auth = (t) => ({ headers: { Authorization: `Bearer ${t}` } });

  before(async () => {
    await new Promise((r) => { server.listen(PORT, '127.0.0.1', r); });
    const hash = await bcrypt.hash(password, 10);
    const mk = (name, email) => prisma.user.create({ data: { name, email, password: hash, role: 'CUSTOMER', status: 'ACTIVE', emailVerifiedAt: new Date() } });
    const a = await mk('Asha Menon', `asha@${domain}`);
    staffUser = await mk('Ravi Kumar', `ravi@${domain}`);
    const org = async (name, by) => prisma.organisation.create({ data: { kind: 'CORPORATE', code: `ZB-S${tag}${name.length}`, name, legalName: `${name} Private Limited`, pan: `AABCS${tag.slice(3)}K`, address: '1 MG Road', city: 'Bengaluru', state: 'Karnataka', pincode: '560001', billingEmail: `ap@${domain}`, phone: '9845011155', status: 'ACTIVE', createdById: by } });
    const o = await org(`Acme ${tag}`, a.id);
    orgId = o.id;
    await prisma.orgMember.create({ data: { organisationId: orgId, userId: a.id, role: 'ADMIN' } });
    await prisma.orgMember.create({ data: { organisationId: orgId, userId: staffUser.id, role: 'TRAVELLER' } });
    const o2 = await org(`Other Co ${tag}`, a.id);
    otherOrgId = o2.id;
    await prisma.orgMember.create({ data: { organisationId: otherOrgId, userId: a.id, role: 'ADMIN' } });
    admin = (await api.post('/auth/login', { email: a.email, password })).data.data.token;
    staff = (await api.post('/auth/login', { email: staffUser.email, password })).data.data.token;
  });

  after(async () => {
    await prisma.orgSso.updateMany({ where: { organisationId: { in: [orgId, otherOrgId] } }, data: { enabled: false, enforce: false } }).catch(() => {});
    await new Promise((r) => { server.close(r); });
  });

  it('is offered, and only a company admin can set it up', async () => {
    expect((await api.get('/business/info')).data.data.sso.available).to.equal(true);
    expect((await api.get('/auth/config')).data.data.companySso).to.equal(true);
    const r = await api.get(`/business/${orgId}/sso`, auth(admin));
    expect(r.status, JSON.stringify(r.data)).to.equal(200);
    expect(r.data.data.providers).to.deep.equal({ GOOGLE: true, MICROSOFT: true });
    expect(r.data.data.config.enabled).to.equal(false);
    expect((await api.get(`/business/${orgId}/sso`, auth(staff))).status).to.equal(403);
  });

  it('proves the email domain with a DNS TXT record; public and taken domains are refused', async () => {
    expect((await api.post(`/business/${orgId}/sso/domains`, { domain: 'gmail.com' }, auth(admin))).status).to.equal(400);
    const add = await api.post(`/business/${orgId}/sso/domains`, { domain: `@${domain.toUpperCase()}` }, auth(admin));
    expect(add.status, JSON.stringify(add.data)).to.equal(201);
    const d = add.data.data;
    expect(d).to.include({ domain, status: 'PENDING', txtName: `_zivoplus.${domain}` });
    expect(d.txtValue).to.match(/^zivoplus-verification=[0-9a-f]{32}$/);
    const early = await api.post(`/business/${orgId}/sso/domains/${d.id}/verify`, {}, auth(admin));
    expect(early.status).to.equal(409);
    expect(early.data.message).to.include('TXT record');
    txt.set(d.txtName, ['v=spf1 -all', d.txtValue]);
    const ok = await api.post(`/business/${orgId}/sso/domains/${d.id}/verify`, {}, auth(admin));
    expect(ok.status, JSON.stringify(ok.data)).to.equal(200);
    expect(ok.data.data.status).to.equal('VERIFIED');
    // Another company can't claim a domain that is verified
    expect((await api.post(`/business/${otherOrgId}/sso/domains`, { domain }, auth(admin))).status).to.equal(409);
  });

  it('needs a test sign-in that works before it can be turned on', async () => {
    expect((await api.put(`/business/${orgId}/sso`, { provider: 'GOOGLE', enabled: true }, auth(admin))).status).to.equal(409);
    expect((await api.put(`/business/${orgId}/sso`, { provider: 'GOOGLE' }, auth(admin))).status).to.equal(200);
    // A personal Google account at the company address (no Workspace "hd") fails the test
    let t = await api.post(`/business/${orgId}/sso/test`, {}, auth(admin));
    expect(t.status, JSON.stringify(t.data)).to.equal(200);
    expect(t.data.data.url).to.include(`${MOCK}/google/authorize`).and.include(`hd=${domain}`).and.include('code_challenge_method=S256');
    let back = await signInAt(t.data.data.url, { sub: 'g-1', email: `asha@${domain}`, email_verified: true, name: 'Asha Menon' });
    expect(back.status).to.equal(303);
    expect(back.location).to.include('/business?tab=signin&sso_test=error');
    expect(errorOf(back.location)).to.include('Google Workspace');
    // With the Workspace account it works
    t = await api.post(`/business/${orgId}/sso/test`, {}, auth(admin));
    back = await signInAt(t.data.data.url, { sub: 'g-1', email: `asha@${domain}`, email_verified: true, hd: domain, name: 'Asha Menon' });
    expect(back.location).to.include('sso_test=ok');
    expect(back.cookie, 'a test does not sign anyone in').to.not.include('zivo');
    const s = (await api.get(`/business/${orgId}/sso`, auth(admin))).data.data;
    expect(s.lastTest).to.include({ ok: true, email: `asha@${domain}` });
    const on = await api.put(`/business/${orgId}/sso`, { ...s.config, enabled: true }, auth(admin));
    expect(on.status, JSON.stringify(on.data)).to.equal(200);
    expect(on.data.data.config.enabled).to.equal(true);
  });

  it('signs a member in with their work account; others need an invitation unless auto-join is on', async () => {
    expect((await api.post('/auth/sso/start', { email: `someone@not-set-up-${tag}.in` })).status).to.equal(404);
    let st = await api.post('/auth/sso/start', { email: `ravi@${domain}`, returnTo: '/business?tab=trips' });
    expect(st.status, JSON.stringify(st.data)).to.equal(200);
    expect(st.data.data.url).to.include(`login_hint=ravi%40${domain}`);
    const back = await signInAt(st.data.data.url, { sub: 'g-2', email: `ravi@${domain}`, email_verified: true, hd: domain, name: 'Ravi Kumar' });
    expect(back.status).to.equal(303);
    expect(back.location).to.match(/\/business\?tab=trips$/);
    expect(back.cookie).to.match(/=[\w-]+\.[\w-]+\.[\w-]+/); // the session cookie (a signed token)
    const me = await api.get('/auth/me', { headers: { Cookie: back.cookie.split(';')[0] } });
    expect(me.status).to.equal(200);
    expect(me.data.data.user.email).to.equal(`ravi@${domain}`);

    // The same sign-in link can't be used twice
    const again = await signInAt(st.data.data.url, { sub: 'g-2', email: `ravi@${domain}`, email_verified: true, hd: domain }, { tamper: { state: back.state } });
    expect(again.location).to.include('/login?company=1');
    expect(errorOf(again.location)).to.include('expired');

    // A new employee without an invitation
    st = await api.post('/auth/sso/start', { email: `neha@${domain}` });
    const no = await signInAt(st.data.data.url, { sub: 'g-3', email: `neha@${domain}`, email_verified: true, hd: domain, name: 'Neha Shah' });
    expect(errorOf(no.location)).to.include('Ask your travel admin');
    expect(await prisma.user.findUnique({ where: { email: `neha@${domain}` } })).to.equal(null);

    // Auto-join: they join as the role the admin chose
    const cfg = (await api.get(`/business/${orgId}/sso`, auth(admin))).data.data.config;
    expect((await api.put(`/business/${orgId}/sso`, { ...cfg, autoJoin: true, defaultRole: 'BOOKER' }, auth(admin))).status).to.equal(200);
    st = await api.post('/auth/sso/start', { email: `neha@${domain}` });
    const yes = await signInAt(st.data.data.url, { sub: 'g-3', email: `neha@${domain}`, email_verified: true, hd: domain, name: 'Neha Shah' });
    expect(yes.location).to.match(/\/business$/);
    const neha = await prisma.user.findUnique({ where: { email: `neha@${domain}` } });
    expect(neha).to.include({ name: 'Neha Shah', role: 'CUSTOMER', status: 'ACTIVE' });
    expect(await prisma.orgMember.findUnique({ where: { organisationId_userId: { organisationId: orgId, userId: neha.id } } })).to.include({ role: 'BOOKER', status: 'ACTIVE' });
  });

  it('refuses forged or mismatched identities', async () => {
    let st = await api.post('/auth/sso/start', { email: `ravi@${domain}` });
    const forged = await signInAt(st.data.data.url, { sub: 'g-2', email: `ravi@${domain}`, email_verified: true, hd: domain }, { tamper: { key: strangerKey } });
    expect(errorOf(forged.location)).to.include('signature');
    st = await api.post('/auth/sso/start', { email: `ravi@${domain}` });
    const replayed = await signInAt(st.data.data.url, { sub: 'g-2', email: `ravi@${domain}`, email_verified: true, hd: domain }, { tamper: { nonce: 'another-request' } });
    expect(errorOf(replayed.location)).to.include('matched');
    st = await api.post('/auth/sso/start', { email: `ravi@${domain}` });
    const elsewhere = await signInAt(st.data.data.url, { sub: 'g-9', email: 'ravi@elsewhere.in', email_verified: true, hd: 'elsewhere.in' });
    expect(errorOf(elsewhere.location)).to.include('verified domains');
  });

  it('"company sign-in only": passwords stop working for employees, not for the company admin', async () => {
    const cfg = (await api.get(`/business/${orgId}/sso`, auth(admin))).data.data.config;
    expect((await api.put(`/business/${orgId}/sso`, { ...cfg, enforce: true }, auth(admin))).status).to.equal(200);
    const pw = await api.post('/auth/login', { email: `ravi@${domain}`, password });
    expect(pw.status).to.equal(403);
    expect(pw.data.code).to.equal('COMPANY_SSO_REQUIRED');
    expect((await api.post('/auth/login', { email: `asha@${domain}`, password })).status).to.equal(200);
    expect((await api.put(`/business/${orgId}/sso`, { ...cfg, enforce: false }, auth(admin))).status).to.equal(200);
    expect((await api.post('/auth/login', { email: `ravi@${domain}`, password })).status).to.equal(200);
  });

  it('Microsoft: a new provider needs a new test, which pins the company directory', async () => {
    const cfg = (await api.get(`/business/${orgId}/sso`, auth(admin))).data.data.config;
    const sw = await api.put(`/business/${orgId}/sso`, { ...cfg, provider: 'MICROSOFT' }, auth(admin));
    expect(sw.data.data.config.enabled, 'switched off until tested').to.equal(false);
    expect(sw.data.data.lastTest).to.equal(null);
    const tid = crypto.randomUUID();
    const t = await api.post(`/business/${orgId}/sso/test`, {}, auth(admin));
    expect(t.data.data.url).to.include(`${MOCK}/microsoft/organizations/authorize`);
    const back = await signInAt(t.data.data.url, { sub: 'm-1', preferred_username: `asha@${domain}`, name: 'Asha Menon' }, { tid });
    expect(back.location).to.include('sso_test=ok');
    const s = (await api.get(`/business/${orgId}/sso`, auth(admin))).data.data;
    expect(s.config.tenantId).to.equal(tid);
    expect((await api.put(`/business/${orgId}/sso`, { ...s.config, enabled: true }, auth(admin))).status).to.equal(200);
    // Someone from another Microsoft directory with an address at the domain is refused
    let st = await api.post('/auth/sso/start', { email: `ravi@${domain}` });
    expect(st.data.data.url).to.include(`/microsoft/${tid}/authorize`);
    const wrong = await signInAt(st.data.data.url, { sub: 'm-2', preferred_username: `ravi@${domain}` }, { tid: crypto.randomUUID() });
    expect(errorOf(wrong.location)).to.include('directory');
    st = await api.post('/auth/sso/start', { email: `ravi@${domain}` });
    const right = await signInAt(st.data.data.url, { sub: 'm-2', preferred_username: `ravi@${domain}` }, { tid });
    expect(right.location).to.match(/\/business$/);
  });

  it('removing the last verified domain turns company sign-in off', async () => {
    const s = (await api.get(`/business/${orgId}/sso`, auth(admin))).data.data;
    expect((await api.delete(`/business/${orgId}/sso/domains/${s.domains[0].id}`, auth(admin))).status).to.equal(200);
    const after = (await api.get(`/business/${orgId}/sso`, auth(admin))).data.data;
    expect(after.config.enabled).to.equal(false);
    expect(after.domains).to.have.length(0);
    expect((await api.post('/auth/sso/start', { email: `ravi@${domain}` })).status).to.equal(404);
  });
});
