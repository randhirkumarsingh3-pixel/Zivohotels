import crypto from 'crypto';
import { scheduleRecompute } from '../services/dynamicPricingService.js';
import Razorpay from 'razorpay';
import { inventoryRepository } from '../repositories/inventoryRepository.js';
import prisma from '../config/db.js';
import eventBus from '../events/eventBus.js';
import { getDatesInRange } from '../utils/dateUtils.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { getSystemConfig } from '../config/systemConfig.js';
import { z } from 'zod';
import { sendBookingConfirmationEmail } from '../services/emailService.js';
import { roundMoney, toMoney } from '../utils/money.js';
import { bookingForExtensionOrder, applyExtension } from '../services/hourlyExtension.js';
import { isDateChangeOrder, applyPaid as applyDateChange } from '../services/dateChangeService.js';
import { feeDueNow, feeOf } from '../services/serviceFee.js';

// Keys are validated at server boot in server.js — no fallbacks here.
const razorpay = new Razorpay({
  key_id:     process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// Constant-time comparison of two hex signatures (avoids timing attacks).
const signaturesMatch = (expected, received) => {
  if (typeof expected !== 'string' || typeof received !== 'string') return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(received);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

// A customer may only pay for their own booking; admins may act on any booking.
const canPayForBooking = (booking, user) =>
  booking && (user?.role === 'ADMIN' || booking.userId === user?.id);

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
  if (booking.stayType === 'HOURLY') return; // hourly stays never take night rooms
  scheduleRecompute(booking.hotelId); // rooms freed up: refresh dynamic prices shortly
  const datesToRestore = getDatesInRange(booking.checkIn, booking.checkOut);
  
  // Each room type of the booking (rooms of one booking can be different types)
  for (const group of await inventoryRepository.roomsByType(tx, booking)) {
    for (const date of datesToRestore) {
      await tx.inventory.update({
        where: {
          roomTypeId_date: {
            roomTypeId: group.roomTypeId,
            date
          }
        },
        data: {
          bookedRooms: { decrement: group.rooms },
          availableRooms: { increment: group.rooms }
        }
      });
    }
  }
};

export const createOrder = asyncHandler(async (req, res) => {
  const validation = createOrderSchema.safeParse(req.body);
  if (!validation.success) {
    return res.status(422).json({ success: false, message: 'Validation failed', errors: validation.error.format(), requestId: req.id });
  }

  const { bookingId } = validation.data;
    
    const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
    if (!canPayForBooking(booking, req.user)) {
      return res.status(404).json({ success: false, message: 'Booking not found', requestId: req.id });
    }
    
    if (booking.paymentStatus === 'PAID') {
      return res.status(400).json({ success: false, message: 'Booking already paid', requestId: req.id });
    }
    // Unpaid bookings are cancelled at their deadline (30 minutes, or the pay-later deadline)
    if (booking.status === 'CANCELLED' || (booking.status === 'PENDING' && booking.expiresAt && new Date(booking.expiresAt) <= new Date())) {
      return res.status(400).json({ success: false, message: 'The time to pay for this booking has ended, so it was cancelled. Please book again.', requestId: req.id });
    }

    // Determine amount to charge based on Payment Type
    const config = await getSystemConfig();
    let amountToCharge = booking.totalAmount;
    if (booking.paymentType === 'PARTIAL') {
      amountToCharge = roundMoney(booking.totalAmount * (config.partialPaymentPercent / 100)); // Dynamic upfront, to the paisa
    }
    // ZivoPlus's service fee (if any) is paid with the first payment; Zivo Cash already used isn't
    // charged again
    amountToCharge = roundMoney(amountToCharge + feeDueNow(booking) - (toMoney(booking.walletAmount) || 0));
    if (!(amountToCharge > 0)) {
      return res.status(400).json({ success: false, message: 'Nothing left to pay for this booking', requestId: req.id });
    }

    const options = {
      amount: Math.round(amountToCharge * 100), // Razorpay operates in paise
      currency: "INR",
      receipt: booking.bookingRef
    };

    let order;
    try {
      order = await razorpay.orders.create(options);
    } catch (gatewayError) {
      // Never pass Razorpay's own status through: its 401 ("Authentication failed", i.e. bad API
      // keys) looked like an expired session, and the website logged the guest out mid-checkout.
      console.error('[Payments] Razorpay order creation failed:', gatewayError?.statusCode, gatewayError?.error?.description || gatewayError?.message);
      return res.status(502).json({
        success: false,
        message: 'Online payment is unavailable right now. Please try again in a few minutes.',
        requestId: req.id
      });
    }

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

    if (!signaturesMatch(expectedSignature, razorpay_signature)) {
      return res.status(400).json({ success: false, message: 'Invalid payment signature', requestId: req.id });
    }

    const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
    if (!canPayForBooking(booking, req.user)) {
      return res.status(404).json({ success: false, message: 'Booking not found', requestId: req.id });
    }

    // The signed order must be the order created for THIS booking. Without this check a valid
    // signature from a cheap booking could be replayed to mark a different booking as paid.
    if (!booking.razorpayOrderId || booking.razorpayOrderId !== razorpay_order_id) {
      return res.status(400).json({ success: false, message: 'Payment does not match this booking', requestId: req.id });
    }
    
    if (booking.paymentStatus === 'PAID' || booking.paymentStatus === 'PARTIAL_PAID') {
      return res.status(200).json({ success: true, message: 'Payment already processed', requestId: req.id });
    }

    // Safety Check: If cron job cancelled the booking (late payment), trigger auto-refund!
    if (booking.status === 'CANCELLED') {
      try {
        await razorpay.payments.refund(razorpay_payment_id, {
          // Only the card / UPI part; Zivo Cash used on it is returned to the wallet automatically
          amount: Math.round((roundMoney(booking.totalAmount * (booking.paymentType === 'PARTIAL' ? ((await getSystemConfig()).partialPaymentPercent / 100) : 1)) + feeDueNow(booking) - (toMoney(booking.walletAmount) || 0)) * 100)
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
    // Same rounding as the order amount in createOrder, so paid + remaining = total exactly
    const amountPaid = booking.paymentType === 'PARTIAL' ? roundMoney(booking.totalAmount * (config.partialPaymentPercent / 100)) : booking.totalAmount;

    await prisma.booking.update({
      where: { id: bookingId },
      data: {
        paymentStatus,
        status: 'CONFIRMED',
        // Reserve now, pay later: paid online now, so it is a prepaid booking from here on
        ...(booking.paymentType === 'PAY_AT_HOTEL' ? { paymentType: 'PREPAID' } : {}),
        razorpayPaymentId: razorpay_payment_id,
        razorpaySignature: razorpay_signature,
        paidAmount: amountPaid,
        remainingAmount: roundMoney(booking.totalAmount - amountPaid),
        // The service fee came with this payment
        ...(feeDueNow(booking) > 0 ? { metadata: { ...(booking.metadata || {}), serviceFeePaid: true } } : {}),
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
    // Paid online: issue the invoice (generated in the background, idempotent)
    eventBus.emitEvent('BOOKING_CONFIRMED', { bookingId });

    res.status(200).json({ success: true, message: 'Payment verified successfully', requestId: req.id });
});

// Webhook endpoint (Public, requires raw body for signature verification)
export const webhook = asyncHandler(async (req, res) => {
  try {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    const signature = req.headers['x-razorpay-signature'];

    if (!webhookSecret || !req.rawBody) {
      console.error('Webhook rejected: RAZORPAY_WEBHOOK_SECRET or raw body missing');
      return res.status(500).json({ success: false, message: 'Webhook not configured', requestId: req.id });
    }

    // Verify webhook signature using RAW body
    const shasum = crypto.createHmac('sha256', webhookSecret);
    shasum.update(req.rawBody);
    const expectedSignature = shasum.digest('hex');
    
    if (!signaturesMatch(expectedSignature, signature)) {
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

      // Extra hours on an hourly stay (its own order): extend it, unless the page already did
      if (!booking) {
        const ext = await bookingForExtensionOrder(orderId);
        if (ext) {
          await applyExtension(ext.id, { orderId, paymentId: payment.id, paidPaise: payment.amount })
            .catch((err) => console.error('[Webhook] Extension not applied:', err.message));
        }
        // A date change's difference (its own order): move the booking, unless the page already did
        else if (await isDateChangeOrder(orderId)) {
          await applyDateChange(orderId, payment.id, payment.amount)
            .catch((err) => console.error('[Webhook] Date change not applied:', err.message));
        }
        return res.status(200).send('OK');
      }
      
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
            ...(booking.paymentType === 'PAY_AT_HOTEL' ? { paymentType: 'PREPAID' } : {}),
            razorpayPaymentId: payment.id,
            // Card / UPI amount plus any Zivo Cash used on the booking, less the service fee it carried
            paidAmount: roundMoney(payment.amount / 100 + (toMoney(booking.walletAmount) || 0) - feeDueNow(booking)),
            remainingAmount: roundMoney(booking.totalAmount - (payment.amount / 100) - (toMoney(booking.walletAmount) || 0) + feeDueNow(booking)),
            ...(feeDueNow(booking) > 0 ? { metadata: { ...(booking.metadata || {}), serviceFeePaid: true } } : {}),
          }
        });

        await prisma.auditLog.create({
          data: { action: 'WEBHOOK_PAYMENT_CONFIRMED', entityType: 'BOOKING', entityId: booking.id, details: { event }, userId: 'SYSTEM' }
        });

        sendBookingConfirmationEmail(booking.id).catch(err => console.error("[EmailService] Webhook confirmation email dispatch failed:", err));
        eventBus.emitEvent('BOOKING_CONFIRMED', { bookingId: booking.id });
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

          // Restore Inventory — but only if the booking wasn't already cancelled through
          // cancelBooking/failBooking, which restore inventory themselves (avoids double restore).
          const dates = booking.status === 'CANCELLED'
            ? []
            : getDatesInRange(new Date(booking.checkIn), new Date(booking.checkOut));
          const groups = dates.length ? await inventoryRepository.roomsByType(tx, booking) : [];
          for (const group of groups) {
            for (const date of dates) {
              await tx.inventory.updateMany({
                where: { roomTypeId: group.roomTypeId, date },
                data: {
                  bookedRooms: { decrement: group.rooms },
                  availableRooms: { increment: group.rooms }
                }
              });
            }
          }
        });

        await prisma.auditLog.create({
          data: { action: 'WEBHOOK_REFUND_SUCCESS', entityType: 'BOOKING', entityId: booking.id, details: { refundId: refund.id }, userId: 'SYSTEM' }
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
          data: { action: 'WEBHOOK_PAYMENT_FAILED', entityType: 'BOOKING', entityId: booking.id, details: { error: payment.error_description }, userId: 'SYSTEM' }
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
    // Card / UPI part only; Zivo Cash used on the booking goes back to the wallet automatically
    // (with the service fee: a full refund returns it too)
    const fee = feeOf(booking);
    const feeBack = fee.paid && !(fee.refunded > 0) ? fee.amount : 0;
    const refund = await razorpay.payments.refund(booking.razorpayPaymentId, {
      amount: Math.round(((toMoney(booking.paidAmount) || 0) + feeBack - (toMoney(booking.walletAmount) || 0)) * 100)
    });

    await prisma.$transaction(async (tx) => {
      // 1. Cancel booking and mark refunded
      await tx.booking.update({
        where: { id: bookingId },
        data: { status: 'CANCELLED', paymentStatus: 'REFUNDED', remainingAmount: booking.totalAmount, ...(feeBack > 0 ? { metadata: { ...(booking.metadata || {}), serviceFeeRefunded: feeBack } } : {}) }
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
