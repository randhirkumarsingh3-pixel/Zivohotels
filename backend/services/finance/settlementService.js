import { Prisma } from '@prisma/client';
import prisma from '../../config/db.js';
import ledgerService from './ledgerService.js';
import {
  COMMISSION_GST_PERCENT, TCS_PERCENT, TDS_PERCENT, DEFAULT_COMMISSION_PERCENT,
  zivoGstStateCode, hotelGstStateCode,
} from '../../constants/finance.js';

const DAY_MS = 24 * 60 * 60 * 1000;

// Booking dates are calendar days in India. Depending on the server's time zone they are stored at
// midnight UTC or midnight IST (18:30 UTC the day before), so read the day on the India calendar.
const IST_OFFSET_MS = 330 * 60 * 1000;
const startOfDayUtc = (d) => {
  const ist = new Date(d.getTime() + IST_OFFSET_MS);
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()));
};

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

const D = (v) => new Prisma.Decimal(v ?? 0);
const pct = (amount, percent) => D(amount).times(percent).dividedBy(100).toDecimalPlaces(2);

/**
 * Money the hotel is owed for one settlement (pure; all values are Prisma.Decimal).
 *
 * @param {Object} input
 * @param {number} input.grossAmount   value the hotel earns, GST included (the stay, or the
 *                                     cancellation / no-show amount kept)
 * @param {number} input.taxAmount     GST included in grossAmount
 * @param {number} input.collected     part of grossAmount ZivoHotels collected online (0 for pay-at-hotel)
 * @param {number} input.commissionPercent  the hotel's agreed rate
 * @param {boolean} input.hotelGstRegistered TCS applies only to GST-registered hotels
 * @param {boolean} input.sameState    ZivoHotels and the hotel in the same state -> CGST+SGST, else IGST
 *
 * netPayable = collected - commission - GST on commission - TCS - TDS. Negative means the hotel
 * holds the money (pay-at-hotel) and owes ZivoHotels; it is netted against later payouts.
 */
export const computeSettlement = ({ grossAmount, taxAmount, collected, commissionPercent, hotelGstRegistered, sameState }) => {
  const gross = D(grossAmount);
  const tax = D(taxAmount);
  const preTax = gross.minus(tax);
  const collectedOnline = Prisma.Decimal.min(gross, Prisma.Decimal.max(0, D(collected)));

  const commission = pct(preTax, commissionPercent);
  let cgst = D(0), sgst = D(0), igst = D(0);
  if (sameState) {
    cgst = pct(commission, COMMISSION_GST_PERCENT / 2);
    sgst = pct(commission, COMMISSION_GST_PERCENT / 2);
  } else {
    igst = pct(commission, COMMISSION_GST_PERCENT);
  }
  const commissionGst = cgst.plus(sgst).plus(igst);

  // TCS on the pre-GST value of what was collected online (proportionally), registered hotels only
  const collectedPreTax = gross.isZero() ? D(0) : preTax.times(collectedOnline).dividedBy(gross);
  const tcs = hotelGstRegistered ? pct(collectedPreTax, TCS_PERCENT) : D(0);
  const tds = pct(preTax, TDS_PERCENT);

  const netPayable = collectedOnline.minus(commission).minus(commissionGst).minus(tcs).minus(tds);
  return { gross, preTax, tax, collected: collectedOnline, commission, cgst, sgst, igst, commissionGst, tcs, tds, netPayable };
};

/** A checked-out stay: the whole booking value; collected = paid minus refunded. */
export const staySettlementInput = (booking) => {
  const total = D(booking.totalAmount);
  const tax = D(booking.taxAmount);
  return {
    grossAmount: total,
    taxAmount: tax,
    collected: D(booking.paidAmount).minus(D(booking.refundAmount)),
  };
};

/**
 * A cancellation fee or no-show charge the guest paid and didn't get back. The GST in it is taken
 * pro rata from the booking; all of it was collected online.
 */
export const retainedSettlementInput = (booking, retainedAmount) => {
  const total = D(booking.totalAmount);
  const retained = D(retainedAmount);
  const tax = total.isZero() ? D(0) : D(booking.taxAmount).times(retained).dividedBy(total).toDecimalPlaces(2);
  return { grossAmount: retained, taxAmount: tax, collected: retained };
};

const KIND_LABEL = { STAY: 'stay', CANCELLATION: 'cancellation fee', NO_SHOW: 'no-show charge' };

/**
 * Writes a settlement and its balanced ledger entries. Commission rate: the hotel's agreement,
 * else its own rate, else 15%. Paid on the hotel's next payout-cycle date after the (scheduled)
 * check-out. Idempotent per booking.
 */
const createSettlementRecord = async (tx, booking, kind, input) => {
  const existing = await tx.settlement.findUnique({ where: { bookingId: booking.id } });
  if (existing) return existing;

  const [agreement, hotel] = await Promise.all([
    tx.agreement.findUnique({ where: { hotelId: booking.hotelId } }),
    tx.hotel.findUnique({
      where: { id: booking.hotelId },
      select: { payoutCycle: true, dynamicCommissionRate: true, gstin: true, state: true }
    }),
  ]);
  const commissionPercent = agreement?.commissionRate ?? hotel?.dynamicCommissionRate ?? DEFAULT_COMMISSION_PERCENT;
  const zivoState = zivoGstStateCode();
  const hotelState = hotelGstStateCode(hotel);
  const sameState = Boolean(zivoState && hotelState && zivoState === hotelState);
  const m = computeSettlement({
    ...input,
    commissionPercent,
    hotelGstRegistered: Boolean(hotel?.gstin && String(hotel.gstin).trim()),
    sameState,
  });

  const settlement = await tx.settlement.create({
    data: {
      bookingId: booking.id,
      hotelId: booking.hotelId,
      kind,
      grossAmount: m.gross,
      commissionAmount: m.commission,
      taxAmount: m.tax,
      commissionGstAmount: m.commissionGst,
      cgstAmount: m.cgst,
      sgstAmount: m.sgst,
      igstAmount: m.igst,
      tcsAmount: m.tcs,
      tdsAmount: m.tds,
      placeOfSupply: hotelState,
      netPayable: m.netPayable,
      status: 'PENDING',
      holdUntil: nextPayoutDate(hotel?.payoutCycle, booking.checkOut),
    }
  });

  // Double entry: collected online = hotel share + commission + GST on it + TCS + TDS
  const ref = booking.id;
  const what = `${KIND_LABEL[kind]} for booking ${booking.bookingRef}`;
  const entries = [
    { referenceId: ref, account: 'ZIVO', type: 'CREDIT', amount: m.commission, description: `Commission (${commissionPercent}% of pre-GST) on ${what}` },
    { referenceId: ref, account: 'GST_ON_COMMISSION', type: 'CREDIT', amount: m.commissionGst, description: `GST ${COMMISSION_GST_PERCENT}% on commission (${sameState ? 'CGST+SGST' : 'IGST'}), ${what}` },
    { referenceId: ref, account: 'TCS_PAYABLE', type: 'CREDIT', amount: m.tcs, description: `TCS ${TCS_PERCENT}% on ${what}` },
    { referenceId: ref, account: 'TDS_PAYABLE', type: 'CREDIT', amount: m.tds, description: `TDS ${TDS_PERCENT}% (194-O) on ${what}` },
    m.netPayable.isNegative()
      ? { referenceId: ref, account: 'HOTEL', type: 'DEBIT', amount: m.netPayable.abs(), description: `Owed by hotel (collected at hotel), ${what}` }
      : { referenceId: ref, account: 'HOTEL', type: 'CREDIT', amount: m.netPayable, description: `Net payable, ${what}` },
    { referenceId: ref, account: 'USER', type: 'DEBIT', amount: m.collected, description: `Collected online, ${what}` },
  ];
  await ledgerService.record(entries.filter((e) => !D(e.amount).isZero()), tx);

  return settlement;
};

export const settlementService = {
  /** Settlement for a stay, created inside the check-out transaction. */
  createForCheckout: async (tx, booking) =>
    createSettlementRecord(tx, booking, 'STAY', staySettlementInput(booking)),

  /**
   * Settlement for money the guest paid and doesn't get back: the cancellation fee under the
   * property's policy (kind CANCELLATION) or a no-show (kind NO_SHOW). Nothing if nothing was kept.
   */
  createForRetained: async (tx, booking, kind, retainedAmount) => {
    if (!D(retainedAmount).greaterThan(0)) return null;
    return createSettlementRecord(tx, booking, kind, retainedSettlementInput(booking, retainedAmount));
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
