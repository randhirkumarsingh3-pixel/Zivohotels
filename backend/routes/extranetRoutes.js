import prisma from '../config/db.js';
import express from 'express';
import staffRoutes from './staffRoutes.js';
import { extranetGet as googleExtranetGet, extranetSet as googleExtranetSet } from '../controllers/googleHotelsController.js';
import { protect, authorizeRoles } from '../middleware/authMiddleware.js';
import { permissionGate } from '../middleware/permissionGate.js';
import ownerAgreementRoutes from './ownerAgreementRoutes.js';
import hotelBusinessRateRoutes from './hotelBusinessRateRoutes.js';
import hotelGstInvoiceRoutes from './hotelGstInvoiceRoutes.js';
import { hotelScopeGuard } from '../middleware/hotelScopeGuard.js';

// Modular Controllers
import { getProperty, updateProperty, updateBookingEmails, getPropertyOverview } from '../controllers/extranet/propertyController.js';
import { extranetGetSetup, extranetSaveSetup, extranetAllocations, extranetSetAllocation, extranetTimeline } from '../controllers/hourlyController.js';
import { getRooms } from '../controllers/extranet/roomController.js';
import { getBookings, updateBookingStatus } from '../controllers/extranet/bookingController.js';
import { listHotelRequests, respondHotelRequest } from '../controllers/stayRequestController.js';
import { listHotelReviews, replyToReview, deleteReply, reportReview } from '../controllers/reviewController.js';
import { fetchNotifications, markNotificationsRead } from '../controllers/extranet/notificationController.js';
import { fetchActivityTimeline } from '../controllers/extranet/activityController.js';
import { getDashboard } from '../controllers/extranet/dashboardController.js';
import { getPerformance } from '../controllers/extranet/performanceController.js';
import { getFinancialOverview, getSettlementDetails, getPayoutHistory, getFinanceHub, downloadFinanceDocument, downloadStatement, downloadDocumentsZip } from '../controllers/extranet/financeController.js';
import { getHotelWallet } from '../controllers/walletController.js';
import { getHotelMembership, putHotelMembership } from '../controllers/membershipController.js';

import {
  initOnboarding,
  getOnboardingProgress,
  saveOnboardingStep,
  submitForReview
} from '../controllers/extranet/onboardingController.js';

const router = express.Router();

// Extranet routes are protected and restricted to OWNER/MANAGER
router.use(protect);
router.use(authorizeRoles('OWNER', 'ADMIN', 'MANAGER'));
router.use(permissionGate); // each path's permission (staff roles)

// The listing agreement: read, get a signing code, sign (routes/ownerAgreementRoutes.js)
router.use('/agreement', ownerAgreementRoutes);
// Business rates: discounts for companies and travel agents (routes/hotelBusinessRateRoutes.js)
router.use('/business-rates', hotelBusinessRateRoutes);
// GST invoices the property issues for business (GSTIN) bookings (routes/hotelGstInvoiceRoutes.js)
router.use('/gst-invoices', hotelGstInvoiceRoutes);

// Property Onboarding (Bypasses scoping during creation)
router.post('/onboarding/init', initOnboarding);

// The signed-in owner's properties, for the "Active property" switcher (before scoping: it lists
// every hotel the owner may pick)
router.get('/properties', async (req, res) => {
  try {
    // Owned properties and the ones whose team they're on
    const ids = req.user.role === 'ADMIN' ? [] : Object.keys(req.user.access?.hotels || {});
    const hotels = await prisma.hotel.findMany({
      where: { id: { in: ids }, isDeleted: false },
      select: { id: true, name: true, city: true, status: true },
      orderBy: { name: 'asc' }
    });
    res.json({ success: true, data: hotels });
  } catch (error) {
    console.error('Error listing extranet properties:', error);
    res.status(500).json({ success: false, message: 'Could not load your properties' });
  }
});

// Apply strict hotel scoping for all following extranet routes
router.use(hotelScopeGuard);

router.get('/onboarding/:hotelId/progress', getOnboardingProgress);
router.put('/onboarding/:hotelId/step/:step', saveOnboardingStep);
router.post('/onboarding/:hotelId/submit', submitForReview);

// Property Info
router.get('/property', getProperty);
router.get('/property/overview', getPropertyOverview);
router.put('/property', updateProperty);
router.put('/property/booking-emails', updateBookingEmails);

// Rooms & Rates
router.get('/rooms', getRooms);
// Room types and rate plans are added and edited through /admin/rooms and /admin/rate-plans
// (owners are limited to their own properties there).

// Bookings
router.get('/bookings', getBookings);
router.put('/bookings/:bookingId/status', updateBookingStatus);
// Guest requests (concierge): see them and confirm or decline with a reply
router.get('/requests', listHotelRequests);
router.patch('/requests/:requestId', respondHotelRequest);

// Reviews
router.get('/reviews', listHotelReviews);
router.post('/reviews/:reviewId/reply', replyToReview);

// Feedback QR code (services/feedbackQr.js): PNG and the printable A5 card, and how it's used
const sendQr = (kind, hotelOf) => async (req, res, next) => {
  try {
    const fq = await import('../services/feedbackQr.js');
    const hotel = await hotelOf(req);
    if (!hotel) return res.status(404).json({ success: false, message: 'Property not found' });
    const name = `feedback-qr-${String(hotel.name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
    res.locals.skipFormat = true;
    if (kind === 'png') return res.set({ 'Content-Type': 'image/png', 'Content-Disposition': `attachment; filename="${name}.png"`, 'Cache-Control': 'private, no-store' }).send(await fq.qrPng(hotel));
    return res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${name}.pdf"`, 'Cache-Control': 'private, no-store' }).send(await fq.qrCardPdf(hotel));
  } catch (e) { next(e); }
};
const scopedHotel = (req) => prisma.hotel.findUnique({ where: { id: req.scopedHotelId }, select: { id: true, name: true, city: true } });
router.get('/reviews/qr.png', sendQr('png', scopedHotel));
router.get('/reviews/qr.pdf', sendQr('pdf', scopedHotel));
router.get('/reviews/qr-stats', async (req, res, next) => {
  try { const { qrStats, feedbackUrl } = await import('../services/feedbackQr.js'); const h = await scopedHotel(req); res.json({ success: true, data: { ...(await qrStats(req.scopedHotelId)), url: h ? feedbackUrl(h) : null } }); } catch (e) { next(e); }
});
router.delete('/reviews/:reviewId/reply', deleteReply);
router.post('/reviews/:reviewId/report', reportReview);

// Promotions
// Promotions are managed through /admin/promotions (owners: their own properties).

// Notifications & Activity
// Hourly stays: settings and room types, rooms per day, the day's timeline
router.get('/hourly', extranetGetSetup);
router.put('/hourly', extranetSaveSetup);
router.get('/hourly/allocations', extranetAllocations);
router.put('/hourly/allocations', extranetSetAllocation);
router.get('/hourly/timeline', extranetTimeline);
router.get('/notifications', fetchNotifications);
router.put('/notifications/read', markNotificationsRead);
router.get('/activity', fetchActivityTimeline);
router.get('/dashboard', getDashboard);
router.get('/performance', getPerformance);
// Monthly report by room type against the month before, with booking pace (services/extranetReports.js)
router.get('/performance/monthly', async (req, res, next) => {
  try {
    const { monthlyReport } = await import('../services/extranetReports.js');
    res.json({ success: true, data: await monthlyReport(req.scopedHotelId, req.query.month) });
  } catch (e) { if (e.statusCode === 400) return res.status(400).json({ success: false, message: e.message }); next(e); }
});
router.get('/performance/monthly.csv', async (req, res, next) => {
  try {
    const { monthlyReport, monthlyReportCsv } = await import('../services/extranetReports.js');
    const r = await monthlyReport(req.scopedHotelId, req.query.month);
    res.locals.skipFormat = true;
    res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="performance-${r.month}.csv"`, 'Cache-Control': 'private, no-store' }).send(monthlyReportCsv(r));
  } catch (e) { if (e.statusCode === 400) return res.status(400).json({ success: false, message: e.message }); next(e); }
});

// Finance & Settlements
router.get('/finance/overview', getFinancialOverview);
router.get('/finance/settlements/:settlementId', getSettlementDetails);
router.get('/finance/payouts', getPayoutHistory);
router.get('/finance/hub', getFinanceHub);
router.get('/finance/documents/zip', downloadDocumentsZip);
router.get('/finance/documents/:id/pdf', downloadFinanceDocument);
router.get('/finance/statement', downloadStatement);
router.get('/wallet', getHotelWallet);
router.get('/membership', getHotelMembership);
router.put('/membership', putHotelMembership);

// Google Hotels: the property's own choice to appear (needs property.edit)
router.get('/google', googleExtranetGet);
router.put('/google', googleExtranetSet);

// The property's team and roles (needs team.manage there)
router.use('/team', staffRoutes);

export default router;
