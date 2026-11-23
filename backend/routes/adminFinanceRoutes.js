import express from 'express';
import { ledger, payouts } from '../controllers/adminFinanceController.js';

/** Admin → Finance (mounted at /admin/finance; finance.view) */
const router = express.Router();
router.get('/ledger', ledger);
router.get('/payouts', payouts);
export default router;
