import { expect } from 'chai';
import {
  settlementService, nextPayoutDate, computeSettlement, staySettlementInput, retainedSettlementInput,
} from '../../services/finance/settlementService.js';

// Minimal stand-in for a Prisma transaction: returns what would be written.
const fakeTx = { settlement: { create: async ({ data }) => data } };

describe('settlementService.createSettlement', () => {
  it('records the GST actually charged on the booking', async () => {
    const s = await settlementService.createSettlement(
      { bookingId: 'b1', hotelId: 'h1', grossAmount: 20060, commissionPercent: 15, taxAmount: 3060 },
      fakeTx
    );
    expect(s.taxAmount.toString()).to.equal('3060');
    expect(s.commissionAmount.toString()).to.equal('3009');
    expect(s.netPayable.toString()).to.equal('17051');
  });

  it('rounds commission to the paisa', async () => {
    const s = await settlementService.createSettlement(
      { bookingId: 'b1', hotelId: 'h1', grossAmount: 1234.57, commissionPercent: 15, taxAmount: 0 },
      fakeTx
    );
    expect(s.commissionAmount.toString()).to.equal('185.19');
  });

  it('falls back to a flat tax percentage when no tax amount is given', async () => {
    const s = await settlementService.createSettlement(
      { bookingId: 'b1', hotelId: 'h1', grossAmount: 1000, commissionPercent: 15, taxPercent: 12 },
      fakeTx
    );
    expect(s.taxAmount.toString()).to.equal('120');
  });
});


const ymd = (d) => d.toISOString().slice(0, 10);

describe('nextPayoutDate (payout cycle after check-out)', () => {
  // 2026-12-16 is a Wednesday
  it('Weekly: the next Wednesday, never the check-out day itself', () => {
    expect(ymd(nextPayoutDate('Weekly', '2026-12-14'))).to.equal('2026-12-16'); // Mon -> Wed
    expect(ymd(nextPayoutDate('Weekly', '2026-12-16'))).to.equal('2026-12-23'); // Wed -> next Wed
    expect(ymd(nextPayoutDate('Weekly', '2026-12-19'))).to.equal('2026-12-23'); // Sat -> Wed
  });

  it('15 days: the next 1st or 16th', () => {
    expect(ymd(nextPayoutDate('15 days', '2026-12-03'))).to.equal('2026-12-16');
    expect(ymd(nextPayoutDate('15 days', '2026-12-16'))).to.equal('2027-01-01');
    expect(ymd(nextPayoutDate('15 days', '2026-12-31'))).to.equal('2027-01-01');
  });

  it('Monthly: the 1st of the following month', () => {
    expect(ymd(nextPayoutDate('Monthly', '2026-12-01'))).to.equal('2027-01-01');
    expect(ymd(nextPayoutDate('Monthly', '2026-12-31'))).to.equal('2027-01-01');
  });

  it('T+N: N days after check-out; unknown cycles fall back to Weekly', () => {
    expect(ymd(nextPayoutDate('T+2', '2026-12-20'))).to.equal('2026-12-22');
    expect(ymd(nextPayoutDate(null, '2026-12-14'))).to.equal('2026-12-16');
  });

  it('uses the India calendar day whether the check-out was stored at midnight UTC or IST', () => {
    expect(ymd(nextPayoutDate('T+2', '2026-11-15T00:00:00Z'))).to.equal('2026-11-17');
    expect(ymd(nextPayoutDate('T+2', '2026-11-14T18:30:00Z'))).to.equal('2026-11-17'); // 15 Nov 00:00 IST
  });
});

describe('computeSettlement (commission, GST on commission, TCS, TDS)', () => {
  const booking = { totalAmount: 20060, baseAmount: 17000, taxAmount: 3060, paidAmount: 20060, refundAmount: 0 };
  const run = (b, rate, opts = {}) =>
    computeSettlement({ ...staySettlementInput(b), commissionPercent: rate, hotelGstRegistered: true, sameState: true, ...opts });

  it('prepaid stay: agreed rate on pre-GST amount, 18% GST on it (CGST+SGST), TCS 0.5%, TDS 0.1%', () => {
    const m = run(booking, 12);
    expect(m.commission.toString()).to.equal('2040'); // 12% of 17,000
    expect(m.cgst.toString()).to.equal('183.6');
    expect(m.sgst.toString()).to.equal('183.6');
    expect(m.igst.toString()).to.equal('0');
    expect(m.tcs.toString()).to.equal('85'); // 0.5% of 17,000
    expect(m.tds.toString()).to.equal('17'); // 0.1% of 17,000
    expect(m.netPayable.toString()).to.equal('17550.8');
  });

  it('different states: IGST 18%; unregistered hotel: no TCS', () => {
    const m = run(booking, 12, { sameState: false, hotelGstRegistered: false });
    expect(m.igst.toString()).to.equal('367.2');
    expect(m.cgst.toString()).to.equal('0');
    expect(m.tcs.toString()).to.equal('0');
    expect(m.netPayable.toString()).to.equal('17635.8');
  });

  it('pay at hotel: nothing collected online, no TCS; hotel owes commission + GST + TDS', () => {
    const m = run({ ...booking, paidAmount: 0 }, 15);
    expect(m.commission.toString()).to.equal('2550');
    expect(m.tcs.toString()).to.equal('0');
    expect(m.netPayable.toString()).to.equal('-3026');
  });

  it('partial payment: TCS only on the part collected online', () => {
    const m = run({ ...booking, paidAmount: 6018 }, 15);
    expect(m.tcs.toString()).to.equal('25.5'); // 0.5% of 5,100 (30% of 17,000)
    expect(m.netPayable.toString()).to.equal('2966.5');
  });

  it('cancellation fee kept: GST portion pro rata, all collected online', () => {
    const m = computeSettlement({
      ...retainedSettlementInput(booking, 10030),
      commissionPercent: 15, hotelGstRegistered: true, sameState: true,
    });
    expect(m.tax.toString()).to.equal('1530');
    expect(m.commission.toString()).to.equal('1275'); // 15% of 8,500
    expect(m.netPayable.toString()).to.equal('8474.5');
  });
});
