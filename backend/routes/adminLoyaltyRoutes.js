import express from 'express';
import { getStats, putConfig, getMembers, getMember, adjustMember } from '../controllers/loyaltyController.js';

// Mounted at /api/v1/admin/loyalty (protect + ADMIN/OWNER from /admin; the controller allows ADMIN only).
const router = express.Router();
router.get('/stats', getStats);
router.put('/config', putConfig);
router.get('/members', getMembers);
router.get('/members/:id', getMember);
router.post('/members/:id/adjust', adjustMember);
export default router;
