/**
 * Property listing agreements, end to end:
 *
 *  prepare  ZivoPlus staff prepare the agreement from the template (Admin → Agreement template)
 *           and the property's onboarding details. The exact text is saved on the agreement with a
 *           SHA-256 fingerprint, and the owner is emailed a link to read and sign it.
 *  sign     The owner reads it in the Extranet, types their full name, ticks the consent box and
 *           enters a one-time code sent to their account email. Saved: name, email, time, IP,
 *           device, and the fingerprint of the text they saw (it must match). The property moves
 *           to "Ready for go-live" and both sides get the signed PDF by email.
 *  pdf      The agreement as a PDF; once signed, with a signature certificate page.
 *
 * A prepared agreement can be prepared again (new text, new fingerprint) until it's signed; a
 * signed one is never changed. Changing terms after signing means cancelling and preparing anew.
 */
import crypto from 'crypto';
import prisma from '../../config/db.js';
import { esc, day, dateTime, shell, header, meta, renderPdf } from '../documents/theme.js';
import { brandContext } from '../documents/documentSettings.js';
import { getTemplate } from './agreementTemplate.js';
import { sendCode, checkCode, CodeError } from '../otpService.js';
import { getSigningSettings, startSigning, syncStatus, storedFiles } from './leegality.js';

const bad = (m, code = 400) => Object.assign(new Error(m), { statusCode: code });
const sha256 = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');
const TYPE = { INDIVIDUAL: 'sole proprietorship', PARTNERSHIP: 'partnership firm', LLP: 'limited liability partnership', PVT_LTD: 'private limited company', PUBLIC_LTD: 'public limited company', HUF: 'Hindu Undivided Family', TRUST: 'trust' };
const CYCLE = { Weekly: 'weekly (every Wednesday)', '15 days': 'twice a month (on the 1st and 16th)', Monthly: 'monthly (in the first week of the month)' };
const cycleText = (c) => CYCLE[c] || (/^T\+(\d+)$/i.test(c || '') ? `${c.slice(2)} day(s) after the guest checks out` : 'weekly (every Wednesday)');

const loadHotel = (hotelId) => prisma.hotel.findUnique({
  where: { id: hotelId },
  include: { owner: { select: { id: true, name: true, email: true, phone: true } }, roomTypes: { where: { isActive: true }, select: { totalInventory: true } } },
});

/** The values filled into the template, and what's missing to prepare the agreement. */
export const agreementData = async (hotel, { agreement = null, commissionRate, payoutCycle, termMonths, effectiveDate } = {}) => {
  const [brand, bank, tpl] = await Promise.all([brandContext(), prisma.bankDetail.findUnique({ where: { hotelId: hotel.id } }), getTemplate()]);
  const addr = hotel.integrationSettings?.addressDetails || {};
  const contact = hotel.integrationSettings?.contactInfo || {};
  const address = [addr.houseNo, addr.area || hotel.location, hotel.city, hotel.state, hotel.pincode].filter(Boolean).join(', ');
  const rate = Number(commissionRate ?? agreement?.commissionRate);
  const values = {
    agreementRef: agreement?.reference || 'Assigned when prepared',
    effectiveDate: day(effectiveDate || new Date()),
    zivoLegalName: brand.company.legalName, zivoAddress: brand.company.address || '[ZivoPlus address: add it in Finance settings]',
    zivoGstin: brand.company.gstin || '[add in Finance settings]', zivoCin: brand.company.cin || '—',
    ownerLegalName: hotel.legalName || '', ownerType: TYPE[hotel.incorporationType] || 'business',
    ownerPan: hotel.pan || '', ownerGstin: hotel.gstin || 'Not registered', ownerAddress: address,
    ownerContactName: hotel.owner?.name || contact.ownerName || '', ownerEmail: hotel.owner?.email || contact.ownerEmail || '', ownerPhone: hotel.owner?.phone || contact.ownerPhone || '',
    propertyName: hotel.name, propertyId: `ZP-${hotel.id.slice(0, 8).toUpperCase()}`, propertyCity: hotel.city || '', propertyState: hotel.state || '',
    roomCount: String(hotel.roomTypes?.reduce((s, r) => s + (r.totalInventory || 0), 0) || '—'),
    commissionRate: Number.isFinite(rate) && rate > 0 ? String(Math.round(rate * 100) / 100) : '',
    payoutCycle: cycleText(payoutCycle || agreement?.payoutCycle || hotel.payoutCycle),
    bankName: bank?.bankName || '', bankAccountEnding: bank?.accountNumber ? String(bank.accountNumber).slice(-4) : '', bankIfsc: bank?.ifscCode || '',
    termMonths: String(termMonths || agreement?.termMonths || tpl.termMonths), noticeDays: String(tpl.noticeDays), jurisdiction: tpl.jurisdiction,
  };
  const missing = [];
  if (!values.commissionRate) missing.push('Commission % (Finance & Legal step, or enter it here)');
  if (!values.ownerLegalName) missing.push('Legal entity name (Finance & Legal step)');
  if (!values.ownerPan) missing.push('PAN (Finance & Legal step)');
  if (!address) missing.push('Property address (Location step)');
  if (!values.ownerEmail) missing.push('Owner email');
  if (!bank) missing.push('Payout bank account (Finance & Legal step)');
  if (!brand.company.address || !brand.company.gstin || brand.company.legalName === 'ZivoPlus') missing.push('ZivoPlus legal name, address and GSTIN (Admin → Finance settings → Company)');
  return { values, missing, template: tpl, bank };
};

const paragraphs = (text, values) => {
  const filled = String(text).replace(/\{\{\s*([a-zA-Z]+)\s*\}\}/g, (_, k) => (values[k] ? `\uE000${values[k]}\uE001` : `\uE002${k}\uE003`));
  const html = (s) => esc(s).replace(/\uE000/g, '<b>').replace(/\uE001/g, '</b>').replace(/\uE002/g, '<span class="miss">[').replace(/\uE003/g, ']</span>');
  return filled.split(/\n{2,}/).map((block) => {
    const lines = block.split('\n');
    if (lines.every((l) => /^\s*-\s+/.test(l))) return `<ul>${lines.map((l) => `<li>${html(l.replace(/^\s*-\s+/, ''))}</li>`).join('')}</ul>`;
    return `<p>${lines.map(html).join('<br>')}</p>`;
  }).join('');
};

const AGREEMENT_CSS = `.agr{font-size:11.5px;line-height:1.65;color:#0f172a}.agr h2{font-size:13px;margin:16px 0 4px;color:#0b1f3a}.agr p{margin:0 0 8px}.agr ul{margin:0 0 8px 18px;padding:0}.agr li{margin:2px 0}.miss{background:#fee2e2;color:#b91c1c;padding:0 3px;border-radius:3px}
.cert{margin-top:18px;border:1px solid #e2e8f0;border-radius:8px;padding:14px 16px;font-size:11px}.cert h2{margin:0 0 8px;font-size:13px}.cert td{padding:3px 10px 3px 0;vertical-align:top}.cert td:first-child{color:#64748b;white-space:nowrap}.mono{font-family:monospace;font-size:10px;word-break:break-all}
.sigs{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:22px}.sigs div{border-top:1px solid #94a3b8;padding-top:6px;font-size:11px}`;

/** The agreement body (what the owner signs). */
export const renderBody = (template, values) => `<div class="agr">${template.sections.map((s) => `${s.heading ? `<h2>${esc(s.heading)}</h2>` : ''}${paragraphs(s.body, values)}`).join('')}</div>`;

const nextReference = async () => {
  const year = new Date().getFullYear();
  const n = await prisma.agreement.count({ where: { reference: { startsWith: `ZIV-AGR-${year}-` } } });
  return `ZIV-AGR-${year}-${String(n + 1).padStart(6, '0')}`;
};

/** Preview without saving (admin). */
export const previewAgreement = async (hotelId, opts = {}) => {
  const hotel = await loadHotel(hotelId);
  if (!hotel) throw bad('Property not found', 404);
  const agreement = await prisma.agreement.findUnique({ where: { hotelId } });
  const { values, missing, template } = await agreementData(hotel, { agreement, ...opts });
  return { missing, html: renderBody(template, values), title: template.title, templateVersion: template.version, values };
};

/**
 * Prepares (or prepares again) the agreement and sends it to the owner.
 * opts: { commissionRate, payoutCycle, termMonths, send = true }
 */
export const prepareAgreement = async (hotelId, user, opts = {}) => {
  const hotel = await loadHotel(hotelId);
  if (!hotel) throw bad('Property not found', 404);
  const existing = await prisma.agreement.findUnique({ where: { hotelId } });
  if (existing?.status === 'SIGNED' || existing?.status === 'ACTIVE') throw bad('This agreement is already signed. Cancel it first to prepare a new one.', 409);
  if (opts.commissionRate !== undefined && opts.commissionRate !== null && opts.commissionRate !== '') {
    const r = Number(opts.commissionRate);
    if (!(r > 0 && r <= 50)) throw bad('Commission: more than 0 and at most 50%.');
  }
  const { values, missing, template } = await agreementData(hotel, { agreement: existing, ...opts });
  if (missing.length) throw Object.assign(bad(`Can't prepare the agreement yet. Missing: ${missing.join('; ')}.`), { missing });
  const reference = existing?.reference || await nextReference();
  values.agreementRef = reference;
  const content = renderBody(template, values);
  const data = {
    reference, commissionRate: Number(values.commissionRate), payoutCycle: opts.payoutCycle || existing?.payoutCycle || hotel.payoutCycle || 'Weekly',
    termMonths: Number(values.termMonths), templateVersion: template.version, content, contentHash: sha256(content),
    status: opts.send === false ? 'DRAFT' : 'PENDING_SIGNATURE', sentAt: opts.send === false ? null : new Date(), preparedAt: new Date(), preparedBy: user?.email || user?.id || null,
    signedAt: null, viewedAt: null, signerName: null, signerEmail: null, signerUserAgent: null, signatureMethod: null, ipAddress: null, expiryAt: null,
    leegalityDocumentId: null, leegalitySignUrl: null, leegalityStatus: null, leegalityRequestedAt: null, leegalityContentHash: null, signerCertificate: null,
  };
  if (existing) await prisma.agreementFile.deleteMany({ where: { agreementId: existing.id } });
  const agreement = existing
    ? await prisma.agreement.update({ where: { hotelId }, data })
    : await prisma.agreement.create({ data: { ...data, hotelId, ownerId: hotel.ownerId } });
  await prisma.auditLog.create({ data: { action: opts.send === false ? 'AGREEMENT_PREPARED' : 'AGREEMENT_SENT', entityType: 'HOTEL', entityId: hotelId, userId: user?.id || 'SYSTEM', details: { reference, commissionRate: data.commissionRate, templateVersion: template.version, contentHash: data.contentHash } } }).catch(() => {});
  if (opts.send !== false && values.ownerEmail) await emailOwnerToSign(hotel, agreement).catch((e) => console.error('[Agreement] email failed:', e.message));
  return agreement;
};

const emailOwnerToSign = async (hotel, agreement) => {
  const { notifyUser } = await import('../notifyService.js');
  const { emailLayout } = await import('../emailLayout.js');
  const link = `/extranet/agreement/${hotel.id}`;
  const html = await emailLayout({
    title: 'Your ZivoPlus agreement is ready to sign', eyebrow: 'Listing agreement', ref: agreement.reference,
    body: `Hello ${esc(hotel.owner?.name || '')},<br>${esc(hotel.name)} has been approved. Please read the listing agreement and sign it online to go live.`,
    rows: [['Agreement', agreement.reference], ['Property', hotel.name], ['Commission', `${agreement.commissionRate}% of the room price before GST`], ['Term', `${agreement.termMonths} months`]],
    cta: { label: 'Read and sign', href: link },
    note: 'You sign by typing your name and entering a code we email you. You can download the agreement before and after signing.',
  });
  await notifyUser(hotel.ownerId, {
    type: 'AGREEMENT', title: 'Sign your ZivoPlus agreement', message: `${hotel.name}: read and sign the listing agreement to go live.`, link,
    email: { to: hotel.owner?.email, subject: `Sign your ZivoPlus agreement: ${hotel.name}`, html, jobType: 'SEND_AGREEMENT' },
  });
};

/** What the owner sees in the Extranet. Marks the first time they opened it. */
const lastSync = new Map(); // agreement id -> time we last asked Leegality (at most every 20 s)
const syncIfDue = async (agreement) => {
  if (!agreement?.leegalityDocumentId || agreement.leegalityStatus !== 'SENT' || ['SIGNED', 'ACTIVE'].includes(agreement.status)) return agreement;
  const t = lastSync.get(agreement.id) || 0;
  if (Date.now() - t < 20000) return agreement;
  lastSync.set(agreement.id, Date.now());
  try { return await syncStatus(agreement, { onSigned: afterAadhaarSign }); } catch (e) { console.error('[Leegality] status check failed:', e.message); return agreement; }
};

export const ownerView = async (hotelId, user) => {
  let agreement = await prisma.agreement.findUnique({ where: { hotelId } });
  agreement = await syncIfDue(agreement);

  if (!agreement || !agreement.content) return null;
  if (!agreement.viewedAt && agreement.status === 'PENDING_SIGNATURE' && user?.role === 'OWNER') {
    await prisma.agreement.update({ where: { hotelId }, data: { viewedAt: new Date() } });
  }
  const tpl = await getTemplate();
  return {
    reference: agreement.reference, status: agreement.status, title: tpl.title, html: agreement.content, contentHash: agreement.contentHash,
    commissionRate: agreement.commissionRate, termMonths: agreement.termMonths, sentAt: agreement.sentAt, signedAt: agreement.signedAt,
    signerName: agreement.signerName, signerEmail: agreement.signerEmail, expiryAt: agreement.expiryAt,
    signatureMethod: agreement.signatureMethod, signing: await signingOffer(agreement),
  };
};

/** How the owner can sign this agreement now. */
const signingOffer = async (agreement) => {
  const s = await getSigningSettings();
  const aadhaar = s.active === 'LEEGALITY_AADHAAR';
  return {
    method: s.active, emailFallback: aadhaar && s.allowEmailFallback, sandbox: aadhaar ? s.leegality.sandbox : false,
    leegalityStatus: agreement.leegalityContentHash === agreement.contentHash ? agreement.leegalityStatus : null,
  };
};

/**
 * The owner chose "Sign with Aadhaar": sends this exact agreement to Leegality and returns the
 * link to Leegality's signing page.
 */
export const startAadhaarSigning = async (hotelId, user, { contentHash, consent } = {}) => {
  const hotel = await loadHotel(hotelId);
  if (!hotel) throw bad('Property not found', 404);
  if (!canSign(hotel, user)) throw bad('Only the property\'s owner account can sign the agreement.', 403);
  const agreement = await prisma.agreement.findUnique({ where: { hotelId } });
  if (agreement?.status !== 'PENDING_SIGNATURE') throw bad('There is no agreement waiting for your signature.', 409);
  if (!contentHash || contentHash !== agreement.contentHash) throw bad('The agreement was updated since you opened it. Reload the page and read the new version.', 409);
  if (consent !== true) throw bad('Tick the box to confirm you agree to sign electronically.');
  const pdf = await agreementPdf(hotelId, { forEsign: true });
  return startSigning({ agreement, hotel, owner: { id: user.id, name: user.name, email: user.email, phone: user.phone }, pdf });
};

/** After Leegality reports the agreement signed: emails the signed copy and audit trail. */
export const afterAadhaarSign = async (agreement) => {
  const hotel = await loadHotel(agreement.hotelId);
  if (hotel) await emailSignedCopies(hotel, agreement);
};

/** Asks Leegality for the latest state (admin "Check status", webhook). */
export const refreshFromLeegality = async (where) => {
  const agreement = await prisma.agreement.findUnique({ where });
  if (!agreement?.leegalityDocumentId) return agreement;
  lastSync.set(agreement.id, Date.now());
  return syncStatus(agreement, { onSigned: afterAadhaarSign });
};


const canSign = (hotel, user) => user?.role === 'OWNER' && hotel.ownerId === user.id;

/** Signing with an emailed code is off when Aadhaar eSign is required without the fallback. */
const emailSigningAllowed = async () => {
  const s = await getSigningSettings();
  if (s.active === 'LEEGALITY_AADHAAR' && !s.allowEmailFallback) throw bad('This agreement is signed with Aadhaar eSign. Use "Sign with Aadhaar".', 409);
};

export const requestSigningCode = async (hotelId, user, ctx = {}) => {
  const hotel = await prisma.hotel.findUnique({ where: { id: hotelId }, select: { id: true, ownerId: true, name: true } });
  if (!hotel) throw bad('Property not found', 404);
  if (!canSign(hotel, user)) throw bad('Only the property\'s owner account can sign the agreement.', 403);
  const agreement = await prisma.agreement.findUnique({ where: { hotelId } });
  if (agreement?.status !== 'PENDING_SIGNATURE') throw bad('There is no agreement waiting for your signature.', 409);
  await emailSigningAllowed();
  return sendCode({ channel: 'EMAIL', target: user.email, purpose: 'AGREEMENT', ipAddress: ctx.ip, userAgent: ctx.userAgent, name: user.name });
};

export const signAgreement = async (hotelId, user, { name, code, consent, contentHash }, ctx = {}) => {
  const hotel = await loadHotel(hotelId);
  if (!hotel) throw bad('Property not found', 404);
  if (!canSign(hotel, user)) throw bad('Only the property\'s owner account can sign the agreement.', 403);
  const agreement = await prisma.agreement.findUnique({ where: { hotelId } });
  if (agreement?.status !== 'PENDING_SIGNATURE') throw bad('There is no agreement waiting for your signature.', 409);
  if (!contentHash || contentHash !== agreement.contentHash) throw bad('The agreement was updated since you opened it. Reload the page and read the new version.', 409);
  await emailSigningAllowed();
  const typed = String(name || '').trim().replace(/\s+/g, ' ');
  if (typed.length < 3) throw bad('Type your full name to sign.');
  if (consent !== true) throw bad('Tick the box to confirm you agree to sign electronically.');
  try { await checkCode({ channel: 'EMAIL', target: user.email, purpose: 'AGREEMENT', code }); } catch (e) { if (e instanceof CodeError) throw bad(e.message, e.statusCode); throw e; }

  const now = new Date();
  const expiryAt = new Date(now); expiryAt.setMonth(expiryAt.getMonth() + (agreement.termMonths || 12));
  const signed = await prisma.$transaction(async (tx) => {
    const a = await tx.agreement.update({ where: { hotelId }, data: { status: 'SIGNED', signedAt: now, expiryAt, signerName: typed.slice(0, 120), signerEmail: user.email, ipAddress: ctx.ip || null, signerUserAgent: String(ctx.userAgent || '').slice(0, 300), signatureMethod: 'EMAIL_OTP' } });
    if (hotel.status === 'PENDING_AGREEMENT') await tx.hotel.update({ where: { id: hotelId }, data: { status: 'READY_FOR_GO_LIVE' } });
    await tx.auditLog.create({ data: { action: 'STATUS_AGREEMENT_SIGNED', entityType: 'HOTEL', entityId: hotelId, userId: user.id, details: { reference: a.reference, signerName: a.signerName, signerEmail: a.signerEmail, ipAddress: a.ipAddress, contentHash: a.contentHash, method: 'EMAIL_OTP' } } });
    return a;
  });
  emailSignedCopies(hotel, signed).catch((e) => console.error('[Agreement] signed copy email failed:', e.message));
  return signed;
};

const emailSignedCopies = async (hotel, agreement) => {
  const { notifyUser, notifyAdmins } = await import('../notifyService.js');
  const { emailLayout } = await import('../emailLayout.js');
  const rows = [['Agreement', agreement.reference], ['Property', hotel.name], ['Signed by', `${agreement.signerName} (${agreement.signerEmail})`], ['Signed on', dateTime(agreement.signedAt)]];
  const financeAttachments = [{ type: 'agreement', hotelId: hotel.id }, ...(agreement.signatureMethod === 'AADHAAR_ESIGN' ? [{ type: 'agreementAudit', hotelId: hotel.id }] : [])];
  const owner = await emailLayout({ title: 'Agreement signed', eyebrow: 'Listing agreement', ref: agreement.reference, status: 'Signed', body: `Thank you. Your ZivoPlus listing agreement for ${esc(hotel.name)} is signed; a copy is attached. ZivoPlus will now take your property live.`, rows });
  await notifyUser(hotel.ownerId, { type: 'AGREEMENT', title: 'Agreement signed', message: `${hotel.name}: your signed agreement is in your email and the Extranet.`, link: `/extranet/agreement/${hotel.id}`, email: { to: hotel.owner?.email, subject: `Signed: your ZivoPlus agreement ${agreement.reference}`, html: owner, jobType: 'AGREEMENT_SIGNED', financeAttachments } });
  const staff = await emailLayout({ title: `${hotel.name} signed the agreement`, eyebrow: 'Listing agreement', ref: agreement.reference, body: 'The property is ready to go live (Admin → Property review).', rows, cta: { label: 'Open property review', href: '/admin/properties/review' } });
  await notifyAdmins({ type: 'AGREEMENT', title: `${hotel.name} signed the agreement`, message: `${agreement.reference}: ready to go live.`, link: '/admin/agreements', email: { subject: `Agreement signed: ${hotel.name} (${agreement.reference})`, html: staff, financeAttachments } });
};

/** ZivoPlus records a paper agreement signed outside the system. */
export const markSignedOffline = async (hotelId, user, { note } = {}) => {
  const agreement = await prisma.agreement.findUnique({ where: { hotelId } });
  if (!agreement?.content) throw bad('Prepare the agreement first.', 409);
  if (agreement.status === 'SIGNED') throw bad('Already signed.', 409);
  if (String(note || '').trim().length < 5) throw bad('Say how it was signed, e.g. "Signed paper copy received 12 Dec, filed".');
  const now = new Date();
  const expiryAt = new Date(now); expiryAt.setMonth(expiryAt.getMonth() + (agreement.termMonths || 12));
  const hotel = await prisma.hotel.findUnique({ where: { id: hotelId }, select: { status: true } });
  await prisma.$transaction([
    prisma.agreement.update({ where: { hotelId }, data: { status: 'SIGNED', signedAt: now, expiryAt, signatureMethod: 'OFFLINE', signerName: String(note).trim().slice(0, 120), signerEmail: user.email || null } }),
    ...(hotel?.status === 'PENDING_AGREEMENT' ? [prisma.hotel.update({ where: { id: hotelId }, data: { status: 'READY_FOR_GO_LIVE' } })] : []),
    prisma.auditLog.create({ data: { action: 'STATUS_AGREEMENT_SIGNED', entityType: 'HOTEL', entityId: hotelId, userId: user.id, details: { method: 'OFFLINE', note } } }),
  ]);
};

export const agreementPdf = async (hotelId, { forEsign = false, auditTrail = false } = {}) => {
  const [agreement, hotel, brand, tpl] = await Promise.all([prisma.agreement.findUnique({ where: { hotelId } }), prisma.hotel.findUnique({ where: { id: hotelId }, select: { name: true } }), brandContext(), getTemplate()]);
  if (!agreement?.content) return null;
  // Signed with Aadhaar through Leegality: their signed PDF (and audit trail) is the record
  if (!forEsign && agreement.signatureMethod === 'AADHAAR_ESIGN') {
    const files = await storedFiles(agreement.id);
    const f = files.find((x) => x.kind === (auditTrail ? 'AUDIT_TRAIL' : 'SIGNED_PDF'));
    if (f) return Buffer.from(f.content);
  }
  if (auditTrail) return null;
  const signedBlock = !forEsign && (agreement.status === 'SIGNED' || agreement.status === 'ACTIVE');
  const cert = signedBlock ? `<div class="cert"><h2>Signature certificate</h2><table>
    <tr><td>Agreement</td><td>${esc(agreement.reference)}</td></tr>
    <tr><td>Signed by</td><td>${esc(agreement.signerName || '')}${agreement.signatureMethod === 'EMAIL_OTP' ? ` &lt;${esc(agreement.signerEmail || '')}&gt;` : ''}</td></tr>
    <tr><td>Method</td><td>${agreement.signatureMethod === 'EMAIL_OTP' ? 'Electronic: typed name, consent and one-time code sent to the signer\'s email' : 'Signed outside ZivoPlus; recorded by ZivoPlus staff'}</td></tr>
    <tr><td>Signed on</td><td>${esc(dateTime(agreement.signedAt))} (India time)</td></tr>
    ${agreement.ipAddress ? `<tr><td>IP address</td><td>${esc(agreement.ipAddress)}</td></tr>` : ''}
    ${agreement.signerUserAgent ? `<tr><td>Device</td><td class="mono">${esc(agreement.signerUserAgent)}</td></tr>` : ''}
    <tr><td>Document fingerprint</td><td class="mono">SHA-256 ${esc(agreement.contentHash)}</td></tr>
    <tr><td>Valid until</td><td>${esc(day(agreement.expiryAt))}, then until ended with notice</td></tr></table></div>` : '';
  const body = `<div class="page">${header({ brandSub: brand.company.legalName, title: tpl.title, sub: hotel?.name || '', ref: agreement.reference, status: signedBlock ? { label: 'Signed', tone: '' } : forEsign ? null : { label: 'Awaiting signature', tone: 'warn' } })}
${meta([['Prepared', day(agreement.preparedAt || agreement.sentAt)], ['Commission', `${agreement.commissionRate}%`], ['Term', `${agreement.termMonths || 12} months`], ['Template', `v${agreement.templateVersion || 1}`]])}
${agreement.content}
<div class="sigs"><div>For ${esc(brand.company.legalName)}<br><span style="color:#64748b">Accepted electronically by ZivoPlus</span></div><div>For the Partner<br>${signedBlock ? `<b>${esc(agreement.signerName || '')}</b>, ${esc(day(agreement.signedAt))}` : forEsign ? '<span style="color:#64748b">Signed with Aadhaar eSign (signature below)</span>' : '<span style="color:#64748b">Awaiting signature</span>'}</div></div>
${cert}</div>`;
  return renderPdf(shell(`${tpl.title} ${agreement.reference}`, body, { extraCss: AGREEMENT_CSS, watermark: signedBlock || forEsign ? null : 'DRAFT' }));
};

export default { agreementData, previewAgreement, prepareAgreement, ownerView, requestSigningCode, signAgreement, markSignedOffline, agreementPdf, renderBody, startAadhaarSigning, refreshFromLeegality, afterAadhaarSign };
