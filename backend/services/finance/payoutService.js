import { Prisma } from '@prisma/client';
import prisma from '../../config/db.js';
import ledgerService from './ledgerService.js';

export const payoutService = {
  /**
   * Processes a payout for a specific hotel
   */
  processPayout: async (hotelId) => {
    return await prisma.$transaction(async (tx) => {
      // 1. Fetch all READY settlements
      const settlements = await tx.settlement.findMany({
        where: { hotelId, status: 'READY' }
      });

      if (settlements.length === 0) {
        throw new Error('No settlements ready for payout');
      }

      // Calculate total using Decimal
      const totalAmount = settlements.reduce(
        (sum, s) => sum.plus(s.netPayable), 
        new Prisma.Decimal(0)
      );

      // Negative Balance Protection: Prevent payouts if the hotel owes us money (due to refunds)
      if (totalAmount.isNegative() || totalAmount.isZero()) {
        throw new Error(`Insufficient balance for payout: ${totalAmount.toString()}`);
      }

      // 2. Create Payout record
      const payout = await tx.payout.create({
        data: {
          hotelId,
          totalAmount,
          status: 'SUCCESS',
          reference: `PAY-${Date.now()}`
        }
      });

      // 3. Mark settlements as PAID
      await tx.settlement.updateMany({
        where: { id: { in: settlements.map(s => s.id) } },
        data: { status: 'PAID', payoutDate: new Date() }
      });

      // 4. Record Ledger entry (HOTEL Debit -> Payout)
      await ledgerService.record([
        {
          referenceId: payout.id,
          account: 'HOTEL',
          type: 'DEBIT',
          amount: totalAmount,
          description: `Payout ${payout.id} processed`
        }
      ], tx);

      return payout;
    });
  }
};

export default payoutService;
