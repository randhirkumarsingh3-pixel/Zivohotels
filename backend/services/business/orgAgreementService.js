/**
 * Agreements with business accounts: travel agents (Partner Hub) and companies (ZivoPlus for
 * Business).
 *
 *  prepare  ZivoPlus prepares it from Admin → Agreement template (agent or company wording) and
 *           the organisation's details and terms; done automatically when the organisation is
 *           approved, and again by staff when terms change (until it is signed).
 *  sign     one of the organisation's admins reads it in the portal and signs with an emailed code
 *           (typed name + consent) or Aadhaar eSign through Leegality, as Admin → Agreement
 *           template → How owners sign is set for property agreements.
 *  require  Business settings can require a signed agreement before the organisation books.
 */
import crypto from 'crypto';
import prisma from '../../config/db.js';
import { esc, day, dateTime, shell, header, meta, renderPdf } from '../documents/theme.js';
import { brandContext } from '../documents/documentSettings.js';
import { getTemplate } from '../agreements/agreementTemplate.js';
import { renderBody, AGREEMENT_CSS } from '../agreements/agreementService.js';
import { sendCode, checkCode, CodeError } from '../otpService.js';
import { getSigningSettings, createSignRequest, readResult, certificateOf, saveFile, storedFiles, leegalityConfigured } from '../agreements/leegality.js';
import { notifyUser, notifyAdmins } from '../notifyService.js';
import { emailLayout, siteUrl } from '../emailLayout.js';
import { getBusinessSettings, termsFor } from './businessSettings.js';
import { membershipFor, PORTAL } from './organisationService.js';

const fail = (m, code = 400) => Object.assign(new Error(m), { statusCode: code });
const sha256 = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');
const TYPE = { INDIVIDUAL: 'sole proprietorship', PARTNERSHIP: 'partnership firm', LLP: 'limited liability partnership', PVT_LTD: 'private limited company', PUBLIC_LTD: 'public limited company', HUF: 'Hindu Undivided Family', TRUST: 'trust' };
const MODE = { PREPAID: 'prepaid wallet (top-ups)', CREDIT: 'credit line', BOTH: 'prepaid wallet first, then credit line' };
const INVOICE = { ON_BEHALF: 'issued by ZivoPlus on behalf of the hotel, which is the supplier', ZIVO_SUPPLIER: 'issued by ZivoPlus as the supplier', HOTEL_ISSUES: 'issued by the hotel' };
const PRICING = { NET: 'net rates, with the Agent\'s own markup', COMMISSION: 'the public price, with commission to the Agent', BOTH: 'net rates with the Agent\'s markup, or the public price with commission, chosen per booking' };
const inrText = (n) => `₹${Math.round(Number(n) || 0).toLocaleString('en-IN')}`;

/** Fills the template's fields from the organisation; also what's missing. */
export const orgAgreementData = async (org, { agreement = null } = {}) => {
  const [brand, settings, tpl] = await Promise.all([brandContext(), getBusinessSettings(), getTemplate(org.kind)]);
  const t = termsFor(org, settings);
  const values = {
    agreementRef: agreement?.reference || 'Assigned when prepared', effectiveDate: day(agreement?.signedAt || new Date()),
    zivoLegalName: brand.company.legalName, zivoAddress: brand.company.address || '', zivoGstin: brand.company.gstin || '', zivoCin: brand.company.cin || '—',
    partnerLegalName: org.legalName, partnerType: TYPE[org.incorporationType] || 'business', partnerPan: org.pan, partnerGstin: org.gstin || 'Not registered',
    partnerAddress: `${org.address}, ${org.city}, ${org.state} ${org.pincode}`, partnerEmail: org.billingEmail, partnerPhone: org.phone, accountCode: org.code,
    paymentTerms: MODE[t.paymentMode], creditLimit: t.creditAllowed && t.creditLimit > 0 ? inrText(t.creditLimit) : 'None', creditDays: String(t.creditDays), invoiceIssuer: INVOICE[t.invoiceMode],
    termMonths: String(tpl.termMonths), noticeDays: String(tpl.noticeDays), jurisdiction: tpl.jurisdiction,
    ...(org.kind === 'AGENCY' ? { pricingModel: PRICING[t.pricingModel], defaultMarkup: String(t.defaultMarkupPct), extraCommission: String(t.extraCommissionPct), tdsRate: String(t.tdsPct) } : {}),
  };
  const missing = [];
  if (!brand.company.address || !brand.company.gstin || brand.company.legalName === 'ZivoPlus') missing.push('ZivoPlus legal name, address and GSTIN (Admin → Finance settings → Company)');
  return { values, missing, template: tpl };
};

const nextReference = async () => {
  const year = new Date().getFullYear();
  const n = await prisma.orgAgreement.count({ where: { reference: { startsWith: `ZIV-BAG-${year}-` } } });
  for (let i = 1; i < 50; i += 1) {
    const ref = `ZIV-BAG-${year}-${String(n + i).padStart(6, '0')}`;
    if (!(await prisma.orgAgreement.findUnique({ where: { reference: ref }, select: { id: true } }))) return ref;
  }
  return `ZIV-BAG-${year}-${Date.now().toString().slice(-6)}`;
};

const orgAdmins = (orgId) => prisma.orgMember.findMany({ where: { organisationId: orgId, role: 'ADMIN', status: 'ACTIVE' }, select: { userId: true } });

/** Prepares (or prepares again) the organisation's agreement and asks its admins to sign. */
export const prepareOrgAgreement = async (orgId, staff = null, { notify = true } = {}) => {
  const org = await prisma.organisation.findUnique({ where: { id: String(orgId) }, include: { agreement: true } });
  if (!org) throw fail('Organisation not found', 404);
  if (org.agreement?.status === 'SIGNED') throw fail('This organisation\'s agreement is already signed. Cancel it first to prepare a new one.', 409);
  const { values, missing, template } = await orgAgreementData(org, { agreement: org.agreement });
  if (missing.length) throw Object.assign(fail(`Can't prepare the agreement yet. Missing: ${missing.join('; ')}.`), { missing });
  const reference = org.agreement?.reference || await nextReference();
  const content = renderBody(template, { ...values, agreementRef: reference });
  const data = {
    reference, status: 'PENDING_SIGNATURE', title: template.title, content, contentHash: sha256(content), templateVersion: template.version || 1, termMonths: template.termMonths,
    preparedAt: new Date(), preparedById: staff?.id || null, leegalityDocumentId: null, leegalitySignUrl: null, leegalityStatus: null, leegalityRequestedAt: null, leegalityContentHash: null,
    signedAt: null, signerName: null, signerEmail: null, signerUserId: null, signatureMethod: null, signerCertificate: null,
  };
  const a = org.agreement
    ? await prisma.orgAgreement.update({ where: { id: org.agreement.id }, data })
    : await prisma.orgAgreement.create({ data: { ...data, organisationId: org.id } });
  if (org.agreement) await prisma.agreementFile.deleteMany({ where: { agreementId: a.id } });
  await prisma.auditLog.create({ data: { action: 'ORG_AGREEMENT_PREPARED', entityType: 'ORGANISATION', entityId: org.id, userId: staff?.id || 'SYSTEM', details: { reference, templateVersion: a.templateVersion, contentHash: a.contentHash } } }).catch(() => {});
  if (notify) {
    const p = PORTAL[org.kind];
    const html = await emailLayout({
      title: `Please sign your ${template.title.toLowerCase()}`, eyebrow: p.name, ref: reference, status: { label: 'Awaiting signature', tone: 'warn' },
      body: `<p>Your agreement with ZivoPlus for <b>${esc(org.name)}</b> is ready. An admin of your organisation can read and sign it online.</p>`,
      cta: { label: 'Read and sign', href: `${siteUrl()}${p.path}?tab=agreement` },
    });
    for (const m of await orgAdmins(org.id)) {
      await notifyUser(m.userId, { type: 'ORG_AGREEMENT', title: 'Agreement ready to sign', message: `${template.title} ${reference} for ${org.name}.`, link: `${p.path}?tab=agreement`, email: { subject: `Please sign: ${template.title} (${reference})`, html } });
    }
  }
  return a;
};

const loadForMember = async (orgId, user) => {
  const { org, member } = await membershipFor(orgId, user);
  const agreement = await prisma.orgAgreement.findUnique({ where: { organisationId: org.id } });
  return { org, member, agreement };
};

const canSign = (member) => member.role === 'ADMIN' && member.status === 'ACTIVE';

/** Asks Leegality for the latest state (at most every 20 s from page loads). */
const lastSync = new Map();
export const refreshOrgAgreement = async (where, { force = true } = {}) => {
  const a = await prisma.orgAgreement.findUnique({ where });
  if (!a?.leegalityDocumentId || a.status !== 'PENDING_SIGNATURE' || !leegalityConfigured()) return a;
  if (!force && Date.now() - (lastSync.get(a.id) || 0) < 20000) return a;
  lastSync.set(a.id, Date.now());
  const res = await readResult(a.leegalityDocumentId, a.signerEmail);
  if (res.done) {
    if (res.signedPdf) await saveFile(a.id, 'SIGNED_PDF', `${a.reference}-signed.pdf`, res.signedPdf);
    if (res.auditTrail) await saveFile(a.id, 'AUDIT_TRAIL', `${a.reference}-audit-trail.pdf`, res.auditTrail);
    const expiryAt = new Date(res.signedAt); expiryAt.setMonth(expiryAt.getMonth() + (a.termMonths || 12));
    const signed = await prisma.orgAgreement.update({ where: { id: a.id }, data: {
      status: 'SIGNED', signedAt: res.signedAt, expiryAt, leegalityStatus: 'COMPLETED', signatureMethod: 'AADHAAR_ESIGN',
      signerName: (res.cert.name || res.name || a.signerName || '').slice(0, 120), signerEmail: res.email || a.signerEmail, signerCertificate: certificateOf(res, a.leegalityDocumentId),
    } });
    await afterSigned(signed);
    return signed;
  }
  if (res.failed && a.leegalityStatus !== res.failed) return prisma.orgAgreement.update({ where: { id: a.id }, data: { leegalityStatus: res.failed } });
  return a;
};

export const viewOrgAgreement = async (orgId, user) => {
  let { org, member, agreement } = await loadForMember(orgId, user);
  if (agreement?.leegalityStatus === 'SENT') {
    try { agreement = await refreshOrgAgreement({ id: agreement.id }, { force: false }); } catch (e) { console.error('[OrgAgreement] status check failed:', e.message); }
  }
  const settings = await getBusinessSettings();
  const required = Boolean((org.kind === 'AGENCY' ? settings.agency : settings.corporate).requireAgreement);
  if (!agreement) return { exists: false, required };
  const s = await getSigningSettings();
  const aadhaar = s.active === 'LEEGALITY_AADHAAR';
  return {
    exists: true, required, id: agreement.id, reference: agreement.reference, status: agreement.status, title: agreement.title, html: agreement.content, contentHash: agreement.contentHash,
    preparedAt: agreement.preparedAt, signedAt: agreement.signedAt, signerName: agreement.signerName, signatureMethod: agreement.signatureMethod, expiryAt: agreement.expiryAt,
    canSign: canSign(member) && agreement.status === 'PENDING_SIGNATURE', signerEmail: user.email,
    signing: { method: s.active, emailFallback: aadhaar && s.allowEmailFallback, sandbox: aadhaar ? s.leegality.sandbox : false, leegalityStatus: agreement.leegalityContentHash === agreement.contentHash ? agreement.leegalityStatus : null },
  };
};

const pendingFor = async (orgId, user, contentHash) => {
  const { org, member, agreement } = await loadForMember(orgId, user);
  if (!canSign(member)) throw fail('Only an admin of your organisation can sign the agreement.', 403);
  if (agreement?.status !== 'PENDING_SIGNATURE') throw fail('There is no agreement waiting for a signature.', 409);
  if (contentHash !== undefined && (!contentHash || contentHash !== agreement.contentHash)) throw fail('The agreement was updated since you opened it. Reload the page and read the new version.', 409);
  return { org, agreement };
};
const emailAllowed = async () => {
  const s = await getSigningSettings();
  if (s.active === 'LEEGALITY_AADHAAR' && !s.allowEmailFallback) throw fail('This agreement is signed with Aadhaar eSign. Use "Sign with Aadhaar".', 409);
};

export const requestOrgSigningCode = async (orgId, user, ctx = {}) => {
  await pendingFor(orgId, user);
  await emailAllowed();
  return sendCode({ channel: 'EMAIL', target: user.email, purpose: 'AGREEMENT', ipAddress: ctx.ip, userAgent: ctx.userAgent, name: user.name });
};

export const signOrgAgreement = async (orgId, user, { name, code, consent, contentHash } = {}, ctx = {}) => {
  const { agreement } = await pendingFor(orgId, user, contentHash);
  await emailAllowed();
  const typed = String(name || '').trim().replace(/\s+/g, ' ');
  if (typed.length < 3) throw fail('Type your full name to sign.');
  if (consent !== true) throw fail('Tick the box to confirm you agree to sign electronically.');
  try { await checkCode({ channel: 'EMAIL', target: user.email, purpose: 'AGREEMENT', code }); } catch (e) { if (e instanceof CodeError) throw fail(e.message, e.statusCode); throw e; }
  const now = new Date();
  const expiryAt = new Date(now); expiryAt.setMonth(expiryAt.getMonth() + (agreement.termMonths || 12));
  const signed = await prisma.orgAgreement.update({ where: { id: agreement.id }, data: {
    status: 'SIGNED', signedAt: now, expiryAt, signerUserId: user.id, signerName: typed.slice(0, 120), signerEmail: user.email,
    ipAddress: ctx.ip || null, signerUserAgent: String(ctx.userAgent || '').slice(0, 300), signatureMethod: 'EMAIL_OTP',
  } });
  await afterSigned(signed);
  return signed;
};

export const startOrgAadhaar = async (orgId, user, { contentHash, consent } = {}) => {
  const { org, agreement } = await pendingFor(orgId, user, contentHash);
  if (consent !== true) throw fail('Tick the box to confirm you agree to sign with Aadhaar eSign.');
  if (agreement.leegalityDocumentId && agreement.leegalityContentHash === agreement.contentHash && agreement.leegalitySignUrl && agreement.leegalityStatus === 'SENT') {
    return { signUrl: agreement.leegalitySignUrl, documentId: agreement.leegalityDocumentId, reused: true };
  }
  const pdf = await orgAgreementPdf(org.id, { forEsign: true });
  const d = await createSignRequest({ name: `${agreement.reference} ${org.name} ${agreement.title}`, pdf, signer: { name: user.name, email: user.email, phone: user.phone }, irn: agreement.reference });
  await prisma.orgAgreement.update({ where: { id: agreement.id }, data: { leegalityDocumentId: d.documentId, leegalitySignUrl: d.signUrl, leegalityStatus: 'SENT', leegalityRequestedAt: new Date(), leegalityContentHash: agreement.contentHash, signerEmail: user.email, signerUserId: user.id } });
  await prisma.auditLog.create({ data: { action: 'ORG_AGREEMENT_ESIGN_REQUESTED', entityType: 'ORGANISATION', entityId: org.id, userId: user.id, details: { reference: agreement.reference, documentId: d.documentId } } }).catch(() => {});
  return { signUrl: d.signUrl, documentId: d.documentId, reused: false };
};

/** Signed: audit, and the signed copy to the organisation's admins and ZivoPlus. */
const afterSigned = async (a) => {
  const org = await prisma.organisation.findUnique({ where: { id: a.organisationId } });
  await prisma.auditLog.create({ data: { action: 'ORG_AGREEMENT_SIGNED', entityType: 'ORGANISATION', entityId: org.id, userId: a.signerUserId || 'LEEGALITY', details: { reference: a.reference, method: a.signatureMethod, signerName: a.signerName, signerEmail: a.signerEmail, contentHash: a.contentHash } } }).catch(() => {});
  const p = PORTAL[org.kind];
  const rows = [['Agreement', a.reference], ['Organisation', `${org.name} (${org.code})`], ['Signed by', `${a.signerName} (${a.signerEmail})`], ['Signed on', dateTime(a.signedAt)], ['Method', a.signatureMethod === 'AADHAAR_ESIGN' ? 'Aadhaar eSign (Leegality)' : 'Emailed code']];
  const html = await emailLayout({ title: 'Agreement signed', eyebrow: p.name, ref: a.reference, status: { label: 'Signed', tone: 'ok' }, rows, body: '<p>Thank you. Download the signed copy from the Agreement tab at any time.</p>', cta: { label: 'Open', href: `${siteUrl()}${p.path}?tab=agreement` } });
  for (const m of await orgAdmins(org.id)) await notifyUser(m.userId, { type: 'ORG_AGREEMENT_SIGNED', title: 'Agreement signed', message: `${a.title} ${a.reference} is signed.`, link: `${p.path}?tab=agreement`, email: { subject: `Signed: ${a.title} (${a.reference})`, html } });
  await notifyAdmins({ type: 'ORG_AGREEMENT_SIGNED', title: `${org.name} signed its agreement`, message: `${a.reference} (${p.name}).`, link: `/admin/organisations?id=${org.id}` });
};

/** The agreement PDF; signed with Aadhaar, Leegality's signed copy (and audit trail). */
export const orgAgreementPdf = async (orgId, { forEsign = false, auditTrail = false } = {}) => {
  const [a, org, brand] = await Promise.all([prisma.orgAgreement.findUnique({ where: { organisationId: String(orgId) } }), prisma.organisation.findUnique({ where: { id: String(orgId) } }), brandContext()]);
  if (!a) return null;
  if (!forEsign && a.signatureMethod === 'AADHAAR_ESIGN') {
    const f = (await storedFiles(a.id)).find((x) => x.kind === (auditTrail ? 'AUDIT_TRAIL' : 'SIGNED_PDF'));
    if (f) return Buffer.from(f.content);
  }
  if (auditTrail) return null;
  const signed = !forEsign && a.status === 'SIGNED';
  const cert = signed ? `<div class="cert"><h2>Signature certificate</h2><table>
    <tr><td>Agreement</td><td>${esc(a.reference)}</td></tr>
    <tr><td>Signed by</td><td>${esc(a.signerName || '')}${a.signatureMethod === 'EMAIL_OTP' ? ` &lt;${esc(a.signerEmail || '')}&gt;` : ''}</td></tr>
    <tr><td>Method</td><td>${a.signatureMethod === 'EMAIL_OTP' ? 'Electronic: typed name, consent and one-time code sent to the signer\'s email' : 'Signed outside ZivoPlus; recorded by ZivoPlus staff'}</td></tr>
    <tr><td>Signed on</td><td>${esc(dateTime(a.signedAt))} (India time)</td></tr>
    ${a.ipAddress ? `<tr><td>IP address</td><td>${esc(a.ipAddress)}</td></tr>` : ''}
    <tr><td>Document fingerprint</td><td class="mono">SHA-256 ${esc(a.contentHash)}</td></tr></table></div>` : '';
  const body = `<div class="page">${header({ brandSub: brand.company.legalName, title: a.title, sub: `${org.name} · ${org.code}`, ref: a.reference, status: signed ? { label: 'Signed', tone: '' } : forEsign ? null : { label: 'Awaiting signature', tone: 'warn' } })}
${meta([['Prepared', day(a.preparedAt)], ['Account', esc(org.code)], ['Term', `${a.termMonths} months`], ['Template', `v${a.templateVersion}`]])}
${a.content}
<div class="sigs"><div>For ${esc(brand.company.legalName)}<br><span style="color:#64748b">Accepted electronically by ZivoPlus</span></div><div>For ${esc(org.legalName)}<br>${signed ? `<b>${esc(a.signerName || '')}</b>, ${esc(day(a.signedAt))}` : forEsign ? '<span style="color:#64748b">Signed with Aadhaar eSign (signature below)</span>' : '<span style="color:#64748b">Awaiting signature</span>'}</div></div>
${cert}</div>`;
  return renderPdf(shell(`${a.title} ${a.reference}`, body, { extraCss: AGREEMENT_CSS, watermark: signed || forEsign ? null : 'DRAFT' }));
};

/** Whether an organisation may book: signed agreement needed when Business settings require it. */
export const assertAgreementForBooking = async (org, settings) => {
  if (!(org.kind === 'AGENCY' ? settings.agency : settings.corporate).requireAgreement) return;
  const a = await prisma.orgAgreement.findUnique({ where: { organisationId: org.id }, select: { status: true } });
  if (a?.status !== 'SIGNED') throw fail(a ? 'Sign your agreement with ZivoPlus first (Agreement tab), then you can book.' : 'ZivoPlus is preparing your agreement. You can book once it is signed.', 409);
};

/** Staff view of the agreement. */
export const adminOrgAgreement = async (orgId) => {
  const a = await prisma.orgAgreement.findUnique({ where: { organisationId: String(orgId) } });
  return a ? { reference: a.reference, status: a.status, title: a.title, preparedAt: a.preparedAt, signedAt: a.signedAt, signerName: a.signerName, signerEmail: a.signerEmail, signatureMethod: a.signatureMethod, leegalityStatus: a.leegalityStatus } : null;
};

export default { orgAgreementData, prepareOrgAgreement, viewOrgAgreement, requestOrgSigningCode, signOrgAgreement, startOrgAadhaar, refreshOrgAgreement, orgAgreementPdf, assertAgreementForBooking, adminOrgAgreement };
