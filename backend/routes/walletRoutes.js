import express from 'express';
import { getMyWallet } from '../controllers/walletController.js';
import { protect } from '../middleware/authMiddleware.js';

// Mounted at /api/v1/wallet: the signed-in guest's Zivo Cash.
const router = express.Router();
router.get('/', protect, getMyWallet);
export default router;
