import express from 'express';
import { listPromotions, createPromotion, updatePromotion, deletePromotion } from '../controllers/promotionController.js';
import { protect, authorizeRoles } from '../middleware/authMiddleware.js';

// Mounted at /api/v1/admin/promotions. Owners: their own properties; admins: everything.
const router = express.Router();
router.use(protect, authorizeRoles('ADMIN', 'OWNER'));
router.get('/', listPromotions);
router.post('/', createPromotion);
router.patch('/:id', updatePromotion);
router.delete('/:id', deletePromotion);
export default router;
