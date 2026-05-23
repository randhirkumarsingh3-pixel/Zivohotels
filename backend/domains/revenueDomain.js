/**
 * Revenue Domain (Pure Logic)
 * 
 * Rules:
 * - NO database queries
 * - Pure mathematical constraints and calculations
 */
export const revenueDomain = {

  /**
   * Validates a coupon rules (expiry, usage limits)
   * 
   * @param {Object} coupon - The coupon data
   * @param {Number} userUsageCount - How many times the user has used this coupon
   * @returns {Object} { valid: boolean, message: string }
   */
  validateCoupon: (coupon, userUsageCount = 0) => {
    
    if (!coupon.isActive) {
      return { valid: false, message: 'Coupon is not active' };
    }

    if (new Date() > new Date(coupon.expiry)) {
      return { valid: false, message: 'Coupon has expired' };
    }

    if (coupon.maxUses && coupon.usedCount >= coupon.maxUses) {
      return { valid: false, message: 'Coupon usage limit reached' };
    }

    if (userUsageCount > 0) {
      return { valid: false, message: 'You have already used this coupon' };
    }

    return { 
      valid: true, 
      message: 'Coupon is valid' 
    };
  },

  /**
   * Calculates the actual discount amount based on a subtotal
   */
  calculateDiscountValue: (coupon, subtotal) => {
    if (coupon.minBookingAmount && subtotal < coupon.minBookingAmount) {
      return 0; // Or throw error
    }

    let discount = 0;
    if (coupon.discountType === 'PERCENTAGE' || coupon.discountType === 'PERCENT') {
      discount = (subtotal * coupon.value) / 100;
      if (coupon.maxDiscount) {
        discount = Math.min(discount, coupon.maxDiscount);
      }
    } else if (coupon.discountType === 'FLAT' || coupon.discountType === 'FIXED') {
      discount = coupon.value;
    }

    discount = Math.min(discount, subtotal);
    return Math.round(discount * 100) / 100;
  }

};

export default revenueDomain;
