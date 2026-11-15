import express from 'express';
import { adminOverview, adminUpdatePlan, adminMembers, adminGrant, adminCancel, adminHotelPercent } from '../controllers/membershipController.js';

// Mounted at /api/v1/admin/membership (protect + ADMIN/OWNER from /admin; the controller allows ADMIN only).
const router = express.Router();
router.get('/overview', adminOverview);
router.put('/plans/:id', adminUpdatePlan);
router.get('/members', adminMembers);
router.post('/grant', adminGrant);
router.post('/members/:id/cancel', adminCancel);
router.put('/hotels/:hotelId', adminHotelPercent);
export default router;
