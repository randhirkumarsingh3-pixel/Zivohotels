/**
 * Feature Builder for AI Pricing Engine
 * 
 * Transforms raw booking context into a structured feature set for model inference.
 */
export const featureBuilder = {
  /**
   * Builds a feature object from the current pricing context
   * 
   * @param {Object} context 
   * @returns {Object} features
   */
  buildFeatures: (context) => {
    const {
      hotelId,
      roomTypeId,
      date,
      basePrice,
      demandScore = 0.5,
      availableRooms = 999,
      occupancyRate = 0,
      userSegment = 'STANDARD',
      device = 'WEB'
    } = context;

    const dateObj = new Date(date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Days to check-in (important for price elasticity)
    const daysToCheckIn = Math.max(0, Math.ceil((dateObj.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)));

    return {
      hotelId,
      roomTypeId,
      demandScore: parseFloat(demandScore.toFixed(4)),
      availableRooms,
      occupancyRate: parseFloat(occupancyRate.toFixed(4)),
      daysToCheckIn,
      dayOfWeek: dateObj.getDay(),
      month: dateObj.getMonth(),
      userSegment,
      device,
      basePrice,
      // Boolean features
      isWeekend: [5, 6].includes(dateObj.getDay())
    };
  },

  /**
   * Generates a stable hash for a given context to identify repeat predictions
   */
  generateContextHash: (features) => {
    const str = `${features.hotelId}-${features.roomTypeId}-${features.demandScore}-${features.occupancyRate}-${features.daysToCheckIn}-${features.userSegment}`;
    // Simple hash function for demonstration
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(16);
  }
};

export default featureBuilder;
