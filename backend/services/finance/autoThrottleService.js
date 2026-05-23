import prisma from '../../config/db.js';

export const autoThrottleService = {
  /**
   * Evaluates system-wide and hotel-level anomalies
   */
  monitorAnomalies: async () => {
    console.log('[AutoThrottle] Monitoring for anomalies...');

    const lastHour = new Date(Date.now() - 60 * 60 * 1000);

    // 1. Check for global refund spike
    const refundCount = await prisma.transaction.count({
      where: { type: 'REFUND', createdAt: { gte: lastHour } }
    });

    if (refundCount > 50) { // Threshold for anomaly
      console.warn('🚨 [AutoThrottle] Global refund spike detected. Enabling SAFE_MODE.');
      await prisma.appState.updateMany({ data: { safeMode: true } });
    }

    // 2. Check for hotel-level issues
    const hotels = await prisma.hotel.findMany({ select: { id: true } });

    for (const hotel of hotels) {
      const hotelRefunds = await prisma.transaction.count({
        where: { bookingId: { in: (await prisma.booking.findMany({ where: { hotelId: hotel.id }, select: { id: true } })).map(b => b.id) }, type: 'REFUND', createdAt: { gte: lastHour } }
      });

      if (hotelRefunds > 5) {
        console.warn(`🚨 [AutoThrottle] Hotel ${hotel.id} anomaly detected. Throttling...`);
        await prisma.hotel.update({
          where: { id: hotel.id },
          data: { isThrottled: true, dynamicCommissionRate: 25.0 } // Penalize/Protect
        });
      }
    }
  }
};

export default autoThrottleService;
