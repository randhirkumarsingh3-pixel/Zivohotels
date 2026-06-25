/**
 * Dynamic Pricing Domain (Pure Business Logic)
 * 
 * Rules:
 * - NO database queries (Prisma)
 * - NO external side-effects
 * - Pure Input -> Output
 */

/**
 * Exponential proximity decay for holiday multipliers.
 * The effect peaks on the holiday day and ramps up/down:
 *   multiplier(t) = base * exp(-|daysToHoliday| / 2)
 * 
 * This means:
 *   - 0 days away: 100% of multiplier
 *   - 1 day away: 60.7%
 *   - 2 days away: 36.8%
 *   - 4 days away: 13.5%
 */
function applyHolidayDecay(baseMultiplier, daysAway) {
  return baseMultiplier * Math.exp(-Math.abs(daysAway) / 2);
}

export const dynamicPricingDomain = {

  /**
   * Calculates the final dynamic price per night
   * 
   * @param {Object} context
   * @param {Number} context.basePrice - Original base price for the night
   * @param {Date}   context.date - The specific date for this price
   * @param {Number} context.demandScore - Normalized demand score (0 to 1), default 0.5
   * @param {Number} context.availableRooms - Remaining inventory
   * @param {String} context.userSegment - 'BUDGET' | 'PREMIUM' | 'RETURNING' | 'STANDARD'
   * @param {Object} context.experimentModifiers - Experiment variants active for this user
   * @param {Object} context.pricingRules - Optional manual overrides or dynamic rules
   * @param {Number} context.previousPrice - From PricingState.lastAppliedPrice (for rate-change cap)
   * @param {Array}  context.holidays - From HolidayCalendar (active entries for date range)
   * @returns {Object} breakdown with finalPrice
   */
  calculateDynamicPrice: (context) => {
    const { 
      basePrice, 
      date, 
      demandScore = 0.5, 
      availableRooms = 999, 
      userSegment = 'STANDARD',
      experimentModifiers = {},
      _pricingRules = {},
      previousPrice = null,
      holidays = [],
      aiPrediction = null      // From Phase 7.5 pricingModelService
    } = context;

    let price = basePrice;
    const breakdown = {
      basePrice,
      demandAdjustment: 0,
      inventoryAdjustment: 0,
      timeAdjustment: 0,
      segmentAdjustment: 0,
      experimentAdjustment: 0,
      aiAdjustment: 0,         // New for Phase 7.5
      gstFloorApplied: false,
      finalPrice: basePrice
    };

    // 1. Demand Adjustment
    // Experiment can override the elasticity weight (for pricing sensitivity A/B tests)
    const demandWeight = experimentModifiers.pricing_demand_weight ?? 0.3;
    const demandAdjPercent = (demandScore - 0.5) * demandWeight;
    breakdown.demandAdjustment = Math.round(basePrice * demandAdjPercent);

    // 2. Inventory Pressure
    let inventoryAdjPercent = 0;
    if (availableRooms <= 2) inventoryAdjPercent = 0.20;
    else if (availableRooms <= 5) inventoryAdjPercent = 0.10;
    breakdown.inventoryAdjustment = Math.round(basePrice * inventoryAdjPercent);

    // 3. Time-based Pricing with Holiday Proximity Decay
    const dateObj = new Date(date);
    const dayOfWeek = dateObj.getDay();
    const _dateStr = dateObj.toISOString().split('T')[0];
    const dateMs = dateObj.getTime();

    // Base: weekend uplift
    let timeAdjPercent = (dayOfWeek === 5 || dayOfWeek === 6) ? 0.10 : 0;

    // Holiday proximity: find the nearest active holiday and apply decayed multiplier
    // Multiple holidays within range are all considered; highest effective multiplier wins
    let bestHolidayEffect = 0;
    for (const h of holidays) {
      const holidayMs = new Date(h.date).getTime();
      const daysAway = (dateMs - holidayMs) / (1000 * 60 * 60 * 24); // negative = before holiday
      
      // Hard cap holiday multiplier at 40% (+0.40) to prevent extreme spikes
      const cappedBaseMultiplier = Math.min(h.multiplier, 0.4);
      const decayedMultiplier = applyHolidayDecay(cappedBaseMultiplier, daysAway);
      
      if (decayedMultiplier > bestHolidayEffect) {
        bestHolidayEffect = decayedMultiplier;
        breakdown.holidayApplied = h.name;
        breakdown.holidayDecayedMultiplier = parseFloat(decayedMultiplier.toFixed(4));
      }
    }

    // Holiday effect overrides weekend if stronger (on the holiday day itself it dominates)
    if (bestHolidayEffect > timeAdjPercent) {
      timeAdjPercent = bestHolidayEffect;
    }

    breakdown.timeAdjustment = Math.round(basePrice * timeAdjPercent);

    // 4. User Segment Pricing (invisible to user — kept within ±5%)
    let segmentAdjPercent = 0;
    if (userSegment === 'BUDGET') segmentAdjPercent = -0.05;
    else if (userSegment === 'PREMIUM') segmentAdjPercent = 0.05;
    else if (userSegment === 'RETURNING') segmentAdjPercent = 0.03;
    breakdown.segmentAdjustment = Math.round(basePrice * segmentAdjPercent);

    // 5. AI Pricing Engine (Phase 7.5 Override)
    // If AI is active, it takes over the demand-elasticity and segment-optimization logic
    if (aiPrediction && aiPrediction.multiplier !== undefined) {
      const aiTargetPrice = basePrice * aiPrediction.multiplier;
      breakdown.aiAdjustment = Math.round(aiTargetPrice - basePrice);
      
      // Zero out redundant rule-based adjustments to avoid double-charging
      breakdown.demandAdjustment = 0;
      breakdown.segmentAdjustment = 0;
      breakdown.aiModel = aiPrediction.modelVersion;
      breakdown.aiSource = aiPrediction.source;
    }

    // 6. Experiment Integration (direct price elasticity testing)
    let experimentAdjPercent = 0;
    if (experimentModifiers.pricing_adjustment) {
      experimentAdjPercent = experimentModifiers.pricing_adjustment;
    }
    breakdown.experimentAdjustment = Math.round(basePrice * experimentAdjPercent);

    // 7. Calculate Unclamped Final Price
    price = basePrice +
            breakdown.demandAdjustment +
            breakdown.inventoryAdjustment +
            breakdown.timeAdjustment +
            breakdown.segmentAdjustment +
            breakdown.experimentAdjustment +
            breakdown.aiAdjustment;

    // 7. Absolute Safety Clamp (0.7x to 1.5x of base — hard floor/ceiling)
    const minPriceAbsolute = basePrice * 0.7;
    const maxPriceAbsolute = basePrice * 1.5;
    price = Math.min(Math.max(price, minPriceAbsolute), maxPriceAbsolute);

    // 8. Rate-Change Stability Clamp (±10% per booking session vs last applied price)
    if (previousPrice && previousPrice > 0) {
      const minPriceRelative = previousPrice * 0.9;
      const maxPriceRelative = previousPrice * 1.1;
      price = Math.min(Math.max(price, minPriceRelative), maxPriceRelative);
    }

    breakdown.finalPrice = Math.round(price);
    return breakdown;
  }
};

export default dynamicPricingDomain;
