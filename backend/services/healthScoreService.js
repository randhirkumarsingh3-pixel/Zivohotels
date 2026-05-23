/**
 * HealthScoreService
 * Calculates composite performance score for hotels.
 */

export const calculateHotelHealth = (metrics) => {
  const {
    conversionRate, // 0.0 - 0.1
    avgRating,      // 0 - 5
    cancellationRate, // 0 - 1
    priceCompetitiveness // 0 - 1
  } = metrics;

  // Weighting
  const weights = {
    conversion: 30,
    rating: 25,
    cancellation: 25,
    pricing: 20
  };

  const scores = {
    conversion: Math.min((conversionRate / 0.08) * 100, 100) * (weights.conversion / 100),
    rating: (avgRating / 5) * 100 * (weights.rating / 100),
    cancellation: (1 - cancellationRate) * 100 * (weights.cancellation / 100),
    pricing: priceCompetitiveness * 100 * (weights.pricing / 100)
  };

  const totalScore = Math.round(scores.conversion + scores.rating + scores.cancellation + scores.pricing);

  // Recommendations based on gaps
  const tips = [];
  if (conversionRate < 0.03) tips.push("Improve your property photos and description to boost conversion.");
  if (avgRating < 4) tips.push("Focus on guest experience to improve your rating.");
  if (cancellationRate > 0.1) tips.push("Review your cancellation policy; it's higher than market average.");
  if (priceCompetitiveness < 0.6) tips.push("Your rates are 10%+ higher than similar properties nearby.");

  return {
    score: totalScore,
    breakdown: scores,
    tips
  };
};
