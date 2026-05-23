/**
 * Recommendation Engine Domain
 * 
 * Implements the scoring logic:
 * score = (userAffinity * 0.30) + (ratingScore * 0.20) + (popularityScore * 0.25) + (priceFit * 0.15) + (availabilityScore * 0.10)
 */
export const recommendationDomain = {
  
  calculateScore: (hotel, userBehavior, maxViews, maxBookings, insights = [], manualOverrides = {}) => {
    // 1. User Affinity
    let userAffinity = 0;
    
    // same city
    if (userBehavior?.lastSearchedCity && hotel.city?.toLowerCase() === userBehavior.lastSearchedCity.toLowerCase()) {
      userAffinity += 1.0;
    }

    // price range fit
    if (userBehavior?.preferredMinPrice && userBehavior?.preferredMaxPrice) {
      if (hotel.price >= userBehavior.preferredMinPrice && hotel.price <= userBehavior.preferredMaxPrice) {
        userAffinity += 0.5;
      }
    }

    // penalty for already viewed (don't over-recommend what they already saw and didn't book)
    if (userBehavior?.lastViewedHotels?.includes(hotel.id)) {
      userAffinity -= 0.3;
    }

    // Normalize userAffinity somewhat (max achievable here is 1.5)
    // To keep it 0-1 range, we divide by 1.5
    userAffinity = Math.max(0, userAffinity / 1.5);

    // 2. Rating Score
    const ratingScore = (hotel.rating || 0) / 5;

    // 3. Popularity Score (V2)
    const viewScore = maxViews > 0 ? (hotel.viewsLast24h || 0) / maxViews : 0;
    const bookingScore = maxBookings > 0 ? (hotel.bookingsLast24h || 0) / maxBookings : 0;
    const popularityScore = (viewScore * 0.6) + (bookingScore * 0.4);

    // 4. Price Fit (if user has preferred mid)
    let priceFit = 0;
    if (userBehavior?.preferredMinPrice && userBehavior?.preferredMaxPrice && hotel.price > 0) {
      const preferredMid = (userBehavior.preferredMinPrice + userBehavior.preferredMaxPrice) / 2;
      priceFit = Math.min(preferredMid / hotel.price, 1);
    } else {
      // Fallback if no user preference
      priceFit = 0.5;
    }

    // 5. Availability Score
    const availabilityScore = hotel.totalRooms > 0 ? Math.min((hotel.availableRooms || 0) / hotel.totalRooms, 1) : 0;

    // Final Formula V2 - BASE WEIGHTS
    const baseWeights = {
      affinity: 0.30,
      rating: 0.20,
      popularity: 0.25,
      price: 0.15,
      availability: 0.10
    };

    // Calculate insight boost with decay (half-life of 7 days)
    const insightBoost = {
      affinity: 0,
      rating: 0,
      popularity: 0,
      price: 0,
      availability: 0
    };

    const now = new Date();
    for (const insight of insights) {
      if (!insight.relativeUplift || insight.relativeUplift <= 0 || insight.confidence !== 'HIGH') continue;

      const daysOld = (now - new Date(insight.createdAt)) / (1000 * 60 * 60 * 24);
      
      // Hard Expiry: Ignore insights older than 30 days
      if (daysOld > 30) continue;

      const decayFactor = Math.max(0, 1 - (daysOld / 7)); // linear decay over 7 days

      if (decayFactor > 0) {
        // Tie categories to weight properties with Diversity Penalty
        if (insight.category === 'UI' || insight.category === 'RANKING') {
          const repetitionFactor = Math.min(insightBoost.popularity * 2, 0.5);
          insightBoost.popularity += (insight.relativeUplift * 0.1) * decayFactor * (1 - repetitionFactor);
        } else if (insight.category === 'PRICING') {
          const repetitionFactor = Math.min(insightBoost.price * 2, 0.5);
          insightBoost.price += (insight.relativeUplift * 0.1) * decayFactor * (1 - repetitionFactor);
        }
      }
    }

    const applyBoost = (base, boost) => {
      const clamp = val => Math.min(Math.max(0, val), 0.15);
      const safeBoost = {
        affinity: clamp(boost.affinity),
        rating: clamp(boost.rating),
        popularity: clamp(boost.popularity),
        price: clamp(boost.price),
        availability: clamp(boost.availability)
      };

      // Return normalized weights
      const sum = 
        (base.affinity + safeBoost.affinity) + 
        (base.rating + safeBoost.rating) + 
        (base.popularity + safeBoost.popularity) + 
        (base.price + safeBoost.price) + 
        (base.availability + safeBoost.availability);
      
      return {
        affinity: (base.affinity + safeBoost.affinity) / sum,
        rating: (base.rating + safeBoost.rating) / sum,
        popularity: (base.popularity + safeBoost.popularity) / sum,
        price: (base.price + safeBoost.price) / sum,
        availability: (base.availability + safeBoost.availability) / sum,
      };
    };

    let finalWeights = applyBoost(baseWeights, insightBoost);

    // Business Control Layer (Manual Overrides)
    if (manualOverrides && Object.keys(manualOverrides).length > 0) {
      const nowTime = now.getTime();
      const expiry = manualOverrides.overrideExpiry ? new Date(manualOverrides.overrideExpiry).getTime() : 0;
      
      if (!expiry || nowTime < expiry) {
        const clampOverride = val => Math.min(Math.max(val, -0.10), 0.10);
        if (manualOverrides.affinity) finalWeights.affinity += clampOverride(manualOverrides.affinity);
        if (manualOverrides.rating) finalWeights.rating += clampOverride(manualOverrides.rating);
        if (manualOverrides.popularity) finalWeights.popularity += clampOverride(manualOverrides.popularity);
        if (manualOverrides.price) finalWeights.price += clampOverride(manualOverrides.price);
        if (manualOverrides.availability) finalWeights.availability += clampOverride(manualOverrides.availability);
      }

      // Re-normalize after manual override
      const overrideSum = finalWeights.affinity + finalWeights.rating + finalWeights.popularity + finalWeights.price + finalWeights.availability;
      finalWeights = {
        affinity: finalWeights.affinity / overrideSum,
        rating: finalWeights.rating / overrideSum,
        popularity: finalWeights.popularity / overrideSum,
        price: finalWeights.price / overrideSum,
        availability: finalWeights.availability / overrideSum
      };
    }

    const score = 
      (userAffinity * finalWeights.affinity) + 
      (ratingScore * finalWeights.rating) + 
      (popularityScore * finalWeights.popularity) + 
      (priceFit * finalWeights.price) + 
      (availabilityScore * finalWeights.availability);

    return Math.round(score * 10000) / 10000;
  }
};

export default recommendationDomain;
