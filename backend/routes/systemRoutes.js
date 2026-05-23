import express from 'express';
import { 
  getStats, 
  getSecurityLogs, 
  getIntegrityResult, 
  triggerAction, 
  getConfig,
  updateConfig,
  getTaxRules,
  updateTaxRules
} from '../controllers/systemController.js';
import { protect, authorizeRoles } from '../middleware/authMiddleware.js';

const router = express.Router();

// Strict restriction to ADMIN for all system control routes
router.use(protect);
router.use(authorizeRoles('ADMIN'));

router.get('/stats', getStats);
router.get('/security-logs', getSecurityLogs);
router.get('/integrity', getIntegrityResult);
router.post('/actions', triggerAction);
router.get('/config', getConfig);
router.put('/config', updateConfig);
router.get('/tax-rules', getTaxRules);
router.put('/tax-rules', updateTaxRules);

export default router;
