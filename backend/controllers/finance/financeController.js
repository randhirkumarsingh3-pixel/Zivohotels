import { Prisma } from '@prisma/client';
import prisma from '../../config/db.js';
import payoutService from '../../services/finance/payoutService.js';
import dashboardService from '../../services/finance/dashboardService.js';
import walletService from '../../services/finance/walletService.js';

export const financeController = {
  getDashboardMetrics: async (req, res) => {
    try {
      const metrics = await dashboardService.getMetrics();
      res.json({ success: true, data: metrics });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  },

  getWallet: async (req, res) => {
    try {
      const { ownerId, type } = req.query; // ownerId can be userId or hotelId
      const wallet = await walletService.getOrCreateWallet(ownerId, type);
      const transactions = await prisma.walletTransaction.findMany({
        where: { walletId: wallet.id },
        orderBy: { createdAt: 'desc' },
        take: 50
      });
      res.json({ success: true, data: { ...wallet, transactions } });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  },

  getFraudLogs: async (req, res) => {
    try {
      const logs = await prisma.fraudLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: 100
      });
      res.json({ success: true, data: logs });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  },

  getSettlements: async (req, res) => {
// ...
    const settlements = await prisma.settlement.findMany({
      include: { bookingId: true } // Simplified
    });
    res.json({ success: true, data: settlements });
  },

  getTransactions: async (req, res) => {
    const transactions = await prisma.transaction.findMany({
      orderBy: { createdAt: 'desc' }
    });
    res.json({ success: true, data: transactions });
  },

  processPayout: async (req, res) => {
    const { hotelId } = req.body;
    try {
      const payout = await payoutService.processPayout(hotelId);
      res.json({ success: true, data: payout });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message });
    }
  }
};

export default financeController;
