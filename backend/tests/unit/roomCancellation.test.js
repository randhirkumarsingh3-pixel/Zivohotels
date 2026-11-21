import { expect } from 'chai';
import { roomCancellationQuote } from '../../domains/cancellationRules.js';

describe('Cancelling one room of a booking', () => {
  const booking = { totalAmount: 15000, paidAmount: 15000, taxAmount: 1000, baseAmount: 14000, checkIn: '2027-01-20', metadata: {} };
  const rooms = [{ roomNumber: 1, subtotal: 9000 }, { roomNumber: 2, subtotal: 3000 }];
  const free = { policyCode: 'FREE_CANCEL_24H' };
  const strict = { policyCode: 'NON_REFUNDABLE' };
  const now = new Date('2027-01-01T00:00:00Z');

  it('refunds the room\'s share by its price when cancellation is free', () => {
    const q = roomCancellationQuote({ booking, rooms, room: rooms[1], policy: free, initiatedBy: 'GUEST', now });
    expect(q.shareTotal).to.equal(3750); // 3000 of 12000 = a quarter
    expect(q.refundAmount).to.equal(3750);
    expect(q.retainedAmount).to.equal(0);
    expect(q.shareTax).to.equal(250);
  });

  it('keeps the charge under a non-refundable policy', () => {
    const q = roomCancellationQuote({ booking, rooms, room: rooms[0], policy: strict, initiatedBy: 'GUEST', now });
    expect(q.refundAmount).to.equal(0);
    expect(q.retainedAmount).to.equal(11250);
  });

  it('refunds everything for that room when the hotel cancels', () => {
    const q = roomCancellationQuote({ booking, rooms, room: rooms[0], policy: strict, initiatedBy: 'HOTEL', now });
    expect(q.refundAmount).to.equal(11250);
  });

  it('has nothing to refund on an unpaid (pay later) booking', () => {
    const q = roomCancellationQuote({ booking: { ...booking, paidAmount: 0 }, rooms, room: rooms[1], policy: free, initiatedBy: 'GUEST', now });
    expect(q.refundAmount).to.equal(0);
    expect(q.retainedAmount).to.equal(0);
  });
});
