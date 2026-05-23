import { asyncHandler } from '../middleware/asyncHandler.js';
import recommendationService from '../services/recommendationService.js';

export const getRecommendations = asyncHandler(async (req, res) => {
  const userId = req.user?.id || null;
  const { city } = req.query;

  const recommendations = await recommendationService.getPersonalizedRecommendations(userId, city);

  res.status(200).json({
    success: true,
    data: recommendations
  });
});
