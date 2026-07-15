import prisma from '../../config/db.js';


/**
 * Controller for Extranet Financial Operations.
 */
export const getFinancialOverview = async (req, res) => {
  const { hotelId } = req.params;

  try {
    const settlements = await prisma.settlement.findMany({
      where: { hotelId },
      orderBy: { createdAt: 'desc' }
    });

    const pendingSettlements = settlements.filter(s => s.status === 'PENDING');
    const processedPayouts = await prisma.payout.findMany({
      where: { hotelId, status: 'PAID' }
    });

    // Calculate Metrics
    const pendingAmount = pendingSettlements.reduce((sum, s) => sum + Number(s.netPayable), 0);
    const totalEarned = settlements.reduce((sum, s) => sum + Number(s.netPayable), 0);
    const totalPayouts = processedPayouts.reduce((sum, p) => sum + Number(p.totalAmount), 0);

    return res.json({
      success: true,
      data: {
        metrics: {
          pendingAmount,
          totalEarned,
          totalPayouts,
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
    const settlement = await prisma.settlement.findUnique({
      where: { id: settlementId },
      include: {
        booking: {
          include: { roomType: true }
        }
      }
    });

    if (!settlement) return res.status(404).json({ success: false, message: 'Settlement not found' });

    // "Explain Money" Breakdown
    const breakdown = {
      grossBooking: Number(settlement.grossAmount),
      deductions: [
        { label: 'Zivo Commission', amount: Number(settlement.commissionAmount), type: 'COMMISSION' },
        { label: 'Taxes (GST/VAT)', amount: Number(settlement.taxAmount), type: 'TAX' }
      ],
      netPayable: Number(settlement.netPayable),
      payoutEligibility: settlement.holdUntil,
      status: settlement.status
    };

    return res.json({ success: true, data: breakdown });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const getPayoutHistory = async (req, res) => {
  const { hotelId } = req.params;

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
