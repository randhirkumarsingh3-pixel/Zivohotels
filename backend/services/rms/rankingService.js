
export const rankingService = {
  /**
   * Calculates Expected Revenue Score (ERS) for a list of hotels
   * ERS = Conversion Probability * Final Price * Commission Rate
   */
  rankHotels: async (hotels, context) => {
    // 1. Fetch historical conversion rates per hotel
    const rankedHotels = hotels.map(hotel => {
      // Mocked conversion probability for now (will be learned from SessionLog)
      const conversionProb = hotel.rating > 4 ? 0.15 : 0.08; 
      
      const price = hotel.roomTypes?.[0]?.price || 0;
      const commission = hotel.dynamicCommissionRate || 15.0;
      
      // Expected Revenue per view
      const expectedRevenue = conversionProb * price * (commission / 100);
      
      return {
        ...hotel,
        ersScore: expectedRevenue,
        conversionProb
      };
    });

    // 2. Sort by ERS descending
    return rankedHotels.sort((a, b) => b.ersScore - a.ersScore);
  }
};

export default rankingService;
