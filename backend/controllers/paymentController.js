import crypto from 'crypto';
import Razorpay from 'razorpay';
import prisma from '../config/db.js';
import { getDatesInRange } from '../utils/dateUtils.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { getSystemConfig } from '../config/systemConfig.js';
import { z } from 'zod';
import { sendBookingConfirmationEmail } from '../services/emailService.js';

// Keys are validated at server boot in server.js — no fallbacks here.
const razorpay = new Razorpay({
  key_id:     process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// --- ZOD SCHEMAS ---

const createOrderSchema = z.object({
  bookingId: z.string().uuid('Invalid booking ID')
});

const verifyPaymentSchema = z.object({
  razorpay_order_id: z.string().min(1, 'Order ID is required'),
  razorpay_payment_id: z.string().min(1, 'Payment ID is required'),
  razorpay_signature: z.string().min(1, 'Signature is required'),
  bookingId: z.string().uuid('Invalid booking ID')
});

const refundPaymentSchema = z.object({
  bookingId: z.string().uuid('Invalid booking ID')
});

/**
 * Utility to restore inventory for a booking
 * @param {object} booking - Booking object from Prisma
 * @param {object} tx - Prisma transaction client
 */
const restoreInventory = async (booking, tx) => {
  const datesToRestore = getDatesInRange(booking.checkIn, booking.checkOut);
  
  for (const date of datesToRestore) {
    await tx.inventory.update({
      where: {
        roomTypeId_date: {
          roomTypeId: booking.roomTypeId,
          date
        }
      },
      data: {
        bookedRooms: { decrement: booking.rooms },
        availableRooms: { increment: booking.rooms }
      }
    });
  }
};

export const createOrder = asyncHandler(async (req, res) => {
  const validation = createOrderSchema.safeParse(req.body);
  if (!validation.success) {
    return res.status(422).json({ success: false, message: 'Validation failed', errors: validation.error.format(), requestId: req.id });
  }

  const { bookingId } = validation.data;
    
    const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found', requestId: req.id });
    
    if (booking.paymentStatus === 'PAID') {
      return res.status(400).json({ success: false, message: 'Booking already paid', requestId: req.id });
    }

    // Determine amount to charge based on Payment Type
    const config = await getSystemConfig();
    let amountToCharge = booking.totalAmount;
    if (booking.paymentType === 'PARTIAL') {
      amountToCharge = booking.totalAmount * (config.partialPaymentPercent / 100); // Dynamic upfront
    }

    const options = {
      amount: Math.round(amountToCharge * 100), // Razorpay operates in paise
      currency: "INR",
      receipt: booking.bookingRef
    };

    const order = await razorpay.orders.create(options);

    // Save Razorpay order ID to booking
    await prisma.booking.update({
      where: { id: bookingId },
      data: { razorpayOrderId: order.id }
    });

    res.status(200).json({ success: true, data: order, requestId: req.id });
});

export const verifyPayment = asyncHandler(async (req, res) => {
  const validation = verifyPaymentSchema.safeParse(req.body);
  if (!validation.success) {
    return res.status(422).json({ success: false, message: 'Validation failed', errors: validation.error.format(), requestId: req.id });
  }

  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, bookingId } = validation.data;

    const secret = process.env.RAZORPAY_KEY_SECRET;
    
    // Secure verification
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(razorpay_order_id + "|" + razorpay_payment_id)
      .digest('hex');

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({ success: false, message: 'Invalid payment signature', requestId: req.id });
    }

    const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
    
    if (booking.paymentStatus === 'PAID' || booking.paymentStatus === 'PARTIAL_PAID') {
      return res.status(200).json({ success: true, message: 'Payment already processed', requestId: req.id });
    }

    // Safety Check: If cron job cancelled the booking (late payment), trigger auto-refund!
    if (booking.status === 'CANCELLED') {
      try {
        await razorpay.payments.refund(razorpay_payment_id, {
          amount: Math.round(booking.paidAmount * 100) || Math.round(booking.totalAmount * (booking.paymentType === 'PARTIAL' ? 0.3 : 1) * 100)
        });
      } catch (refundErr) {
        console.error("Failed to process auto-refund for late payment", refundErr);
      }

      await prisma.booking.update({
        where: { id: bookingId },
        data: {
          paymentStatus: 'REFUNDED',
          razorpayPaymentId: razorpay_payment_id,
          razorpaySignature: razorpay_signature
        }
      });
      
      await prisma.auditLog.create({
        data: { 
          action: 'AUTO_REFUND_LATE_PAYMENT', 
          entityType: 'BOOKING', 
          entityId: bookingId, 
          details: { razorpay_payment_id }, 
          userId: req.user?.id,
          requestId: req.id
        }
      });

      return res.status(400).json({ success: false, message: 'Booking expired. Payment has been automatically refunded.', requestId: req.id });
    }
    
    const config = await getSystemConfig();
    const paymentStatus = booking.paymentType === 'PARTIAL' ? 'PARTIAL_PAID' : 'PAID';
    const amountPaid = booking.paymentType === 'PARTIAL' ? booking.totalAmount * (config.partialPaymentPercent / 100) : booking.totalAmount;

    await prisma.booking.update({
      where: { id: bookingId },
      data: {
        paymentStatus,
        status: 'CONFIRMED',
        razorpayPaymentId: razorpay_payment_id,
        razorpaySignature: razorpay_signature,
        paidAmount: amountPaid,
        remainingAmount: booking.totalAmount - amountPaid
      }
    });

    await prisma.auditLog.create({
      data: { 
        action: 'PAYMENT_SUCCESS', 
        entityType: 'BOOKING', 
        entityId: bookingId, 
        details: { amountPaid }, 
        userId: req.user?.id,
        requestId: req.id
      }
    });

    sendBookingConfirmationEmail(bookingId).catch(err => console.error("[EmailService] verifyPayment confirmation email dispatch failed:", err));

    res.status(200).json({ success: true, message: 'Payment verified successfully', requestId: req.id });
});

// Webhook endpoint (Public, requires raw body for signature verification)
export const webhook = asyncHandler(async (req, res) => {
  try {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    const signature = req.headers['x-razorpay-signature'];

    // Verify webhook signature using RAW body
    const shasum = crypto.createHmac('sha256', webhookSecret);
    shasum.update(req.rawBody);
    const expectedSignature = shasum.digest('hex');
    
    if (expectedSignature !== signature) {
      console.warn('⚠️ Webhook signature mismatch');
      return res.status(400).json({ success: false, message: 'Invalid signature', requestId: req.id });
    }

    const event = req.body.event;
    const payload = req.body.payload;
    console.log(`🔔 Webhook received: ${event}`);

    if (event === 'payment.captured' || event === 'payment.authorized') {
      const payment = payload.payment.entity;
      const orderId = payment.order_id;
      
      const booking = await prisma.booking.findFirst({ where: { razorpayOrderId: orderId } });
      
      if (booking && booking.paymentStatus === 'PENDING') {
        if (booking.status === 'CANCELLED') {
          // Late capture auto-refund
          await razorpay.payments.refund(payment.id, { amount: payment.amount }).catch(() => {});
          await prisma.booking.update({
            where: { id: booking.id },
            data: { paymentStatus: 'REFUNDED', razorpayPaymentId: payment.id }
          });
          return res.status(200).send('OK');
        }

        const paymentStatus = booking.paymentType === 'PARTIAL' ? 'PARTIAL_PAID' : 'PAID';
        await prisma.booking.update({
          where: { id: booking.id },
          data: {
            paymentStatus,
            status: 'CONFIRMED',
            razorpayPaymentId: payment.id,
            paidAmount: payment.amount / 100,
            remainingAmount: booking.totalAmount - (payment.amount / 100)
          }
        });

        await prisma.auditLog.create({
          data: { action: 'WEBHOOK_PAYMENT_CONFIRMED', entityType: 'BOOKING', entityId: booking.id, details: { event } }
        });

        sendBookingConfirmationEmail(booking.id).catch(err => console.error("[EmailService] Webhook confirmation email dispatch failed:", err));
      }
    } 
    else if (event === 'payment.refunded') {
      const payment = payload.payment.entity;
      const refund = payload.refund.entity;
      
      const booking = await prisma.booking.findFirst({ where: { razorpayPaymentId: payment.id } });
      
      if (booking && booking.paymentStatus !== 'REFUNDED') {
        await prisma.$transaction(async (tx) => {
          await tx.booking.update({
            where: { id: booking.id },
            data: { 
              status: 'CANCELLED', 
              paymentStatus: 'REFUNDED',
              refundAmount: payment.amount_refunded / 100,
              cancelledAt: new Date()
            }
          });
          
          await tx.refund.upsert({
            where: { bookingId: booking.id },
            update: { status: 'SUCCESS', razorpayRefundId: refund.id },
            create: {
              bookingId: booking.id,
              amount: payment.amount_refunded / 100,
              status: 'SUCCESS',
              razorpayRefundId: refund.id
            }
          });

          // Restore Inventory
          const dates = getDatesInRange(new Date(booking.checkIn), new Date(booking.checkOut));
          for (const date of dates) {
            await tx.inventory.updateMany({
              where: { roomTypeId: booking.roomTypeId, date },
              data: {
                bookedRooms: { decrement: booking.rooms },
                availableRooms: { increment: booking.rooms }
              }
            });
          }
        });

        await prisma.auditLog.create({
          data: { action: 'WEBHOOK_REFUND_SUCCESS', entityType: 'BOOKING', entityId: booking.id, details: { refundId: refund.id } }
        });
      }
    } 
    else if (event === 'payment.failed') {
      const payment = payload.payment.entity;
      const booking = await prisma.booking.findFirst({ where: { razorpayOrderId: payment.order_id } });
      
      if (booking && booking.status !== 'CANCELLED') {
        await prisma.booking.update({
          where: { id: booking.id },
          data: { paymentStatus: 'FAILED' }
        });

        await prisma.auditLog.create({
          data: { action: 'WEBHOOK_PAYMENT_FAILED', entityType: 'BOOKING', entityId: booking.id, details: { error: payment.error_description } }
        });
      }
    }

    res.status(200).send('OK');
  } catch (error) {
    console.error('Webhook Error:', error);
    res.status(500).json({ success: false, message: 'Webhook processing failed', requestId: req.id });
  }
});

export const refundPayment = asyncHandler(async (req, res) => {
  const validation = refundPaymentSchema.safeParse(req.body);
  if (!validation.success) {
    return res.status(422).json({ success: false, message: 'Validation failed', errors: validation.error.format(), requestId: req.id });
  }

  const { bookingId } = validation.data;

    const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found', requestId: req.id });
    
    if (booking.paymentStatus !== 'PAID' && booking.paymentStatus !== 'PARTIAL_PAID') {
      return res.status(400).json({ success: false, message: 'Booking not paid', requestId: req.id });
    }

    if (!booking.razorpayPaymentId) {
      return res.status(400).json({ success: false, message: 'No Razorpay Payment ID found for refund', requestId: req.id });
    }

    // Trigger Razorpay Refund
    const refund = await razorpay.payments.refund(booking.razorpayPaymentId, {
      amount: Math.round(booking.paidAmount * 100)
    });

    await prisma.$transaction(async (tx) => {
      // 1. Cancel booking and mark refunded
      await tx.booking.update({
        where: { id: bookingId },
        data: { status: 'CANCELLED', paymentStatus: 'REFUNDED', remainingAmount: booking.totalAmount }
      });

      // 2. Restore inventory
      await restoreInventory(booking, tx);
    });

    await prisma.auditLog.create({
      data: { 
        action: 'MANUAL_REFUND_ISSUED', 
        entityType: 'BOOKING', 
        entityId: bookingId, 
        details: { refundId: refund.id }, 
        userId: req.user?.id,
        requestId: req.id
      }
    });

    res.status(200).json({ success: true, message: 'Refund successful', data: refund, requestId: req.id });
});
