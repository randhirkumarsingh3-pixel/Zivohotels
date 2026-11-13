import { expect } from 'chai';
import { calculateRefund, policyFieldsForCode, getDefaultPolicy } from '../../utils/refundCalculator.js';
import { hotelGstStateCode } from '../../constants/finance.js';

const now = new Date('2026-12-10T12:00:00Z');
const at = (hoursBeforeCheckIn) => ({ checkIn: new Date(now.getTime() + hoursBeforeCheckIn * 3600 * 1000), paidAmount: 5000 });
const refund = (hours, code) => calculateRefund(at(hours), policyFieldsForCode(code), now).refundAmount;

describe('cancellation policies chosen by the property', () => {
  it('free until 24/48/72 hours before check-in, then nothing', () => {
    expect(refund(30, 'FREE_CANCEL_24H')).to.equal(5000);
    expect(refund(23, 'FREE_CANCEL_24H')).to.equal(0);
    expect(refund(47, 'FREE_CANCEL_48H')).to.equal(0);
    expect(refund(73, 'FREE_CANCEL_72H')).to.equal(5000);
  });

  it('free until check-in', () => {
    expect(refund(1, 'FREE_CANCEL_CHECKIN')).to.equal(5000);
    expect(refund(-1, 'FREE_CANCEL_CHECKIN')).to.equal(0);
  });

  it('non-refundable never refunds', () => {
    expect(refund(500, 'NON_REFUNDABLE')).to.equal(0);
  });

  it('a property with no saved policy gets the onboarding default (free until 24h)', () => {
    expect(getDefaultPolicy().policyCode).to.equal('FREE_CANCEL_24H');
    expect(calculateRefund(at(23), getDefaultPolicy(), now).refundAmount).to.equal(0);
  });
});

describe('hotel GST state code', () => {
  it('comes from the GSTIN, else the state name', () => {
    expect(hotelGstStateCode({ gstin: '27ABCDE1234F1Z5', state: 'Goa' })).to.equal('27');
    expect(hotelGstStateCode({ gstin: null, state: 'Karnataka' })).to.equal('29');
    expect(hotelGstStateCode({ gstin: '', state: 'Atlantis' })).to.equal(null);
  });
});
