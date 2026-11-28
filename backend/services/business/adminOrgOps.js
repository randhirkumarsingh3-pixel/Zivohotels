/**
 * Admin → Business & Partners: what ZivoPlus staff need to run companies (ZivoPlus for Business)
 * and travel agents (ZivoPlus Partner Hub) end to end, on top of organisationService (approve,
 * terms, ledger) and orgAgreementService:
 *
 *  overview()                       applications waiting, accounts by status, this month's
 *                                   bookings and value, top accounts, documents to check
 *  createOnBehalf(admin, input)     add a company / agency for them; its admin gets an email to
 *                                   set a password (optionally approved straight away)
 *  updateProfile(id, admin, input)  staff can correct every detail (legal and tax included)
 *  reviewDocument(id, docId, ...)   mark a KYC file checked or not acceptable (with a note)
 *  staffAddMember(id, admin, ...)   add someone to its team
 *  bookings(id, q)                  its bookings
 *  report(id, q) / reportCsv(id, q) spend (companies) or sales and commission (agents), by month,
 *                                   hotel, city and traveller; CSV with GST details
 */
import crypto from 'crypto';
import prisma from '../../config/db.js';
import bcrypt from '../../utils/bcrypt.js';
import { getBusinessSettings } from './businessSettings.js';
import { accountSummary } from './orgLedger.js';
import { PORTAL, ROLES, DOC_TYPES, legalDetails, orgView, addMember, adminDetail, nextCode } from './organisationService.js';
import { profileDetails } from './orgChecklist.js';
import { setBank } from './orgApplication.js';
import { spendReportFor, spendCsvFor, commissionStatementFor } from './businessBookingService.js';
import { notifyUser } from '../notifyService.js';
import { emailLayout } from '../emailLayout.js';

const fail = (m, statusCode = 400) => Object.assign(new Error(m), { statusCode });
const clean = (v, max = 200) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const isEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
const site = () => String(process.env.FRONTEND_URL || 'https://zivoplus.com').replace(/\/$/, '');
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const KINDS = ['CORPORATE', 'AGENCY'];
const SPENT = ['CONFIRMED', 'CHECKED_IN', 'COMPLETED', 'NO_SHOW'];
const audit = (action, entityId, userId, details) => prisma.auditLog.create({ data: { action, entityType: 'ORGANISATION', entityId, userId: userId || 'SYSTEM', details } }).catch(() => {});
const monthStart = (d = new Date()) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
const ymKey = (d) => new Date(d).toISOString().slice(0, 7);

const loadOrg = async (id) => {
  const org = await prisma.organisation.findUnique({ where: { id: String(id) } });
  if (!org) throw fail('Organisation not found', 404);
  return org;
};

/** The dashboard: what needs attention and how the accounts are doing this month. */
export const overview = async () => {
  const s = await getBusinessSettings();
  const start = monthStart();
  const lastStart = monthStart(new Date(start.getTime() - 86400000));
  const [grouped, waiting, monthRows, lastRows, unsigned, orgsWithDocs] = await Promise.all([
    prisma.organisation.groupBy({ by: ['kind', 'status'], _count: { _all: true } }),
    prisma.organisation.findMany({ where: { status: { in: ['IN_REVIEW', 'ON_HOLD'] } }, orderBy: { createdAt: 'asc' }, take: 20 }),
    prisma.booking.findMany({ where: { organisationId: { not: null }, createdAt: { gte: start }, status: { in: SPENT } }, select: { organisationId: true, totalAmount: true, organisation: { select: { kind: true } } } }),
    prisma.booking.findMany({ where: { organisationId: { not: null }, createdAt: { gte: lastStart, lt: start }, status: { in: SPENT } }, select: { totalAmount: true, organisation: { select: { kind: true } } } }),
    prisma.orgAgreement.count({ where: { status: { not: 'SIGNED' }, organisation: { status: 'ACTIVE' } } }).catch(() => 0),
    prisma.organisation.findMany({ where: { status: { in: ['IN_REVIEW', 'ON_HOLD', 'ACTIVE'] } }, select: { documents: true } }),
  ]);
  const counts = { CORPORATE: {}, AGENCY: {} };
  for (const g of grouped) counts[g.kind] = { ...(counts[g.kind] || {}), [g.status]: g._count._all };
  const sum = (rows, kind) => {
    const r = rows.filter((b) => b.organisation?.kind === kind);
    return { bookings: r.length, value: round2(r.reduce((t, b) => t + Number(b.totalAmount), 0)) };
  };
  const byOrg = new Map();
  for (const b of monthRows) {
    const x = byOrg.get(b.organisationId) || { bookings: 0, value: 0 };
    x.bookings += 1; x.value = round2(x.value + Number(b.totalAmount));
    byOrg.set(b.organisationId, x);
  }
  const topIds = [...byOrg.entries()].sort((a, b) => b[1].value - a[1].value).slice(0, 8).map(([id]) => id);
  const topOrgs = topIds.length ? await prisma.organisation.findMany({ where: { id: { in: topIds } }, select: { id: true, name: true, code: true, kind: true } }) : [];
  const docsToCheck = orgsWithDocs.reduce((t, o) => t + (Array.isArray(o.documents) ? o.documents.filter((d) => !d.review).length : 0), 0);
  const age = (d) => Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
  return {
    portals: { corporateEnabled: s.corporate.enabled, agencyEnabled: s.agency.enabled },
    counts,
    month: { from: start, CORPORATE: sum(monthRows, 'CORPORATE'), AGENCY: sum(monthRows, 'AGENCY') },
    lastMonth: { CORPORATE: sum(lastRows, 'CORPORATE'), AGENCY: sum(lastRows, 'AGENCY') },
    waiting: waiting.map((o) => ({ ...orgView(o, s), waitingDays: age(o.createdAt), documentsCount: Array.isArray(o.documents) ? o.documents.length : 0 })),
    top: topIds.map((id) => ({ ...topOrgs.find((o) => o.id === id), ...byOrg.get(id) })).filter((o) => o.name),
    attention: { unsignedAgreements: unsigned, documentsToCheck: docsToCheck },
  };
};

/**
 * ZivoPlus adds a company or travel agency for them. Its admin (a guest account by email; a new
 * one gets a set-password link) is told by email. `approve` makes it active straight away.
 */
export const createOnBehalf = async (admin, input = {}) => {
  const kind = input.kind;
  if (!KINDS.includes(kind)) throw fail('Choose a company or a travel agent.');
  const s = await getBusinessSettings();
  const ks = kind === 'AGENCY' ? s.agency : s.corporate;
  const d = legalDetails(input, { kind, requireGstin: ks.requireGstin });
  const taken = await prisma.organisation.findFirst({ where: { kind, pan: d.pan, status: { not: 'REJECTED' } }, select: { name: true, code: true } });
  if (taken) throw fail(`An account with this PAN already exists: ${taken.name} (${taken.code}).`, 409);
  const email = String(input.adminEmail || '').trim().toLowerCase();
  if (!isEmail(email)) throw fail('Enter the email of the person who will run the account.');
  const adminName = clean(input.adminName, 120);
  let user = await prisma.user.findUnique({ where: { email } });
  if (user && user.role !== 'CUSTOMER') throw fail('This email belongs to a hotel or ZivoPlus staff account. Use another email.');
  if (user && ['BLOCKED', 'DELETED'].includes(user.status)) throw fail('This account is blocked.');
  if (!user && adminName.length < 2) throw fail('Enter the name of the person who will run the account.');
  const approve = Boolean(input.approve);
  const extra = profileDetails({ contactName: adminName || user?.name || null, ...input }, { kind, gstin: d.gstin });
  const bankInput = input.bank && input.bank.accountNumber ? input.bank : null;

  let raw = null;
  const org = await prisma.$transaction(async (tx) => {
    if (!user) {
      raw = crypto.randomBytes(32).toString('hex');
      user = await tx.user.create({ data: {
        name: adminName, email, role: 'CUSTOMER', status: 'INVITED', password: await bcrypt.hash(crypto.randomBytes(16).toString('hex'), 10),
        inviteToken: crypto.createHash('sha256').update(raw).digest('hex'), inviteExpiry: new Date(Date.now() + 7 * 86400000), mustChangePassword: false,
      } });
    }
    const code = await nextCode(kind, tx);
    const o = await tx.organisation.create({ data: { ...d, ...extra, kind, code, createdById: admin.id, submittedAt: new Date(), ...(approve ? { status: 'ACTIVE', reviewedById: admin.id, reviewedAt: new Date(), statusNote: 'Added by ZivoPlus' } : {}) } });
    await tx.orgMember.create({ data: { organisationId: o.id, userId: user.id, role: 'ADMIN', invitedById: admin.id } });
    return o;
  });
  if (bankInput) await setBank(org, admin, bankInput, { staff: true });
  await audit('ORG_CREATED_BY_STAFF', org.id, admin.id, { kind, code: org.code, adminEmail: email, approved: approve, newAccount: Boolean(raw) });
  if (approve) {
    const { prepareOrgAgreement } = await import('./orgAgreementService.js');
    await prepareOrgAgreement(org.id, admin).catch((e) => console.error('[OrgAgreement] not prepared:', e.message));
  }
  const portal = PORTAL[kind];
  const link = raw ? `${site()}/accept-invite?token=${raw}&next=${encodeURIComponent(portal.path)}` : `${site()}${portal.path}`;
  await notifyUser(user.id, {
    type: 'ORG_CREATED', title: `${org.name} is on ${portal.name}`, message: approve ? 'Your account is ready.' : 'Upload your documents so we can approve it.', link: portal.path, inApp: !raw,
    email: { subject: `${org.name} on ${portal.name} (${org.code})`, html: await emailLayout({
      title: `Welcome to ${portal.name}`, eyebrow: portal.name, ref: org.code, status: { label: approve ? 'Active' : 'In review', tone: approve ? 'ok' : 'info' },
      body: `<p>ZivoPlus has set up <b>${org.name.replace(/[<>&]/g, '')}</b> on ${portal.name}, with you as its admin.</p><p>${approve ? 'The account is active: sign the agreement, invite your team and start booking.' : 'Upload your PAN, GST certificate and business proof so we can approve it.'}</p>`,
      cta: { label: raw ? 'Set your password' : `Open ${portal.name}`, href: link }, note: raw ? 'This link works for 7 days.' : null,
    }) },
  }).catch(() => {});
  return { ...(await adminDetail(org.id)), ...(process.env.EMAIL_TEST_MODE === 'true' && raw ? { inviteLink: link } : {}) };
};

/** Staff correct any detail (legal and tax too: the change is in the history). */
export const updateProfile = async (id, admin, input = {}) => {
  const org = await loadOrg(id);
  const s = await getBusinessSettings();
  const d = legalDetails({ ...org, ...input }, { kind: org.kind, requireGstin: (org.kind === 'AGENCY' ? s.agency : s.corporate).requireGstin });
  if (d.pan !== org.pan) {
    const taken = await prisma.organisation.findFirst({ where: { kind: org.kind, pan: d.pan, status: { not: 'REJECTED' }, id: { not: org.id } }, select: { name: true } });
    if (taken) throw fail(`Another account has this PAN (${taken.name}).`, 409);
  }
  const extra = profileDetails(input, { kind: org.kind, gstin: d.gstin, partial: true });
  const changed = Object.keys(d).filter((k) => String(d[k] ?? '') !== String(org[k] ?? ''));
  if (!changed.length && !Object.keys(extra).length) return adminDetail(org.id);
  await prisma.organisation.update({ where: { id: org.id }, data: { ...Object.fromEntries(changed.map((k) => [k, d[k]])), ...extra } });
  await audit('ORG_PROFILE_UPDATED_BY_STAFF', org.id, admin.id, { before: Object.fromEntries(changed.map((k) => [k, org[k] ?? null])), after: Object.fromEntries(changed.map((k) => [k, d[k] ?? null])) });
  return adminDetail(org.id);
};

/** A KYC file checked (VERIFIED) or not acceptable (REJECTED, with a note the organisation sees). */
export const reviewDocument = async (id, docId, admin, { status, note } = {}) => {
  const org = await loadOrg(id);
  if (!['VERIFIED', 'REJECTED'].includes(status)) throw fail('Choose verified or not acceptable.');
  const text = clean(note, 300);
  if (status === 'REJECTED' && text.length < 3) throw fail('Say what is wrong with it, so they can upload it again.');
  const docs = Array.isArray(org.documents) ? org.documents : [];
  const doc = docs.find((x) => x.id === docId);
  if (!doc) throw fail('Document not found', 404);
  const review = { status, note: text || null, by: admin.id, byName: admin.name || null, at: new Date().toISOString() };
  await prisma.organisation.update({ where: { id: org.id }, data: { documents: docs.map((x) => (x.id === docId ? { ...x, review } : x)) } });
  await audit(status === 'VERIFIED' ? 'ORG_DOCUMENT_VERIFIED' : 'ORG_DOCUMENT_REJECTED', org.id, admin.id, { docId, type: doc.type, note: text || null });
  if (status === 'REJECTED') {
    const admins = await prisma.orgMember.findMany({ where: { organisationId: org.id, role: 'ADMIN', status: 'ACTIVE' }, select: { userId: true } });
    for (const a of admins) {
      await notifyUser(a.userId, { type: 'ORG_DOCUMENT_REJECTED', title: `Please upload your ${DOC_TYPES[doc.type] || 'document'} again`, message: text, link: PORTAL[org.kind].path }).catch(() => {});
    }
  }
  return adminDetail(org.id);
};

/** Staff add someone to the team (the organisation must be approved). */
export const staffAddMember = async (id, admin, input = {}) => {
  const org = await loadOrg(id);
  if (!['ACTIVE', 'IN_REVIEW', 'ON_HOLD'].includes(org.status)) throw fail('This organisation is closed.', 409);
  if (!ROLES[input.role]) throw fail('Choose a role.');
  const m = await addMember(org, { ...admin, name: 'ZivoPlus' }, input);
  await audit('ORG_MEMBER_ADDED_BY_STAFF', org.id, admin.id, { email: String(input.email || '').toLowerCase(), role: input.role });
  return m;
};

/** Its bookings, newest first. */
export const bookings = async (id, { status, search, page = 1, pageSize = 30 } = {}) => {
  const org = await loadOrg(id);
  const where = { organisationId: org.id };
  if (['PENDING', 'CONFIRMED', 'CHECKED_IN', 'COMPLETED', 'CANCELLED', 'NO_SHOW'].includes(status)) where.status = status;
  const q = clean(search, 60);
  if (q) where.OR = [{ bookingRef: { contains: q, mode: 'insensitive' } }, { guestName: { contains: q, mode: 'insensitive' } }];
  const take = Math.min(Math.max(Number(pageSize) || 30, 1), 100);
  const [rows, total] = await Promise.all([
    prisma.booking.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (Math.max(Number(page) || 1, 1) - 1) * take, take, select: {
      id: true, bookingRef: true, status: true, guestName: true, checkIn: true, checkOut: true, rooms: true, totalAmount: true, createdAt: true, businessPricing: true,
      hotel: { select: { name: true, city: true } },
    } }),
    prisma.booking.count({ where }),
  ]);
  return {
    total, page: Math.max(Number(page) || 1, 1), pageSize: take,
    bookings: rows.map((b) => ({ id: b.id, bookingRef: b.bookingRef, status: b.status, guestName: b.guestName, checkIn: b.checkIn, checkOut: b.checkOut, rooms: b.rooms, totalAmount: Number(b.totalAmount), createdAt: b.createdAt, hotel: b.hotel, bookedBy: b.businessPricing?.bookedBy?.name || null, commission: b.businessPricing?.commissionAmount ?? null })),
  };
};

/** The last 6 months: bookings and value by the month they were made. */
const trend = async (org) => {
  const from = monthStart(new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() - 5, 1)));
  const rows = await prisma.booking.findMany({ where: { organisationId: org.id, status: { in: SPENT }, createdAt: { gte: from } }, select: { createdAt: true, totalAmount: true } });
  const months = [];
  for (let i = 0; i < 6; i += 1) months.push(ymKey(new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + i, 1))));
  return months.map((m) => {
    const r = rows.filter((b) => ymKey(b.createdAt) === m);
    return { month: m, bookings: r.length, value: round2(r.reduce((t, b) => t + Number(b.totalAmount), 0)) };
  });
};

/** Spend (companies) or sales and commission (agents) for a period, plus the 6-month trend. */
export const report = async (id, q = {}) => {
  const org = await loadOrg(id);
  const [spend, months, account] = await Promise.all([spendReportFor(org, q), trend(org), accountSummary(org, { settings: await getBusinessSettings() })]);
  const out = { kind: org.kind, organisation: { id: org.id, name: org.name, code: org.code }, ...spend, trend: months, account };
  if (org.kind === 'AGENCY') {
    const c = await commissionStatementFor(org, q);
    out.commission = { totals: c.totals, rows: c.rows.slice(0, 50) };
  }
  return out;
};

export const reportCsv = async (id, q = {}) => spendCsvFor(await loadOrg(id), q);

export default { overview, createOnBehalf, updateProfile, reviewDocument, staffAddMember, bookings, report, reportCsv };
