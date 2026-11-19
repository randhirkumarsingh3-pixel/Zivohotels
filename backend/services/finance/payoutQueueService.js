import { Prisma } from '@prisma/client';
import prisma from '../../config/db.js';

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
   * Automatic payouts are not connected to a bank yet. This used to mark queued payouts as paid
   * after a simulated bank call (a random 90% "success"), which would record money as sent that
   * never left the account. Until a payout provider (e.g. RazorpayX) is integrated, nothing is
   * paid here: hotels are paid by bank transfer and recorded in Admin → Wallet Control with the
   * transfer reference (payoutService.processPayout).
   */
  processBatch: async () => {
    const waiting = await prisma.payoutQueue.count({ where: { status: { in: ['QUEUED', 'FAILED'] } } });
    if (waiting) console.warn(`[Payouts] ${waiting} queued payout(s): automatic payouts are not connected to a bank. Pay them by transfer and record them in Admin → Wallet Control.`);
    return { processed: 0, waiting };
  }
};

export default payoutQueueService;
