import { expect } from 'chai';
import { pricingDomain } from '../../domains/pricingDomain.js';
import { stayNightlyPrice } from '../../services/ariService.js';
import { getDatesInRange } from '../../utils/dateUtils.js';

const taxRules = [
  { minThreshold: 0, maxThreshold: 7500, percentage: 5 },
  { minThreshold: 7500, maxThreshold: null, percentage: 18 },
];
const roomType = { maxOccupancy: 3, baseOccupancy: 2, extraBedAllowed: false, maxExtraBeds: 0 };
const ratePlan = { basePrice: 5000, extraAdultPrice: 1000, occupancyPricing: [], mealPlan: 'EP' };
const stay = { checkInDate: new Date('2027-03-01T00:00:00'), checkOutDate: new Date('2027-03-04T00:00:00') };
const run = (over = {}) => pricingDomain.calculate({
  roomType, ratePlan, taxRules, prepaidDiscountPercent: 5, rooms: 1, adults: 2, children: 0, extraBeds: 0,
  paymentType: 'PAY_AT_HOTEL', dynamicContext: { safeMode: true }, ...stay, ...over,
});

describe('daily rates in pricing', () => {
  const nights = getDatesInRange(stay.checkInDate, stay.checkOutDate);

  it('uses the base price when no daily rate is set', () => {
    expect(run().roomPrice).to.equal(15000);
  });

  it('a daily rate replaces the base price for that night only', () => {
    const p = run({ dailyRates: { [nights[1].toISOString()]: 8000 } });
    expect(p.roomPrice).to.equal(5000 + 8000 + 5000);
  });

  it('extra guests are still charged on top of a daily rate', () => {
    const p = run({ adults: 3, dailyRates: { [nights[0].toISOString()]: 6000 } });
    expect(p.extraGuestCharges).to.equal(3000); // 1 extra adult x 3 nights
    expect(p.roomPrice).to.equal(6000 + 5000 + 5000);
  });

  it('refuses a night without a price instead of selling it for ₹0', () => {
    expect(() => run({ ratePlan: { ...ratePlan, basePrice: 0 } })).to.throw(/no price/);
  });

  it('stayNightlyPrice averages daily rates and base price over the stay', () => {
    expect(stayNightlyPrice(5000, nights, { [nights[2].toISOString()]: 8000 })).to.equal(6000);
    expect(stayNightlyPrice(5000, nights, {})).to.equal(5000);
  });
});
