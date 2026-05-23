import express from 'express';
import { getRecommendations } from '../controllers/recommendationController.js';
import { extractUser } from '../middleware/authMiddleware.js';

const router = express.Router();

router.get('/', extractUser, getRecommendations);

export default router;
