import express from 'express';
import { financeController } from '../controllers/finance/financeController.js';
import { protect, authorizeRoles } from '../middleware/authMiddleware.js';

const router = express.Router();

// All finance routes are protected and restricted to Admin/SuperAdmin
router.use(protect);
router.use(authorizeRoles('ADMIN', 'SUPER_ADMIN'));

router.get('/dashboard', financeController.getDashboardMetrics);
router.get('/wallet', financeController.getWallet);
router.get('/fraud-logs', financeController.getFraudLogs);
router.get('/settlements', financeController.getSettlements);
router.get('/transactions', financeController.getTransactions);
router.post('/payouts/process', financeController.processPayout);

export default router;
