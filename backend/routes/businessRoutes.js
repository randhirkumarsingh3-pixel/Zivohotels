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
 *  GET    /:orgId/policy   PUT { enabled, approval, requireReason, metroCities, grades, defaultGrade }  (companies)
 *  GET    /:orgId/approvals                   trips waiting for my approval
 *  POST   /:orgId/approvals/:id               { decision: APPROVE|REJECT, note }
 *  GET    /:orgId/reports/spend?from=&to=     spend, savings, policy compliance; /reports/spend.csv with GST details
 *  POST   /:orgId/members/import              { csv, commit } preview or import people (companies' HR lists)
 *  PUT    /:orgId/members/:memberId/delegate  { delegateMemberId, delegateUntil } a stand-in approver while away
 *  GET    /:orgId/travellers?days=&city=      where travellers are: staying now, arriving, checked out (also .csv)
 *  GET    /:orgId/groups                      group requests (9 to 60 rooms): POST to ask, /hotels?q= to choose,
 *         /:id/price, /:id/accept { leadName, leadPhone, hold }, /:id/cancel
 *  GET    /:orgId/bookings/:id/rooming-list   who is in each room; PUT { rooms: [{ roomNumber, guestName }] }
 *  GET    /:orgId/agreed-rates                rates agreed with hotels for the company, in place or coming up
 *  GET    /:orgId/trips?status=               POST { city, checkIn, checkOut, rooms, adults, purpose, notes, travellerMemberId? }
 *  POST   /:orgId/trips/:id/decline { note }  POST /:orgId/trips/:id/cancel
 *  GET    /:orgId/sso                         company sign-in settings (admins): PUT config, POST /domains { domain },
 *         POST /domains/:id/verify (DNS TXT), DELETE /domains/:id, POST /test → { url }
 *  GET    /:orgId/agreement                   the agreement with ZivoPlus; POST /code, /sign { name, code, consent, contentHash },
 *                                             /aadhaar { consent, contentHash }; GET /pdf, /audit-trail
 */
import express from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { protect } from '../middleware/authMiddleware.js';
import svc, { setBranding, brandingFor, membershipFor, setLogo, removeLogo, setDelegate, importMembers } from '../services/business/organisationService.js';
import trips from '../services/business/tripRequests.js';
import dutyOfCare from '../services/business/dutyOfCare.js';
import groups from '../services/business/groupBookings.js';
import corporateRates from '../services/business/corporateRates.js';
import booking from '../services/business/businessBookingService.js';
import { agencyVoucherPdf } from '../services/voucherService.js';
import { policyOf, savePolicy } from '../services/business/travelPolicy.js';
import orgAgreement from '../services/business/orgAgreementService.js';
import sso from '../services/business/companySso.js';

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

router.get('/:orgId/sso', wrap(async (req, res) => ok(res, await sso.getSso(req.params.orgId, req.user))));
router.put('/:orgId/sso', wrap(async (req, res) => ok(res, await sso.saveSso(req.params.orgId, req.user, req.body || {}))));
router.post('/:orgId/sso/domains', wrap(async (req, res) => ok(res, await sso.addDomain(req.params.orgId, req.user, req.body || {}), 201)));
router.post('/:orgId/sso/domains/:domainId/verify', wrap(async (req, res) => ok(res, await sso.verifyDomain(req.params.orgId, req.user, req.params.domainId))));
router.delete('/:orgId/sso/domains/:domainId', wrap(async (req, res) => ok(res, await sso.removeDomain(req.params.orgId, req.user, req.params.domainId))));
router.post('/:orgId/sso/test', wrap(async (req, res) => ok(res, await sso.startTest(req.params.orgId, req.user))));
router.get('/:orgId/members', wrap(async (req, res) => ok(res, await svc.listMembers(req.params.orgId, req.user))));
router.post('/:orgId/members', wrap(async (req, res) => ok(res, await svc.inviteMember(req.params.orgId, req.user, req.body || {}), 201)));
router.post('/:orgId/members/import', wrap(async (req, res) => {
  try { ok(res, await importMembers(req.params.orgId, req.user, req.body || {})); } catch (e) {
    if (e.rows) return res.status(e.statusCode || 400).json({ success: false, message: e.message, rows: e.rows });
    throw e;
  }
}));
router.put('/:orgId/members/:memberId/delegate', wrap(async (req, res) => ok(res, await setDelegate(req.params.orgId, req.user, req.params.memberId, req.body || {}))));
router.patch('/:orgId/members/:memberId', wrap(async (req, res) => ok(res, await svc.updateMember(req.params.orgId, req.user, req.params.memberId, req.body || {}))));
router.delete('/:orgId/members/:memberId', wrap(async (req, res) => { await svc.removeMember(req.params.orgId, req.user, req.params.memberId); ok(res, { removed: true }); }));

router.get('/:orgId/account', wrap(async (req, res) => ok(res, await svc.viewAccount(req.params.orgId, req.user, req.query))));
router.post('/:orgId/topup', wrap(async (req, res) => ok(res, await svc.startTopup(req.params.orgId, req.user, req.body || {}))));
router.post('/:orgId/topup/confirm', wrap(async (req, res) => ok(res, await svc.confirmTopup(req.params.orgId, req.user, req.body || {}))));

router.put('/:orgId/branding', wrap(async (req, res) => ok(res, await setBranding(req.params.orgId, req.user, req.body || {}))));
router.post('/:orgId/branding/logo', wrap(async (req, res) => ok(res, await setLogo(req.params.orgId, req.user, req.body || {}))));
router.delete('/:orgId/branding/logo', wrap(async (req, res) => ok(res, await removeLogo(req.params.orgId, req.user))));
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

router.get('/:orgId/policy', wrap(async (req, res) => ok(res, policyOf((await membershipFor(req.params.orgId, req.user)).org))));
router.put('/:orgId/policy', wrap(async (req, res) => ok(res, await savePolicy(req.params.orgId, req.user, req.body || {}))));
router.get('/:orgId/approvals', wrap(async (req, res) => ok(res, await booking.listApprovals(req.params.orgId, req.user))));
router.post('/:orgId/approvals/:id', wrap(async (req, res) => ok(res, await booking.decideApproval(req.params.orgId, req.user, req.params.id, req.body || {}, { requestId: req.id }))));
router.get('/:orgId/reports/spend', wrap(async (req, res) => ok(res, await booking.spendReport(req.params.orgId, req.user, req.query))));
router.get('/:orgId/groups', wrap(async (req, res) => ok(res, await groups.listForOrg(req.params.orgId, req.user))));
router.get('/:orgId/groups/hotels', wrap(async (req, res) => ok(res, await groups.hotelChoices(req.params.orgId, req.user, req.query.q))));
router.post('/:orgId/groups', wrap(async (req, res) => ok(res, await groups.submit(req.params.orgId, req.user, req.body || {}), 201)));
router.get('/:orgId/groups/:id/price', wrap(async (req, res) => ok(res, await groups.price(req.params.orgId, req.user, req.params.id))));
router.post('/:orgId/groups/:id/accept', wrap(async (req, res) => ok(res, await groups.accept(req.params.orgId, req.user, req.params.id, req.body || {}, { requestId: req.id }), 201)));
router.post('/:orgId/groups/:id/cancel', wrap(async (req, res) => ok(res, await groups.cancel(req.params.orgId, req.user, req.params.id))));
router.get('/:orgId/bookings/:id/rooming-list', wrap(async (req, res) => ok(res, await booking.roomingList(req.params.orgId, req.user, req.params.id))));
router.put('/:orgId/bookings/:id/rooming-list', wrap(async (req, res) => ok(res, await booking.saveRoomingList(req.params.orgId, req.user, req.params.id, req.body || {}))));
router.get('/:orgId/travellers', wrap(async (req, res) => ok(res, await dutyOfCare.travellers(req.params.orgId, req.user, req.query))));
router.get('/:orgId/travellers.csv', wrap(async (req, res) => {
  const csv = await dutyOfCare.travellersCsv(req.params.orgId, req.user, req.query);
  res.locals.skipFormat = true;
  res.type('text/csv').set({ 'Content-Disposition': 'attachment; filename="zivoplus-travellers.csv"', 'Cache-Control': 'private, no-store' }).send(csv);
}));
router.get('/:orgId/agreed-rates', wrap(async (req, res) => {
  const { org } = await svc.membershipFor(req.params.orgId, req.user);
  ok(res, org.kind === 'CORPORATE' ? await corporateRates.forOrganisation(org.id) : []);
}));
router.get('/:orgId/reports/spend.csv', wrap(async (req, res) => {
  const csv = await booking.spendCsv(req.params.orgId, req.user, req.query);
  res.locals.skipFormat = true;
  res.type('text/csv').set({ 'Content-Disposition': 'attachment; filename="zivoplus-business-stays.csv"', 'Cache-Control': 'private, no-store' }).send(`\uFEFF${csv}`);
}));

const ctx = (req) => ({ ip: req.ip, userAgent: req.headers['user-agent'] });
router.get('/:orgId/trips', wrap(async (req, res) => ok(res, await trips.listTrips(req.params.orgId, req.user, req.query))));
router.post('/:orgId/trips', wrap(async (req, res) => ok(res, await trips.submitTrip(req.params.orgId, req.user, req.body || {}), 201)));
router.post('/:orgId/trips/:id/decline', wrap(async (req, res) => ok(res, await trips.declineTrip(req.params.orgId, req.user, req.params.id, req.body || {}))));
router.post('/:orgId/trips/:id/cancel', wrap(async (req, res) => ok(res, await trips.cancelTrip(req.params.orgId, req.user, req.params.id))));
router.get('/:orgId/incentives', wrap(async (req, res) => { const { incentiveProgress } = await import('../services/business/agentIncentives.js'); ok(res, await incentiveProgress(req.params.orgId, req.user)); }));
router.get('/:orgId/agreement', wrap(async (req, res) => ok(res, await orgAgreement.viewOrgAgreement(req.params.orgId, req.user))));
router.post('/:orgId/agreement/code', wrap(async (req, res) => ok(res, await orgAgreement.requestOrgSigningCode(req.params.orgId, req.user, ctx(req)))));
router.post('/:orgId/agreement/sign', wrap(async (req, res) => { const a = await orgAgreement.signOrgAgreement(req.params.orgId, req.user, req.body || {}, ctx(req)); ok(res, { status: a.status, signedAt: a.signedAt, reference: a.reference }); }));
router.post('/:orgId/agreement/aadhaar', wrap(async (req, res) => ok(res, await orgAgreement.startOrgAadhaar(req.params.orgId, req.user, req.body || {}))));
const sendAgreementPdf = (audit) => wrap(async (req, res) => {
  const { org } = await membershipFor(req.params.orgId, req.user);
  const pdf = await orgAgreement.orgAgreementPdf(org.id, { auditTrail: audit });
  if (!pdf) return res.status(404).json({ success: false, message: audit ? 'No audit trail: it exists for agreements signed with Aadhaar eSign.' : 'No agreement yet.' });
  res.locals.skipFormat = true;
  return res.type('application/pdf').set({ 'Content-Disposition': `inline; filename="ZivoPlus-${org.code}-agreement${audit ? '-audit-trail' : ''}.pdf"`, 'Cache-Control': 'private, no-store' }).send(Buffer.from(pdf));
});
router.get('/:orgId/agreement/pdf', sendAgreementPdf(false));
router.get('/:orgId/agreement/audit-trail', sendAgreementPdf(true));

export default router;
