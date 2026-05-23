import prisma from '../../config/db.js';

export const reconciliationService = {
  /**
   * Performs a system-wide financial integrity check
   */
  run: async () => {
    console.log('[Reconciliation] Starting integrity check...');
    const issues = [];

    // 1. Check: Booking without Transaction
    const bookingsWithoutPayments = await prisma.booking.findMany({
      where: {
        status: 'CONFIRMED',
        NOT: {
          id: { in: (await prisma.transaction.findMany({ where: { status: 'SUCCESS' }, select: { bookingId: true } })).map(t => t.bookingId) }
        }
      }
    });

    if (bookingsWithoutPayments.length > 0) {
      issues.push({
        type: 'MISSING_PAYMENT',
        count: bookingsWithoutPayments.length,
        ids: bookingsWithoutPayments.map(b => b.id)
      });
    }

    // 2. Check: Transaction without Settlement
    const orphanPayments = await prisma.transaction.findMany({
      where: {
        status: 'SUCCESS',
        type: 'PAYMENT',
        NOT: {
          bookingId: { in: (await prisma.settlement.findMany({ select: { bookingId: true } })).map(s => s.bookingId) }
        }
      }
    });

    if (orphanPayments.length > 0) {
      issues.push({
        type: 'MISSING_SETTLEMENT',
        count: orphanPayments.length,
        ids: orphanPayments.map(p => p.id)
      });
    }

    // 3. Check: Ledger Balance
    // Sum of all Ledger entries for a referenceId should balance in a closed circuit
    // (User Debit = Hotel Credit + Zivo Credit)

    console.log(`[Reconciliation] Complete. Found ${issues.length} issues.`);
    return { success: true, issues };
  }
};

export default reconciliationService;
