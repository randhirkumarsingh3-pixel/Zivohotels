import assert from 'assert';
import { memberDiscounts, canUseAudience } from '../../services/membershipService.js';
import { computeSettlement, staySettlementInput } from '../../services/finance/settlementService.js';

const member = { isPaid: false, plan: { code: 'MEMBER' }, benefits: { hotelMemberRates: true, zivoDiscountPercent: 0, zivoDiscountMax: 0, memberOffers: true } };
const prime = { isPaid: true, plan: { code: 'PRIME' }, benefits: { hotelMemberRates: true, zivoDiscountPercent: 5, zivoDiscountMax: 1500, memberOffers: true } };

describe('membership', () => {
  it("free members get the hotel's member price; Prime adds Zivo's extra on what is left, capped", () => {
    assert.deepStrictEqual(memberDiscounts(member, 10, 7600), { hotel: 760, zivo: 0 });
    assert.deepStrictEqual(memberDiscounts(prime, 10, 7600), { hotel: 760, zivo: 342 });
    assert.deepStrictEqual(memberDiscounts(prime, 0, 100000), { hotel: 0, zivo: 1500 });
    assert.deepStrictEqual(memberDiscounts(null, 10, 7600), { hotel: 0, zivo: 0 });
  });
  it('offers by audience', () => {
    assert.ok(canUseAudience(null, 'ALL'));
    assert.ok(!canUseAudience(null, 'MEMBERS'));
    assert.ok(canUseAudience(member, 'MEMBERS'));
    assert.ok(!canUseAudience(member, 'PRIME'));
    assert.ok(canUseAudience(prime, 'PRIME'));
  });
  it("Zivo pays the Prime extra: the hotel's settlement is on the price after its own member discount", () => {
    const booking = { totalAmount: 7000, taxAmount: 333, paidAmount: 7000, refundAmount: 0, metadata: { membership: { hotelDiscount: 760, zivoDiscount: 342 } } };
    const m = computeSettlement({ ...staySettlementInput(booking), commissionPercent: 15, hotelGstRegistered: false, sameState: true });
    assert.strictEqual(m.zivoFunded.toString(), '342');
    assert.strictEqual(m.commission.toString(), '1051.35'); // 15% of (6667 + 342)
  });
});
