import prisma from '../../config/db.js';

export const analyticsService = {
  /**
   * Tracks a new session
   */
  startSession: async (userId, platform, city) => {
    return await prisma.sessionLog.create({
      data: { userId, platform, city, sessionId: `SESS-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` }
    });
  },

  /**
   * Calculates Revenue Per Session (RPS)
   */
  calculateRPS: async (timeRangeDays = 30) => {
    const startDate = new Date(Date.now() - timeRangeDays * 24 * 60 * 60 * 1000);

    const totalSessions = await prisma.sessionLog.count({
      where: { createdAt: { gte: startDate } }
    });

    const totalRevenue = await prisma.settlement.aggregate({
      where: { createdAt: { gte: startDate } },
      _sum: { grossAmount: true }
    });

    if (totalSessions === 0) return 0;

    const rps = (totalRevenue._sum.grossAmount?.toNumber() || 0) / totalSessions;
    return { rps, totalSessions, totalRevenue: totalRevenue._sum.grossAmount };
  }
};

export default analyticsService;
