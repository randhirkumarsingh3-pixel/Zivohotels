/**
 * ZivoPlus for Business and ZivoPlus Partner Hub, for their members (mounted at /api/v1/business).
 *
 *  GET    /info                               which portals take applications (public)
 *  GET    /mine                               my organisations and my role in each
 *  POST   /apply                              { kind: CORPORATE|AGENCY, name, legalName, ... }
 *  GET    /:orgId                             details, terms, what I can do, account summary
 *  PUT    /:orgId                             edit details (all until approved; contacts after)
 *  POST   /:orgId/documents                   { type, fileName, file: data URL }  KYC upload
 *  GET    /:orgId/documents/:docId/file       DELETE /:orgId/documents/:docId
 *  GET    /:orgId/members                     POST { email, name, role }  invite
 *  PATCH  /:orgId/members/:memberId           { role?, status? }   DELETE removes
 *  GET    /:orgId/account?page=               balance, credit, overdue, entries
 *  POST   /:orgId/topup                       { amount } Razorpay order
 *  POST   /:orgId/topup/confirm               { razorpay_order_id, razorpay_payment_id, razorpay_signature }
 */
import express from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { protect } from '../middleware/authMiddleware.js';
import svc from '../services/business/organisationService.js';

const router = express.Router();
const wrap = (fn) => asyncHandler(async (req, res) => {
  try { await fn(req, res); } catch (e) {
    if (e.statusCode && e.statusCode < 500) return res.status(e.statusCode).json({ success: false, message: e.message });
    throw e;
  }
});
const ok = (res, data, code = 200) => res.status(code).json({ success: true, data });

router.get('/info', wrap(async (req, res) => ok(res, await svc.publicInfo())));

router.use(protect);
router.get('/mine', wrap(async (req, res) => ok(res, await svc.myOrganisations(req.user))));
router.post('/apply', wrap(async (req, res) => ok(res, await svc.apply(req.user, req.body || {}), 201)));
router.get('/:orgId', wrap(async (req, res) => ok(res, await svc.viewOrganisation(req.params.orgId, req.user))));
router.put('/:orgId', wrap(async (req, res) => ok(res, await svc.updateOrganisation(req.params.orgId, req.user, req.body || {}))));

router.post('/:orgId/documents', wrap(async (req, res) => ok(res, await svc.addDocument(req.params.orgId, req.user, req.body || {}), 201)));
router.delete('/:orgId/documents/:docId', wrap(async (req, res) => { await svc.removeDocument(req.params.orgId, req.user, req.params.docId); ok(res, { removed: true }); }));
router.get('/:orgId/documents/:docId/file', wrap(async (req, res) => {
  const f = await svc.readDocument(req.params.orgId, req.params.docId, { user: req.user });
  res.locals.skipFormat = true;
  res.set({ 'Content-Type': f.mimeType, 'Content-Disposition': `inline; filename="${f.name.replace(/[^\w.-]/g, '_')}"`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' }).send(f.content);
}));

router.get('/:orgId/members', wrap(async (req, res) => ok(res, await svc.listMembers(req.params.orgId, req.user))));
router.post('/:orgId/members', wrap(async (req, res) => ok(res, await svc.inviteMember(req.params.orgId, req.user, req.body || {}), 201)));
router.patch('/:orgId/members/:memberId', wrap(async (req, res) => ok(res, await svc.updateMember(req.params.orgId, req.user, req.params.memberId, req.body || {}))));
router.delete('/:orgId/members/:memberId', wrap(async (req, res) => { await svc.removeMember(req.params.orgId, req.user, req.params.memberId); ok(res, { removed: true }); }));

router.get('/:orgId/account', wrap(async (req, res) => ok(res, await svc.viewAccount(req.params.orgId, req.user, req.query))));
router.post('/:orgId/topup', wrap(async (req, res) => ok(res, await svc.startTopup(req.params.orgId, req.user, req.body || {}))));
router.post('/:orgId/topup/confirm', wrap(async (req, res) => ok(res, await svc.confirmTopup(req.params.orgId, req.user, req.body || {}))));

export default router;
