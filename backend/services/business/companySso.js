/**
 * Company sign-in (single sign-on) for ZivoPlus for Business: employees at a company's verified
 * email domains sign in with Google Workspace or Microsoft Entra ID (OpenID Connect, code flow
 * with PKCE, state and nonce; the ID token's signature is checked against the provider's keys).
 *
 * Set up by the company's admin (Business → Sign-in): choose the provider, prove each email
 * domain with a DNS TXT record, test a sign-in, then turn it on; optionally new employees join
 * automatically and company sign-in becomes the only way in for those emails.
 *
 * ZivoPlus's own app registrations (environment):
 *   Google     SSO_GOOGLE_CLIENT_ID / SSO_GOOGLE_CLIENT_SECRET (else GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET)
 *   Microsoft  SSO_MICROSOFT_CLIENT_ID / SSO_MICROSOFT_CLIENT_SECRET (multi-tenant app)
 *   Redirect   SSO_REDIRECT_URI, else <FRONTEND_URL>/api/v1/auth/sso/callback
 * Outside production, SSO_MOCK_IDP_URL points both providers (and the DNS check) at a test
 * identity provider (tests/e2e/companySso.e2e.test.js).
 */
import crypto from 'crypto';
import dns from 'dns';
import { Prisma } from '@prisma/client';
import prisma from '../../config/db.js';
import bcrypt from '../../utils/bcrypt.js';
import { membershipFor, ROLES } from './organisationService.js';

const fail = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });
const site = () => String(process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');
const mock = () => (process.env.NODE_ENV !== 'production' && process.env.SSO_MOCK_IDP_URL ? String(process.env.SSO_MOCK_IDP_URL).replace(/\/$/, '') : null);
const STATE_TTL = 10 * 60 * 1000;
const JOIN_ROLES = ['TRAVELLER', 'BOOKER', 'APPROVER', 'FINANCE'];
// Free email services: anyone can have an address there, so nobody can own them for sign-in
const PUBLIC_DOMAINS = new Set(['gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.in', 'yahoo.in', 'outlook.com', 'hotmail.com', 'live.com', 'msn.com', 'icloud.com', 'me.com', 'aol.com', 'rediffmail.com', 'proton.me', 'protonmail.com', 'zoho.com', 'zohomail.in', 'yandex.com', 'gmx.com', 'mail.com']);

export const TXT_PREFIX = '_zivoplus';
export const txtName = (domain) => `${TXT_PREFIX}.${domain}`;
export const txtValue = (token) => `zivoplus-verification=${token}`;
export const domainOf = (email) => String(email || '').trim().toLowerCase().split('@')[1] || '';

// --- Providers -------------------------------------------------------------------------------

const creds = (p) => {
  if (mock()) return { id: 'zivoplus-mock-client', secret: 'zivoplus-mock-secret' };
  if (p === 'GOOGLE') return { id: process.env.SSO_GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID, secret: process.env.SSO_GOOGLE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET };
  return { id: process.env.SSO_MICROSOFT_CLIENT_ID, secret: process.env.SSO_MICROSOFT_CLIENT_SECRET };
};

/** Which providers ZivoPlus offers (its app registration is set up). */
export const providersOffered = () => ({
  GOOGLE: Boolean(creds('GOOGLE').id && creds('GOOGLE').secret),
  MICROSOFT: Boolean(creds('MICROSOFT').id && creds('MICROSOFT').secret),
});
export const ssoAvailable = () => Object.values(providersOffered()).some(Boolean);

const endpoints = (p, tenant) => {
  const m = mock();
  if (p === 'GOOGLE') {
    if (m) return { authorize: `${m}/google/authorize`, token: `${m}/google/token`, jwks: `${m}/google/jwks`, issuers: [`${m}/google`] };
    return { authorize: 'https://accounts.google.com/o/oauth2/v2/auth', token: 'https://oauth2.googleapis.com/token', jwks: 'https://www.googleapis.com/oauth2/v3/certs', issuers: ['https://accounts.google.com', 'accounts.google.com'] };
  }
  const t = tenant || 'organizations';
  if (m) return { authorize: `${m}/microsoft/${t}/authorize`, token: `${m}/microsoft/${t}/token`, jwks: `${m}/microsoft/jwks`, issuerFor: (tid) => `${m}/microsoft/${tid}` };
  return {
    authorize: `https://login.microsoftonline.com/${t}/oauth2/v2.0/authorize`,
    token: `https://login.microsoftonline.com/${t}/oauth2/v2.0/token`,
    jwks: 'https://login.microsoftonline.com/common/discovery/v2.0/keys',
    issuerFor: (tid) => `https://login.microsoftonline.com/${tid}/v2.0`,
  };
};

const redirectUri = () => process.env.SSO_REDIRECT_URI || `${site()}/api/v1/auth/sso/callback`;

// --- ID token check (RS256 against the provider's published keys) ----------------------------

const b64url = (s) => Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64');
const jwksCache = new Map(); // url -> { at, keys }

const keyFor = async (url, kid) => {
  for (const fresh of [false, true]) {
    let entry = jwksCache.get(url);
    if (fresh || !entry || Date.now() - entry.at > 3600000) {
      const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!r.ok) throw fail('Could not reach the sign-in provider. Please try again.', 502);
      entry = { at: Date.now(), keys: (await r.json()).keys || [] };
      jwksCache.set(url, entry);
    }
    const jwk = entry.keys.find((k) => k.kid === kid && (!k.use || k.use === 'sig'));
    if (jwk) return crypto.createPublicKey({ key: { kty: jwk.kty, n: jwk.n, e: jwk.e }, format: 'jwk' });
  }
  throw fail('The sign-in provider\'s signature key is unknown.', 401);
};

export const verifyIdToken = async (idToken, { jwks, issuers, issuerFor, audience, nonce }) => {
  const parts = String(idToken || '').split('.');
  if (parts.length !== 3) throw fail('The sign-in provider sent no valid identity.', 401);
  let header; let payload;
  try { header = JSON.parse(b64url(parts[0])); payload = JSON.parse(b64url(parts[1])); } catch { throw fail('The sign-in provider sent no valid identity.', 401); }
  if (header.alg !== 'RS256') throw fail('Unsupported signature on the identity token.', 401);
  const key = await keyFor(jwks, header.kid);
  const okSig = crypto.verify('RSA-SHA256', Buffer.from(`${parts[0]}.${parts[1]}`), key, b64url(parts[2]));
  if (!okSig) throw fail('The identity token\'s signature is not valid.', 401);
  const now = Math.floor(Date.now() / 1000);
  const allowed = issuers || (issuerFor && payload.tid ? [issuerFor(payload.tid)] : []);
  if (!allowed.includes(payload.iss)) throw fail('The identity token comes from an unexpected issuer.', 401);
  const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!aud.includes(audience)) throw fail('The identity token is not meant for ZivoPlus.', 401);
  if (!(payload.exp > now - 60)) throw fail('The sign-in took too long. Please try again.', 401);
  if (payload.nonce !== nonce) throw fail('The sign-in could not be matched to this request. Please try again.', 401);
  return payload;
};

// --- Settings ---------------------------------------------------------------------------------

const ssoRow = async (orgId) => (await prisma.orgSso.findUnique({ where: { organisationId: orgId } }))
  || { organisationId: orgId, enabled: false, provider: null, tenantId: null, autoJoin: false, defaultRole: 'TRAVELLER', defaultGrade: null, enforce: false, lastTest: null };

const domainView = (d) => ({ id: d.id, domain: d.domain, status: d.status, txtName: txtName(d.domain), txtValue: txtValue(d.token), verifiedAt: d.verifiedAt, checkedAt: d.checkedAt });

const view = async (orgId) => {
  const c = await ssoRow(orgId);
  const domains = await prisma.orgSsoDomain.findMany({ where: { organisationId: orgId }, orderBy: { createdAt: 'asc' } });
  return {
    config: { enabled: c.enabled, provider: c.provider, tenantId: c.tenantId, autoJoin: c.autoJoin, defaultRole: c.defaultRole, defaultGrade: c.defaultGrade, enforce: c.enforce },
    domains: domains.map(domainView), providers: providersOffered(), lastTest: c.lastTest || null,
  };
};

const adminOf = async (orgId, user) => {
  const { org } = await membershipFor(orgId, user, 'members.manage');
  if (org.kind !== 'CORPORATE') throw fail('Company sign-in is for company accounts.', 404);
  if (!ssoAvailable()) throw fail('Company sign-in is not offered yet.', 404);
  return org;
};

export const getSso = async (orgId, user) => { const org = await adminOf(orgId, user); return view(org.id); };

export const saveSso = async (orgId, user, input = {}) => {
  const org = await adminOf(orgId, user);
  const cur = await ssoRow(org.id);
  const provider = input.provider === undefined ? cur.provider : (input.provider || null);
  if (provider && !providersOffered()[provider]) throw fail('This sign-in provider is not offered.');
  const tenantId = input.tenantId === undefined ? cur.tenantId : (String(input.tenantId || '').trim() || null);
  if (tenantId && !/^[0-9a-f-]{36}$/i.test(tenantId)) throw fail('The directory (tenant) ID looks like 2b7f6c0a-1234-… (36 characters).');
  const defaultRole = input.defaultRole === undefined ? cur.defaultRole : String(input.defaultRole || 'TRAVELLER');
  if (!JOIN_ROLES.includes(defaultRole)) throw fail('New employees can join as traveller, booker, approver or finance.');
  const changedIdp = provider !== cur.provider || (provider === 'MICROSOFT' && tenantId !== cur.tenantId);
  // A different provider (or directory) needs a new test before it can be on
  const lastTest = changedIdp ? null : cur.lastTest;
  let enabled = input.enabled === undefined ? cur.enabled : Boolean(input.enabled);
  let enforce = input.enforce === undefined ? cur.enforce : Boolean(input.enforce);
  const verified = await prisma.orgSsoDomain.count({ where: { organisationId: org.id, status: 'VERIFIED' } });
  if (enabled && !(provider && verified && lastTest?.ok)) {
    // Asked to turn it on: say what is missing. Already on but the provider changed: off until tested
    if (input.enabled === true && !cur.enabled) throw fail('To turn it on: choose your work accounts, verify a domain and test a sign-in.', 409);
    enabled = false;
  }
  if (!enabled) enforce = false;
  const data = {
    enabled, provider, tenantId: provider === 'MICROSOFT' ? tenantId : null, autoJoin: Boolean(input.autoJoin ?? cur.autoJoin), defaultRole,
    defaultGrade: input.defaultGrade === undefined ? cur.defaultGrade : (String(input.defaultGrade || '').slice(0, 40) || null),
    enforce, lastTest: lastTest ?? Prisma.DbNull, updatedById: user.id,
  };
  await prisma.orgSso.upsert({ where: { organisationId: org.id }, create: { organisationId: org.id, ...data }, update: data });
  await prisma.auditLog.create({ data: { action: 'COMPANY_SSO_UPDATED', entityType: 'ORGANISATION', entityId: org.id, userId: user.id, details: { enabled, provider, autoJoin: data.autoJoin, defaultRole, enforce } } }).catch(() => {});
  return view(org.id);
};

// --- Domains ----------------------------------------------------------------------------------

export const addDomain = async (orgId, user, input = {}) => {
  const org = await adminOf(orgId, user);
  const domain = String(input.domain || '').trim().toLowerCase().replace(/^@/, '').replace(/\.$/, '');
  if (!/^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain)) throw fail('Enter a domain like yourcompany.com, without http or @.');
  if (PUBLIC_DOMAINS.has(domain)) throw fail(`${domain} is a public email service: nobody can own it for company sign-in. Use your company's own domain.`);
  if (await prisma.orgSsoDomain.findFirst({ where: { domain, status: 'VERIFIED', NOT: { organisationId: org.id } } })) throw fail(`${domain} is already verified by another ZivoPlus account. Ask ZivoPlus support if this is wrong.`, 409);
  if (await prisma.orgSsoDomain.findUnique({ where: { organisationId_domain: { organisationId: org.id, domain } } })) throw fail(`${domain} is already on your list.`, 409);
  if (await prisma.orgSsoDomain.count({ where: { organisationId: org.id } }) >= 10) throw fail('Up to 10 domains per company.');
  const d = await prisma.orgSsoDomain.create({ data: { organisationId: org.id, domain, token: crypto.randomBytes(16).toString('hex') } });
  return domainView(d);
};

const txtRecords = async (name) => {
  const m = mock();
  if (m) {
    const r = await fetch(`${m}/dns?name=${encodeURIComponent(name)}`, { signal: AbortSignal.timeout(5000) }).catch(() => null);
    return r?.ok ? (await r.json()).txt || [] : [];
  }
  try { return (await dns.promises.resolveTxt(name)).map((chunks) => chunks.join('')); } catch { return []; }
};

export const verifyDomain = async (orgId, user, domainId) => {
  const org = await adminOf(orgId, user);
  const d = await prisma.orgSsoDomain.findFirst({ where: { id: String(domainId), organisationId: org.id } });
  if (!d) throw fail('Domain not found.', 404);
  if (d.status === 'VERIFIED') return domainView(d);
  const found = (await txtRecords(txtName(d.domain))).some((v) => v.trim() === txtValue(d.token));
  if (!found) {
    await prisma.orgSsoDomain.update({ where: { id: d.id }, data: { checkedAt: new Date() } });
    throw fail(`We couldn't find the TXT record at ${txtName(d.domain)} yet. DNS changes can take up to an hour; check the name and value, then try again.`, 409);
  }
  const updated = await prisma.$transaction(async (tx) => {
    if (await tx.orgSsoDomain.findFirst({ where: { domain: d.domain, status: 'VERIFIED', NOT: { organisationId: org.id } } })) throw fail(`${d.domain} is already verified by another ZivoPlus account.`, 409);
    return tx.orgSsoDomain.update({ where: { id: d.id }, data: { status: 'VERIFIED', verifiedAt: new Date(), checkedAt: new Date() } });
  });
  await prisma.auditLog.create({ data: { action: 'COMPANY_SSO_DOMAIN_VERIFIED', entityType: 'ORGANISATION', entityId: org.id, userId: user.id, details: { domain: d.domain } } }).catch(() => {});
  return domainView(updated);
};

export const removeDomain = async (orgId, user, domainId) => {
  const org = await adminOf(orgId, user);
  const d = await prisma.orgSsoDomain.findFirst({ where: { id: String(domainId), organisationId: org.id } });
  if (!d) throw fail('Domain not found.', 404);
  await prisma.orgSsoDomain.delete({ where: { id: d.id } });
  // No verified domain left: company sign-in can't work, so it is off
  if (!(await prisma.orgSsoDomain.count({ where: { organisationId: org.id, status: 'VERIFIED' } }))) {
    await prisma.orgSso.updateMany({ where: { organisationId: org.id }, data: { enabled: false, enforce: false } });
  }
  await prisma.auditLog.create({ data: { action: 'COMPANY_SSO_DOMAIN_REMOVED', entityType: 'ORGANISATION', entityId: org.id, userId: user.id, details: { domain: d.domain } } }).catch(() => {});
  return { removed: true };
};

// --- Sign-in ----------------------------------------------------------------------------------

const safeReturn = (p) => (typeof p === 'string' && /^\/(?!\/)[^\s\\]*$/.test(p) && p.length < 500 ? p : null);

const authorizeUrl = async (orgId, c, { purpose, userId = null, returnTo = null, loginHint = null, hd = null }) => {
  const id = crypto.randomBytes(24).toString('base64url');
  const nonce = crypto.randomBytes(16).toString('base64url');
  const codeVerifier = crypto.randomBytes(32).toString('base64url');
  await prisma.ssoLoginState.deleteMany({ where: { expiresAt: { lt: new Date() } } }).catch(() => {});
  await prisma.ssoLoginState.create({ data: { id, organisationId: orgId, purpose, nonce, codeVerifier, returnTo: safeReturn(returnTo), userId, expiresAt: new Date(Date.now() + STATE_TTL) } });
  const e = endpoints(c.provider, c.tenantId);
  const q = new URLSearchParams({
    client_id: creds(c.provider).id, response_type: 'code', redirect_uri: redirectUri(), scope: 'openid email profile',
    state: id, nonce, code_challenge: crypto.createHash('sha256').update(codeVerifier).digest('base64url'), code_challenge_method: 'S256', prompt: 'select_account',
  });
  if (loginHint) q.set('login_hint', loginHint);
  if (c.provider === 'GOOGLE' && hd) q.set('hd', hd);
  return `${e.authorize}?${q}`;
};

/** The admin's test sign-in (Business → Sign-in → Test sign-in). */
export const startTest = async (orgId, user) => {
  const org = await adminOf(orgId, user);
  const c = await ssoRow(org.id);
  if (!c.provider) throw fail('Choose your work accounts first.');
  const domains = await prisma.orgSsoDomain.findMany({ where: { organisationId: org.id, status: 'VERIFIED' } });
  if (!domains.length) throw fail('Verify a domain first.');
  const own = domains.find((d) => d.domain === domainOf(user.email));
  return { url: await authorizeUrl(org.id, c, { purpose: 'TEST', userId: user.id, hd: (own || domains[0]).domain, loginHint: own ? user.email : null }) };
};

/** "Sign in with your company account": the work email's verified domain finds the company. */
export const startLogin = async (email, returnTo) => {
  const mail = String(email || '').trim().toLowerCase();
  const domain = domainOf(mail);
  if (!domain) throw fail('Enter your work email.', 422);
  const d = await prisma.orgSsoDomain.findFirst({ where: { domain, status: 'VERIFIED' } });
  const c = d && await prisma.orgSso.findUnique({ where: { organisationId: d.organisationId } });
  if (!c?.enabled || !c.provider || !providersOffered()[c.provider]) throw fail(`Company sign-in isn't set up for @${domain}. Sign in with your password or a code instead.`, 404);
  return { url: await authorizeUrl(d.organisationId, c, { purpose: 'LOGIN', returnTo, loginHint: mail, hd: domain }) };
};

/**
 * Emails whose company made company sign-in the only way in (enforce): passwords, codes and
 * Google sign-in are refused for them. The company's own admins keep their password, so they
 * can always get in to fix the setup.
 */
export const companySignInRequired = async (user) => {
  const domain = domainOf(user?.email);
  if (!domain || user.role !== 'CUSTOMER') return null;
  const d = await prisma.orgSsoDomain.findFirst({ where: { domain, status: 'VERIFIED' } });
  if (!d) return null;
  const c = await prisma.orgSso.findUnique({ where: { organisationId: d.organisationId } });
  if (!c?.enabled || !c.enforce) return null;
  const admin = await prisma.orgMember.findFirst({ where: { organisationId: d.organisationId, userId: user.id, role: 'ADMIN', status: 'ACTIVE' } });
  if (admin) return null;
  return { provider: c.provider };
};

const exchangeCode = async (c, code, codeVerifier) => {
  const e = endpoints(c.provider, c.tenantId);
  const { id, secret } = creds(c.provider);
  const r = await fetch(e.token, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' }, signal: AbortSignal.timeout(10000),
    body: new URLSearchParams({ grant_type: 'authorization_code', code: String(code), redirect_uri: redirectUri(), client_id: id, client_secret: secret, code_verifier: codeVerifier }),
  }).catch(() => null);
  const body = r ? await r.json().catch(() => ({})) : {};
  if (!r?.ok || !body.id_token) throw fail(body.error_description || 'The sign-in provider did not confirm the sign-in. Please try again.', 401);
  return body.id_token;
};

/** Who signed in, checked against the company's settings: { email, name, tid }. */
const identityFrom = async (c, claims, domains) => {
  let email; let name = claims.name || '';
  if (c.provider === 'GOOGLE') {
    email = String(claims.email || '').toLowerCase();
    if (!email || claims.email_verified !== true) throw fail('Your Google account has no confirmed email.', 401);
    // Workspace accounts carry hd (the domain); a personal Google account at a company address doesn't
    if (!claims.hd || String(claims.hd).toLowerCase() !== domainOf(email)) throw fail('Sign in with your company Google Workspace account, not a personal Google account.', 403);
  } else {
    email = String(claims.email || claims.preferred_username || claims.upn || '').toLowerCase();
    if (!claims.tid) throw fail('Your Microsoft account has no directory. Use your work account.', 403);
    if (c.tenantId && claims.tid !== c.tenantId) throw fail('This Microsoft account is not from your company\'s directory.', 403);
  }
  if (!domains.includes(domainOf(email))) throw fail(`${email || 'This account'} is not at one of your company's verified domains.`, 403);
  if (!name) name = email.split('@')[0];
  return { email, name: String(name).slice(0, 120), tid: claims.tid || null };
};

/**
 * Back from the provider (GET /auth/sso/callback). Returns what to do next:
 *   { kind: 'TEST', redirect }                    the admin's test, recorded
 *   { kind: 'LOGIN', user, redirect }             sign this user in, then go there
 * Errors carry .redirect (the sign-in page, or the Sign-in tab for a test) with the message.
 */
export const completeSignIn = async ({ state, code, error, errorDescription }) => {
  const st = state && await prisma.ssoLoginState.findUnique({ where: { id: String(state) } });
  const loginFail = (m) => Object.assign(fail(m, 401), { redirect: `${site()}/login?company=1&sso_error=${encodeURIComponent(m)}` });
  if (!st) throw loginFail('This sign-in link has expired. Please start again.');
  await prisma.ssoLoginState.delete({ where: { id: st.id } }).catch(() => {});
  const testBack = (ok, m) => `${site()}/business?tab=signin&sso_test=${ok ? 'ok' : 'error'}${m ? `&sso_error=${encodeURIComponent(m)}` : ''}`;
  const c = await prisma.orgSso.findUnique({ where: { organisationId: st.organisationId } });
  try {
    if (st.expiresAt < new Date()) throw fail('This sign-in took too long. Please start again.', 401);
    if (error) throw fail(errorDescription || (error === 'access_denied' ? 'Sign-in was cancelled.' : 'The sign-in provider refused the sign-in.'), 401);
    if (!c?.provider || !providersOffered()[c.provider]) throw fail('Company sign-in is not set up.', 409);
    if (st.purpose === 'LOGIN' && !c.enabled) throw fail('Company sign-in is turned off for your company. Sign in with your password or a code.', 409);
    const domains = (await prisma.orgSsoDomain.findMany({ where: { organisationId: st.organisationId, status: 'VERIFIED' }, select: { domain: true } })).map((d) => d.domain);
    const idToken = await exchangeCode(c, code, st.codeVerifier);
    const e = endpoints(c.provider, c.tenantId);
    const claims = await verifyIdToken(idToken, { jwks: e.jwks, issuers: e.issuers, issuerFor: e.issuerFor, audience: creds(c.provider).id, nonce: st.nonce });
    const who = await identityFrom(c, claims, domains);

    if (st.purpose === 'TEST') {
      // Microsoft without a directory ID: the tested account's directory is pinned from now on
      await prisma.orgSso.update({ where: { id: c.id }, data: { lastTest: { ok: true, at: new Date().toISOString(), email: who.email }, ...(c.provider === 'MICROSOFT' && !c.tenantId ? { tenantId: who.tid } : {}) } });
      await prisma.auditLog.create({ data: { action: 'COMPANY_SSO_TESTED', entityType: 'ORGANISATION', entityId: st.organisationId, userId: st.userId || 'SYSTEM', details: { ok: true, email: who.email } } }).catch(() => {});
      return { kind: 'TEST', redirect: testBack(true) };
    }
    if (c.provider === 'MICROSOFT' && !c.tenantId) throw fail('Your company\'s Microsoft directory isn\'t confirmed yet. Ask your admin to test company sign-in again.', 409);

    const org = await prisma.organisation.findUnique({ where: { id: st.organisationId } });
    if (org?.status !== 'ACTIVE') throw fail('Your company\'s ZivoPlus account is not active.', 403);
    let user = await prisma.user.findUnique({ where: { email: who.email } });
    if (user) {
      if (['BLOCKED', 'DELETED'].includes(user.status)) throw fail('This account is blocked. Contact ZivoPlus support.', 403);
      if (user.role !== 'CUSTOMER') throw fail('Hotel and ZivoPlus staff accounts sign in with their password.', 403);
    }
    let member = user && await prisma.orgMember.findUnique({ where: { organisationId_userId: { organisationId: org.id, userId: user.id } } });
    if (member && member.status !== 'ACTIVE') throw fail(`Your access to ${org.name} on ZivoPlus is paused. Ask your travel admin.`, 403);
    if (!member) {
      if (!c.autoJoin) throw fail(`You're not in ${org.name}'s ZivoPlus account yet. Ask your travel admin to add you.`, 403);
      const created = await prisma.$transaction(async (tx) => {
        const u = user || await tx.user.create({ data: { name: who.name, email: who.email, role: 'CUSTOMER', status: 'ACTIVE', emailVerifiedAt: new Date(), password: await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10) } });
        const m = await tx.orgMember.create({ data: { organisationId: org.id, userId: u.id, role: JOIN_ROLES.includes(c.defaultRole) ? c.defaultRole : 'TRAVELLER', grade: c.defaultGrade || null } });
        return { u, m };
      });
      user = created.u; member = created.m;
      await prisma.auditLog.create({ data: { action: 'COMPANY_SSO_AUTO_JOINED', entityType: 'ORGANISATION', entityId: org.id, userId: user.id, details: { email: who.email, role: member.role } } }).catch(() => {});
    }
    // They proved the address with their company account
    if (!user.emailVerifiedAt || user.status === 'INVITED') {
      user = await prisma.user.update({ where: { id: user.id }, data: { emailVerifiedAt: user.emailVerifiedAt || new Date(), ...(user.status === 'INVITED' ? { status: 'ACTIVE', inviteToken: null, inviteExpiry: null } : {}) } });
    }
    return { kind: 'LOGIN', user, organisationId: org.id, redirect: `${site()}${st.returnTo || '/business'}` };
  } catch (e) {
    if (st.purpose === 'TEST') {
      if (c) await prisma.orgSso.update({ where: { id: c.id }, data: { lastTest: { ok: false, at: new Date().toISOString(), error: e.message } } }).catch(() => {});
      e.redirect = testBack(false, e.message);
    } else {
      e.redirect = `${site()}/login?company=1&sso_error=${encodeURIComponent(e.message)}`;
    }
    throw e;
  }
};

export default { getSso, saveSso, addDomain, verifyDomain, removeDomain, startTest, startLogin, completeSignIn, companySignInRequired, ssoAvailable, providersOffered, ROLES };
