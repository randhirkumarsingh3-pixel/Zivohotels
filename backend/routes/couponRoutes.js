import express from 'express';
import { applyCouponPreview, getAvailableCoupons } from '../controllers/couponController.js';
import { protect, authorizeRoles } from '../middleware/authMiddleware.js';

const router = express.Router();

router.get('/', getAvailableCoupons);
router.post('/apply', protect, authorizeRoles('CUSTOMER', 'ADMIN'), applyCouponPreview);

export default router;
