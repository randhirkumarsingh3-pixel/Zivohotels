import prisma from '../config/db.js';
import revenueDomain from '../domains/revenueDomain.js';

export const couponService = {
  
  /**
   * Applies a coupon for preview (ephemeral)
   */
  applyCouponPreview: async (code, bookingAmount, userId) => {
    const coupon = await prisma.coupon.findUnique({
      where: { code }
    });

    if (!coupon) {
      return { valid: false, message: 'Invalid coupon code' };
    }

    let userUsageCount = 0;
    if (userId) {
      const usage = await prisma.couponUsage.findUnique({
        where: { userId_couponId: { userId, couponId: coupon.id } }
      });
      if (usage) {
        userUsageCount = usage.usedCount;
      }
    }

    const validation = revenueDomain.validateCoupon(coupon, userUsageCount);
    
    if (!validation.valid) {
      return validation;
    }

    const discount = revenueDomain.calculateDiscountValue(coupon, bookingAmount);
    
    return {
      valid: true,
      discount,
      finalAmount: bookingAmount - discount,
      message: validation.message
    };
  },

  /**
   * Validates and increments coupon usage atomically (used at booking creation)
   */
  consumeCoupon: async (tx, code, userId, bookingId) => {
    const coupon = await tx.coupon.findUnique({
      where: { code }
    });

    if (!coupon) {
      throw new Error('Invalid coupon code');
    }

    let userUsageCount = 0;
    const usage = await tx.couponUsage.findUnique({
      where: { userId_couponId: { userId, couponId: coupon.id } }
    });

    if (usage) {
      userUsageCount = usage.usedCount;
    }

    if (coupon.maxUsesPerUser && userUsageCount >= coupon.maxUsesPerUser) {
      throw new Error("Coupon usage limit reached for user");
    }

    const validation = revenueDomain.validateCoupon(coupon, userUsageCount);

    if (!validation.valid) {
      throw new Error(validation.message);
    }

    // Atomic Increment usage with bounds checking
    const updatedCoupons = await tx.$queryRaw`
      UPDATE "Coupon"
      SET "usedCount" = "usedCount" + 1
      WHERE id = ${coupon.id}
        AND "isActive" = true
        AND "expiry" > NOW()
        AND ("maxUses" IS NULL OR "usedCount" < "maxUses")
      RETURNING *;
    `;

    if (!updatedCoupons || updatedCoupons.length === 0) {
      throw new Error("Coupon limit reached or expired due to high demand");
    }

    await tx.couponUsage.upsert({
      where: { userId_couponId: { userId, couponId: coupon.id } },
      update: { usedCount: { increment: 1 } },
      create: { 
        userId, 
        couponId: coupon.id,
        usedCount: 1
      }
    });

    return { valid: true, coupon };
  }
};

export default couponService;
