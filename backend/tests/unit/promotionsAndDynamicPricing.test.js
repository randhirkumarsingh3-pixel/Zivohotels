import assert from 'assert';
import { discountFor, checkEligibility, coversHotel } from '../../domains/promotionDomain.js';
import { priceForNight, normalizeCondition } from '../../services/dynamicPricingService.js';
import { computeSettlement, staySettlementInput } from '../../services/finance/settlementService.js';

const day = (s) => new Date(`${s}T00:00:00`);
const promo = (o = {}) => ({ isActive: true, hotelId: 'h1', hotelIds: [], discountType: 'PERCENT', value: 10, minNights: 1, roomTypeIds: [], ratePlanIds: [], ...o });

describe('promotions', () => {
  it('percent discount is capped by maxDiscount; flat never exceeds the subtotal', () => {
    assert.strictEqual(discountFor(promo({ value: 15, maxDiscount: 1000 }), 8050), 1000);
    assert.strictEqual(discountFor(promo({ value: 15 }), 8050), 1208);
    assert.strictEqual(discountFor(promo({ discountType: 'FLAT', value: 500 }), 300), 300);
  });
  it('platform promotions cover all hotels or only the listed ones', () => {
    assert.ok(coversHotel(promo({ hotelId: null }), 'x'));
    assert.ok(!coversHotel(promo({ hotelId: null, hotelIds: ['a'] }), 'x'));
    assert.ok(!coversHotel(promo(), 'x'));
  });
  it('checks nights, stay window, room and minimum amount', () => {
    const ctx = { hotelId: 'h1', roomTypeId: 'r1', ratePlanId: 'p1', checkIn: day('2026-12-10'), checkOut: day('2026-12-12'), subtotal: 5000, now: day('2026-11-15') };
    assert.ok(checkEligibility(promo({ minNights: 2 }), ctx).ok);
    assert.ok(!checkEligibility(promo({ minNights: 3 }), ctx).ok);
    assert.ok(!checkEligibility(promo({ stayEnd: day('2026-12-10') }), ctx).ok);
    assert.ok(checkEligibility(promo({ stayEnd: day('2026-12-11') }), ctx).ok);
    assert.ok(!checkEligibility(promo({ roomTypeIds: ['r2'] }), ctx).ok);
    assert.ok(!checkEligibility(promo({ minBookingAmount: 6000 }), ctx).ok);
    assert.ok(!checkEligibility(promo({ maxAdvanceDays: 7 }), ctx).ok);
  });
});

describe('dynamic pricing', () => {
  const settings = { minPercent: -30, maxPercent: 15, minPrice: null, maxPrice: null };
  const rules = [
    { type: 'WEEKDAY', name: 'Weekend', adjustment: 20, condition: { weekdays: [5, 6] } },
    { type: 'LAST_MINUTE', name: 'Last minute', adjustment: -10, condition: { withinDays: 2 } },
  ];
  it('adds matching rules and holds the total within the limits', () => {
    const fri = priceForNight({ basePrice: 3500, rules, settings, ctx: { date: day('2026-11-20'), daysAhead: 5, occupancyPct: 0 } });
    assert.strictEqual(fri.percent, 15);
    assert.strictEqual(fri.price, 4025);
    const tue = priceForNight({ basePrice: 3500, rules, settings, ctx: { date: day('2026-11-17'), daysAhead: 2, occupancyPct: 0 } });
    assert.strictEqual(tue.price, 3150);
  });
  it('rejects incomplete rule conditions', () => {
    assert.throws(() => normalizeCondition('OCCUPANCY', {}));
    assert.deepStrictEqual(normalizeCondition('WEEKDAY', { weekdays: ['6', 5, 9] }), { weekdays: [5, 6] });
  });
});

describe('settlement with a Zivo-funded promotion', () => {
  it('charges commission on the full price and pays the discount to the hotel', () => {
    const booking = { totalAmount: 7184, taxAmount: 342, paidAmount: 7184, refundAmount: 0, metadata: { promotion: { fundedBy: 'ZIVO', discountAmount: 1208 } } };
    const m = computeSettlement({ ...staySettlementInput(booking), commissionPercent: 15, hotelGstRegistered: true, sameState: false });
    assert.strictEqual(m.commission.toString(), '1207.5');
    assert.strictEqual(m.netPayable.toString(), '6918.85');
    const hotelFunded = computeSettlement({ ...staySettlementInput({ ...booking, metadata: {} }), commissionPercent: 15, hotelGstRegistered: true, sameState: false });
    assert.strictEqual(hotelFunded.netPayable.toString(), '5931.92');
  });
});
