import { Prisma } from '@prisma/client';
import prisma from '../../config/db.js';
import ledgerService from './ledgerService.js';

export const dashboardService = {
  /**
   * Aggregates real-time financial metrics
   */
  getMetrics: async () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 1. Revenue & Commission (Today)
    const settlementsToday = await prisma.settlement.findMany({
      where: { createdAt: { gte: today } }
    });

    const revenueToday = settlementsToday.reduce((sum, s) => sum.plus(s.grossAmount), new Prisma.Decimal(0));
    const commissionToday = settlementsToday.reduce((sum, s) => sum.plus(s.commissionAmount), new Prisma.Decimal(0));

    // 2. Pending Payouts (Liabilities)
    const pendingSettlements = await prisma.settlement.aggregate({
      where: { status: 'READY' },
      _sum: { netPayable: true }
    });

    // 3. Refunds & Disputes
    const refundsToday = await prisma.transaction.aggregate({
      where: { type: 'REFUND', status: 'SUCCESS', createdAt: { gte: today } },
      _sum: { amount: true }
    });

    const openDisputes = await prisma.dispute.count({ where: { status: 'OPEN' } });

    // 4. Risk & Liquidity Metrics (Phase 8.6 Strategic)
    const walletLiability = await prisma.wallet.aggregate({
      _sum: { balance: true }
    });

    const creditExposure = await prisma.wallet.aggregate({
      _sum: { creditLimit: true }
    });

    const disputedAmount = await prisma.dispute.aggregate({
      where: { status: 'OPEN' },
      _sum: { amount: true }
    });

    // 5. Ledger Health Check
    const ledgerStatus = await ledgerService.validateGlobalBalance();

    return {
      revenueToday: revenueToday.toNumber(),
      commissionToday: commissionToday.toNumber(),
      pendingPayouts: pendingSettlements._sum.netPayable?.toNumber() || 0,
      refundsToday: refundsToday._sum.amount?.toNumber() || 0,
      disputesOpen: openDisputes,
      disputedAmount: disputedAmount._sum.amount?.toNumber() || 0,
      walletLiability: walletLiability._sum.balance?.toNumber() || 0,
      creditExposure: creditExposure._sum.creditLimit?.toNumber() || 0,
      ledgerHealth: ledgerStatus.isValid ? 'BALANCED' : 'IMBALANCED',
      ledgerVariance: ledgerStatus.variance
    };
  }
};

export default dashboardService;
