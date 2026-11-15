import express from 'express';
import { getCalendar, updateInventory, updateRates, bulkUpdate } from '../controllers/ariController.js';

// Mounted under /api/v1/admin (protect + ADMIN/OWNER). Owners are limited to their own properties.
const router = express.Router();
router.get('/calendar', getCalendar);
router.post('/inventory', updateInventory);
router.post('/rates', updateRates);
router.post('/bulk', bulkUpdate);
export default router;
