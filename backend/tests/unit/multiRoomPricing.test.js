import assert from 'assert';
import { pricingDomain } from '../../domains/pricingDomain.js';
import { roomLinesFrom, roomsPerType, splitEvenly } from '../../domains/roomLines.js';

const taxRules = [
  { minThreshold: 0, maxThreshold: 7500, percentage: 5 },
  { minThreshold: 7500, maxThreshold: null, percentage: 18 },
];
const standard = { id: 'std', name: 'Standard Room', maxOccupancy: 2, baseOccupancy: 2 };
const suite = { id: 'suite', name: 'Suite', maxOccupancy: 4, baseOccupancy: 2 };
const stdEP = { id: 'std-ep', basePrice: 3000, extraAdultPrice: 0, mealPlan: 'EP' };
const suiteCP = { id: 'suite-cp', basePrice: 9000, extraAdultPrice: 1000, mealPlan: 'CP', mealPriceAdult: 500, mealPriceChild: 250 };
const stay = { taxRules, prepaidDiscountPercent: 5, checkInDate: new Date('2026-12-10'), checkOutDate: new Date('2026-12-12') };

describe('Bookings with several rooms', () => {
  it('splits guests of older requests evenly, bigger rooms first', () => {
    assert.deepStrictEqual(splitEvenly(5, 2), [3, 2]);
    const lines = roomLinesFrom({ roomTypeId: 'std', ratePlanId: 'std-ep', rooms: 2, adults: 3, children: 1, guestName: 'Asha' });
    assert.deepStrictEqual(lines.map((l) => [l.adults, l.children, l.guestName]), [[2, 1, 'Asha'], [1, 0, 'Asha']]);
  });

  it('needs an adult in every room and at most 8 rooms', () => {
    assert.throws(() => roomLinesFrom({ roomTypeId: 'std', ratePlanId: 'std-ep', rooms: 3, adults: 2 }), /room 3 needs at least one adult/i);
    assert.throws(() => roomLinesFrom({ roomLines: Array(9).fill({ roomTypeId: 'a', ratePlanId: 'b', adults: 1 }) }), /At most 8/);
  });

  it('counts rooms per room type in a fixed order (inventory locks)', () => {
    const lines = [{ roomTypeId: 'suite' }, { roomTypeId: 'std' }, { roomTypeId: 'suite' }];
    assert.deepStrictEqual(roomsPerType(lines), [{ roomTypeId: 'std', rooms: 1 }, { roomTypeId: 'suite', rooms: 2 }]);
  });

  it('matches the single-type price when all rooms are the same', () => {
    const old = pricingDomain.calculate({ ...stay, roomType: standard, ratePlan: stdEP, rooms: 2, adults: 4, children: 0, extraBeds: 0, paymentType: 'PREPAID' });
    const now = pricingDomain.calculateStay({ ...stay, paymentType: 'PREPAID', rooms: [
      { roomType: standard, ratePlan: stdEP, adults: 2, children: 0 },
      { roomType: standard, ratePlan: stdEP, adults: 2, children: 0 },
    ] });
    for (const k of ['subtotal', 'discountAmount', 'baseAmount', 'taxAmount', 'totalAmount']) assert.strictEqual(now[k], old[k], k);
    assert.strictEqual(now.rooms, 2);
  });

  it('prices a suite and a standard room for their own guests, GST per room', () => {
    const p = pricingDomain.calculateStay({ ...stay, paymentType: 'PAY_AT_HOTEL', rooms: [
      { roomType: suite, ratePlan: suiteCP, adults: 3, children: 1 },
      { roomType: standard, ratePlan: stdEP, adults: 1, children: 0 },
    ] });
    // Suite: 2 nights x (9000 + 2 extra guests x 1000 + meals 3x500 + 1x250) = 2 x 12750
    // Standard: 2 x 3000
    assert.strictEqual(p.roomsBreakdown[0].subtotal, 25500);
    assert.strictEqual(p.roomsBreakdown[1].subtotal, 6000);
    assert.strictEqual(p.subtotal, 31500);
    assert.deepStrictEqual(p.roomsBreakdown.map((r) => r.taxPercentage), [18, 5]);
    assert.strictEqual(p.taxAmount, Math.round(25500 * 0.18) + Math.round(6000 * 0.05));
    assert.strictEqual(p.totalAmount, 31500 + p.taxAmount);
    assert.strictEqual(p.adults, 4);
    assert.strictEqual(p.children, 1);
  });

  it('checks each room against its own maximum occupancy', () => {
    assert.throws(() => pricingDomain.calculateStay({ ...stay, paymentType: 'PAY_AT_HOTEL', rooms: [
      { roomType: standard, ratePlan: stdEP, adults: 3, children: 0 },
      { roomType: standard, ratePlan: stdEP, adults: 1, children: 0 },
    ] }), /Standard Room fits up to 2 guests; room 1 has 3/);
  });

  it('applies a room-type offer only to those rooms, and shares discounts exactly', () => {
    const promo = { discountType: 'PERCENT', value: 10 };
    const p = pricingDomain.calculateStay({ ...stay, paymentType: 'PREPAID', appliedPromotion: promo, promotionRoomIndexes: [1], rooms: [
      { roomType: suite, ratePlan: suiteCP, adults: 2, children: 0 },
      { roomType: standard, ratePlan: stdEP, adults: 1, children: 0 },
    ] });
    assert.strictEqual(p.promotionDiscountAmount, 600); // 10% of the standard room's 6000 only
    const shared = p.roomsBreakdown.reduce((t, r) => t + r.discount, 0);
    assert.strictEqual(shared, p.discountAmount);
    assert.strictEqual(p.roomsBreakdown.reduce((t, r) => t + r.amountAfterDiscount, 0), p.baseAmount);
  });
});
