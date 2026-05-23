import prisma from '../../config/db.js';

export const forecastingService = {
  /**
   * Predicts demand for a city on a specific date
   */
  getForecast: async (city, date) => {
    // 1. Check if we have a stored forecast
    const forecast = await prisma.demandForecast.findUnique({
      where: { city_date: { city, date: new Date(date) } }
    });

    if (forecast) return forecast;

    // 2. Fallback: Simple heuristic based on historical bookings
    const historicalBookings = await prisma.booking.count({
      where: { hotel: { city }, createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } }
    });

    return {
      city,
      date,
      predictedDemand: historicalBookings > 10 ? 0.8 : 0.5,
      confidence: 0.6
    };
  }
};

export default forecastingService;
