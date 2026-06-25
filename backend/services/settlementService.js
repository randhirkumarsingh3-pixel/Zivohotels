import { PrismaClient } from '@prisma/client';
import ledgerService from './ledgerService.js';
import notificationService from './notificationService.js';
import { eventBus, EVENTS } from './eventBus.js';

const prisma = new PrismaClient();

class SettlementService {
  /**
   * Generates a settlement for a booking upon checkout.
   */
  async generateSettlement(bookingId, traceId) {
    return await prisma.$transaction(async (tx) => {
      const booking = await tx.booking.findUnique({
        where: { id: bookingId },
        include: { hotel: true }
      });

      if (!booking) throw new Error('Booking not found');
      if (booking.status !== 'CHECKED_OUT') throw new Error('Settlement can only be generated for CHECKED_OUT bookings');

      // Check if settlement already exists
      const existing = await tx.settlement.findUnique({ where: { bookingId } });
      if (existing) return existing;

      // 1. Calculate Financials
      const grossAmount = booking.totalAmount;
      const commissionRate = booking.hotel.dynamicCommissionRate || 15.0;
      const commissionAmount = (grossAmount * commissionRate) / 100;
      const taxAmount = booking.taxAmount || 0;
      const netPayable = grossAmount - commissionAmount - taxAmount;

      // 2. Determine Payout Eligibility (T+2 logic)
      const payoutCycleDays = parseInt(booking.hotel.payoutCycle?.replace('T+', '') || '2');
      const holdUntil = new Date();
      holdUntil.setDate(holdUntil.getDate() + payoutCycleDays);

      // 3. Create Settlement Record
      const settlement = await tx.settlement.create({
        data: {
          bookingId,
          hotelId: booking.hotelId,
          grossAmount,
          commissionAmount,
          taxAmount,
          netPayable,
          status: 'PENDING',
          holdUntil,
          version: 1
        }
      });

      // 4. Post Ledger Entries (Double-Entry Bookkeeping)
      // Debit: Guest/Sales Account (Asset)
      // Credit: Hotel Payouts Account (Liability)
      // Credit: Zivo Commissions Account (Revenue)
      await ledgerService.postTransaction({
        referenceId: settlement.id,
        referenceType: 'SETTLEMENT',
        traceId,
        description: `Settlement for booking ${booking.bookingRef}`,
        entries: [
          { account: 'SALES_GUEST', type: 'DEBIT', amount: grossAmount },
          { account: `HOTEL_PAYOUT_${booking.hotelId}`, type: 'CREDIT', amount: netPayable },
          { account: 'ZIVO_COMMISSION', type: 'CREDIT', amount: commissionAmount },
          { account: 'TAX_COLLECTED', type: 'CREDIT', amount: taxAmount }
        ]
      });

      // 5. Notify Hotel
      await notificationService.createNotification({
        hotelId: booking.hotelId,
        type: 'SETTLEMENT',
        title: 'New Settlement Generated',
        message: `Settlement of ₹${netPayable.toLocaleString()} generated for booking ${booking.bookingRef}. Eligible for payout on ${holdUntil.toLocaleDateString()}.`,
        metadata: { settlementId: settlement.id, bookingId }
      });

      // 6. Broadcast Real-time Event
      eventBus.emitEvent(EVENTS.SETTLEMENT_CREATED, {
        settlementId: settlement.id,
        bookingId,
        hotelId: booking.hotelId,
        netPayable,
        bookingRef: booking.bookingRef
      }, { traceId });

      return settlement;
    });
  }

  /**
   * Adjusts an existing settlement (e.g., due to dispute or manual override).
   */
  async adjustSettlement(_settlementId, { _adjustmentAmount, _reason, _traceId }) {
     // Logic for SettlementVersion increments and Ledger updates would go here
  }
}

export default new SettlementService();
