import { Prisma } from '@prisma/client';
import prisma from '../../config/db.js';
import ledgerService from './ledgerService.js';

export const payoutService = {
  /**
   * Processes a payout for a specific hotel
   */
  processPayout: async (hotelId) => {
    return await prisma.$transaction(async (tx) => {
      // 1. Settlements whose payout-cycle date has arrived (READY, or PENDING and now due)
      const settlements = await tx.settlement.findMany({
        where: {
          hotelId,
          OR: [
            { status: 'READY' },
            { status: 'PENDING', holdUntil: { lte: new Date() } }
          ]
        }
      });

      if (settlements.length === 0) {
        throw new Error('No settlements ready for payout');
      }

      // Calculate total using Decimal
      const totalAmount = settlements.reduce(
        (sum, s) => sum.plus(s.netPayable), 
        new Prisma.Decimal(0)
      );

      // Negative Balance Protection: no payout while the hotel owes us money overall (commission on
      // pay-at-hotel stays, refunds); those settlements stay open and net against later stays
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
