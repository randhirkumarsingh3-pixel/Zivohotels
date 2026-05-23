/**
 * Refund Domain (Pure Business Logic)
 * 
 * Rules:
 * - NO database queries (Prisma)
 * - NO external side-effects
 * - Pure Input -> Output
 */
export const refundDomain = {

  /**
   * Calculates the refund amount based on cancellation policy and time till check-in.
   * 
   * @param {Object} input
   * @param {Object} input.booking - The booking record (needs checkIn and paidAmount)
   * @param {Object} input.policy - The cancellation policy rules
   * @param {Date} [input.now] - Current time (for testing/purity), defaults to new Date()
   * @returns {Object} Refund calculation result
   */
  calculate: (input) => {
    const { booking, policy, now = new Date() } = input;

    if (!booking || !policy) {
      throw new Error('Booking and Policy are required for refund calculation');
    }

    // Fallbacks for policy values
    const freeHours = policy.freeCancellationHours ?? 24;
    const partialPercent = policy.partialRefundPercent ?? 50;
    const noRefundHours = policy.noRefundHours ?? 6;

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
    refundAmount = Math.min(Math.max(0, refundAmount), paidAmount);
    if (isNaN(refundAmount)) refundAmount = 0;

    return {
      refundAmount: Math.round(refundAmount * 100) / 100,
      policyApplied: hoursLeft >= freeHours ? 'FREE' : (hoursLeft >= noRefundHours ? 'PARTIAL' : 'NONE'),
      hoursLeft: Math.floor(hoursLeft)
    };
  },

  /**
   * Standard global fallback if no hotel policy exists
   */
  getDefaultPolicy: () => ({
    freeCancellationHours: 24,
    partialRefundPercent: 50,
    noRefundHours: 6
  })
};

export default refundDomain;
