import express from 'express';
import { getProgram, getMyRewards, getMyHistory } from '../controllers/loyaltyController.js';
import { protect } from '../middleware/authMiddleware.js';

// Mounted at /api/v1/loyalty: the signed-in member's Zivo Rewards.
const router = express.Router();
router.get('/program', getProgram);
router.get('/me', protect, getMyRewards);
router.get('/me/history', protect, getMyHistory);
export default router;
