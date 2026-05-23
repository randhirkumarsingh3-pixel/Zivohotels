import express from 'express';
import { getExperiments, getExperimentResults, getOptimizationHealth } from '../controllers/experimentController.js';
import { extractUser, protect, authorizeRoles } from '../middleware/authMiddleware.js';

const router = express.Router();

router.get('/', extractUser, getExperiments);
router.get('/health', protect, authorizeRoles('ADMIN'), getOptimizationHealth);
router.get('/results/:id', protect, authorizeRoles('ADMIN'), getExperimentResults);

export default router;
