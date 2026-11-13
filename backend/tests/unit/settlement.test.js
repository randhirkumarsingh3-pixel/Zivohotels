import { expect } from 'chai';
import { settlementService } from '../../services/finance/settlementService.js';

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
