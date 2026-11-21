import { expect } from 'chai';
import { normalizePhone, maskPhone, smsProvider, smsTestMode } from '../../services/smsService.js';
import { hotelEmailRecipients } from '../../services/notifyService.js';

describe('Mobile numbers', () => {
  it('reads Indian mobiles typed in any common way', () => {
    for (const v of ['9876543210', '98765 43210', '098765-43210', '919876543210', '+91 98765 43210']) {
      expect(normalizePhone(v), v).to.equal('+919876543210');
    }
  });
  it('keeps other countries given with their + code', () => {
    expect(normalizePhone('+44 7700 900123')).to.equal('+447700900123');
  });
  it('refuses what is not a mobile number', () => {
    for (const v of ['', '12345', '5876543210', 'abc', '+12']) expect(normalizePhone(v), v).to.equal(null);
  });
  it('masks the number where a code went', () => {
    expect(maskPhone('+919876543210')).to.equal('+91 ••••• •3210');
  });
});

describe('SMS provider', () => {
  const saved = process.env.SMS_PROVIDER;
  after(() => { if (saved === undefined) delete process.env.SMS_PROVIDER; else process.env.SMS_PROVIDER = saved; });
  it('is in test mode until a real provider is set', () => {
    delete process.env.SMS_PROVIDER;
    expect(smsProvider()).to.equal('test');
    expect(smsTestMode()).to.equal(true);
    process.env.SMS_PROVIDER = 'unknown-thing';
    expect(smsTestMode()).to.equal(true);
    process.env.SMS_PROVIDER = 'MSG91';
    expect(smsProvider()).to.equal('msg91');
    expect(smsTestMode()).to.equal(false);
  });
});

describe('Hotel booking email recipients', () => {
  it('sends to reception, owner and the extra booking emails, once each', () => {
    const hotel = {
      owner: { email: 'Owner@Hotel.com' },
      integrationSettings: { contactInfo: { receptionEmail: 'frontdesk@hotel.com', bookingEmails: ['owner@hotel.com', 'revenue@hotel.com', 'not-an-email'] } },
    };
    expect(hotelEmailRecipients(hotel)).to.deep.equal(['frontdesk@hotel.com', 'owner@hotel.com', 'revenue@hotel.com']);
  });
  it('works with only the owner', () => {
    expect(hotelEmailRecipients({ owner: { email: 'o@h.com' } })).to.deep.equal(['o@h.com']);
  });
});
