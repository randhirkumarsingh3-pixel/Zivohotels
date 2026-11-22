import { Prisma } from '@prisma/client';
import prisma from '../../config/db.js';
import ledgerService from './ledgerService.js';

const bad = (message) => Object.assign(new Error(message), { status: 400 });

export const payoutService = {
  /**
   * Processes a payout for a specific hotel
   */
  processPayout: async (hotelId, { reference, adminId } = {}) => {
    // A payout records money ZivoPlus has already sent by bank transfer: it needs the transfer
    // reference (UTR) and a bank account on file (there is no bank integration that sends it).
    const ref = String(reference || '').trim();
    if (ref.length < 6) throw bad('Enter the bank transfer reference (UTR) of the payment you made');
    const bank = await prisma.bankDetail.findUnique({ where: { hotelId }, select: { id: true } });
    if (!bank) throw bad('This property has no bank account on file. Add it before paying out.');
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
        throw bad('Nothing is due yet: no settlement has reached its payout date.');
      }

      // Calculate total using Decimal
      const totalAmount = settlements.reduce(
        (sum, s) => sum.plus(s.netPayable), 
        new Prisma.Decimal(0)
      );

      // Negative Balance Protection: no payout while the hotel owes us money overall (commission on
      // pay-at-hotel stays, refunds); those settlements stay open and net against later stays
      if (totalAmount.isNegative() || totalAmount.isZero()) {
        throw bad(`Nothing to pay: what is due comes to ₹${Number(totalAmount).toLocaleString('en-IN')} after commission owed on pay-at-hotel stays. It carries over to later stays.`);
      }

      // 2. Create Payout record
      const payout = await tx.payout.create({
        data: {
          hotelId,
          totalAmount,
          status: 'SUCCESS',
          reference: ref
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

      await tx.auditLog.create({ data: { action: 'PAYOUT_RECORDED', entityType: 'PAYOUT', entityId: payout.id, userId: adminId || null, details: { hotelId, amount: Number(totalAmount), reference: ref, settlements: settlements.length } } });
      await tx.notification.create({ data: { hotelId, type: 'PAYOUT', title: 'Payout sent', message: `₹${Number(totalAmount).toLocaleString('en-IN')} was sent to your bank account (reference ${ref}) for ${settlements.length} settlement${settlements.length === 1 ? '' : 's'}.`, metadata: { payoutId: payout.id, reference: ref } } });
      return payout;
    });
  },

  /** What is due to a hotel now (payout-cycle date reached) and where it would go. */
  dueFor: async (hotelId) => {
    const [settlements, bank] = await Promise.all([
      prisma.settlement.findMany({ where: { hotelId, OR: [{ status: 'READY' }, { status: 'PENDING', holdUntil: { lte: new Date() } }] }, select: { id: true, netPayable: true, kind: true, holdUntil: true, bookingId: true } }),
      prisma.bankDetail.findUnique({ where: { hotelId }, select: { bankName: true, accountName: true, accountNumber: true, ifscCode: true } }),
    ]);
    const total = settlements.reduce((s, x) => s + Number(x.netPayable), 0);
    return {
      due: Math.round(total * 100) / 100,
      count: settlements.length,
      bank: bank ? { bankName: bank.bankName, accountName: bank.accountName, last4: String(bank.accountNumber).slice(-4), ifsc: bank.ifscCode } : null,
    };
  }
};

export default payoutService;
