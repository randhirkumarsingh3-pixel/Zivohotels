import prisma from '../config/db.js';
import express from 'express';
import { protect, authorizeRoles } from '../middleware/authMiddleware.js';
import { hotelScopeGuard } from '../middleware/hotelScopeGuard.js';

// Modular Controllers
import { getProperty, updateProperty, updateBookingEmails } from '../controllers/extranet/propertyController.js';
import { extranetGetSetup, extranetSaveSetup, extranetAllocations, extranetSetAllocation, extranetTimeline } from '../controllers/hourlyController.js';
import { getRooms } from '../controllers/extranet/roomController.js';
import { getBookings, updateBookingStatus } from '../controllers/extranet/bookingController.js';
import { listHotelRequests, respondHotelRequest } from '../controllers/stayRequestController.js';
import { listHotelReviews, replyToReview, deleteReply, reportReview } from '../controllers/reviewController.js';
import { fetchNotifications, markNotificationsRead } from '../controllers/extranet/notificationController.js';
import { fetchActivityTimeline } from '../controllers/extranet/activityController.js';
import { getDashboard } from '../controllers/extranet/dashboardController.js';
import { getPerformance } from '../controllers/extranet/performanceController.js';
import { getFinancialOverview, getSettlementDetails, getPayoutHistory } from '../controllers/extranet/financeController.js';
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

// Property Onboarding (Bypasses scoping during creation)
router.post('/onboarding/init', initOnboarding);

// The signed-in owner's properties, for the "Active property" switcher (before scoping: it lists
// every hotel the owner may pick)
router.get('/properties', async (req, res) => {
  try {
    const hotels = await prisma.hotel.findMany({
      where: { ownerId: req.user.id, isDeleted: false },
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

// Finance & Settlements
router.get('/finance/overview', getFinancialOverview);
router.get('/finance/settlements/:settlementId', getSettlementDetails);
router.get('/finance/payouts', getPayoutHistory);
router.get('/wallet', getHotelWallet);
router.get('/membership', getHotelMembership);
router.put('/membership', putHotelMembership);

export default router;
