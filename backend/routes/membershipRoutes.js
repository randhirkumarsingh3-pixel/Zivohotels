import express from 'express';
import { getPlans, getMine, buy, verify } from '../controllers/membershipController.js';
import { protect } from '../middleware/authMiddleware.js';

// Mounted at /api/v1/membership.
const router = express.Router();
router.get('/plans', getPlans);
router.get('/me', protect, getMine);
router.post('/buy', protect, buy);
router.post('/verify', protect, verify);
export default router;
