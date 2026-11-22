import { expect } from 'chai';
import {
  platformHourly, hotelHourly, isBookable, checkSlot, startTimes, roomsNeeded, hourlyPrice, priceHourly, hourlyRefund, istDate, istYmd, slotLabel, extensionPrice,
} from '../../domains/hourly.js';

const settings = hotelHourly({ enabled: true, approved: true, openFrom: '08:00', openTo: '21:00', durations: [3, 6], cleaningMinutes: 30, leadMinutes: 60, freeCancelHours: 2 });
const now = istDate('2026-12-10', '07:00');

describe('Hourly stays: settings', () => {
  it('keeps only durations ZivoPlus allows and that fit the opening hours', () => {
    const s = hotelHourly({ durations: [3, 6, 9, 12, 5], openFrom: '10:00', openTo: '17:00' }, platformHourly({ durations: [3, 6, 12] }));
    expect(s.durations).to.deep.equal([3, 6]);
  });
  it('is bookable only when switched on, approved, and on platform-wide', () => {
    expect(isBookable(settings, platformHourly({}))).to.equal(true);
    expect(isBookable({ ...settings, approved: false }, platformHourly({}))).to.equal(false);
    expect(isBookable(settings, platformHourly({ enabled: false }))).to.equal(false);
  });
});

describe('Hourly stays: slots', () => {
  it('accepts a slot inside the hours, on the half hour, with enough notice', () => {
    const r = checkSlot({ date: '2026-12-10', start: '11:00', hours: 3 }, settings, now);
    expect(r.ok).to.equal(true);
    expect(r.end.getTime() - r.start.getTime()).to.equal(3 * 3600000);
    expect(istYmd(r.start)).to.equal('2026-12-10');
  });
  it('refuses slots outside the rules', () => {
    expect(checkSlot({ date: '2026-12-10', start: '07:30', hours: 3 }, settings, now).ok).to.equal(false); // before opening
    expect(checkSlot({ date: '2026-12-10', start: '19:00', hours: 3 }, settings, now).ok).to.equal(false); // ends after 21:00
    expect(checkSlot({ date: '2026-12-10', start: '11:15', hours: 3 }, settings, now).ok).to.equal(false); // not on the half hour
    expect(checkSlot({ date: '2026-12-10', start: '11:00', hours: 9 }, settings, now).ok).to.equal(false); // duration not offered
    expect(checkSlot({ date: '2026-12-10', start: '07:30', hours: 3 }, { ...settings, openFrom: '07:00' }, now).ok).to.equal(false); // less than 1 hour ahead
  });
  it('lists the start times left for a duration', () => {
    const times = startTimes('2026-12-10', 6, settings, now);
    expect(times[0]).to.equal('08:00');
    expect(times[times.length - 1]).to.equal('15:00');
  });
});

describe('Hourly stays: rooms in use', () => {
  const at = (h) => istDate('2026-12-10', h);
  it('counts overlapping slots, with the cleaning time after each', () => {
    const existing = [{ start: at('08:00'), end: at('11:00') }];
    expect(roomsNeeded(existing, { start: at('11:00'), end: at('14:00') }, 30)).to.equal(2); // inside the cleaning time
    expect(roomsNeeded(existing, { start: at('11:30'), end: at('14:30') }, 30)).to.equal(1); // after cleaning: same room
  });
  it('needs as many rooms as the most slots at one moment, not all overlapping ones', () => {
    const existing = [{ start: at('08:00'), end: at('10:00') }, { start: at('12:00'), end: at('14:00') }];
    expect(roomsNeeded(existing, { start: at('09:00'), end: at('13:00') }, 0)).to.equal(2);
  });
});

describe('Hourly stays: price and refunds', () => {
  it('reads the price of a duration', () => {
    expect(hourlyPrice({ hourlyPrices: { 3: 1299, 6: '1999' } }, 6)).to.equal(1999);
    expect(hourlyPrice({ hourlyPrices: {} }, 3)).to.equal(null);
  });
  it('applies member discounts before GST, with the GST slab of the price', () => {
    const taxRules = [{ minThreshold: 0, maxThreshold: 7500, percentage: 5 }, { minThreshold: 7500, maxThreshold: null, percentage: 18 }];
    const p = priceHourly({ price: 2000, memberHotel: 200, memberZivo: 100, taxRules });
    expect(p).to.include({ roomPrice: 2000, memberDiscountAmount: 300, baseAmount: 1700, taxPercentage: 5, taxAmount: 85, totalAmount: 1785 });
  });
  it('refunds in full until the free-cancellation time, nothing after', () => {
    const start = istDate('2026-12-10', '14:00');
    expect(hourlyRefund({ slotStart: start, paidAmount: 1785, freeCancelHours: 2 }, istDate('2026-12-10', '11:30')).refundAmount).to.equal(1785);
    expect(hourlyRefund({ slotStart: start, paidAmount: 1785, freeCancelHours: 2 }, istDate('2026-12-10', '12:30')).refundAmount).to.equal(0);
  });
  it('labels a slot in India time', () => {
    expect(slotLabel(istDate('2026-12-10', '11:00'), istDate('2026-12-10', '14:00'), 3)).to.match(/10 Dec · 11:00 am – 2:00 pm · 3 hours/i);
  });
  describe('priceHourly with an offer', () => {
    it('takes the offer off first, the member price from what is left, then adds GST', () => {
      const p = priceHourly({ price: 1299, promotionDiscount: 130, memberHotel: 58, memberZivo: 0, taxRules: [] });
      expect(p).to.include({ roomPrice: 1299, promotionDiscountAmount: 130, memberDiscountAmount: 58, baseAmount: 1111, taxPercentage: 5, taxAmount: 56, totalAmount: 1167 });
    });
    it('never discounts below zero', () => {
      const p = priceHourly({ price: 500, promotionDiscount: 450, memberHotel: 100, taxRules: [] });
      expect(p).to.include({ promotionDiscountAmount: 450, memberDiscountAmount: 50, baseAmount: 0, totalAmount: 0 });
    });
  });
  describe('extensionPrice', () => {
    it('charges the extra hours at the hotel price and GST again on the whole stay', () => {
      const p = extensionPrice({ baseAmount: 1169, taxAmount: 58, totalAmount: 1227 }, 2, 400, []);
      expect(p).to.include({ extraBase: 800, newBase: 1969, taxPercentage: 5, newTax: 98, newTotal: 2067, extraAmount: 840 });
    });
    it('moves to the higher GST rate when the stay crosses ₹7,500', () => {
      const p = extensionPrice({ baseAmount: 7200, taxAmount: 360, totalAmount: 7560 }, 1, 500, []);
      expect(p).to.include({ newBase: 7700, taxPercentage: 18, newTax: 1386, extraAmount: 1526 });
    });
    it('is not offered without an extra-hour price', () => {
      expect(extensionPrice({ baseAmount: 1000, taxAmount: 50, totalAmount: 1050 }, 1, 0, [])).to.equal(null);
    });
  });
});
