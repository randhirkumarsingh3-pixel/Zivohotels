/**
 * refundCalculator.js
 * Source of truth for all refund logic.
 */

export const calculateRefund = (booking, policy) => {
  if (!booking || !policy) {
    throw new Error('Booking and Policy are required for refund calculation');
  }

  // Fallbacks for policy values
  const freeHours = policy.freeCancellationHours ?? 24;
  const partialPercent = policy.partialRefundPercent ?? 50;
  const noRefundHours = policy.noRefundHours ?? 6;

  const now = new Date();
  const checkIn = new Date(booking.checkIn);
  
  // Diff in hours
  const diffMs = checkIn.getTime() - now.getTime();
  const hoursLeft = diffMs / (1000 * 60 * 60);

  let refundAmount = 0;
  const paidAmount = booking.paidAmount || 0;

  if (hoursLeft >= freeHours) {
    // Phase 1: Full Refund
    refundAmount = paidAmount;
  } else if (hoursLeft >= noRefundHours) {
    // Phase 2: Partial Refund
    refundAmount = paidAmount * (partialPercent / 100);
  } else {
    // Phase 3: No Refund
    refundAmount = 0;
  }

  // HARD LIMITS & SAFETY CHECKS
  // 1. Never refund more than paid
  // 2. Never refund negative amounts
  // 3. Handle NaN
  refundAmount = Math.min(Math.max(0, refundAmount), paidAmount);
  
  if (isNaN(refundAmount)) refundAmount = 0;

  return {
    refundAmount: Math.round(refundAmount * 100) / 100, // Round to 2 decimal places
    policyApplied: hoursLeft >= freeHours ? 'FREE' : (hoursLeft >= noRefundHours ? 'PARTIAL' : 'NONE'),
    hoursLeft: Math.floor(hoursLeft)
  };
};

/**
 * getDefaultPolicy
 * Standard global fallback if no hotel policy exists
 */
export const getDefaultPolicy = () => ({
  freeCancellationHours: 24,
  partialRefundPercent: 50,
  noRefundHours: 6
});
