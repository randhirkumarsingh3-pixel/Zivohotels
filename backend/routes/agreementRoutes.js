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
import { previewAgreement, prepareAgreement, markSignedOffline, agreementPdf } from '../services/agreements/agreementService.js';
import { FIELDS, DEFAULT_TEMPLATE, getTemplate, saveTemplate } from '../services/agreements/agreementTemplate.js';

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
router.delete('/:id', cancelAgreement);

export const templateRouter = express.Router();
templateRouter.use(staffOnly);
templateRouter.get('/', wrap(async (req, res) => res.json({ success: true, data: { template: await getTemplate(), fields: FIELDS, defaultTemplate: DEFAULT_TEMPLATE } })));
templateRouter.put('/', wrap(async (req, res) => res.json({ success: true, data: { template: await saveTemplate(req.body || {}, req.user), fields: FIELDS } })));

export default router;
