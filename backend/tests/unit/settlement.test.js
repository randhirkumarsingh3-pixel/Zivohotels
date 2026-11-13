import { expect } from 'chai';
import { settlementService, nextPayoutDate, computeStaySettlement } from '../../services/finance/settlementService.js';

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
});

describe('computeStaySettlement', () => {
  const booking = { totalAmount: 20060, baseAmount: 17000, taxAmount: 3060, paidAmount: 20060, refundAmount: 0 };

  it('prepaid: agreed commission on the pre-GST amount, hotel gets the rest', () => {
    const m = computeStaySettlement(booking, 12);
    expect(m.commission.toString()).to.equal('2040'); // 12% of 17,000, not of 20,060
    expect(m.netPayable.toString()).to.equal('18020');
  });

  it('pay at hotel: nothing collected online, hotel owes the commission', () => {
    const m = computeStaySettlement({ ...booking, paidAmount: 0 }, 15);
    expect(m.commission.toString()).to.equal('2550');
    expect(m.netPayable.toString()).to.equal('-2550');
  });

  it('partial payment: commission comes out of what was collected online', () => {
    const m = computeStaySettlement({ ...booking, paidAmount: 6018 }, 15);
    expect(m.netPayable.toString()).to.equal('3468');
  });

  it('older bookings without baseAmount use total minus tax', () => {
    const m = computeStaySettlement({ ...booking, baseAmount: 0 }, 10);
    expect(m.preTax.toString()).to.equal('17000');
  });
});
