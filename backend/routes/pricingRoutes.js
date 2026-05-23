import express from 'express';
import { 
  getPricingConfig, 
  updatePricingConfig, 
  getPricingRules, 
  createPricingRule, 
  getPricingSnapshots,
  getHolidays,
  createHoliday,
  deleteHoliday
} from '../controllers/pricingController.js';
import { protect, authorizeRoles } from '../middleware/authMiddleware.js';

const router = express.Router();

router.use(protect);
router.use(authorizeRoles('ADMIN', 'OWNER'));

router.get('/config', getPricingConfig);
router.put('/config', updatePricingConfig);

router.get('/rules', getPricingRules);
router.post('/rules', createPricingRule);

router.get('/holidays', getHolidays);
router.post('/holidays', createHoliday);
router.delete('/holidays/:id', deleteHoliday);

router.get('/snapshots', getPricingSnapshots);

export default router;
