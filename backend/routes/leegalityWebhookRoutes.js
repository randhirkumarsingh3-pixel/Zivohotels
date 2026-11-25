/**
 * Leegality webhook (mounted at /api/v1/webhooks/leegality, no sign-in): Leegality calls it when
 * the owner signs, rejects, or the signing link expires. The `mac` field must equal
 * HMAC-SHA1(documentId, LEEGALITY_PRIVATE_SALT); anything else is refused. We don't trust the
 * payload's content beyond the document id: the state is read back from Leegality's API.
 * Set this address as both "Webhook URL" and "Error Webhook URL" on the signer in the Leegality
 * workflow, with Webhook Version v2.5.
 */
import express from 'express';
import prisma from '../config/db.js';
import { macValid, leegalityConfigured } from '../services/agreements/leegality.js';
import { refreshFromLeegality } from '../services/agreements/agreementService.js';

const router = express.Router();

router.post('/', express.json({ limit: '1mb' }), async (req, res) => {
  const { documentId, mac, webhookType, documentStatus } = req.body || {};
  if (!leegalityConfigured()) return res.status(503).json({ success: false, message: 'Leegality is not set up.' });
  if (!macValid(documentId, mac)) {
    await prisma.securityLog.create({ data: { type: 'WEBHOOK_REJECTED', ip: req.ip || 'unknown', userAgent: req.headers['user-agent'], details: { provider: 'LEEGALITY', reason: 'mac mismatch', documentId: String(documentId || '').slice(0, 64) } } }).catch(() => {});
    return res.status(401).json({ success: false, message: 'Signature check failed.' });
  }
  const agreement = await prisma.agreement.findUnique({ where: { leegalityDocumentId: String(documentId) }, select: { id: true, hotelId: true } });
  // Unknown or replaced document (e.g. the agreement was prepared again): acknowledge, do nothing
  if (!agreement) return res.status(200).json({ success: true, ignored: true });
  await prisma.auditLog.create({ data: { action: 'AGREEMENT_ESIGN_WEBHOOK', entityType: 'HOTEL', entityId: agreement.hotelId, userId: 'LEEGALITY', details: { documentId, webhookType: webhookType || null, documentStatus: documentStatus || null, action: req.body?.request?.action || null } } }).catch(() => {});
  try {
    const a = await refreshFromLeegality({ id: agreement.id });
    return res.status(200).json({ success: true, status: a?.status, leegalityStatus: a?.leegalityStatus });
  } catch (e) {
    console.error('[Leegality webhook]', e.message);
    // A 5xx makes Leegality retry later
    return res.status(502).json({ success: false, message: 'Could not read the document from Leegality yet.' });
  }
});

export default router;
