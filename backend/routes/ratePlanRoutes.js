import express from 'express';
import { createRatePlan, updateRatePlan, deleteRatePlan } from '../controllers/ratePlanController.js';
import { protect, authorizeRoles } from '../middleware/authMiddleware.js';

const router = express.Router();

// Base: /api/v1/rate-plans
router.route('/')
  .post(protect, authorizeRoles('ADMIN', 'OWNER'), createRatePlan);

router.route('/:id')
  .patch(protect, authorizeRoles('ADMIN', 'OWNER'), updateRatePlan) // Using PATCH for soft delete/partial updates
  .delete(protect, authorizeRoles('ADMIN', 'OWNER'), deleteRatePlan);

export default router;
