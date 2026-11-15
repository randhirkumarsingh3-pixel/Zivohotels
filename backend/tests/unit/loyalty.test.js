import assert from 'assert';
import { pointsForAmount, DEFAULT_CONFIG } from '../../services/loyaltyService.js';
import { computeSettlement, staySettlementInput } from '../../services/finance/settlementService.js';

describe('Zivo Rewards', () => {
  it('earns per ₹100 of pre-GST value, times the tier multiplier, rounded down', () => {
    assert.strictEqual(pointsForAmount(7400, DEFAULT_CONFIG, 1), 74);
    assert.strictEqual(pointsForAmount(7400, DEFAULT_CONFIG, 1.5), 111);
    assert.strictEqual(pointsForAmount(99, DEFAULT_CONFIG, 1), 0);
  });
  it('Zivo pays for points used: commission and payout on the full price', () => {
    const booking = { totalAmount: 7770, taxAmount: 370, paidAmount: 7770, refundAmount: 0, metadata: { loyalty: { discountAmount: 200, pointsRedeemed: 200 } } };
    const m = computeSettlement({ ...staySettlementInput(booking), commissionPercent: 15, hotelGstRegistered: false, sameState: true });
    assert.strictEqual(m.zivoFunded.toString(), '200');
    assert.strictEqual(m.commission.toString(), '1140');
  });
});
