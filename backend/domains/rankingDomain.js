/**
 * Ranking Domain (Pure Logic)
 * 
 * Rules:
 * - NO database queries
 * - Pure mathematical scoring algorithm
 * - Deterministic outputs
 */
export const rankingDomain = {

  /**
   * Calculates the ranking score for a hotel based on multiple normalized vectors
   * 
   * @param {Object} hotel 
   * @param {Number} minPrice - The lowest price found in the current search result set
   * @returns {Number} score
   */
  calculateScore: (hotel, minPrice) => {
    // 1. Extract raw values with fallbacks
    const rating = hotel.rating || 0;
    const commission = hotel.commission || 15; // default OTA commission
    const totalRooms = hotel.totalRooms || 1;
    const availableRooms = hotel.availableRooms || 0;
    const _price = hotel.price || minPrice;

    // 2. Normalize inputs to 0-1 range
    const ratingScore = rating / 5;
    
    // Commission score: Cap max commission at 30% for normalization
    const maxExpectedCommission = 30;
    const commissionScore = Math.min(commission / maxExpectedCommission, 1);

    // Availability score
    const availabilityScore = totalRooms > 0 ? Math.min(availableRooms / totalRooms, 1) : 0;

    // Price competitiveness: Min price gets 1.0, higher prices drop down towards 0
    const priceCompetitiveness = hotel.price > 0 && minPrice > 0 ? minPrice / hotel.price : 0;

    // Conversion Proxy: Phase 3 placeholder (1.0)
    const conversionProxy = 1.0;

    // 3. Apply Weighting Formula
    const score = 
        (ratingScore * 0.4) 
      + (priceCompetitiveness * 0.3) 
      + (availabilityScore * 0.1) 
      + (commissionScore * 0.1) 
      + (conversionProxy * 0.1);

    // Round to 4 decimal places
    return Math.round(score * 10000) / 10000;
  }

};

export default rankingDomain;
