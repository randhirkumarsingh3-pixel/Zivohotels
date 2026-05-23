import prisma from '../config/db.js';

export const searchAll = async (req, res, next) => {
  try {
    const query = req.query.q;

    if (!query || query.trim() === '') {
      return res.json([]);
    }

    const searchQuery = query.trim();

    // Perform safe, parameterized Trigram search
    const results = await prisma.$queryRaw`
      SELECT 
        id, 
        name, 
        city, 
        location,
        GREATEST(
          similarity(name, ${searchQuery}),
          similarity(city, ${searchQuery}),
          similarity(location, ${searchQuery})
        ) AS max_score
      FROM "Hotel"
      WHERE name % ${searchQuery}
         OR city % ${searchQuery}
         OR location % ${searchQuery}
        AND ("isDeleted" = false OR "isDeleted" IS NULL)
        AND "status" = 'ACTIVE'
      ORDER BY max_score DESC
      LIMIT 10;
    `;

    // Flatten and map the results
    const mappedResults = [];
    const seenCities = new Set();
    const seenAreas = new Set();

    results.forEach(hotel => {
      // 1. Add city if it's a strong match and not seen
      if (hotel.city && hotel.city.toLowerCase().includes(searchQuery.toLowerCase()) && !seenCities.has(hotel.city)) {
        mappedResults.push({
          type: 'city',
          label: hotel.city,
          value: hotel.city
        });
        seenCities.add(hotel.city);
      }

      // 2. Add location (area) if it's a strong match and not seen
      if (hotel.location && hotel.location.toLowerCase().includes(searchQuery.toLowerCase()) && !seenAreas.has(hotel.location)) {
        mappedResults.push({
          type: 'area',
          label: `${hotel.location}, ${hotel.city}`,
          value: hotel.location
        });
        seenAreas.add(hotel.location);
      }

      // 3. Always add the hotel if it matched
      mappedResults.push({
        type: 'hotel',
        label: hotel.name,
        id: hotel.id,
        slug: hotel.id // Using ID as slug for now, unless we have a slug field
      });
    });

    // Ensure we only return top 10 unique elements across all types
    return res.json(mappedResults.slice(0, 10));
  } catch (error) {
    next(error);
  }
};

export const getPopularCities = async (req, res, next) => {
  try {
    // For now, return a static high-converting list. In the future, this can be driven by booking volume.
    const popular = [
      { type: 'city', label: 'Goa', value: 'goa' },
      { type: 'city', label: 'Mumbai', value: 'mumbai' },
      { type: 'city', label: 'Bangalore', value: 'bangalore' },
      { type: 'city', label: 'Delhi', value: 'delhi' }
    ];
    return res.json(popular);
  } catch (error) {
    next(error);
  }
};

export const searchNearby = async (req, res, next) => {
  try {
    const { lat, lng } = req.query;
    if (!lat || !lng) {
      return res.status(400).json({ success: false, message: 'Latitude and longitude required' });
    }

    // A simple bounding box or proximity query would go here. 
    // For now, we return a mock close match based on common OTAs fallback logic.
    const results = await prisma.hotel.findMany({
      where: { 
        status: 'ACTIVE',
        isDeleted: false
      },
      take: 5
    });

    const mappedResults = results.map(h => ({
      type: 'hotel',
      label: h.name,
      id: h.id,
      slug: h.id
    }));

    return res.json([{ type: 'area', label: 'Hotels Near Me', value: 'nearby' }, ...mappedResults]);
  } catch (error) {
    next(error);
  }
};
