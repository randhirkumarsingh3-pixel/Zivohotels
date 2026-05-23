import rankingDomain from '../domains/rankingDomain.js';

export const rankingService = {
  /**
   * Applies RMS Smart Ranking (Expected Revenue Score)
   */
  rankResults: (hotels, sortBy = 'RECOMMENDED', includeSoldOut = false) => {
    if (!hotels || hotels.length === 0) return [];

    const minPrice = Math.min(...hotels.map(h => h.price || Infinity));

    // 1. Calculate Expected Revenue Score (ERS)
    // ERS = Conversion_Prob * Price * (Commission/100)
    let scoredHotels = hotels.map(hotel => {
      // TRUST GUARDRAIL: Low-rated hotels NEVER get boosted by ERS
      const ratingWeight = hotel.rating < 3.5 ? 0.0 : 1.0;

      const conversionProb = hotel.rating >= 4.5 ? 0.15 : (hotel.rating >= 4.0 ? 0.10 : 0.05);
      const commissionRate = hotel.commission || 15;
      
      const ers = conversionProb * hotel.price * (commissionRate / 100) * ratingWeight;
      
      const scoreParams = {
        rating: hotel.rating,
        commission: commissionRate,
        totalRooms: hotel.totalRooms,
        availableRooms: hotel.availableRooms,
        price: hotel.price
      };

      // Hybrid Score: 70% Legacy Ranking + 30% Revenue Optimization
      const baseScore = rankingDomain.calculateScore(scoreParams, minPrice);
      
      // CTR PENALTY (Phase 9.1): Penalize low-engagement high-ers properties
      const ctr = hotel.ctr || 0.05; // Mock CTR for logic
      const ctrPenalty = ctr < 0.02 ? 0.5 : 1.0; // 50% score penalty if CTR is low

      const finalScore = ((baseScore * 0.7) + (Math.min(ers / 500, 1) * 0.3)) * ctrPenalty;

      return {
        ...hotel,
        ers,
        score: finalScore,
        badges: {
          isTopRated: hotel.rating >= 4.5 && hotel.reviewCount > 20,
          isHighMargin: commissionRate > 20,
          isSoldOut: hotel.availableRooms === 0,
          isBestValue: baseScore > 0.8 // Transparent value badge
        }
      };
    });

    if (!includeSoldOut) {
      scoredHotels = scoredHotels.filter(h => h.availableRooms > 0);
    }

    // 2. DIVERSITY LOGIC & SORTING
    scoredHotels.sort((a, b) => {
      // Always push sold out to bottom unless explicitly requested otherwise
      if (includeSoldOut) {
        if (a.availableRooms === 0 && b.availableRooms > 0) return 1;
        if (b.availableRooms === 0 && a.availableRooms > 0) return -1;
      }

      if (sortBy === 'PRICE_LOW_HIGH') return a.price - b.price;
      if (sortBy === 'RATING_HIGH_LOW') return b.rating - a.rating;
      
      // RECOMMENDED = Highest Revenue Yield (with Trust Layer guardrails)
      return b.score - a.score;
    });

    return scoredHotels;
  }
};

export default rankingService;
