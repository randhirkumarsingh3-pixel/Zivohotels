import express from 'express';
import { adminOverview, adminGuests, adminGuest, adminAdjust, adminHotel } from '../controllers/walletController.js';

// Mounted at /api/v1/admin/wallets (protect + ADMIN/OWNER from /admin; the controller allows ADMIN only).
const router = express.Router();
router.get('/overview', adminOverview);
router.get('/guests', adminGuests);
router.get('/guests/:id', adminGuest);
router.post('/guests/:id/adjust', adminAdjust);
router.get('/hotels/:hotelId', adminHotel);
export default router;
