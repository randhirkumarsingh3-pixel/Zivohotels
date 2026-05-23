/**
 * Review Domain (Pure Logic)
 * 
 * Rules:
 * - NO database queries
 * - Pure mathematical calculations
 * - Deterministic output
 */
export const reviewDomain = {
  
  /**
   * Calculates the new aggregate rating for a hotel
   * 
   * @param {Object} currentStats
   * @param {Number} currentStats.averageRating - The current average rating
   * @param {Number} currentStats.totalReviews - The current total number of reviews
   * @param {Number} newRating - The new rating being added (1-5)
   * @returns {Object} { newAverageRating, newTotalReviews }
   */
  calculateNewAggregate: (currentStats, newRating) => {
    const oldAvg = currentStats.averageRating || 0;
    const count = currentStats.totalReviews || 0;

    // Boundary check for new rating
    const safeRating = Math.max(1, Math.min(5, newRating));

    // Aggregate formula
    const rawNewAvg = ((oldAvg * count) + safeRating) / (count + 1);

    // Round to 1 decimal place (e.g., 4.34 -> 4.3)
    const roundedAvg = Math.round(rawNewAvg * 10) / 10;

    return Object.freeze({
      newAverageRating: roundedAvg,
      newTotalReviews: count + 1
    });
  }

};

export default reviewDomain;
