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

    const gross = Number(settlement.grossAmount);
    const tax = Number(settlement.taxAmount);
    const commission = Number(settlement.commissionAmount);
    const netPayable = Number(settlement.netPayable);
    // What ZivoHotels collected online; the rest of the booking value was paid at the hotel
    const collectedOnline = netPayable + commission;

    // "Explain Money" Breakdown
    const breakdown = {
      bookingRef: booking?.bookingRef,
      paymentType: booking?.paymentType,
      grossBooking: gross,
      preTaxAmount: gross - tax,
      collectedOnline,
      collectedAtHotel: Math.max(0, gross - collectedOnline),
      // grossBooking - deductions = netPayable
      deductions: [
        ...(gross - collectedOnline > 0
          ? [{ label: 'Paid by the guest at the hotel (already with you)', amount: gross - collectedOnline, type: 'COLLECTED_AT_HOTEL' }]
          : []),
        { label: 'Zivo Commission (on amount before GST)', amount: commission, type: 'COMMISSION' }
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
