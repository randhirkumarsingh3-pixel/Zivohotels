/**
 * Admin → Organisations (/api/v1/admin/organisations; business.view to read, business.manage to
 * decide and set terms, finance.manage to record payments) and Admin → Business settings
 * (/api/v1/admin/business-settings; settings.manage to change).
 *
 *  GET  /?kind=&status=&search=&page=     list with account summaries and counts
 *  GET  /:id                              details, members, account, history
 *  POST /:id/decision                     { status: ACTIVE|ON_HOLD|REJECTED|SUSPENDED, note }
 *  PUT  /:id/terms                        { paymentMode, creditLimit, creditDays, invoiceMode, pricingModel, defaultMarkupPct, extraCommissionPct, tier }
 *  POST /:id/ledger                       { type: PAYMENT|REFUND|ADJUSTMENT, amount, note, reference }
 *  GET  /:id/documents/:docId/file
 */
import express from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import svc from '../services/business/organisationService.js';
import { getBusinessSettings, saveBusinessSettings } from '../services/business/businessSettings.js';

const wrap = (fn) => asyncHandler(async (req, res) => {
  try { await fn(req, res); } catch (e) {
    if (e.statusCode && e.statusCode < 500) return res.status(e.statusCode).json({ success: false, message: e.message });
    throw e;
  }
});
const ok = (res, data) => res.json({ success: true, data });
const staffOnly = (req, res, next) => (req.user?.role === 'ADMIN' ? next() : res.status(403).json({ success: false, message: 'ZivoPlus staff only.' }));

const router = express.Router();
router.use(staffOnly);
router.get('/', wrap(async (req, res) => ok(res, await svc.adminList(req.query))));
router.get('/:id', wrap(async (req, res) => ok(res, await svc.adminDetail(req.params.id))));
router.post('/:id/decision', wrap(async (req, res) => ok(res, await svc.decide(req.params.id, req.user, req.body || {}))));
router.put('/:id/terms', wrap(async (req, res) => ok(res, await svc.setTerms(req.params.id, req.user, req.body || {}))));
router.post('/:id/ledger', wrap(async (req, res) => ok(res, await svc.adminEntry(req.params.id, req.user, req.body || {}))));
router.get('/:id/documents/:docId/file', wrap(async (req, res) => {
  const f = await svc.readDocument(req.params.id, req.params.docId, { staff: true });
  res.locals.skipFormat = true;
  res.set({ 'Content-Type': f.mimeType, 'Content-Disposition': `inline; filename="${f.name.replace(/[^\w.-]/g, '_')}"`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' }).send(f.content);
}));

export const settingsRouter = express.Router();
settingsRouter.use(staffOnly);
settingsRouter.get('/', wrap(async (req, res) => ok(res, await getBusinessSettings())));
settingsRouter.put('/', wrap(async (req, res) => ok(res, await saveBusinessSettings(req.body || {}, req.user))));

export default router;
