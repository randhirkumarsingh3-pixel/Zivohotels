import express from 'express';
import {
  getPricingConfig,
  updatePricingConfig,
  getPricingSnapshots,
  getHolidays,
  createHoliday,
  deleteHoliday,
  getDynamicOverview,
  getHotelDynamic,
  updateHotelDynamicSettings,
  createHotelRule,
  updateHotelRule,
  deleteHotelRule,
  recomputeHotelPrices,
  previewHotelPrices,
} from '../controllers/pricingController.js';
import { protect, authorizeRoles } from '../middleware/authMiddleware.js';
import { permissionGate } from '../middleware/permissionGate.js';

// Mounted at /api/v1/admin/pricing and /api/v1/pricing. Owners are limited to their own
// properties by the controller; platform settings and the holiday calendar are admin-only.
const router = express.Router();

router.use(protect);
router.use(authorizeRoles('ADMIN', 'OWNER'));
router.use(permissionGate); // each path's permission (staff roles)

router.get('/config', getPricingConfig);
router.put('/config', updatePricingConfig);
router.get('/snapshots', getPricingSnapshots);

router.get('/holidays', getHolidays);
router.post('/holidays', createHoliday);
router.delete('/holidays/:id', deleteHoliday);

router.get('/dynamic', getDynamicOverview);
router.get('/hotels/:hotelId/dynamic', getHotelDynamic);
router.put('/hotels/:hotelId/dynamic/settings', updateHotelDynamicSettings);
router.post('/hotels/:hotelId/dynamic/rules', createHotelRule);
router.patch('/hotels/:hotelId/dynamic/rules/:ruleId', updateHotelRule);
router.delete('/hotels/:hotelId/dynamic/rules/:ruleId', deleteHotelRule);
router.post('/hotels/:hotelId/dynamic/recompute', recomputeHotelPrices);
router.get('/hotels/:hotelId/dynamic/preview', previewHotelPrices);

export default router;
