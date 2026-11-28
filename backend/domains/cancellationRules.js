/**
 * Cancellation money rules (pure: no database or payment calls), shared by cancellationService and
 * unit tests.
 */
import { calculateRefund, policyFieldsForCode } from '../utils/refundCalculator.js';
import { roundMoney, toMoney } from '../utils/money.js';

/**
 * The guest's refund under the property's policy, and the membership perk: a paid plan with
 * freeCancelExtraHours (at booking time) lets the guest cancel free for that much longer. The fee
 * the hotel would have kept is then paid to the hotel by Zivo (memberWaiver).
 */
export const guestRefund = (booking, policy, now = new Date()) => {
  const base = calculateRefund(booking, policy, now);
  const extra = Number(booking.metadata?.membership?.freeCancelExtraHours) || 0;
  if (extra > 0) {
    const asIfEarlier = calculateRefund(booking, policy, new Date(now.getTime() - extra * 60 * 60 * 1000));
    if (asIfEarlier.refundAmount > base.refundAmount) {
      return { refundAmount: asIfEarlier.refundAmount, policyApplied: `${asIfEarlier.policyApplied}_MEMBER_EXTENDED`, memberWaiver: roundMoney(asIfEarlier.refundAmount - base.refundAmount) };
    }
  }
  return { ...base, memberWaiver: 0 };
};

/**
 * What cancelling one room means in money: the room's share of the booking (by its price before
 * discounts and tax), its share of what was paid, and the refund under the same rules as a whole
 * booking (property policy for a guest; everything back when the hotel or ZivoPlus cancels).
 * Pure, for unit tests: booking { totalAmount, paidAmount, taxAmount, baseAmount, checkIn, ... },
 * rooms = the booking's rooms not yet cancelled, room = the one to cancel.
 */
export const roomCancellationQuote = ({ booking, rooms, room, policy, initiatedBy, now = new Date() }) => {
  const sum = rooms.reduce((t, r) => t + (toMoney(r.subtotal) || 0), 0);
  const ratio = sum > 0 ? (toMoney(room.subtotal) || 0) / sum : 1 / rooms.length;
  const share = (v) => roundMoney((toMoney(v) || 0) * ratio);
  const shareTotal = share(booking.totalAmount);
  const sharePaid = share(booking.paidAmount);
  let refundAmount = sharePaid;
  let policyApplied = `CANCELLED_BY_${initiatedBy}`;
  let memberWaiver = 0;
  if (initiatedBy === 'GUEST') {
    ({ refundAmount, policyApplied, memberWaiver } = guestRefund({ ...booking, totalAmount: shareTotal, paidAmount: sharePaid }, policy, now));
  }
  refundAmount = roundMoney(Math.min(refundAmount, sharePaid));
  return {
    ratio,
    shareTotal,
    sharePaid,
    shareTax: share(booking.taxAmount),
    shareBase: share(booking.baseAmount),
    refundAmount,
    // Kept under the policy: stays in the booking and is paid to the hotel at check-out
    retainedAmount: roundMoney(sharePaid - refundAmount),
    memberWaiver,
    policyApplied,
  };
};


/**
 * When free cancellation ends for a booking (the same instant the refund rules use, including a
 * membership's extra hours). Non-refundable bookings, and ones made after the free period, end at
 * the moment they were booked. Hourly stays: freeCancelHours before the slot starts.
 */
export const freeCancellationEndsAt = (booking, policy) => {
  const booked = new Date(booking.createdAt || Date.now());
  let end;
  if (booking.stayType === 'HOURLY') {
    const hrs = Number(booking.metadata?.hourly?.freeCancelHours ?? 2);
    end = new Date(new Date(booking.slotStart || booking.checkIn).getTime() - hrs * 3600 * 1000);
  } else {
    const code = policy?.policyCode || 'FREE_CANCEL_24H';
    if (code === 'NON_REFUNDABLE') return booked;
    const { freeCancellationHours } = policyFieldsForCode(code);
    const extra = Number(booking.metadata?.membership?.freeCancelExtraHours) || 0;
    end = new Date(new Date(booking.checkIn).getTime() - Math.max(0, freeCancellationHours - extra) * 3600 * 1000);
  }
  return end < booked ? booked : end;
};

/** Requests to the hotel stay open this long after the stay ends (lost items, bills). */
export const REQUESTS_AFTER_STAY_HOURS = 72;

/**
 * When the stay ends: the hourly slot's end, or check-out day at 12:00 IST for nights (check-out
 * dates are stored as the day at 00:00 UTC).
 */
export const stayEndsAt = (booking) => {
  if (booking.stayType === 'HOURLY') return new Date(booking.slotEnd || booking.checkOut);
  const d = new Date(booking.checkOut);
  const midnightUtc = d.getUTCHours() === 0 && d.getUTCMinutes() === 0;
  return midnightUtc ? new Date(d.getTime() + 6.5 * 3600 * 1000) : d;
};

/**
 * Guests can send requests to the hotel from when the booking is made until 72 hours after the stay
 * ends. After check-out only requests that still make sense (lost item, bill, other) are offered.
 */
export const requestWindow = (booking) => {
  const ends = stayEndsAt(booking);
  return {
    opensAt: new Date(booking.createdAt || Date.now()),
    stayEndsAt: ends,
    closesAt: new Date(ends.getTime() + REQUESTS_AFTER_STAY_HOURS * 3600 * 1000),
  };
};

/** Kept for callers that only need the opening time. */
export const requestsOpenAt = (booking) => requestWindow(booking).opensAt;
