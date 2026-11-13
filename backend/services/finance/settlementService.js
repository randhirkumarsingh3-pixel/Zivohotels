import { Prisma } from '@prisma/client';
import prisma from '../../config/db.js';
import ledgerService from './ledgerService.js';

const DEFAULT_COMMISSION_PERCENT = 15;
const DAY_MS = 24 * 60 * 60 * 1000;

const startOfDayUtc = (d) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

/**
 * The date a hotel is paid for a stay, given its payout cycle (chosen at onboarding):
 *  - "Weekly"  -> the first Wednesday after check-out
 *  - "15 days" -> the first 1st or 16th of a month after check-out
 *  - "Monthly" -> the 1st of the month after check-out
 *  - "T+N"     -> N days after check-out (older hotels default to T+2)
 * Anything unrecognised is treated as Weekly. Always strictly after the check-out day.
 */
export const nextPayoutDate = (payoutCycle, checkOut) => {
  const day = startOfDayUtc(new Date(checkOut));
  const cycle = String(payoutCycle || '').trim().toLowerCase();

  const tPlus = cycle.match(/^t\s*\+\s*(\d+)$/);
  if (tPlus) return new Date(day.getTime() + Math.max(1, Number(tPlus[1])) * DAY_MS);

  if (cycle === 'monthly') {
    return new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth() + 1, 1));
  }

  if (cycle === '15 days' || cycle === 'fortnightly') {
    if (day.getUTCDate() < 16) return new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), 16));
    return new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth() + 1, 1));
  }

  // Weekly: next Wednesday (getUTCDay() === 3), never the check-out day itself
  const daysAhead = ((3 - day.getUTCDay() + 7) % 7) || 7;
  return new Date(day.getTime() + daysAhead * DAY_MS);
};

/**
 * Money for one completed stay (pure; all values are Prisma.Decimal):
 *  - commission = agreed rate x the pre-GST amount
 *  - collected  = what ZivoHotels took online (paid minus refunded); 0 for pay-at-hotel
 *  - netPayable = collected - commission. Negative means the hotel collected the money itself and
 *    owes ZivoHotels the commission; it is netted against the hotel's next payout.
 */
export const computeStaySettlement = (booking, commissionPercent) => {
  const D = (v) => new Prisma.Decimal(v ?? 0);
  const total = D(booking.totalAmount);
  const tax = D(booking.taxAmount);
  // Older bookings didn't store baseAmount; fall back to total minus tax
  const preTax = D(booking.baseAmount).greaterThan(0) ? D(booking.baseAmount) : total.minus(tax);
  const commission = preTax.times(commissionPercent).dividedBy(100).toDecimalPlaces(2);
  const collected = Prisma.Decimal.max(0, D(booking.paidAmount).minus(D(booking.refundAmount)));
  return { gross: total, preTax, tax, commission, collected, netPayable: collected.minus(commission) };
};

export const settlementService = {
  /**
   * Creates the settlement for a stay when the guest checks out (called inside the check-out
   * transaction). Uses the hotel's agreed commission rate and schedules the payout for the hotel's
   * next payout-cycle date. Idempotent: returns the existing settlement if there is one.
   */
  createForCheckout: async (tx, booking) => {
    const existing = await tx.settlement.findUnique({ where: { bookingId: booking.id } });
    if (existing) return existing;

    const [agreement, hotel] = await Promise.all([
      tx.agreement.findUnique({ where: { hotelId: booking.hotelId } }),
      tx.hotel.findUnique({ where: { id: booking.hotelId }, select: { payoutCycle: true, dynamicCommissionRate: true } }),
    ]);
    const commissionPercent = agreement?.commissionRate ?? hotel?.dynamicCommissionRate ?? DEFAULT_COMMISSION_PERCENT;
    const m = computeStaySettlement(booking, commissionPercent);

    const settlement = await tx.settlement.create({
      data: {
        bookingId: booking.id,
        hotelId: booking.hotelId,
        grossAmount: m.gross,
        commissionAmount: m.commission,
        taxAmount: m.tax,
        netPayable: m.netPayable,
        status: 'PENDING',
        holdUntil: nextPayoutDate(hotel?.payoutCycle, booking.checkOut),
      }
    });

    // Double entry: money collected = hotel's share + ZivoHotels' commission
    const entries = [
      { referenceId: booking.id, account: 'ZIVO', type: 'CREDIT', amount: m.commission, description: `Commission (${commissionPercent}% of pre-GST) for booking ${booking.bookingRef}` },
      m.netPayable.isNegative()
        ? { referenceId: booking.id, account: 'HOTEL', type: 'DEBIT', amount: m.netPayable.abs(), description: `Commission owed by hotel for booking ${booking.bookingRef} (collected at hotel)` }
        : { referenceId: booking.id, account: 'HOTEL', type: 'CREDIT', amount: m.netPayable, description: `Net payable for booking ${booking.bookingRef}` },
    ];
    if (m.collected.greaterThan(0)) {
      entries.push({ referenceId: booking.id, account: 'USER', type: 'DEBIT', amount: m.collected, description: `Payment collected for booking ${booking.bookingRef}` });
    }
    await ledgerService.record(entries.filter((e) => !new Prisma.Decimal(e.amount).isZero()), tx);

    return settlement;
  },

  /** Marks settlements whose payout date has arrived as READY (run by the finance worker). */
  releaseDue: async (now = new Date(), tx = prisma) => {
    return await tx.settlement.updateMany({
      where: { status: 'PENDING', holdUntil: { lte: now } },
      data: { status: 'READY' }
    });
  },

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
