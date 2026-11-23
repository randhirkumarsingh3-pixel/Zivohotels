import express from 'express';
import { listReports, getReport } from '../controllers/reportController.js';

/** Admin → Reports (mounted at /admin/reports; dashboard.view, money reports also finance.view) */
const router = express.Router();
router.get('/', listReports);
router.get('/:key', getReport);
export default router;
