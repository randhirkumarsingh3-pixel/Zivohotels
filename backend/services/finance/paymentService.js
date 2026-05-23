import { Prisma } from '@prisma/client';
import prisma from '../../config/db.js';
import ledgerService from './ledgerService.js';
import settlementService from './settlementService.js';

export const paymentService = {
  /**
   * Initializes a payment intent/order
   */
  createOrder: async (bookingId, amount, currency = 'INR', gateway = 'RAZORPAY') => {
    const transaction = await prisma.transaction.create({
      data: {
        bookingId,
        type: 'PAYMENT',
        amount: new Prisma.Decimal(amount),
        currency,
        status: 'INITIATED',
        gateway
      }
    });

    return {
      orderId: `ORD_${transaction.id.slice(0, 8)}`,
      amount,
      currency,
      transactionId: transaction.id
    };
  },

  /**
   * Verifies payment and updates transaction status
   */
  verifyPayment: async (transactionId, gatewayRef, status = 'SUCCESS') => {
    return await prisma.transaction.update({
      where: { id: transactionId },
      data: {
        status,
        gatewayRef,
        createdAt: new Date()
      }
    });
  },

  /**
   * Processes a full or partial refund
   */
  processRefund: async (bookingId, amount = null, reason = 'User Cancellation') => {
    return await prisma.$transaction(async (tx) => {
      // 1. Find original successful payment
      const originalTx = await tx.transaction.findFirst({
        where: { bookingId, type: 'PAYMENT', status: 'SUCCESS' }
      });

      if (!originalTx) throw new Error('No successful payment found to refund');

      const refundAmount = amount ? new Prisma.Decimal(amount) : originalTx.amount;
      
      // 2. Create Refund Transaction
      const refundTx = await tx.transaction.create({
        data: {
          bookingId,
          type: 'REFUND',
          amount: refundAmount,
          status: 'SUCCESS',
          gateway: originalTx.gateway,
          gatewayRef: `REF-${originalTx.gatewayRef}-${Date.now()}`
        }
      });

      // 3. Reverse Ledger entries
      // If partial, we calculate proportional reversal or just record the specific refund debit
      await ledgerService.record([
        {
          referenceId: bookingId,
          account: 'USER',
          type: 'CREDIT', // User gets money back
          amount: refundAmount,
          description: `Refund for booking ${bookingId}: ${reason}`
        },
        {
          referenceId: bookingId,
          account: 'ZIVO',
          type: 'DEBIT', // Zivo loses commission
          amount: refundAmount.times(0.15), // Assuming 15% commission reversal
          description: `Commission reversal for refund ${bookingId}`
        },
        {
          referenceId: bookingId,
          account: 'HOTEL',
          type: 'DEBIT', // Hotel loses payout
          amount: refundAmount.times(0.85),
          description: `Payout deduction for refund ${bookingId}`
        }
      ], tx);

      // 4. Adjust Settlement
      await settlementService.adjustForRefund(bookingId, refundAmount, tx);

      return refundTx;
    });
  }
};

export default paymentService;
