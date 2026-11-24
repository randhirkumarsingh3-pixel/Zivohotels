import { expect } from 'chai';
import { freeCancellationEndsAt } from '../../domains/cancellationRules.js';
import { hotelEmailRecipients } from '../../services/notifyService.js';
import { hasDeparted } from '../../services/invoiceService.js';

const H = 3600 * 1000;

describe('Free cancellation end (requests to the hotel open then)', () => {
  const booked = new Date('2026-12-01T10:00:00Z');
  const base = { createdAt: booked, checkIn: new Date('2026-12-20T00:00:00Z'), stayType: 'NIGHTLY' };

  it('is check-in minus the policy hours', () => {
    expect(freeCancellationEndsAt(base, { policyCode: 'FREE_CANCEL_24H' }).toISOString()).to.equal('2026-12-19T00:00:00.000Z');
    expect(freeCancellationEndsAt(base, { policyCode: 'FREE_CANCEL_72H' }).toISOString()).to.equal('2026-12-17T00:00:00.000Z');
  });
  it('is the booking time for non-refundable bookings, or when the free period had already ended', () => {
    expect(freeCancellationEndsAt(base, { policyCode: 'NON_REFUNDABLE' }).getTime()).to.equal(booked.getTime());
    const late = { ...base, checkIn: new Date(booked.getTime() + 5 * H) };
    expect(freeCancellationEndsAt(late, { policyCode: 'FREE_CANCEL_24H' }).getTime()).to.equal(booked.getTime());
  });
  it('counts a membership\'s extra free-cancellation hours', () => {
    const member = { ...base, metadata: { membership: { freeCancelExtraHours: 12 } } };
    expect(freeCancellationEndsAt(member, { policyCode: 'FREE_CANCEL_24H' }).toISOString()).to.equal('2026-12-19T12:00:00.000Z');
  });
  it('hourly stays: the free hours before the slot starts', () => {
    const hourly = { createdAt: booked, stayType: 'HOURLY', slotStart: new Date('2026-12-05T08:00:00Z'), metadata: { hourly: { freeCancelHours: 2 } } };
    expect(freeCancellationEndsAt(hourly, null).toISOString()).to.equal('2026-12-05T06:00:00.000Z');
  });
});

describe('Invoice on the departure date', () => {
  const now = new Date('2026-12-10T08:00:00Z'); // 1:30 pm in India
  it('nightly stays: from the check-out date (India time)', () => {
    expect(hasDeparted({ status: 'CONFIRMED', checkOut: new Date('2026-12-10T00:00:00Z') }, now)).to.equal(true);
    expect(hasDeparted({ status: 'CONFIRMED', checkOut: new Date('2026-12-11T00:00:00Z') }, now)).to.equal(false);
  });
  it('hourly stays: once the slot has ended; checked-out guests always', () => {
    expect(hasDeparted({ status: 'CONFIRMED', stayType: 'HOURLY', checkOut: new Date('2026-12-10T07:00:00Z') }, now)).to.equal(true);
    expect(hasDeparted({ status: 'CONFIRMED', stayType: 'HOURLY', checkOut: new Date('2026-12-10T09:00:00Z') }, now)).to.equal(false);
    expect(hasDeparted({ status: 'COMPLETED', checkOut: new Date('2026-12-12T00:00:00Z') }, now)).to.equal(true);
  });
});

describe('Hotel booking emails', () => {
  it('go to reception, owner, extra booking emails and team members who handle bookings, once each', () => {
    const hotel = {
      integrationSettings: { contactInfo: { receptionEmail: 'Desk@Hotel.com', bookingEmails: ['gm@hotel.com', 'desk@hotel.com'] } },
      owner: { email: 'owner@hotel.com' },
      staff: [
        { status: 'ACTIVE', user: { email: 'frontoffice@hotel.com', status: 'ACTIVE' }, role: { permissions: ['bookings.view'] } },
        { status: 'ACTIVE', user: { email: 'accounts@hotel.com', status: 'ACTIVE' }, role: { permissions: ['finance.view'] } },
        { status: 'PAUSED', user: { email: 'old@hotel.com', status: 'ACTIVE' }, role: { permissions: ['bookings.manage'] } },
      ],
    };
    expect(hotelEmailRecipients(hotel)).to.deep.equal(['desk@hotel.com', 'owner@hotel.com', 'gm@hotel.com', 'frontoffice@hotel.com']);
  });
});
