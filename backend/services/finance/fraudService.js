import prisma from '../../config/db.js';
import fraudModel from './fraudModel.js';

export const fraudService = {
  /**
   * Evaluates a context for potential fraud risk using the advanced model
   */
  evaluateRisk: async (userId, bookingContext) => {
    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // 1. Feature Building
    const failedPayments = await prisma.transaction.count({
      where: { userId, status: 'FAILED', createdAt: { gte: last24h } }
    });

    const totalTx = await prisma.transaction.count({ where: { userId } });
    const refundTx = await prisma.transaction.count({ where: { userId, type: 'REFUND' } });
    const refundRate = totalTx > 0 ? (refundTx / totalTx) : 0;

    const bookingVelocity = await prisma.booking.count({
      where: { userId, createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) } }
    });

    const features = {
      failedPayments,
      refundRate,
      bookingVelocity,
      deviceRisk: bookingContext.deviceRisk || 0
    };

    // 2. Scoring
    const riskScore = fraudModel.score(features);
    const _status = fraudModel.evaluate(riskScore);

    return { 
      riskScore, 
      reasons: [],
      status: riskScore >= 85 ? 'BLOCKED' : (riskScore >= 50 ? 'VERIFICATION_REQUIRED' : 'FLAGGED'),
      isBlocked: riskScore >= 85 
    };
  },

  /**
   * Risk Decay Logic: Older fraud logs carry less weight
   */
  getWeightedRisk: async (userId) => {
    const logs = await prisma.fraudLog.findMany({
      where: { userId, createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } } // Last 30 days
    });

    return logs.reduce((score, log) => {
      const daysOld = (Date.now() - new Date(log.createdAt).getTime()) / (24 * 60 * 60 * 1000);
      const weight = Math.max(0, 1 - (daysOld / 30)); // 30-day linear decay
      return score + (log.riskScore * weight);
    }, 0);
  }
};

export default fraudService;
