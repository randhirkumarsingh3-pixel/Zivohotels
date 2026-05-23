import prisma from '../../config/db.js';
import ledgerService from './ledgerService.js';

export const disputeService = {
  /**
   * Registers a new dispute/chargeback
   */
  createDispute: async (transactionId, reason) => {
    return await prisma.$transaction(async (tx) => {
      const originalTx = await tx.transaction.findUnique({
        where: { id: transactionId }
      });

      if (!originalTx) throw new Error('Transaction not found');

      // 1. Create Dispute record
      const dispute = await tx.dispute.create({
        data: {
          transactionId,
          bookingId: originalTx.bookingId,
          amount: originalTx.amount,
          reason,
          status: 'OPEN'
        }
      });

      // 2. Update Transaction status
      await tx.transaction.update({
        where: { id: transactionId },
        data: { status: 'DISPUTED' }
      });

      // 3. Freeze Payout (if not already paid)
      await tx.settlement.updateMany({
        where: { bookingId: originalTx.bookingId, status: 'READY' },
        data: { status: 'PENDING' } // Revert to pending to block payout
      });

      // 4. Record Dispute Ledger (ZIVO Debit -> Reserve)
      await ledgerService.record([
        {
          referenceId: dispute.id,
          account: 'ZIVO',
          type: 'DEBIT',
          amount: originalTx.amount,
          description: `Dispute ${dispute.id} reserve hold`
        }
      ], tx);

      return dispute;
    });
  },

  /**
   * Resolves a dispute
   */
  resolveDispute: async (disputeId, resolution) => {
    // Logic to either finalize reversal or release the hold
  }
};

export default disputeService;
