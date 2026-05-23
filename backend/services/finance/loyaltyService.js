import prisma from '../../config/db.js';
import walletService from './walletService.js';

export const loyaltyService = {
  /**
   * Calculates points to earn for a booking amount
   */
  calculateEarnedPoints: (amount) => {
    return Math.floor(amount / 100); // 1 point per 100 INR
  },

  /**
   * Adds loyalty points to a user
   */
  awardPoints: async (userId, points, source = 'BOOKING') => {
    return await prisma.loyaltyPoint.create({
      data: { userId, points, source }
    });
  },

  /**
   * Converts points to wallet credit
   * 100 points = 10 INR
   */
  redeemPoints: async (userId, pointsToRedeem) => {
    const userPoints = await prisma.loyaltyPoint.aggregate({
      where: { userId },
      _sum: { points: true }
    });

    const totalAvailable = userPoints._sum.points || 0;
    if (totalAvailable < pointsToRedeem) throw new Error('Insufficient points');

    const creditAmount = (pointsToRedeem / 100) * 10;
    
    return await prisma.$transaction(async (tx) => {
      // 1. Deduct Points (Negative record)
      await tx.loyaltyPoint.create({
        data: { userId, points: -pointsToRedeem, source: 'REDEMPTION' }
      });

      // 2. Credit Wallet
      const wallet = await walletService.getOrCreateWallet(userId, 'USER');
      return await walletService.adjustBalance(wallet.id, 'CREDIT', creditAmount, 'LOYALTY_REDEMPTION', tx);
    });
  }
};

export default loyaltyService;
