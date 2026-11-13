import { Prisma } from '@prisma/client';
import prisma from '../../config/db.js';

export const settlementService = {
  /**
   * Creates a pending settlement for a booking
   */
  createSettlement: async (data, tx = prisma) => {
    const { bookingId, hotelId, grossAmount, commissionPercent, taxAmount, taxPercent } = data;

    const gross = new Prisma.Decimal(grossAmount);
    const commission = gross.times(commissionPercent).dividedBy(100).toDecimalPlaces(2);
    // Prefer the GST actually charged on the booking; taxPercent is the old flat-rate fallback
    const tax = taxAmount !== undefined && taxAmount !== null
      ? new Prisma.Decimal(taxAmount)
      : gross.times(taxPercent || 0).dividedBy(100).toDecimalPlaces(2);
    const netPayable = gross.minus(commission);

    return await tx.settlement.create({
      data: {
        bookingId,
        hotelId,
        grossAmount: gross,
        commissionAmount: commission,
        taxAmount: tax,
        netPayable,
        status: 'PENDING'
      }
    });
  },

  /**
   * Adjusts settlement when a refund is issued
   */
  adjustForRefund: async (bookingId, refundAmount, tx = prisma) => {
    const settlement = await tx.settlement.findUnique({ where: { bookingId } });
    if (!settlement) return;

    // Deduct from netPayable (Hotel bears the brunt of the refund)
    // In a real system, you might split it with Zivo (commission reversal)
    const newNetPayable = Prisma.Decimal.max(0, settlement.netPayable.minus(refundAmount.times(0.85)));

    return await tx.settlement.update({
      where: { bookingId },
      data: { 
        netPayable: newNetPayable,
        status: newNetPayable.isZero() ? 'PAID' : settlement.status // If zeroed out, it's effectively settled
      }
    });
  },

  /**
   * Marks a settlement as READY for payout (e.g., after user check-out)
   */
  markReady: async (bookingId) => {
    return await prisma.settlement.updateMany({
      where: { bookingId, status: 'PENDING' },
      data: { status: 'READY' }
    });
  }
};

export default settlementService;
