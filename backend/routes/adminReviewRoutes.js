import express from 'express';
import { adminListReviews, adminModerateReview } from '../controllers/reviewController.js';

// Mounted at /api/v1/admin/reviews (protect + ADMIN/OWNER from /admin; the controller allows ADMIN only).
const router = express.Router();
router.get('/', adminListReviews);
router.patch('/:id', adminModerateReview);
export default router;
