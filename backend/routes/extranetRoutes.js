import express from 'express';
import { protect, authorizeRoles } from '../middleware/authMiddleware.js';
import { hotelScopeGuard } from '../middleware/hotelScopeGuard.js';

// Modular Controllers
import { getProperty, updateProperty } from '../controllers/extranet/propertyController.js';
import { getRooms, updateRoom } from '../controllers/extranet/roomController.js';
import { getBookings, updateBookingStatus } from '../controllers/extranet/bookingController.js';
import { getReviews, replyToReview } from '../controllers/extranet/reviewController.js';
import { getPromotions, createPromotion } from '../controllers/extranet/promotionController.js';
import { fetchNotifications, markNotificationsRead } from '../controllers/extranet/notificationController.js';
import { fetchActivityTimeline } from '../controllers/extranet/activityController.js';
import { getFinancialOverview, getSettlementDetails, getPayoutHistory } from '../controllers/extranet/financeController.js';

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

// Apply strict hotel scoping for all following extranet routes
router.use(hotelScopeGuard);

router.get('/onboarding/:hotelId/progress', getOnboardingProgress);
router.put('/onboarding/:hotelId/step/:step', saveOnboardingStep);
router.post('/onboarding/:hotelId/submit', submitForReview);

// Property Info
router.get('/property', getProperty);
router.put('/property', updateProperty);

// Rooms & Rates
router.get('/rooms', getRooms);
router.put('/rooms/:roomId', updateRoom);

// Bookings
router.get('/bookings', getBookings);
router.put('/bookings/:bookingId/status', updateBookingStatus);

// Reviews
router.get('/reviews', getReviews);
router.post('/reviews/:reviewId/reply', replyToReview);

// Promotions
router.get('/promotions', getPromotions);
router.post('/promotions', createPromotion);

// Notifications & Activity
router.get('/notifications', fetchNotifications);
router.put('/notifications/read', markNotificationsRead);
router.get('/activity', fetchActivityTimeline);

// Finance & Settlements
router.get('/finance/overview', getFinancialOverview);
router.get('/finance/settlements/:settlementId', getSettlementDetails);
router.get('/finance/payouts', getPayoutHistory);

export default router;
