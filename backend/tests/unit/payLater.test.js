import { expect } from 'chai';
import { payLaterDeadline, payLaterSettings, checkInDayStart, reminderAt } from '../../domains/payLater.js';

describe('Reserve now, pay later', () => {
  const settings = payLaterSettings({ payAtHotel: true, expiryHours: 24 });

  it('reads admin settings with safe defaults', () => {
    expect(payLaterSettings({})).to.deep.equal({ enabled: true, hours: 24 });
    expect(payLaterSettings({ payAtHotel: false }).enabled).to.equal(false);
    expect(payLaterSettings({ expiryHours: 999 }).hours).to.equal(24);
    expect(payLaterSettings({ expiryHours: 12 }).hours).to.equal(12);
  });

  it('starts the check-in day at midnight India time', () => {
    expect(checkInDayStart('2026-12-20').toISOString()).to.equal('2026-12-19T18:30:00.000Z');
  });

  it('gives the booking window when check-in is far away', () => {
    const now = new Date('2026-12-01T06:00:00Z');
    expect(payLaterDeadline({ now, checkIn: '2026-12-20', settings }).toISOString()).to.equal('2026-12-02T06:00:00.000Z');
  });

  it('ends at the start of the check-in day when that comes first', () => {
    const now = new Date('2026-12-19T06:00:00Z'); // 11:30 IST, check-in tomorrow
    expect(payLaterDeadline({ now, checkIn: '2026-12-20', settings }).toISOString()).to.equal('2026-12-19T18:30:00.000Z');
  });

  it('is not offered with under 2 hours to pay, or when switched off', () => {
    expect(payLaterDeadline({ now: new Date('2026-12-19T17:00:00Z'), checkIn: '2026-12-20', settings })).to.equal(null);
    expect(payLaterDeadline({ now: new Date('2026-12-01T06:00:00Z'), checkIn: '2026-12-20', settings: { enabled: false, hours: 24 } })).to.equal(null);
  });

  it('reminds 6 hours before the deadline, or halfway for short windows', () => {
    expect(reminderAt('2026-12-01T00:00:00Z', '2026-12-02T00:00:00Z').toISOString()).to.equal('2026-12-01T18:00:00.000Z');
    expect(reminderAt('2026-12-01T00:00:00Z', '2026-12-01T04:00:00Z').toISOString()).to.equal('2026-12-01T02:00:00.000Z');
  });
});
