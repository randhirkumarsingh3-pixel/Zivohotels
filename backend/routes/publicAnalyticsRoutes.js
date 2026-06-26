import express from 'express';
import { trackEvent } from '../controllers/publicAnalyticsController.js';
import { extractUser } from '../middleware/authMiddleware.js';

const router = express.Router();

// extractUser is a soft-auth middleware that extracts userId if token exists, but doesn't block if missing
router.post('/track', extractUser, trackEvent);

export default router;
