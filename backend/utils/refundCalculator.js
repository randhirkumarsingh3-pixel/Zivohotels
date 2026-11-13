import { roundMoney, toMoney } from './money.js';

/**
 * refundCalculator.js
 * Source of truth for how much a guest gets back when THEY cancel.
 * (A cancellation by the hotel or an admin always refunds in full; see cancellationService.)
 *
 * Properties choose one policy at onboarding (CancellationPolicy.policyCode):
 *   FREE_CANCEL_CHECKIN  full refund until check-in, then nothing
 *   FREE_CANCEL_24H/48H/72H  full refund until 24/48/72 hours before check-in, then nothing
 *   NON_REFUNDABLE       never refunded
 * Older rows without a known code fall back to the numeric hour/percent fields.
 */
export const POLICY_FREE_HOURS = {
  FREE_CANCEL_CHECKIN: 0,
  FREE_CANCEL_24H: 24,
  FREE_CANCEL_48H: 48,
  FREE_CANCEL_72H: 72,
};
export const CANCELLATION_POLICY_CODES = [...Object.keys(POLICY_FREE_HOURS), 'NON_REFUNDABLE'];

/** Numeric fields stored alongside a policy code, for anything still reading them. */
export const policyFieldsForCode = (code) => {
  if (code === 'NON_REFUNDABLE') {
    return { policyCode: code, freeCancellationHours: 0, partialRefundPercent: 0, noRefundHours: 0 };
  }
  const hours = POLICY_FREE_HOURS[code] ?? 24;
  return { policyCode: code, freeCancellationHours: hours, partialRefundPercent: 0, noRefundHours: hours };
};

export const calculateRefund = (booking, policy, now = new Date()) => {
  if (!booking || !policy) {
    throw new Error('Booking and Policy are required for refund calculation');
  }

  const checkIn = new Date(booking.checkIn);
  const hoursLeft = (checkIn.getTime() - now.getTime()) / (1000 * 60 * 60);
  const paidAmount = toMoney(booking.paidAmount) || 0;

  let refundAmount = 0;
  let policyApplied;

  if (policy.policyCode === 'NON_REFUNDABLE') {
    policyApplied = 'NON_REFUNDABLE';
  } else if (policy.policyCode in POLICY_FREE_HOURS) {
    const free = hoursLeft >= POLICY_FREE_HOURS[policy.policyCode];
    refundAmount = free ? paidAmount : 0;
    policyApplied = free ? 'FREE' : 'NONE';
  } else {
    // Legacy numeric policy
    const freeHours = policy.freeCancellationHours ?? 24;
    const partialPercent = policy.partialRefundPercent ?? 0;
    const noRefundHours = policy.noRefundHours ?? freeHours;
    if (hoursLeft >= freeHours) {
      refundAmount = paidAmount;
      policyApplied = 'FREE';
    } else if (hoursLeft >= noRefundHours) {
      refundAmount = paidAmount * (partialPercent / 100);
      policyApplied = 'PARTIAL';
    } else {
      policyApplied = 'NONE';
    }
  }

  // Never refund more than paid, never negative
  refundAmount = Math.min(Math.max(0, refundAmount), paidAmount);
  if (isNaN(refundAmount)) refundAmount = 0;

  return {
    refundAmount: roundMoney(refundAmount), // to the paisa
    policyApplied,
    hoursLeft: Math.floor(hoursLeft)
  };
};

/**
 * Used when a property has no saved policy: the onboarding default
 * (free cancellation until 24 hours before check-in, then non-refundable).
 */
export const getDefaultPolicy = () => policyFieldsForCode('FREE_CANCEL_24H');
