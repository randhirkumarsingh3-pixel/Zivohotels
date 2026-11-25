/**
 * Admin → Agreements (mounted at /api/v1/admin/agreements; properties.view to read,
 * properties.approve to prepare, send or record signatures) and Admin → Agreement template
 * (/api/v1/admin/agreement-template; settings.view / settings.manage).
 *
 *  GET    /                         every agreement with its status
 *  POST   /:hotelId/preview         { commissionRate?, payoutCycle?, termMonths? } the text it would have, and what's missing
 *  POST   /:hotelId/prepare         same body + { send = true } prepares it from the template and emails the owner
 *  POST   /:hotelId/mark-signed     { note } a paper agreement signed outside ZivoPlus
 *  GET    /:hotelId/pdf             the agreement (with signature certificate once signed)
 *  DELETE /:id                      cancel (a signed one puts the property back to pending)
 */
import express from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { getAgreements, cancelAgreement } from '../controllers/agreementController.js';
import { previewAgreement, prepareAgreement, markSignedOffline, agreementPdf, refreshFromLeegality } from '../services/agreements/agreementService.js';
import { getSigningSettings, saveSigningSettings } from '../services/agreements/leegality.js';
import { getTemplate, saveTemplate, TEMPLATE_KINDS, fieldsFor, defaultFor } from '../services/agreements/agreementTemplate.js';

const fail = (res, e) => {
  if (e.statusCode && e.statusCode < 500) return res.status(e.statusCode).json({ success: false, message: e.message, ...(e.missing ? { missing: e.missing } : {}) });
  throw e;
};
const wrap = (fn) => asyncHandler(async (req, res) => { try { await fn(req, res); } catch (e) { fail(res, e); } });
const staffOnly = (req, res, next) => (req.user?.role === 'ADMIN' ? next() : res.status(403).json({ success: false, message: 'ZivoPlus staff only.' }));

const router = express.Router();
router.use(staffOnly);
router.get('/', getAgreements);
router.post('/:hotelId/preview', wrap(async (req, res) => res.json({ success: true, data: await previewAgreement(req.params.hotelId, req.body || {}) })));
router.post('/:hotelId/prepare', wrap(async (req, res) => res.json({ success: true, data: await prepareAgreement(req.params.hotelId, req.user, req.body || {}) })));
router.post('/:hotelId/mark-signed', wrap(async (req, res) => { await markSignedOffline(req.params.hotelId, req.user, req.body || {}); res.json({ success: true }); }));
router.get('/:hotelId/pdf', wrap(async (req, res) => {
  const pdf = await agreementPdf(req.params.hotelId);
  if (!pdf) return res.status(404).json({ success: false, message: 'No agreement prepared yet.' });
  res.type('application/pdf').set('Content-Disposition', `inline; filename="ZivoPlus-Agreement-${req.params.hotelId.slice(0, 8)}.pdf"`).send(Buffer.from(pdf));
}));
router.get('/:hotelId/audit-trail', wrap(async (req, res) => {
  const pdf = await agreementPdf(req.params.hotelId, { auditTrail: true });
  if (!pdf) return res.status(404).json({ success: false, message: 'No audit trail: it exists for agreements signed with Aadhaar eSign.' });
  res.type('application/pdf').set('Content-Disposition', `inline; filename="ZivoPlus-Agreement-audit-trail-${req.params.hotelId.slice(0, 8)}.pdf"`).send(Buffer.from(pdf));
}));
// Ask Leegality for the latest state of an Aadhaar eSign request (if a webhook was missed)
router.post('/:hotelId/refresh', wrap(async (req, res) => {
  const a = await refreshFromLeegality({ hotelId: req.params.hotelId });
  if (!a?.leegalityDocumentId) return res.status(404).json({ success: false, message: 'This agreement wasn\'t sent for Aadhaar eSign.' });
  res.json({ success: true, data: { status: a.status, leegalityStatus: a.leegalityStatus, signedAt: a.signedAt } });
}));
router.delete('/:id', cancelAgreement);

export const templateRouter = express.Router();
templateRouter.use(staffOnly);
// ?kind=HOTEL (default) | AGENCY (travel agent agreement) | CORPORATE (company agreement)
const kindOf = (req) => (TEMPLATE_KINDS[req.query.kind] ? req.query.kind : 'HOTEL');
const kinds = Object.entries(TEMPLATE_KINDS).map(([k, v]) => ({ kind: k, label: v.label }));
templateRouter.get('/', wrap(async (req, res) => res.json({ success: true, data: { kind: kindOf(req), kinds, template: await getTemplate(kindOf(req)), fields: fieldsFor(kindOf(req)), defaultTemplate: defaultFor(kindOf(req)) } })));
templateRouter.put('/', wrap(async (req, res) => res.json({ success: true, data: { kind: kindOf(req), template: await saveTemplate(req.body || {}, req.user, kindOf(req)), fields: fieldsFor(kindOf(req)) } })));
// How owners sign: emailed code, or Aadhaar eSign through Leegality (with its workflow ID)
templateRouter.get('/signing', wrap(async (req, res) => res.json({ success: true, data: await getSigningSettings() })));
templateRouter.put('/signing', wrap(async (req, res) => res.json({ success: true, data: await saveSigningSettings(req.body || {}, req.user) })));

export default router;
