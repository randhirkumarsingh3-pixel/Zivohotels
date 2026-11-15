import assert from 'assert';
import { moderationFlags, reviewBlocker } from '../../services/reviewService.js';

describe('review moderation', () => {
  it('publishes ordinary reviews, holds contact details, links and abuse', () => {
    assert.deepStrictEqual(moderationFlags('Lovely stay, the staff were great. 10/10 would return in 2027!'), []);
    assert.ok(moderationFlags('Call me on 98765 43210').includes('Contains a phone number'));
    assert.ok(moderationFlags('mail me at a.b@example.com').includes('Contains an email address'));
    assert.ok(moderationFlags('see www.cheap-rooms.example').includes('Contains a link'));
    assert.ok(moderationFlags('The manager was a bastard').includes('Possible abusive language'));
  });
});

describe('review window', () => {
  const stay = { status: 'COMPLETED', checkIn: new Date('2026-11-05T00:00:00'), checkOut: new Date('2026-11-07T00:00:00') };
  it('opens the day after check-in and closes 90 days after check-out', () => {
    assert.ok(reviewBlocker(stay, new Date('2026-11-05T20:00:00')));
    assert.strictEqual(reviewBlocker(stay, new Date('2026-11-06T09:00:00')), null);
    assert.strictEqual(reviewBlocker(stay, new Date('2027-01-30T09:00:00')), null);
    assert.ok(reviewBlocker(stay, new Date('2027-02-10T09:00:00')));
  });
  it('refuses cancelled, no-show and unconfirmed bookings', () => {
    for (const status of ['CANCELLED', 'NO_SHOW', 'PENDING']) assert.ok(reviewBlocker({ ...stay, status }, new Date('2026-11-10')));
  });
});
