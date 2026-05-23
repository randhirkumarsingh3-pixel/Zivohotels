import { Prisma } from '@prisma/client';
import prisma from '../../config/db.js';
import ledgerService from './ledgerService.js';

export const payoutQueueService = {
  /**
   * Enqueues a payout with a risk hold buffer
   */
  enqueue: async (hotelId, amount, holdHours = 24) => {
    const holdUntil = new Date();
    holdUntil.setHours(holdUntil.getHours() + holdHours);

    return await prisma.payoutQueue.create({
      data: {
        hotelId,
        amount: new Prisma.Decimal(amount),
        status: 'QUEUED',
        holdUntil
      }
    });
  },

  /**
   * Processes the next batch of payouts (Respecting Hold Buffer)
   */
  processBatch: async () => {
    const queue = await prisma.payoutQueue.findMany({
      where: { 
        status: { in: ['QUEUED', 'FAILED'] }, 
        retries: { lt: 3 },
        holdUntil: { lte: new Date() } // Only process if hold period is over
      },
      take: 10
    });

    for (const item of queue) {
      try {
        await prisma.payoutQueue.update({ where: { id: item.id }, data: { status: 'PROCESSING' } });

        // SIMULATED BANK CALL
        // await razorpay.payouts.create(...)
        const success = Math.random() > 0.1; // 90% success rate for simulation

        if (!success) throw new Error('Bank API Timeout');

        // On Success
        await prisma.$transaction(async (tx) => {
          await tx.payoutQueue.update({ where: { id: item.id }, data: { status: 'SUCCESS' } });
          
          // Finalize payout record and ledger
          const payout = await tx.payout.create({
            data: {
              hotelId: item.hotelId,
              totalAmount: item.amount,
              status: 'SUCCESS',
              reference: `AUTO-PAY-${item.id.slice(0, 8)}`
            }
          });

          await ledgerService.record([{
            referenceId: payout.id,
            account: 'HOTEL',
            type: 'DEBIT',
            amount: item.amount,
            description: `Automated payout ${payout.id}`
          }], tx);
        });

      } catch (error) {
        await prisma.payoutQueue.update({
          where: { id: item.id },
          data: { 
            status: 'FAILED', 
            retries: { increment: 1 },
            error: error.message
          }
        });
      }
    }
  }
};

export default payoutQueueService;
