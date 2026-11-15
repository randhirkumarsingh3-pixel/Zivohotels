import express from 'express';
import { createReview, editReview, getMyReviews, getReviewOptions } from '../controllers/reviewController.js';
import { protect, authorizeRoles } from '../middleware/authMiddleware.js';

// Mounted at /api/v1/reviews: guests writing and editing their reviews.
const router = express.Router();
router.get('/options', getReviewOptions);
router.get('/mine', protect, getMyReviews);
router.post('/', protect, authorizeRoles('CUSTOMER', 'ADMIN', 'OWNER'), createReview);
router.put('/:id', protect, editReview);
export default router;
