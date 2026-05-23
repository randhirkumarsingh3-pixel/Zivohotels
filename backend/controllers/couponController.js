import { z } from 'zod';
import couponService from '../services/couponService.js';
import prisma from '../config/db.js';

const applySchema = z.object({
  code: z.string().min(1),
  bookingAmount: z.number().positive()
});

export const applyCouponPreview = async (req, res, next) => {
  try {
    const validation = applySchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(422).json({ 
        success: false, 
        message: 'Invalid request data', 
        errors: validation.error.format() 
      });
    }

    const { code, bookingAmount } = validation.data;
    const userId = req.user?.id; // Allow unauthenticated if they just want to see if coupon exists, or require it.
    // The route will be protected or public. Let's assume protected.

    const result = await couponService.applyCouponPreview(code, bookingAmount, userId);

    if (!result.valid) {
      return res.status(400).json({ success: false, message: result.message });
    }

    res.status(200).json({
      success: true,
      data: {
        valid: true,
        discount: result.discount,
        finalAmount: result.finalAmount,
        message: result.message
      }
    });

  } catch (error) {
    next(error);
  }
};

export const getAvailableCoupons = async (req, res, next) => {
  try {
    const coupons = await prisma.coupon.findMany({
      where: {
        isActive: true,
        expiry: { gt: new Date() }
      },
      select: {
        code: true,
        discountType: true,
        value: true,
        minBookingAmount: true,
        maxDiscount: true,
        expiry: true
      }
    });

    res.status(200).json({
      success: true,
      data: coupons
    });
  } catch (error) {
    next(error);
  }
};
