import express from 'express';
import { createReview } from '../controllers/reviewController.js';
import { protect, authorizeRoles } from '../middleware/authMiddleware.js';

const router = express.Router();

router.post('/', protect, authorizeRoles('CUSTOMER', 'ADMIN'), createReview);

export default router;
