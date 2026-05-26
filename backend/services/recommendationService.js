import prisma from '../config/db.js';
import recommendationDomain from '../domains/recommendationDomain.js';
import cacheUtils from '../utils/cacheUtils.js';

export const recommendationService = {
  
  getPersonalizedRecommendations: async (userId, city) => {
    const cacheKey = `rec_${userId || 'anon'}_${city || 'all'}_${new Date().toISOString().split('T')[0]}`;
    
    // 1. Always fetch Recently Viewed in real-time (DO NOT CACHE)
    let recentlyViewed = [];
    let userBehavior = null;

    if (userId) {
      userBehavior = await prisma.userBehavior.findUnique({
        where: { userId }
      });

      if (userBehavior && userBehavior.lastViewedHotels && userBehavior.lastViewedHotels.length > 0) {
        const rvHotels = await prisma.hotel.findMany({
          where: { id: { in: userBehavior.lastViewedHotels }, status: 'ACTIVE', isDeleted: false },
          include: { roomTypes: { include: { ratePlans: true } } }
        });
        
        // Map and format
        recentlyViewed = rvHotels.map(mapHotelBasic);
      }
    }

    // 2. Check Cache for the heavy Recommended & Popular calculations
    const cachedData = cacheUtils.getCache(cacheKey);
    if (cachedData) {
      return {
        recentlyViewed,
        ...cachedData
      };
    }

    // 3. Calculate Popular in City
    // Top hotels by booking count and views
    let popularInCity = [];
    const popularTargetCity = city || userBehavior?.lastSearchedCity || null;

    // We approximate popularity by fetching active hotels and getting their view counts
    const activeHotels = await prisma.hotel.findMany({
      where: { 
        status: 'ACTIVE', 
        isDeleted: false,
        ...(popularTargetCity && { city: { equals: popularTargetCity, mode: 'insensitive' } })
      },
      include: {
        roomTypes: {
          where: { isActive: true },
          include: { ratePlans: { where: { isActive: true } } }
        }
      },
      take: 50 // Limit bounds
    });

    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    // Fetch views for these hotels
    const views = await prisma.hotelView.groupBy({
      by: ['hotelId'],
      _count: { id: true },
      where: {
        hotelId: { in: activeHotels.map(h => h.id) },
        createdAt: { gte: twentyFourHoursAgo }
      }
    });

    const viewMap = views.reduce((acc, curr) => {
      acc[curr.hotelId] = curr._count.id;
      return acc;
    }, {});

    const maxViews = Math.max(1, ...Object.values(viewMap), 1);

    // Fetch bookings for these hotels
    const bookings = await prisma.booking.groupBy({
      by: ['hotelId'],
      _count: { id: true },
      where: {
        hotelId: { in: activeHotels.map(h => h.id) },
        createdAt: { gte: twentyFourHoursAgo },
        status: { in: ['CONFIRMED', 'COMPLETED'] }
      }
    });

    const bookingMap = bookings.reduce((acc, curr) => {
      acc[curr.hotelId] = curr._count.id;
      return acc;
    }, {});

    const maxBookings = Math.max(1, ...Object.values(bookingMap), 1);

    // Map all hotels with their base data
    let allMappedHotels = activeHotels.map(hotel => {
      const basic = mapHotelBasic(hotel);
      basic.viewsLast24h = viewMap[hotel.id] || 0;
      basic.bookingsLast24h = bookingMap[hotel.id] || 0;
      // We don't have accurate availableRooms without dates, so we mock it for generic recommendations
      basic.availableRooms = 1; 
      basic.totalRooms = 1;
      return basic;
    });

    // Sort for Popular In City (Rating + Views + Bookings)
    popularInCity = [...allMappedHotels].sort((a, b) => {
      const aPop = (a.viewsLast24h * 0.6) + (a.bookingsLast24h * 0.4) + (a.rating * 10);
      const bPop = (b.viewsLast24h * 0.6) + (b.bookingsLast24h * 0.4) + (b.rating * 10);
      return bPop - aPop;
    }).slice(0, 10);

    // 4. Calculate Recommended (Personalized)
    let recommended = [];
    
    // Exclude recently recommended if pool is large enough
    if (userBehavior && userBehavior.recentlyRecommendedHotels?.length > 0) {
      const excludeList = userBehavior.recentlyRecommendedHotels.slice(0, 5);
      const remainingCandidates = allMappedHotels.filter(h => !excludeList.includes(h.id));
      if (remainingCandidates.length >= 10) {
        allMappedHotels = remainingCandidates;
      }
    }

    // Fetch Experiment Insights to influence ranking
    let insights = cacheUtils.getCache('experiment_insights');
    if (!insights) {
      insights = await prisma.experimentInsight.findMany({
        where: { confidence: 'HIGH' },
        orderBy: { createdAt: 'desc' },
        take: 10
      });
      cacheUtils.setCache('experiment_insights', insights, 300000); // 5 min TTL
    }

    // Fetch Business Control Layer (Manual Overrides)
    let manualOverrides = cacheUtils.getCache('manual_overrides');
    if (!manualOverrides) {
      const config = await prisma.systemConfig.findUnique({ where: { key: 'manualOverrides' } });
      manualOverrides = config?.value || {};
      cacheUtils.setCache('manual_overrides', manualOverrides, 300000); // 5 min TTL
    }

    const scoredHotels = allMappedHotels.map(h => {
      const score = recommendationDomain.calculateScore(h, userBehavior, maxViews, maxBookings, insights, manualOverrides);
      return { ...h, recommendationScore: score };
    });

    // Diversity Filter & Sorting
    // 1. Group by score (rounded to 1 decimal place) and shuffle within groups
    const groupedByScore = {};
    for (const h of scoredHotels) {
      const roundedScore = (Math.round(h.recommendationScore * 10) / 10).toFixed(1);
      if (!groupedByScore[roundedScore]) groupedByScore[roundedScore] = [];
      groupedByScore[roundedScore].push(h);
    }

    let shuffledAndSorted = [];
    Object.keys(groupedByScore).sort((a, b) => Number(b) - Number(a)).forEach(scoreGroup => {
      const group = groupedByScore[scoreGroup];
      // Fisher-Yates Shuffle
      for (let i = group.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [group[i], group[j]] = [group[j], group[i]];
      }
      shuffledAndSorted = shuffledAndSorted.concat(group);
    });

    // 2. Max 2 per location
    const locationCounts = {};
    for (const hotel of shuffledAndSorted) {
      if (recommended.length >= 10) break;
      const loc = hotel.location?.toLowerCase() || 'unknown';
      locationCounts[loc] = (locationCounts[loc] || 0) + 1;
      
      if (locationCounts[loc] <= 2) {
        recommended.push(hotel);
      }
    }

    // 5. Save Recently Recommended for next time
    if (userId && recommended.length > 0) {
      setImmediate(async () => {
        try {
          const recIds = recommended.map(r => r.id);
          let newRecs = [...recIds, ...(userBehavior.recentlyRecommendedHotels || [])];
          newRecs = [...new Set(newRecs)].slice(0, 10); // Dedupe & cap at 10

          await prisma.userBehavior.update({
            where: { userId },
            data: { recentlyRecommendedHotels: newRecs }
          });
        } catch (e) {
          console.error("Failed to update recentlyRecommendedHotels", e);
        }
      });
    }

    const calculatedData = {
      recommended,
      popularInCity
    };

    // Cache split based on personalization
    if (userId) {
      cacheUtils.setCache(cacheKey, calculatedData, 60000); // 60s TTL for personalized
    } else {
      cacheUtils.setCache(cacheKey, calculatedData, 120000); // 120s TTL for trending
    }

    return {
      recentlyViewed,
      contextCity: popularTargetCity,
      ...calculatedData
    };
  }
};

/** Helper to extract generic hotel card data */
function mapHotelBasic(hotel) {
  let minPrice = Infinity;
  hotel.roomTypes?.forEach(rt => {
    rt.ratePlans?.forEach(rp => {
      if (rp.basePrice < minPrice) minPrice = rp.basePrice;
    });
  });

  return {
    id: hotel.id,
    name: hotel.name,
    city: hotel.city,
    location: hotel.location,
    rating: hotel.rating || 0,
    reviewCount: hotel.reviews || 0,
    price: minPrice === Infinity ? 0 : minPrice,
    startingPrice: minPrice === Infinity ? 0 : minPrice,
    image: hotel.media?.[0]?.url || hotel.images?.[0] || null,
    amenities: hotel.amenities || []
  };
}

export default recommendationService;
