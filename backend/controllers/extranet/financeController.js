import prisma from '../../config/db.js';
import financeDocs from '../../services/finance/financeDocuments.js';

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

    // Each settlement with its booking (reference, guest, stay dates), so the list says what it was for
    const recent = settlements.slice(0, 100);
    const bookings = await prisma.booking.findMany({ where: { id: { in: recent.map((s) => s.bookingId) } }, select: { id: true, bookingRef: true, guestName: true, checkIn: true, checkOut: true, paymentType: true } });
    const byId = new Map(bookings.map((b) => [b.id, b]));

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
        recentSettlements: recent.map((s) => ({ ...s, booking: byId.get(s.bookingId) || null }))
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
    // What ZivoPlus collected online; the rest of the value was paid at the hotel
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
      payoutDate: settlement.payoutDate,
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

// ─── Finance Hub: statement, documents, earnings, tax ────────────────────────────────────────────

const num = (v) => Number(v || 0);

/** Everything the Finance Hub shows for one month of the hotel in scope. */
export const getFinanceHub = async (req, res) => {
  try {
    const hotelId = req.scopedHotelId;
    const period = financeDocs.validPeriod(req.query.period) ? String(req.query.period) : financeDocs.currentPeriod();
    const [statement, earnings, tax, documents, bank, due] = await Promise.all([
      financeDocs.statementFor(hotelId, period),
      financeDocs.earningsByMonth(hotelId, 12),
      financeDocs.taxByQuarter(hotelId),
      prisma.financeDocument.findMany({ where: { hotelId }, orderBy: { issueDate: 'desc' }, take: 60, select: { id: true, kind: true, number: true, period: true, issueDate: true, total: true, live: true, originalId: true, reason: true } }),
      prisma.bankDetail.findUnique({ where: { hotelId }, select: { bankName: true, accountNumber: true, ifscCode: true, accountName: true } }),
      prisma.settlement.findMany({ where: { hotelId, status: { in: ['PENDING', 'READY'] } }, select: { netPayable: true, holdUntil: true, status: true } }),
    ]);
    const now = new Date();
    const adjustments = await prisma.hotelAdjustment.findMany({ where: { hotelId, status: 'PENDING' }, select: { amount: true } });
    const dueNow = due.filter((s) => s.status === 'READY' || (s.holdUntil && new Date(s.holdUntil) <= now)).reduce((a, s) => a + num(s.netPayable), 0) + adjustments.reduce((a, x) => a + num(x.amount), 0);
    const held = due.filter((s) => !(s.status === 'READY' || (s.holdUntil && new Date(s.holdUntil) <= now)));
    const nextDate = held.map((s) => s.holdUntil).filter(Boolean).sort((a, b) => new Date(a) - new Date(b))[0] || null;
    // Hotel teams see only what's theirs; ZivoPlus' internal ids stay out
    const { supplier, recipient, ...rest } = statement;
    res.json({
      success: true,
      data: {
        ...rest,
        recipient: { legalName: recipient.legalName, property: recipient.property, gstin: recipient.gstin, pan: recipient.pan, stateName: recipient.stateName },
        zivo: { legalName: supplier.legalName, gstin: supplier.gstin, tan: supplier.tan, tcsGstin: supplier.tcsGstin },
        earnings, tax,
        documents: documents.map((d) => ({ ...d, total: num(d.total) })),
        balance: { dueNow: Math.round(dueNow * 100) / 100, onHold: Math.round(held.reduce((a, s) => a + num(s.netPayable), 0) * 100) / 100, nextDate },
        bank: bank ? { bankName: bank.bankName, last4: String(bank.accountNumber).slice(-4), ifsc: bank.ifscCode, accountName: bank.accountName } : null,
      },
    });
  } catch (error) {
    res.status(error.status || 500).json({ success: false, message: error.message });
  }
};

export const downloadFinanceDocument = async (req, res) => {
  try {
    const d = await prisma.financeDocument.findUnique({ where: { id: req.params.id } });
    if (!d || d.hotelId !== req.scopedHotelId) return res.status(404).json({ success: false, message: 'Document not found' });
    const pdf = await financeDocs.documentPdf(d);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${d.number.replace(/\//g, '-')}.pdf"`);
    res.send(pdf);
  } catch (error) {
    res.status(error.status || 500).json({ success: false, message: error.message });
  }
};

export const downloadStatement = async (req, res) => {
  try {
    const { period, format } = req.query;
    if (!financeDocs.validPeriod(period)) return res.status(400).json({ success: false, message: 'Choose a month' });
    const xlsx = format === 'xlsx';
    const buf = xlsx ? await financeDocs.statementWorkbook(req.scopedHotelId, period) : await financeDocs.statementPdf(req.scopedHotelId, period);
    res.setHeader('Content-Type', xlsx ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="ZivoPlus-Statement-${period}.${xlsx ? 'xlsx' : 'pdf'}"`);
    res.send(buf);
  } catch (error) {
    res.status(error.status || 500).json({ success: false, message: error.message });
  }
};
