/**
 * Aadhaar eSign of listing agreements through Leegality (v3 API, X-Auth-Token).
 *
 * Settings: LEEGALITY_BASE_URL (https://sandbox.leegality.com or https://app1.leegality.com),
 * LEEGALITY_AUTH_TOKEN, LEEGALITY_PRIVATE_SALT in the server's .env; the signing method and the
 * Leegality workflow ID (profileId) in Admin → Agreement template → How owners sign.
 *
 *  1. The owner opens the agreement and chooses "Sign with Aadhaar": the exact agreement PDF is
 *     sent to Leegality (POST /api/v3.0/sign/request) with the owner as signer, and the owner is
 *     taken to Leegality's signing page (Aadhaar OTP).
 *  2. Leegality calls our webhook (POST /api/v1/webhooks/leegality) on each signing step; the
 *     `mac` field (HMAC-SHA1 of documentId with the Private Salt) proves it came from Leegality.
 *  3. When the document is completed we fetch the signed PDF and the audit trail
 *     (GET /api/v3.3/document/details?file=true&auditTrail=true; links last 15 s) and keep them.
 * If a webhook is missed, syncStatus() asks Leegality directly (owner page, admin "Check status").
 */
import crypto from 'crypto';
import axios from 'axios';
import prisma from '../../config/db.js';

const KEY = 'agreement_signing';
export const METHODS = ['EMAIL_OTP', 'LEEGALITY_AADHAAR'];
const bad = (m, code = 400) => Object.assign(new Error(m), { statusCode: code });

export const leegalityConfigured = () => Boolean(process.env.LEEGALITY_BASE_URL && process.env.LEEGALITY_AUTH_TOKEN && process.env.LEEGALITY_PRIVATE_SALT);
const baseUrl = () => String(process.env.LEEGALITY_BASE_URL || '').replace(/\/+$/, '').replace(/\/api$/, '');
export const isSandbox = () => /sandbox/i.test(baseUrl());

const client = () => axios.create({
  baseURL: `${baseUrl()}/api`, timeout: 30000, validateStatus: () => true, maxBodyLength: 25 * 1024 * 1024,
  headers: { 'X-Auth-Token': process.env.LEEGALITY_AUTH_TOKEN, 'Content-Type': 'application/json' },
});

// ─── Settings (Admin → Agreement template → How owners sign) ─────────────────
export const getSigningSettings = async () => {
  const row = await prisma.systemConfig.findUnique({ where: { key: KEY } });
  const v = row?.value || {};
  const method = METHODS.includes(v.method) ? v.method : 'EMAIL_OTP';
  return {
    method, leegalityProfileId: v.leegalityProfileId || '', allowEmailFallback: v.allowEmailFallback !== false,
    leegality: { configured: leegalityConfigured(), sandbox: isSandbox(), webhookPath: '/api/v1/webhooks/leegality' },
    // What the owner is offered right now
    active: method === 'LEEGALITY_AADHAAR' && leegalityConfigured() && v.leegalityProfileId ? 'LEEGALITY_AADHAAR' : 'EMAIL_OTP',
  };
};

export const saveSigningSettings = async (input, user) => {
  const method = input?.method;
  if (!METHODS.includes(method)) throw bad('Choose how owners sign.');
  const profileId = String(input?.leegalityProfileId || '').trim();
  if (method === 'LEEGALITY_AADHAAR') {
    if (!leegalityConfigured()) throw bad('Leegality isn\'t set up on the server yet (LEEGALITY_BASE_URL, LEEGALITY_AUTH_TOKEN, LEEGALITY_PRIVATE_SALT in .env).');
    if (!/^[A-Za-z0-9_-]{3,64}$/.test(profileId)) throw bad('Enter the Leegality workflow ID (letters and numbers, from Leegality → Workflows).');
  }
  const value = { method, leegalityProfileId: profileId, allowEmailFallback: input?.allowEmailFallback !== false, updatedAt: new Date().toISOString(), updatedBy: user?.email || user?.id || null };
  await prisma.systemConfig.upsert({ where: { key: KEY }, update: { value }, create: { key: KEY, value, description: 'How owners sign the listing agreement' } });
  return getSigningSettings();
};

// ─── Webhook check ───────────────────────────────────────────────────────────
export const expectedMac = (documentId) => crypto.createHmac('sha1', String(process.env.LEEGALITY_PRIVATE_SALT || '')).update(String(documentId || '')).digest('hex');
export const macValid = (documentId, mac) => {
  if (!leegalityConfigured() || !documentId || typeof mac !== 'string') return false;
  const a = Buffer.from(expectedMac(documentId), 'utf8');
  const b = Buffer.from(mac.toLowerCase(), 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

// ─── Sending the agreement ───────────────────────────────────────────────────
const cleanName = (s) => String(s || '').replace(/[^A-Za-z0-9 +|\-:(),_.[\]&/@]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);
const tenDigits = (p) => { const d = String(p || '').replace(/\D/g, ''); return d.length >= 10 ? d.slice(-10) : null; };

/**
 * Sends the agreement PDF to Leegality for the owner's Aadhaar eSign; returns the signing link.
 * Reuses the request already made for the same agreement text.
 */
/**
 * Sends a PDF to Leegality for one signer (the active workflow); returns { documentId, signUrl }.
 * Used for property agreements and business-account agreements.
 */
export const createSignRequest = async ({ name, pdf, signer, irn }) => {
  const settings = await getSigningSettings();
  if (settings.active !== 'LEEGALITY_AADHAAR') throw bad('Aadhaar eSign isn\'t switched on.', 409);
  const body = {
    profileId: settings.leegalityProfileId,
    file: { name: cleanName(name), file: Buffer.from(pdf).toString('base64') },
    invitees: [{ name: cleanName(signer.name || 'Signer'), email: signer.email, ...(tenDigits(signer.phone) ? { phone: tenDigits(signer.phone) } : {}) }],
    irn: cleanName(irn),
  };
  const r = await client().post('/v3.0/sign/request', body);
  const ok = r.status === 200 && Number(r.data?.status) === 1 && r.data?.data?.documentId;
  if (!ok) {
    const why = (r.data?.messages || []).map((m) => m.message).filter(Boolean).join(' ') || `Leegality answered ${r.status}`;
    throw bad(`Couldn't start Aadhaar eSign: ${why}`, 502);
  }
  const d = r.data.data;
  const invitee = (d.invitees || []).find((i) => (i.email || '').toLowerCase() === String(signer.email).toLowerCase()) || d.invitees?.[0];
  return { documentId: d.documentId, signUrl: invitee?.signUrl || null };
};

export const startSigning = async ({ agreement, hotel, owner, pdf }) => {
  await getSigningSettings();
  if (agreement.leegalityDocumentId && agreement.leegalityContentHash === agreement.contentHash && agreement.leegalitySignUrl && agreement.leegalityStatus === 'SENT') {
    return { signUrl: agreement.leegalitySignUrl, documentId: agreement.leegalityDocumentId, reused: true };
  }
  const d = await createSignRequest({ name: `${agreement.reference} ${hotel.name} Listing Agreement`, pdf, signer: { name: owner.name || hotel.legalName || 'Property owner', email: owner.email, phone: owner.phone }, irn: agreement.reference });
  const invitee = { signUrl: d.signUrl };
  await prisma.agreement.update({ where: { id: agreement.id }, data: { leegalityDocumentId: d.documentId, leegalitySignUrl: invitee?.signUrl || null, leegalityStatus: 'SENT', leegalityRequestedAt: new Date(), leegalityContentHash: agreement.contentHash } });
  await prisma.auditLog.create({ data: { action: 'AGREEMENT_ESIGN_REQUESTED', entityType: 'HOTEL', entityId: hotel.id, userId: owner.id, details: { reference: agreement.reference, provider: 'LEEGALITY', documentId: d.documentId, sandbox: isSandbox() } } }).catch(() => {});
  return { signUrl: invitee?.signUrl || null, documentId: d.documentId, reused: false };
};

// ─── Fetching the result ─────────────────────────────────────────────────────
const parseDate = (s) => {
  const m = String(s || '').match(/^(\d{2})-(\d{2})-(\d{4}) (\d{2}):(\d{2}):(\d{2})$/);
  return m ? new Date(`${m[3]}-${m[2]}-${m[1]}T${m[4]}:${m[5]}:${m[6]}+05:30`) : null;
};
const download = async (url) => {
  const r = await axios.get(url, { responseType: 'arraybuffer', timeout: 20000, validateStatus: () => true });
  if (r.status !== 200) throw new Error(`download failed (${r.status})`);
  return Buffer.from(r.data);
};

/** The document's state at Leegality, and (once completed) its signed PDF and audit trail. */
export const fetchDetails = async (documentId, { files = false } = {}) => {
  const q = new URLSearchParams({ documentId, ...(files ? { file: 'true', auditTrail: 'true' } : {}), invitations_certificateData: 'true' });
  const r = await client().get(`/v3.3/document/details?${q}`);
  if (r.status !== 200 || Number(r.data?.status) !== 1) throw bad(`Leegality couldn't return the document (${(r.data?.messages || []).map((m) => m.message).join(' ') || r.status}).`, 502);
  return r.data.data || {};
};

export const saveFile = (agreementId, kind, fileName, content) => prisma.agreementFile.upsert({
  where: { agreementId_kind: { agreementId, kind } },
  update: { fileName, content, sha256: crypto.createHash('sha256').update(content).digest('hex'), createdAt: new Date() },
  create: { agreementId, kind, fileName, content, sha256: crypto.createHash('sha256').update(content).digest('hex') },
});

/**
 * What Leegality says about a document for this signer: { done, failed (REJECTED | EXPIRED |
 * FAILED | null), signedPdf, auditTrail (Buffers once done), cert, signedAt, email, signType }.
 */
export const readResult = async (documentId, signerEmail) => {
  const details = await fetchDetails(documentId, { files: true });
  const status = String(details.document?.status || '').toUpperCase();
  const inv = (details.invitations || []).find((i) => (i.email || '').toLowerCase() === String(signerEmail || '').toLowerCase()) || (details.invitations || [])[0] || {};
  const st = inv.invitationStatus || {};
  if (status === 'COMPLETED' || st.signed) {
    return {
      done: true, failed: null,
      signedPdf: details.file ? await download(details.file) : null, auditTrail: details.auditTrail ? await download(details.auditTrail) : null,
      cert: inv.certificateData || {}, signedAt: parseDate(st.signDate) || new Date(), email: inv.email || null, name: inv.name || null, signType: inv.usedSignatureType || 'Aadhaar eSign',
    };
  }
  return { done: false, failed: st.rejected ? 'REJECTED' : st.expired ? 'EXPIRED' : st.failureReason ? 'FAILED' : null };
};

/** The signer certificate we keep (never the full Aadhaar number). */
export const certificateOf = (res, documentId) => ({
  name: res.cert.name || null, yob: res.cert.yob || null, gender: res.cert.gender || null, state: res.cert.state || null, pincode: res.cert.pincode || null,
  aadhaarLast4: res.cert.title || null, serialNumber: res.cert.serialNumber || null, signType: res.signType, provider: 'Leegality', documentId, sandbox: isSandbox(),
});

/**
 * Brings our agreement in line with Leegality: on completion, stores the signed PDF and audit
 * trail and marks it signed (property → ready for go-live, copies emailed); on rejection or
 * expiry, records it so ZivoPlus can send it again. Safe to call repeatedly.
 */
export const syncStatus = async (agreement, { onSigned } = {}) => {
  if (!agreement?.leegalityDocumentId || !leegalityConfigured()) return agreement;
  if (['SIGNED', 'ACTIVE'].includes(agreement.status)) return agreement;
  const res = await readResult(agreement.leegalityDocumentId, agreement.signerEmail);
  if (res.done) {
    if (res.signedPdf) await saveFile(agreement.id, 'SIGNED_PDF', `${agreement.reference}-signed.pdf`, res.signedPdf);
    if (res.auditTrail) await saveFile(agreement.id, 'AUDIT_TRAIL', `${agreement.reference}-audit-trail.pdf`, res.auditTrail);
    const expiryAt = new Date(res.signedAt); expiryAt.setMonth(expiryAt.getMonth() + (agreement.termMonths || 12));
    const updated = await prisma.$transaction(async (tx) => {
      const a = await tx.agreement.update({ where: { id: agreement.id }, data: {
        status: 'SIGNED', signedAt: res.signedAt, expiryAt, leegalityStatus: 'COMPLETED', signatureMethod: 'AADHAAR_ESIGN',
        signerName: (res.cert.name || res.name || agreement.signerName || '').slice(0, 120), signerEmail: res.email || agreement.signerEmail,
        signerCertificate: certificateOf(res, agreement.leegalityDocumentId),
      } });
      const hotel = await tx.hotel.findUnique({ where: { id: a.hotelId }, select: { status: true } });
      if (hotel?.status === 'PENDING_AGREEMENT') await tx.hotel.update({ where: { id: a.hotelId }, data: { status: 'READY_FOR_GO_LIVE' } });
      await tx.auditLog.create({ data: { action: 'STATUS_AGREEMENT_SIGNED', entityType: 'HOTEL', entityId: a.hotelId, userId: a.ownerId, details: { reference: a.reference, method: 'AADHAAR_ESIGN', provider: 'LEEGALITY', documentId: a.leegalityDocumentId, signerName: a.signerName } } });
      return a;
    });
    if (onSigned) await onSigned(updated).catch((e) => console.error('[Leegality] after-sign step failed:', e.message));
    return updated;
  }
  if (res.failed && agreement.leegalityStatus !== res.failed) {
    return prisma.agreement.update({ where: { id: agreement.id }, data: { leegalityStatus: res.failed } });
  }
  return agreement;
};

/** Stored Leegality files for an agreement (signed PDF, audit trail). */
export const storedFiles = (agreementId) => prisma.agreementFile.findMany({ where: { agreementId }, select: { kind: true, fileName: true, content: true, sha256: true } });

export default { METHODS, leegalityConfigured, getSigningSettings, saveSigningSettings, macValid, expectedMac, startSigning, createSignRequest, readResult, certificateOf, saveFile, fetchDetails, syncStatus, storedFiles, isSandbox };
