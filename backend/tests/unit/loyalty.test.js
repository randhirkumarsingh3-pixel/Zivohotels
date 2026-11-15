import assert from 'assert';
import { pointsForAmount, allocateLots, DEFAULT_CONFIG } from '../../services/loyaltyService.js';
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
  it('uses the oldest points first, so expiry takes what is left of old batches', () => {
    const lots = [{ id: 'a', points: 300 }, { id: 'b', points: 200 }, { id: 'c', points: 50 }];
    assert.deepStrictEqual(allocateLots(lots, 100).map((l) => l.remaining), [200, 200, 50]);
    assert.deepStrictEqual(allocateLots(lots, 450).map((l) => l.remaining), [0, 50, 50]);
    assert.deepStrictEqual(allocateLots(lots, 0).map((l) => l.remaining), [300, 200, 50]);
  });
});
