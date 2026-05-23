/**
 * DecisionService
 * Provides explainability for AI-driven pricing and ranking decisions.
 */

export const getPricingExplanation = async (hotelId, roomTypeId, basePrice, finalPrice, signals) => {
  const diff = finalPrice - basePrice;
  const pctChange = ((diff / basePrice) * 100).toFixed(1);

  // Decompose factors (Simulated decomposition of ML weights)
  const factors = {
    demand: signals.demandScore > 0.7 ? (diff * 0.6) : (diff * 0.3),
    inventory: signals.inventoryPressure > 0.5 ? (diff * 0.3) : (diff * 0.1),
    holiday: signals.isHoliday ? (diff * 0.2) : 0,
    competition: diff * 0.1 // Base competition adjustment
  };

  const reasons = [];
  if (signals.demandScore > 0.8) reasons.push("Extremely high market demand detected in city.");
  if (signals.inventoryPressure > 0.7) reasons.push("Low inventory ( < 3 rooms left) for this room type.");
  if (signals.isHoliday) reasons.push(`Local holiday impact: ${signals.holidayName || 'Festival period'}.`);
  if (signals.velocity > 5) reasons.push("High booking velocity (5+ bookings in last 30m).");

  return {
    hotelId,
    roomTypeId,
    basePrice,
    finalPrice,
    pctChange,
    factors: {
      demand: `+${((factors.demand / diff) * pctChange || 0).toFixed(1)}%`,
      inventory: `+${((factors.inventory / diff) * pctChange || 0).toFixed(1)}%`,
      holiday: `+${((factors.holiday / diff) * pctChange || 0).toFixed(1)}%`,
      competition: `+${((factors.competition / diff) * pctChange || 0).toFixed(1)}%`
    },
    reasons: reasons.length > 0 ? reasons : ["Standard dynamic adjustment based on market trends."],
    confidence: signals.confidence || "HIGH",
    timestamp: new Date()
  };
};

export const getRankingExplanation = async (hotelId, score, factors) => {
  return {
    hotelId,
    score: score.toFixed(2),
    primaryDrivers: [
      factors.conversionRate > 0.1 ? "Top-tier conversion rate" : null,
      factors.priceCompetitiveness > 0.8 ? "Highly competitive pricing" : null,
      factors.ersBoost > 0 ? "Revenue optimization boost applied" : null,
      factors.ctrPenalty < 0 ? "Low engagement penalty applied" : null
    ].filter(Boolean),
    transparency: {
      ersWeight: "40%",
      relevanceWeight: "30%",
      trustWeight: "30%"
    },
    tips: [
      factors.ctrPenalty < 0 ? "Improve thumbnail quality to increase CTR." : null,
      factors.priceCompetitiveness < 0.5 ? "Lower your base rate to match market average." : null
    ].filter(Boolean)
  };
};
