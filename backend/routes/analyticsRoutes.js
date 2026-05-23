import express from 'express';
import { getKpis, getRevenueTrend, getBookingStats, getTopProperties, getFunnelAnalytics } from '../controllers/analyticsController.js';
import { protect, authorizeRoles } from '../middleware/authMiddleware.js';

const router = express.Router();

router.use(protect);
router.use(authorizeRoles('ADMIN'));

router.get('/kpis', getKpis);
router.get('/revenue', getRevenueTrend);
router.get('/bookings', getBookingStats);
router.get('/top-properties', getTopProperties);
router.get('/funnel', getFunnelAnalytics);

export default router;
