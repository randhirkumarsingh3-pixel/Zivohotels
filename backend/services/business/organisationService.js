/**
 * Organisations for ZivoPlus for Business (kind CORPORATE) and ZivoPlus Partner Hub (kind AGENCY).
 *
 *  1. A signed-in guest account applies with the organisation's legal and tax details; it becomes
 *     the organisation's first ADMIN member. PAN and GSTIN are checked as in hotel onboarding.
 *  2. The organisation uploads its KYC documents (stored encrypted, like hotel KYC).
 *  3. ZivoPlus reviews it (Admin → Organisations): approve, ask for more (ON_HOLD), reject, or
 *     later suspend. ZivoPlus sets its terms: prepaid / credit, credit limit and days, who issues
 *     invoices, and for agents the pricing model, markup and extra commission.
 *  4. Its admins invite their colleagues with a role. Its account (wallet + credit) is topped up
 *     online or by bank transfer recorded by ZivoPlus.
 */
import crypto from 'crypto';
import Razorpay from 'razorpay';
import prisma from '../../config/db.js';
import bcrypt from '../../utils/bcrypt.js';
import { checkPan, checkGstin } from '../verification/kyc.js';
import { detectFileType, saveKycFile, readKycFile, KYC_MAX_BYTES } from '../kycStorage.js';
import { notifyUser, notifyAdmins } from '../notifyService.js';
import { emailLayout, inr, siteUrl } from '../emailLayout.js';
import { getBusinessSettings, termsFor, PAYMENT_MODES, INVOICE_MODES, PRICING_MODELS, KINDS } from './businessSettings.js';
import { accountSummary, postEntry } from './orgLedger.js';

const fail = (m, code = 400) => Object.assign(new Error(m), { statusCode: code });
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const isEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || ''));
const clean = (v, max = 200) => String(v ?? '').trim().replace(/\s+/g, ' ').slice(0, max);
const site = () => siteUrl() || 'http://localhost:5173';

export const PORTAL = {
  CORPORATE: { name: 'ZivoPlus for Business', path: '/business', prefix: 'ZB' },
  AGENCY: { name: 'ZivoPlus Partner Hub', path: '/partners', prefix: 'ZP' },
};
export const STATUSES = ['IN_REVIEW', 'ACTIVE', 'ON_HOLD', 'SUSPENDED', 'REJECTED'];
export const ROLES = {
  ADMIN: 'Admin: everything, including people and the account',
  BOOKER: 'Booker: books stays for anyone in the organisation',
  APPROVER: 'Approver: approves trips that need approval',
  FINANCE: 'Finance: account, top-ups, invoices and statements',
  TRAVELLER: 'Traveller: books their own stays',
};
const CAN = {
  'org.edit': ['ADMIN'],
  'members.manage': ['ADMIN'],
  'members.view': ['ADMIN', 'BOOKER', 'APPROVER', 'FINANCE'],
  'account.view': ['ADMIN', 'FINANCE'],
  'account.topup': ['ADMIN', 'FINANCE'],
  'documents.manage': ['ADMIN'],
  'bookings.create': ['ADMIN', 'BOOKER', 'TRAVELLER'],
  'bookings.viewAll': ['ADMIN', 'BOOKER', 'APPROVER', 'FINANCE'],
};
export const can = (member, action) => Boolean(member && member.status === 'ACTIVE' && (CAN[action] || []).includes(member.role));

export const DOC_TYPES = {
  PAN_CARD: 'PAN card',
  GST_CERTIFICATE: 'GST registration certificate',
  INCORPORATION: 'Certificate of incorporation / partnership deed / shop licence',
  ADDRESS_PROOF: 'Address proof (utility bill, rent agreement)',
  ACCREDITATION: 'IATA / TAAI / TAFI / Ministry of Tourism accreditation',
  AUTHORISATION: 'Authorisation letter for the account admin',
  OTHER: 'Other',
};
const INCORPORATION = ['INDIVIDUAL', 'PARTNERSHIP', 'LLP', 'PVT_LTD', 'PUBLIC_LTD', 'HUF', 'TRUST'];

const audit = (action, entityId, userId, details) => prisma.auditLog.create({ data: { action, entityType: 'ORGANISATION', entityId, userId: userId || 'SYSTEM', details } }).catch(() => {});

// ─── Shapes ──────────────────────────────────────────────────────────────────
const docView = (d) => ({ id: d.id, type: d.type, label: DOC_TYPES[d.type] || d.type, name: d.name, mimeType: d.mimeType, size: d.size, uploadedAt: d.uploadedAt });
const orgView = (org, settings) => ({
  id: org.id, kind: org.kind, code: org.code, portal: PORTAL[org.kind].name, name: org.name, legalName: org.legalName,
  incorporationType: org.incorporationType, pan: org.pan, gstin: org.gstin, address: org.address, city: org.city, state: org.state, pincode: org.pincode,
  billingEmail: org.billingEmail, phone: org.phone, website: org.website, status: org.status, statusNote: org.statusNote, reviewedAt: org.reviewedAt,
  tier: org.tier, createdAt: org.createdAt, terms: termsFor(org, settings),
  documents: (Array.isArray(org.documents) ? org.documents : []).map(docView),
  branding: brandingFor(org),
});

// ─── Applying ────────────────────────────────────────────────────────────────
/** What the portals' public pages need: which portals take applications. */
export const publicInfo = async () => {
  const s = await getBusinessSettings();
  return {
    corporate: { name: PORTAL.CORPORATE.name, enabled: s.corporate.enabled, requireGstin: s.corporate.requireGstin },
    agency: { name: PORTAL.AGENCY.name, enabled: s.agency.enabled, requireGstin: s.agency.requireGstin, pricingModel: s.agency.pricingModel },
    roles: ROLES, documentTypes: DOC_TYPES,
  };
};

const nextCode = async (kind, db) => {
  const prefix = PORTAL[kind].prefix;
  const n = await db.organisation.count({ where: { kind } });
  for (let i = 1; i <= 50; i += 1) {
    const code = `${prefix}-${String(n + i).padStart(6, '0')}`;
    if (!(await db.organisation.findUnique({ where: { code }, select: { id: true } }))) return code;
  }
  return `${prefix}-${crypto.randomInt(100000, 999999)}${crypto.randomInt(10, 99)}`;
};

/** Checks and normalises legal details; throws with a clear message. */
const legalDetails = (input, { kind, requireGstin }) => {
  const d = {
    name: clean(input.name, 120), legalName: clean(input.legalName, 160),
    incorporationType: INCORPORATION.includes(input.incorporationType) ? input.incorporationType : null,
    address: clean(input.address, 300), city: clean(input.city, 80), state: clean(input.state, 80),
    pincode: String(input.pincode || '').replace(/\D/g, '').slice(0, 6),
    billingEmail: String(input.billingEmail || '').trim().toLowerCase(), phone: String(input.phone || '').replace(/[^\d+]/g, '').slice(0, 15),
    website: input.website ? clean(input.website, 200) : null,
  };
  if (d.name.length < 2) throw fail(kind === 'AGENCY' ? 'Enter the agency\'s name.' : 'Enter the company\'s name.');
  if (d.legalName.length < 3) throw fail('Enter the legal name as on the PAN / GST certificate.');
  if (!d.incorporationType) throw fail('Choose the type of business.');
  if (d.address.length < 8 || d.city.length < 2 || d.state.length < 2) throw fail('Enter the registered address with city and state.');
  if (!/^[1-9][0-9]{5}$/.test(d.pincode)) throw fail('Enter a 6-digit PIN code.');
  if (!isEmail(d.billingEmail)) throw fail('Enter the email for invoices and statements.');
  if (d.phone.replace(/\D/g, '').length < 10) throw fail('Enter a phone number.');
  const pan = checkPan(input.pan, d.incorporationType);
  if (!pan.ok) throw fail(pan.message);
  d.pan = pan.pan;
  const gstinIn = String(input.gstin || '').trim();
  if (!gstinIn && requireGstin) throw fail('Enter the GSTIN: business stays are invoiced to it.');
  const g = checkGstin(gstinIn, { pan: d.pan, state: d.state });
  if (!g.ok) throw fail(g.message);
  d.gstin = g.gstin || null;
  return d;
};

export const apply = async (user, input = {}) => {
  const kind = input.kind;
  if (!KINDS.includes(kind)) throw fail('Choose ZivoPlus for Business or Partner Hub.');
  const s = await getBusinessSettings();
  const ks = kind === 'AGENCY' ? s.agency : s.corporate;
  if (!ks.enabled) throw fail(`${PORTAL[kind].name} isn't taking applications yet.`, 403);
  const me = await prisma.user.findUnique({ where: { id: user.id }, select: { id: true, role: true, status: true, name: true, email: true } });
  if (me?.role !== 'CUSTOMER') throw fail('Use a ZivoPlus guest account (not a hotel or staff account) to apply.', 403);
  const mine = await prisma.orgMember.findFirst({ where: { userId: user.id, organisation: { kind, status: { not: 'REJECTED' } } }, include: { organisation: { select: { name: true } } } });
  if (mine) throw fail(`You're already part of ${mine.organisation.name} on ${PORTAL[kind].name}.`, 409);
  const d = legalDetails(input, { kind, requireGstin: ks.requireGstin });
  const taken = await prisma.organisation.findFirst({ where: { kind, pan: d.pan, status: { not: 'REJECTED' } }, select: { name: true } });
  if (taken) throw fail(`An account with this PAN already exists (${taken.name}). Ask its admin to invite you.`, 409);

  const org = await prisma.$transaction(async (tx) => {
    const o = await tx.organisation.create({ data: { ...d, kind, code: await nextCode(kind, tx), createdById: user.id } });
    await tx.orgMember.create({ data: { organisationId: o.id, userId: user.id, role: 'ADMIN' } });
    return o;
  });
  await audit('ORG_APPLIED', org.id, user.id, { kind, code: org.code, name: org.name, pan: org.pan, gstin: org.gstin });
  await notifyAdmins({
    type: 'ORG_APPLIED', title: `New ${kind === 'AGENCY' ? 'travel agent' : 'business'} application`,
    message: `${org.name} (${org.code}) applied for ${PORTAL[kind].name}.`, link: `/admin/organisations?id=${org.id}`,
  });
  await notifyUser(user.id, {
    type: 'ORG_APPLIED', title: 'Application received', message: `We're reviewing ${org.name}. Upload your documents to speed it up.`, link: PORTAL[kind].path,
    email: { subject: `${PORTAL[kind].name}: application received (${org.code})`, html: await emailLayout({
      title: 'We\'ve received your application', eyebrow: PORTAL[kind].name, ref: org.code, status: { label: 'In review', tone: 'info' },
      body: `<p>Thank you, ${me.name}. We're reviewing <b>${org.name}</b>. Upload your PAN, GST certificate and business proof so we can approve it quickly; we'll email you when it's done.</p>`,
      cta: { label: 'Upload documents', href: `${site()}${PORTAL[kind].path}` },
    }) },
  });
  return orgView(org, s);
};

// ─── Members' access ─────────────────────────────────────────────────────────
/** The signed-in person's organisations (with their role). */
export const myOrganisations = async (user) => {
  const s = await getBusinessSettings();
  const rows = await prisma.orgMember.findMany({ where: { userId: user.id }, include: { organisation: true }, orderBy: { createdAt: 'asc' } });
  return rows.map((m) => ({ role: m.role, memberStatus: m.status, organisation: orgView(m.organisation, s) }));
};

/** The organisation and the person's membership; 404 for anyone else. */
export const membershipFor = async (orgId, user, action = null) => {
  const member = await prisma.orgMember.findUnique({ where: { organisationId_userId: { organisationId: String(orgId), userId: user.id } }, include: { organisation: true } });
  if (!member) throw fail('Organisation not found', 404);
  if (member.status !== 'ACTIVE') throw fail('Your access to this organisation is paused. Ask its admin.', 403);
  if (action && !can(member, action)) throw fail('Your role in this organisation can\'t do this. Ask its admin.', 403);
  return { org: member.organisation, member };
};

export const viewOrganisation = async (orgId, user) => {
  const { org, member } = await membershipFor(orgId, user);
  const s = await getBusinessSettings();
  return {
    ...orgView(org, s), myRole: member.role,
    can: Object.fromEntries(Object.keys(CAN).map((k) => [k, can(member, k)])),
    account: can(member, 'account.view') ? await accountSummary(org, { settings: s }) : null,
  };
};

/** Details can change freely until approval; afterwards only contact details (legal and tax
 * details are on the agreement and invoices: ZivoPlus changes those). Editing an organisation
 * that is ON_HOLD sends it back for review. */
export const updateOrganisation = async (orgId, user, input = {}) => {
  const { org } = await membershipFor(orgId, user, 'org.edit');
  const s = await getBusinessSettings();
  let data;
  if (['IN_REVIEW', 'ON_HOLD'].includes(org.status)) {
    const d = legalDetails({ ...org, ...input }, { kind: org.kind, requireGstin: (org.kind === 'AGENCY' ? s.agency : s.corporate).requireGstin });
    data = { ...d, ...(org.status === 'ON_HOLD' ? { status: 'IN_REVIEW' } : {}) };
  } else if (org.status === 'ACTIVE') {
    data = {};
    if (input.billingEmail !== undefined) { const e = String(input.billingEmail).trim().toLowerCase(); if (!isEmail(e)) throw fail('Enter a valid email.'); data.billingEmail = e; }
    if (input.phone !== undefined) { const p = String(input.phone).replace(/[^\d+]/g, '').slice(0, 15); if (p.replace(/\D/g, '').length < 10) throw fail('Enter a phone number.'); data.phone = p; }
    if (input.website !== undefined) data.website = input.website ? clean(input.website, 200) : null;
    if (input.name !== undefined) { const n = clean(input.name, 120); if (n.length < 2) throw fail('Enter the name.'); data.name = n; }
    const locked = ['legalName', 'pan', 'gstin', 'address', 'city', 'state', 'pincode', 'incorporationType'].filter((k) => input[k] !== undefined && String(input[k] ?? '') !== String(org[k] ?? ''));
    if (locked.length) throw fail('Legal, tax and address details can\'t be changed after approval. Write to ZivoPlus support with the new details.', 409);
  } else {
    throw fail('This organisation can\'t be changed.', 409);
  }
  const updated = await prisma.organisation.update({ where: { id: org.id }, data });
  await audit('ORG_UPDATED', org.id, user.id, { fields: Object.keys(data) });
  if (org.status === 'ON_HOLD' && updated.status === 'IN_REVIEW') {
    await notifyAdmins({ type: 'ORG_RESUBMITTED', title: 'Organisation updated for review', message: `${updated.name} (${updated.code}) sent updated details.`, link: `/admin/organisations?id=${org.id}` });
  }
  return orgView(updated, s);
};

/** How the agency appears on vouchers it gives its customers (defaults: its name, phone, billing email). */
export const brandingFor = (org) => {
  const b = org.settings?.branding || {};
  return { name: b.name || org.name, phone: b.phone || org.phone, email: b.email || org.billingEmail, website: b.website || org.website || null };
};

export const setBranding = async (orgId, user, input = {}) => {
  const { org } = await membershipFor(orgId, user, 'org.edit');
  const b = {
    name: clean(input.name, 80) || null, phone: input.phone ? String(input.phone).replace(/[^\d+ -]/g, '').slice(0, 20) : null,
    email: input.email ? String(input.email).trim().toLowerCase() : null, website: input.website ? clean(input.website, 120) : null,
  };
  if (b.email && !isEmail(b.email)) throw fail('Enter a valid email for your vouchers.');
  const fresh = await prisma.organisation.findUnique({ where: { id: org.id }, select: { settings: true } });
  const updated = await prisma.organisation.update({ where: { id: org.id }, data: { settings: { ...(fresh.settings || {}), branding: b } } });
  await audit('ORG_BRANDING_UPDATED', org.id, user.id, b);
  return brandingFor(updated);
};

// ─── KYC documents ───────────────────────────────────────────────────────────
export const addDocument = async (orgId, user, { type, fileName, file } = {}) => {
  const { org } = await membershipFor(orgId, user, 'documents.manage');
  if (!DOC_TYPES[type]) throw fail('Choose the document type.');
  if (['SUSPENDED', 'REJECTED'].includes(org.status)) throw fail('This organisation can\'t add documents.', 409);
  const docs = Array.isArray(org.documents) ? org.documents : [];
  if (docs.length >= 20) throw fail('Up to 20 documents. Remove one first.');
  const m = typeof file === 'string' ? file.match(/^data:[^;,]*;base64,(.+)$/s) : null;
  if (!m) throw fail('Attach the file (PDF, JPG or PNG).');
  const buffer = Buffer.from(m[1], 'base64');
  if (!buffer.length) throw fail('The file is empty.');
  if (buffer.length > KYC_MAX_BYTES) throw fail('The file is larger than 10 MB.', 413);
  const ft = detectFileType(buffer);
  if (!ft) throw fail('Only PDF, JPG and PNG files are accepted.', 415);
  const key = await saveKycFile(buffer, ft, `org-${org.id}`);
  const doc = { id: crypto.randomUUID(), type, name: clean(fileName || `${type.toLowerCase()}.${ft.ext}`, 120), key, mimeType: ft.mimeType, size: buffer.length, uploadedAt: new Date().toISOString(), uploadedBy: user.id };
  await prisma.organisation.update({ where: { id: org.id }, data: { documents: [...docs, doc] } });
  await audit('ORG_DOCUMENT_ADDED', org.id, user.id, { type, size: buffer.length });
  return docView(doc);
};

export const removeDocument = async (orgId, user, docId) => {
  const { org } = await membershipFor(orgId, user, 'documents.manage');
  if (org.status === 'ACTIVE') throw fail('Documents of an approved organisation are kept. Upload a newer one instead.', 409);
  const docs = Array.isArray(org.documents) ? org.documents : [];
  if (!docs.some((d) => d.id === docId)) throw fail('Document not found', 404);
  await prisma.organisation.update({ where: { id: org.id }, data: { documents: docs.filter((d) => d.id !== docId) } });
  await audit('ORG_DOCUMENT_REMOVED', org.id, user.id, { docId });
};

/** The file, for the organisation's admins or ZivoPlus staff. */
export const readDocument = async (orgId, docId, { user, staff = false }) => {
  const org = staff ? await prisma.organisation.findUnique({ where: { id: String(orgId) } }) : (await membershipFor(orgId, user, 'documents.manage')).org;
  if (!org) throw fail('Organisation not found', 404);
  const doc = (Array.isArray(org.documents) ? org.documents : []).find((d) => d.id === docId);
  if (!doc) throw fail('Document not found', 404);
  const content = await readKycFile(doc.key);
  if (!content) throw fail('The file isn\'t available. Please upload it again.', 404);
  return { content, mimeType: doc.mimeType, name: doc.name };
};

// ─── Members ─────────────────────────────────────────────────────────────────
const memberView = (m) => ({ id: m.id, role: m.role, roleLabel: ROLES[m.role], status: m.status, joinedAt: m.createdAt, user: { id: m.user.id, name: m.user.name, email: m.user.email, invited: m.user.status === 'INVITED' } });

export const listMembers = async (orgId, user) => {
  const { org } = await membershipFor(orgId, user, 'members.view');
  const rows = await prisma.orgMember.findMany({ where: { organisationId: org.id }, include: { user: { select: { id: true, name: true, email: true, status: true } } }, orderBy: { createdAt: 'asc' } });
  return rows.map(memberView);
};

export const inviteMember = async (orgId, actor, { email, name, role } = {}) => {
  const { org } = await membershipFor(orgId, actor, 'members.manage');
  if (org.status !== 'ACTIVE') throw fail('You can invite people once ZivoPlus approves your organisation.', 409);
  if (!ROLES[role]) throw fail('Choose a role.');
  const mail = String(email || '').trim().toLowerCase();
  if (!isEmail(mail)) throw fail('Enter a valid email address.');
  let user = await prisma.user.findUnique({ where: { email: mail } });
  let raw = null;
  if (user) {
    if (user.role !== 'CUSTOMER') throw fail('This email belongs to a hotel or ZivoPlus staff account. Use another email.');
    if (['BLOCKED', 'DELETED'].includes(user.status)) throw fail('This account is blocked. Ask ZivoPlus support.');
    if (await prisma.orgMember.findUnique({ where: { organisationId_userId: { organisationId: org.id, userId: user.id } } })) throw fail('This person is already a member.', 409);
  } else {
    if (clean(name).length < 2) throw fail('Enter their name.');
    raw = crypto.randomBytes(32).toString('hex');
    user = await prisma.user.create({ data: {
      name: clean(name, 120), email: mail, role: 'CUSTOMER', status: 'INVITED', password: await bcrypt.hash(crypto.randomBytes(16).toString('hex'), 10),
      inviteToken: crypto.createHash('sha256').update(raw).digest('hex'), inviteExpiry: new Date(Date.now() + 7 * 86400000), mustChangePassword: false,
    } });
  }
  const m = await prisma.orgMember.create({ data: { organisationId: org.id, userId: user.id, role, invitedById: actor.id }, include: { user: { select: { id: true, name: true, email: true, status: true } } } });
  const path = PORTAL[org.kind].path;
  const link = raw ? `${site()}/accept-invite?token=${raw}&next=${encodeURIComponent(path)}` : `${site()}${path}`;
  await notifyUser(user.id, {
    type: 'ORG_INVITE', title: `You've been added to ${org.name}`, message: `${actor.name || 'An admin'} added you as ${role.toLowerCase()} on ${PORTAL[org.kind].name}.`, link: path, inApp: !raw,
    email: { subject: `${actor.name || org.name} invited you to ${org.name} on ${PORTAL[org.kind].name}`, html: await emailLayout({
      title: `Join ${org.name} on ${PORTAL[org.kind].name}`, eyebrow: PORTAL[org.kind].name,
      body: `<p>${actor.name || 'An admin'} added you to <b>${org.name}</b> as <b>${ROLES[role].split(':')[0]}</b>.</p>`,
      cta: { label: raw ? 'Set your password' : 'Open', href: link }, note: raw ? 'This link works for 7 days.' : null,
    }) },
  });
  await audit('ORG_MEMBER_INVITED', org.id, actor.id, { email: mail, role, newAccount: Boolean(raw) });
  return { ...memberView(m), ...(process.env.EMAIL_TEST_MODE === 'true' && raw ? { inviteLink: link } : {}) };
};

const activeAdmins = (orgId) => prisma.orgMember.count({ where: { organisationId: orgId, role: 'ADMIN', status: 'ACTIVE' } });

export const updateMember = async (orgId, actor, memberId, { role, status } = {}) => {
  const { org } = await membershipFor(orgId, actor, 'members.manage');
  const m = await prisma.orgMember.findFirst({ where: { id: memberId, organisationId: org.id } });
  if (!m) throw fail('Member not found', 404);
  const data = {};
  if (role !== undefined) { if (!ROLES[role]) throw fail('Choose a role.'); data.role = role; }
  if (status !== undefined) { if (!['ACTIVE', 'PAUSED'].includes(status)) throw fail('Choose active or paused.'); data.status = status; }
  const losesAdmin = m.role === 'ADMIN' && m.status === 'ACTIVE' && ((data.role && data.role !== 'ADMIN') || data.status === 'PAUSED');
  if (losesAdmin && await activeAdmins(org.id) <= 1) throw fail('An organisation needs at least one active admin. Make someone else admin first.', 409);
  const u = await prisma.orgMember.update({ where: { id: m.id }, data, include: { user: { select: { id: true, name: true, email: true, status: true } } } });
  await audit('ORG_MEMBER_UPDATED', org.id, actor.id, { memberId, ...data });
  return memberView(u);
};

export const removeMember = async (orgId, actor, memberId) => {
  const { org } = await membershipFor(orgId, actor, 'members.manage');
  const m = await prisma.orgMember.findFirst({ where: { id: memberId, organisationId: org.id } });
  if (!m) throw fail('Member not found', 404);
  if (m.role === 'ADMIN' && m.status === 'ACTIVE' && await activeAdmins(org.id) <= 1) throw fail('An organisation needs at least one active admin.', 409);
  await prisma.orgMember.delete({ where: { id: m.id } });
  await audit('ORG_MEMBER_REMOVED', org.id, actor.id, { memberId, userId: m.userId });
};

// ─── Account ─────────────────────────────────────────────────────────────────
const entryView = (e) => ({ id: e.id, type: e.type, amount: Number(e.amount), balanceAfter: Number(e.balanceAfter), reference: e.reference, bookingId: e.bookingId, note: e.note, dueAt: e.dueAt, createdAt: e.createdAt });

export const accountFor = async (org, { page = 1, pageSize = 50 } = {}) => {
  const take = Math.min(Math.max(Number(pageSize) || 50, 1), 200);
  const skip = (Math.max(Number(page) || 1, 1) - 1) * take;
  const [summary, entries, total] = await Promise.all([
    accountSummary(org),
    prisma.orgLedgerEntry.findMany({ where: { organisationId: org.id }, orderBy: { createdAt: 'desc' }, skip, take }),
    prisma.orgLedgerEntry.count({ where: { organisationId: org.id } }),
  ]);
  return { summary, entries: entries.map(entryView), total, page: Math.max(Number(page) || 1, 1), pageSize: take };
};

export const viewAccount = async (orgId, user, q) => accountFor((await membershipFor(orgId, user, 'account.view')).org, q);

const razorpay = () => new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID || 'rzp_test_placeholder', key_secret: process.env.RAZORPAY_KEY_SECRET || 'placeholder' });

/** Top up online: a Razorpay order for the amount; confirmTopup() credits the account. */
export const startTopup = async (orgId, user, { amount } = {}) => {
  const { org } = await membershipFor(orgId, user, 'account.topup');
  if (org.status !== 'ACTIVE') throw fail('You can top up once ZivoPlus approves your organisation.', 409);
  const s = await getBusinessSettings();
  const amt = round2(amount);
  if (!(amt >= s.topup.minAmount && amt <= s.topup.maxAmount)) throw fail(`Top up between ${inr(s.topup.minAmount)} and ${inr(s.topup.maxAmount)}.`);
  let order;
  try {
    order = await razorpay().orders.create({ amount: Math.round(amt * 100), currency: 'INR', receipt: `TOP-${org.code}-${Date.now().toString(36)}`.slice(0, 40), notes: { organisationId: org.id, purpose: 'ORG_TOPUP' } });
  } catch (e) {
    console.error('[Business] Razorpay order failed:', e?.error?.description || e?.message);
    throw fail('Online payment is unavailable right now. Please try again, or pay by bank transfer.', 502);
  }
  await rememberTopup(org.id, order.id, { amount: amt, userId: user.id });
  return { order: { id: order.id, amount: order.amount, currency: order.currency }, keyId: process.env.RAZORPAY_KEY_ID, amount: amt };
};

/** Pending online top-ups are kept on the organisation (the last 20) until paid. */
export const rememberTopup = async (orgId, orderId, info) => {
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Organisation" WHERE id = ${orgId} FOR UPDATE`;
    const o = await tx.organisation.findUnique({ where: { id: orgId }, select: { settings: true } });
    const st = o.settings || {};
    const pending = Object.entries(st.pendingTopups || {}).sort((a, b) => String(b[1].createdAt).localeCompare(String(a[1].createdAt))).slice(0, 19);
    await tx.organisation.update({ where: { id: orgId }, data: { settings: { ...st, pendingTopups: { ...Object.fromEntries(pending), [orderId]: { ...info, createdAt: new Date().toISOString() } } } } });
  });
};

export const confirmTopup = async (orgId, user, { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature } = {}) => {
  const { org } = await membershipFor(orgId, user, 'account.topup');
  const pending = org.settings?.pendingTopups?.[orderId];
  if (!pending) throw fail('This payment doesn\'t match a top-up for your organisation.', 404);
  const expected = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || '').update(`${orderId}|${paymentId}`).digest('hex');
  if (!signature || expected.length !== String(signature).length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(String(signature)))) throw fail('Invalid payment signature');
  const { entry, duplicate } = await postEntry({ organisationId: org.id, type: 'TOPUP', amount: pending.amount, reference: paymentId, note: `Online top-up (order ${orderId})`, createdById: user.id });
  if (!duplicate) {
    await audit('ORG_TOPUP', org.id, user.id, { amount: pending.amount, orderId, paymentId });
    const fresh = await prisma.organisation.findUnique({ where: { id: org.id }, select: { settings: true } });
    const { [orderId]: _done, ...rest } = fresh.settings?.pendingTopups || {};
    await prisma.organisation.update({ where: { id: org.id }, data: { settings: { ...(fresh.settings || {}), pendingTopups: rest } } });
  }
  return { entry: entryView(entry), summary: await accountSummary(await prisma.organisation.findUnique({ where: { id: org.id } })) };
};

// ─── ZivoPlus admin ──────────────────────────────────────────────────────────
export const adminList = async ({ kind, status, search, page = 1, pageSize = 50 } = {}) => {
  const where = {};
  if (KINDS.includes(kind)) where.kind = kind;
  if (STATUSES.includes(status)) where.status = status;
  const q = clean(search, 80);
  if (q) where.OR = [{ name: { contains: q, mode: 'insensitive' } }, { legalName: { contains: q, mode: 'insensitive' } }, { code: { contains: q, mode: 'insensitive' } }, { pan: { contains: q.toUpperCase() } }, { gstin: { contains: q.toUpperCase() } }, { billingEmail: { contains: q.toLowerCase() } }];
  const take = Math.min(Math.max(Number(pageSize) || 50, 1), 200);
  const s = await getBusinessSettings();
  const [rows, total, grouped] = await Promise.all([
    prisma.organisation.findMany({ where, orderBy: [{ status: 'asc' }, { createdAt: 'desc' }], skip: (Math.max(Number(page) || 1, 1) - 1) * take, take, include: { _count: { select: { members: true } } } }),
    prisma.organisation.count({ where }),
    prisma.organisation.groupBy({ by: ['kind', 'status'], _count: { _all: true } }),
  ]);
  const counts = {};
  for (const g of grouped) { counts[g.kind] = counts[g.kind] || {}; counts[g.kind][g.status] = g._count._all; }
  const out = [];
  for (const o of rows) out.push({ ...orgView(o, s), members: o._count.members, account: await accountSummary(o, { settings: s }) });
  return { organisations: out, total, counts, settings: { corporateEnabled: s.corporate.enabled, agencyEnabled: s.agency.enabled } };
};

export const adminDetail = async (id) => {
  const org = await prisma.organisation.findUnique({ where: { id: String(id) } });
  if (!org) throw fail('Organisation not found', 404);
  const s = await getBusinessSettings();
  const [members, account, history] = await Promise.all([
    prisma.orgMember.findMany({ where: { organisationId: org.id }, include: { user: { select: { id: true, name: true, email: true, status: true } } }, orderBy: { createdAt: 'asc' } }),
    accountFor(org, { pageSize: 100 }),
    prisma.auditLog.findMany({ where: { entityType: 'ORGANISATION', entityId: org.id }, orderBy: { createdAt: 'desc' }, take: 50, select: { action: true, details: true, userId: true, createdAt: true } }),
  ]);
  return { ...orgView(org, s), overrides: { paymentMode: org.paymentMode, creditLimit: Number(org.creditLimit), creditDays: org.creditDays, invoiceMode: org.invoiceMode, pricingModel: org.pricingModel, defaultMarkupPct: org.defaultMarkupPct == null ? null : Number(org.defaultMarkupPct), extraCommissionPct: org.extraCommissionPct == null ? null : Number(org.extraCommissionPct), tier: org.tier }, members: members.map(memberView), account, history };
};

const DECISION_TEXT = {
  ACTIVE: ['approved', 'ok', 'Your organisation is approved. You can now invite your team and top up your account.'],
  ON_HOLD: ['needs more details', 'warn', 'We need a few more details before we can approve your organisation.'],
  REJECTED: ['not approved', 'off', 'We couldn\'t approve your organisation.'],
  SUSPENDED: ['suspended', 'off', 'Your organisation\'s account is suspended: bookings and top-ups are paused.'],
};

export const decide = async (id, admin, { status, note } = {}) => {
  const org = await prisma.organisation.findUnique({ where: { id: String(id) } });
  if (!org) throw fail('Organisation not found', 404);
  if (!DECISION_TEXT[status]) throw fail('Choose approve, ask for more, reject or suspend.');
  const text = clean(note, 1000);
  if (status !== 'ACTIVE' && text.length < 5) throw fail('Write a note for the organisation (they see it).');
  const allowed = { ACTIVE: ['IN_REVIEW', 'ON_HOLD', 'SUSPENDED'], ON_HOLD: ['IN_REVIEW', 'ACTIVE'], REJECTED: ['IN_REVIEW', 'ON_HOLD'], SUSPENDED: ['ACTIVE'] };
  if (!allowed[status].includes(org.status)) throw fail(`An organisation that is ${org.status.replace('_', ' ').toLowerCase()} can't be ${DECISION_TEXT[status][0]}.`, 409);
  const updated = await prisma.organisation.update({ where: { id: org.id }, data: { status, statusNote: text || null, reviewedById: admin.id, reviewedAt: new Date() } });
  await audit(`ORG_${status}`, org.id, admin.id, { from: org.status, note: text || null });
  const [label, tone, line] = DECISION_TEXT[status];
  const admins = await prisma.orgMember.findMany({ where: { organisationId: org.id, role: 'ADMIN', status: 'ACTIVE' }, select: { userId: true } });
  const html = await emailLayout({
    title: `${org.name}: ${label}`, eyebrow: PORTAL[org.kind].name, ref: org.code, status: { label: label[0].toUpperCase() + label.slice(1), tone },
    body: `<p>${line}</p>${text ? `<p><b>Note from ZivoPlus:</b> ${text.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]))}</p>` : ''}`,
    cta: { label: `Open ${PORTAL[org.kind].name}`, href: `${site()}${PORTAL[org.kind].path}` },
  });
  for (const a of admins) {
    await notifyUser(a.userId, { type: `ORG_${status}`, title: `${org.name}: ${label}`, message: text || line, link: PORTAL[org.kind].path, email: { to: undefined, subject: `${PORTAL[org.kind].name}: ${org.name} ${label}`, html } });
  }
  return orgView(updated, await getBusinessSettings());
};

/** ZivoPlus sets an organisation's terms (null = use the default). */
export const setTerms = async (id, admin, input = {}) => {
  const org = await prisma.organisation.findUnique({ where: { id: String(id) } });
  if (!org) throw fail('Organisation not found', 404);
  const s = await getBusinessSettings();
  const data = {};
  const opt = (k, list) => { if (input[k] === undefined) return; if (input[k] === null || input[k] === '') { data[k] = null; return; } if (!list.includes(input[k])) throw fail(`Choose a valid ${k}.`); data[k] = input[k]; };
  const pct = (k, max) => { if (input[k] === undefined) return; if (input[k] === null || input[k] === '') { data[k] = null; return; } const n = Number(input[k]); if (!Number.isFinite(n) || n < 0 || n > max) throw fail(`${k} must be between 0 and ${max}.`); data[k] = round2(n); };
  opt('paymentMode', PAYMENT_MODES);
  opt('invoiceMode', INVOICE_MODES);
  if (org.kind === 'AGENCY') { opt('pricingModel', PRICING_MODELS); pct('defaultMarkupPct', s.agency.maxMarkupPct); pct('extraCommissionPct', 30); }
  if (input.creditDays !== undefined) {
    if (input.creditDays === null || input.creditDays === '') data.creditDays = null;
    else { const n = Number(input.creditDays); if (!Number.isInteger(n) || n < 1 || n > 120) throw fail('Credit days must be 1 to 120.'); data.creditDays = n; }
  }
  if (input.creditLimit !== undefined) {
    const n = round2(input.creditLimit);
    if (!(n >= 0 && n <= s.credit.maxLimit)) throw fail(`The credit limit can be up to ${inr(s.credit.maxLimit)} (Business settings).`);
    data.creditLimit = n;
  }
  if (input.tier !== undefined) data.tier = clean(input.tier, 30).toUpperCase() || 'STANDARD';
  const updated = await prisma.organisation.update({ where: { id: org.id }, data });
  await audit('ORG_TERMS_UPDATED', org.id, admin.id, { before: Object.fromEntries(Object.keys(data).map((k) => [k, org[k] == null ? null : String(org[k])])), after: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v == null ? null : String(v)])) });
  return adminDetail(updated.id);
};

/** Payments received by bank transfer, refunds of unused balance and corrections. */
export const adminEntry = async (id, admin, { type, amount, note, reference } = {}) => {
  const org = await prisma.organisation.findUnique({ where: { id: String(id) } });
  if (!org) throw fail('Organisation not found', 404);
  if (!['PAYMENT', 'ADJUSTMENT', 'REFUND'].includes(type)) throw fail('Choose payment received, refund or adjustment.');
  const amt = round2(amount);
  if (!amt) throw fail('Enter the amount.');
  if (type === 'PAYMENT' && amt < 0) throw fail('A payment received is a positive amount.');
  if (type === 'REFUND' && amt > 0) throw fail('A refund paid back to the organisation is a negative amount (money leaving its balance).');
  const text = clean(note, 500);
  if (text.length < 5) throw fail('Write what this is for (e.g. the bank transfer reference).');
  const ref = clean(reference, 100) || `${type}-${Date.now()}`;
  const { entry, duplicate } = await postEntry({ organisationId: org.id, type, amount: amt, reference: ref, note: text, createdById: admin.id, force: true });
  if (duplicate) throw fail('An entry with this reference already exists.', 409);
  await audit('ORG_LEDGER_ENTRY', org.id, admin.id, { type, amount: amt, reference: ref, note: text });
  return entryView(entry);
};

export default {
  PORTAL, ROLES, DOC_TYPES, STATUSES, can, publicInfo, apply, myOrganisations, membershipFor, viewOrganisation, updateOrganisation,
  addDocument, removeDocument, readDocument, listMembers, inviteMember, updateMember, removeMember, viewAccount, accountFor,
  startTopup, confirmTopup, rememberTopup, adminList, adminDetail, decide, setTerms, adminEntry,
};
