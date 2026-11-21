import express from 'express';
import { authorizeRoles } from '../middleware/authMiddleware.js';
import { adminOverview, adminSaveSettings, adminApproveHotel } from '../controllers/hourlyController.js';

/** Admin → Hourly stays: platform rules and approving properties. */
const router = express.Router();
router.use(authorizeRoles('ADMIN'));
router.get('/', adminOverview);
router.put('/settings', adminSaveSettings);
router.put('/hotels/:id', adminApproveHotel);
export default router;
