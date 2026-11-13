import prisma from '../../config/db.js';

/**
 * Controller for Extranet Financial Operations.
 *
 * Every handler is scoped to req.scopedHotelId (set by hotelScopeGuard), so an owner only ever
 * sees their own hotel's settlements and payouts.
 *
 * Settlements are created at check-out (services/finance/settlementService.createForCheckout):
 * commission is the agreed rate on the pre-GST amount, netPayable = collected online - commission
 * (negative when the guest paid at the hotel), paid out on the hotel's next payout-cycle date.
 */
export const getFinancialOverview = async (req, res) => {
  const hotelId = req.scopedHotelId;

  try {
    const settlements = await prisma.settlement.findMany({
      where: { hotelId },
      orderBy: { createdAt: 'desc' }
    });

    const openSettlements = settlements.filter(s => ['PENDING', 'READY'].includes(s.status));
    const processedPayouts = await prisma.payout.findMany({
      where: { hotelId, status: 'SUCCESS' }
    });

    // Calculate Metrics
    const pendingAmount = openSettlements.reduce((sum, s) => sum + Number(s.netPayable), 0);
    const totalEarned = settlements.reduce((sum, s) => sum + Number(s.netPayable), 0);
    const totalPayouts = processedPayouts.reduce((sum, p) => sum + Number(p.totalAmount), 0);
    const nextPayoutDate = openSettlements
      .map(s => s.holdUntil)
      .filter(Boolean)
      .sort((a, b) => a - b)[0] || null;

    return res.json({
      success: true,
      data: {
        metrics: {
          pendingAmount,
          totalEarned,
          totalPayouts,
          nextPayoutDate,
          count: settlements.length
        },
        recentSettlements: settlements.slice(0, 10)
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const getSettlementDetails = async (req, res) => {
  const { settlementId } = req.params;

  try {
    const settlement = await prisma.settlement.findUnique({ where: { id: settlementId } });

    // Not found and "another hotel's settlement" look the same to the caller
    if (!settlement || settlement.hotelId !== req.scopedHotelId) {
      return res.status(404).json({ success: false, message: 'Settlement not found' });
    }

    const booking = await prisma.booking.findUnique({
      where: { id: settlement.bookingId },
      select: { bookingRef: true, paymentType: true, paidAmount: true, refundAmount: true }
    });

    const n = (v) => Number(v || 0);
    const gross = n(settlement.grossAmount);
    const tax = n(settlement.taxAmount);
    const commission = n(settlement.commissionAmount);
    const commissionGst = n(settlement.commissionGstAmount);
    const tcs = n(settlement.tcsAmount);
    const tds = n(settlement.tdsAmount);
    const netPayable = n(settlement.netPayable);
    // What ZivoHotels collected online; the rest of the value was paid at the hotel
    const collectedOnline = netPayable + commission + commissionGst + tcs + tds;
    const collectedAtHotel = Math.max(0, gross - collectedOnline);
    const gstSplit = n(settlement.igstAmount) > 0 ? 'IGST' : 'CGST + SGST';
    const kindLabel = { STAY: 'Stay', CANCELLATION: 'Cancellation fee kept', NO_SHOW: 'No-show charge kept' }[settlement.kind] || 'Stay';

    // "Explain Money" Breakdown: grossBooking - deductions = netPayable
    const breakdown = {
      bookingRef: booking?.bookingRef,
      paymentType: booking?.paymentType,
      kind: settlement.kind,
      kindLabel,
      grossBooking: gross,
      preTaxAmount: gross - tax,
      collectedOnline,
      collectedAtHotel,
      deductions: [
        ...(collectedAtHotel > 0
          ? [{ label: 'Paid by the guest at the hotel (already with you)', amount: collectedAtHotel, type: 'COLLECTED_AT_HOTEL' }]
          : []),
        { label: 'Zivo commission (on amount before GST)', amount: commission, type: 'COMMISSION' },
        { label: `GST 18% on commission (${gstSplit})`, amount: commissionGst, type: 'COMMISSION_GST' },
        ...(tcs > 0 ? [{ label: 'TCS 0.5% (GST section 52)', amount: tcs, type: 'TCS' }] : []),
        { label: 'TDS 0.1% (Income Tax section 194-O)', amount: tds, type: 'TDS' }
      ],
      info: [
        { label: 'GST included in booking (remitted by the hotel)', amount: tax, type: 'TAX' }
      ],
      netPayable,
      payoutEligibility: settlement.holdUntil,
      status: settlement.status
    };

    return res.json({ success: true, data: breakdown });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const getPayoutHistory = async (req, res) => {
  const hotelId = req.scopedHotelId;

  try {
    const payouts = await prisma.payout.findMany({
      where: { hotelId },
      orderBy: { createdAt: 'desc' }
    });

    return res.json({ success: true, data: payouts });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
