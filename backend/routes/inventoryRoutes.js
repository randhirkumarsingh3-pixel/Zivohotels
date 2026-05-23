import express from 'express';
import { bulkUpdateInventory, getInventory } from '../controllers/inventoryController.js';
import { protect, authorizeRoles } from '../middleware/authMiddleware.js';

const router = express.Router();

router.route('/')
  .get(protect, authorizeRoles('ADMIN', 'OWNER'), getInventory);

router.route('/bulk-update')
  .post(protect, authorizeRoles('ADMIN', 'OWNER'), bulkUpdateInventory);

export default router;
