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
 *  PUT    /:orgId/branding                    { name, phone, email, website } on the agency's vouchers
 *  GET    /:orgId/rates?hotelIds=a,b          hotels offering this account a business rate
 *  POST   /:orgId/quote                       { hotelId, checkIn, checkOut, roomLines, model?, markupPct? }
 *  GET    /:orgId/bookings?status=&search=    POST same as quote + { guestName, guestPhone, customerEmail?, clientReference?, hold? }
 *  GET    /:orgId/bookings/:id                POST /:id/pay (held → paid from account)   POST /:id/cancel
 *  GET    /:orgId/bookings/:id/voucher?price=SELL|NONE   the agency-branded voucher (PDF)
 *  GET    /:orgId/commission?from=&to=        commission statement with TDS
 */
import express from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { protect } from '../middleware/authMiddleware.js';
import svc, { setBranding, brandingFor, membershipFor } from '../services/business/organisationService.js';
import booking from '../services/business/businessBookingService.js';
import { agencyVoucherPdf } from '../services/voucherService.js';

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

router.put('/:orgId/branding', wrap(async (req, res) => ok(res, await setBranding(req.params.orgId, req.user, req.body || {}))));
router.get('/:orgId/rates', wrap(async (req, res) => ok(res, await booking.ratesFor(req.params.orgId, req.user, req.query.hotelIds))));
router.post('/:orgId/quote', wrap(async (req, res) => ok(res, await booking.quote(req.params.orgId, req.user, req.body || {}))));
router.get('/:orgId/bookings', wrap(async (req, res) => ok(res, await booking.listBookings(req.params.orgId, req.user, req.query))));
router.post('/:orgId/bookings', wrap(async (req, res) => ok(res, await booking.book(req.params.orgId, req.user, req.body || {}, { requestId: req.id }), 201)));
router.get('/:orgId/bookings/:id', wrap(async (req, res) => ok(res, await booking.getBooking(req.params.orgId, req.user, req.params.id))));
router.post('/:orgId/bookings/:id/pay', wrap(async (req, res) => ok(res, await booking.payHeld(req.params.orgId, req.user, req.params.id))));
router.post('/:orgId/bookings/:id/cancel', wrap(async (req, res) => ok(res, await booking.cancelBooking(req.params.orgId, req.user, req.params.id, { requestId: req.id }))));
router.get('/:orgId/bookings/:id/voucher', wrap(async (req, res) => {
  const b = await booking.getBooking(req.params.orgId, req.user, req.params.id);
  const { org } = await membershipFor(req.params.orgId, req.user);
  const pdf = await agencyVoucherPdf(b.id, { agency: brandingFor(org), price: req.query.price === 'SELL' ? 'SELL' : 'NONE' });
  res.locals.skipFormat = true;
  res.type('application/pdf').set({ 'Content-Disposition': `inline; filename="Voucher-${b.business?.clientReference || b.bookingRef}.pdf"`, 'Cache-Control': 'private, no-store' }).send(Buffer.from(pdf));
}));
router.get('/:orgId/commission', wrap(async (req, res) => ok(res, await booking.commissionStatement(req.params.orgId, req.user, req.query))));

export default router;
