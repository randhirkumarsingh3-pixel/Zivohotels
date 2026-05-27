import prisma from '../config/db.js';
import { pricingDomain } from '../domains/pricingDomain.js';
import { inventoryRepository } from '../repositories/inventoryRepository.js';
import { bookingRepository } from '../repositories/bookingRepository.js';
import { couponService } from './couponService.js';
import channelManagerService from './channel/channelManagerService.js';
import ledgerService from './finance/ledgerService.js';
import settlementService from './finance/settlementService.js';
import loyaltyService from './finance/loyaltyService.js';
import agentService from './finance/agentService.js';
import { getSystemConfig } from '../config/systemConfig.js';
import { sendBookingConfirmationEmail } from './emailService.js';

export const bookingService = {

  /**
   * Generates a preview of the booking costs
   */
  previewBooking: async (params) => {
    const { roomTypeId, ratePlanId, checkIn, checkOut, rooms, adults, children, extraBeds, paymentType, couponCode } = params;

    // 1. Fetch Dependencies
    const roomType = await prisma.roomType.findUnique({
      where: { id: roomTypeId },
      include: { hotel: true }
    });
    if (!roomType) throw new Error('Room type not found');

    const ratePlan = await prisma.ratePlan.findUnique({
      where: { id: ratePlanId },
      include: { occupancyPricing: true }
    });
    if (!ratePlan) throw new Error('Rate plan not found');

    const checkInDate = new Date(checkIn);
    const checkOutDate = new Date(checkOut);

    const taxRules = await prisma.taxRule.findMany({
      where: { isActive: true },
      orderBy: { effectiveFrom: 'desc' }
    });

    const systemConfig = await getSystemConfig();
    const prepaidDiscountPercent = systemConfig.prepaidDiscountPercent ?? 5;

    let appliedCoupon = null;
    if (couponCode) {
      appliedCoupon = await prisma.coupon.findUnique({
        where: { code: couponCode, isActive: true }
      });
      if (appliedCoupon && new Date(appliedCoupon.expiry) < new Date()) {
         appliedCoupon = null;
      }
    }

    // 2. Pricing Preview (Safe Mode - no dynamic pricing adjustments)
    // Preview always shows stable base-rate pricing so the checkout matches
    // what the user saw on the hotel detail page. Dynamic pricing is applied
    // only when the actual booking is confirmed (createBooking).
    const dynamicContext = {
      safeMode: true,
      availableRooms: roomType.totalInventory,
      userSegment: 'STANDARD',
      device: 'WEB'
    };

    const calculationInput = {
      roomType,
      ratePlan,
      taxRules,
      prepaidDiscountPercent,
      checkInDate,
      checkOutDate,
      rooms,
      adults,
      children,
      extraBeds,
      paymentType,
      appliedCoupon,
      dynamicContext
    };

    return pricingDomain.calculate(calculationInput);
  },

  /**
   * Orchestrates the creation of a new booking
   */
  createBooking: async (userId, hotelId, roomTypeId, dates, pricingParams, context = {}) => {
    const { 
      guestName, guestEmail, guestPhone, 
      ratePlanId, paymentType, couponCode, 
      requestId, sessionId, agentId 
    } = context;

    // 1. Fetch Dependencies (Pre-Transaction)
    const roomType = await prisma.roomType.findUnique({
      where: { id: roomTypeId },
      include: { hotel: true }
    });
    if (!roomType) throw new Error('Room type not found');

    const ratePlan = await prisma.ratePlan.findUnique({
      where: { id: ratePlanId },
      include: { occupancyPricing: true }
    });
    if (!ratePlan) throw new Error('Rate plan not found');

    const checkInDate = new Date(dates[0]);
    const checkOutDate = new Date(dates[dates.length - 1]);
    checkOutDate.setDate(checkOutDate.getDate() + 1);
    const rooms = pricingParams.rooms || 1;
    const adults = pricingParams.adults || 2;
    const children = pricingParams.children || 0;
    const extraBeds = pricingParams.extraBeds || 0;

    const taxRules = await prisma.taxRule.findMany({
      where: { isActive: true },
      orderBy: { effectiveFrom: 'desc' }
    });

    const systemConfig = await getSystemConfig();
    const prepaidDiscountPercent = systemConfig.prepaidDiscountPercent ?? 5;

    let appliedCoupon = null;
    if (couponCode) {
      appliedCoupon = await prisma.coupon.findUnique({
        where: { code: couponCode, isActive: true }
      });
      if (appliedCoupon && new Date(appliedCoupon.expiry) < new Date()) {
         appliedCoupon = null;
      }
    }

    // 2. Pricing Validation (Double Check)
    const dynamicContext = {
      safeMode: false,
      availableRooms: roomType.totalInventory,
      userSegment: 'STANDARD',
      device: 'WEB'
    };

    const calculationInput = {
      roomType,
      ratePlan,
      taxRules,
      prepaidDiscountPercent,
      checkInDate,
      checkOutDate,
      rooms,
      adults,
      children,
      extraBeds,
      paymentType,
      appliedCoupon,
      dynamicContext
    };

    const pricing = pricingDomain.calculate(calculationInput);
    Object.freeze(pricing);

    // 3. B2B Agent Authorization (Phase 8.7)
    if (agentId) {
      await agentService.authorizeBooking(agentId, pricing.finalAmount);
    }

    // 4. Execute Transactional Core
    const bookingResult = await prisma.$transaction(async (tx) => {
      
      // A. Lock Inventory
      await inventoryRepository.lockInventory(tx, {
        roomTypeId, checkInDate, checkOutDate, rooms
      });

      // B. Optional: Consume Coupon
      let appliedCoupon = null;
      if (couponCode) {
        appliedCoupon = await couponService.consumeCoupon(tx, couponCode, userId);
      }

      // C. Create Booking
      const expiresAt = new Date(Date.now() + (paymentType === 'PAY_AT_HOTEL' ? 24 * 60 : 30) * 60 * 1000);
      const bookingData = {
        bookingRef: `ZIVO-${Math.floor(100000 + Math.random() * 900000)}`,
        guestName, guestEmail, guestPhone,
        checkIn: checkInDate,
        checkOut: checkOutDate,
        guests: adults + children,
        adults, children, rooms, extraBeds,
        totalAmount: pricing.finalAmount,
        hotelId,
        roomTypeId,
        ratePlanId,
        paymentType,
        couponCode,
        status: paymentType === 'PAY_AT_HOTEL' ? 'CONFIRMED' : 'PENDING',
        expiresAt,
        requestId,
        userId: userId || null,
        sessionId: sessionId || null,
        metadata: {
           pricingVersion: 'DDD-V1',
           ratePlanName: ratePlan.name
        }
      };

      const booking = await bookingRepository.create(tx, bookingData);

      // Initialize operational timeline
      await tx.bookingTimelineEvent.create({
        data: {
          bookingId: booking.id,
          status: 'BOOKING_INITIATED',
          title: 'Booking Initiated',
          message: `Booking request generated for ${roomType.name} at ${roomType.hotel.name}.`
        }
      });

      if (paymentType === 'PAY_AT_HOTEL') {
        await tx.bookingTimelineEvent.create({
          data: {
            bookingId: booking.id,
            status: 'CONFIRMED',
            title: 'Booking Confirmed',
            message: 'Your stay is confirmed. Payment will be collected at the hotel.'
          }
        });
      } else {
        await tx.bookingTimelineEvent.create({
          data: {
            bookingId: booking.id,
            status: 'PENDING_PAYMENT',
            title: 'Pending Payment',
            message: 'Waiting for payment confirmation.'
          }
        });
      }

      await tx.bookingTimelineEvent.create({
        data: {
          bookingId: booking.id,
          status: 'INVOICE_GENERATED',
          title: 'Invoice Generated',
          message: 'Booking invoice has been generated.'
        }
      });

      // Generate trip intelligence snapshot
      const airportDistance = `${Math.floor(15 + Math.random() * 20)} mins`;
      const peakCheckIn = '12:00 PM - 2:00 PM';
      const wifiRating = Math.random() > 0.3 ? 'Excellent' : 'Good';
      const aiTags = ['Business Friendly', 'High WiFi Speed', 'Clean Room Guarantee'];
      if (adults + children > 2) aiTags.push('Family Pick');

      await tx.bookingIntelligence.create({
        data: {
          bookingId: booking.id,
          wifiRating,
          peakCheckIn,
          airportDistance,
          aiTags
        }
      });


      // E. Save Pricing Snapshot (with versioning)
      if (pricing.dynamicPricing?.applied && pricing.dynamicPricing.nightlyBreakdowns) {
        const runId = Date.now().toString();
        const snapshots = pricing.dynamicPricing.nightlyBreakdowns.map(nb => ({
          bookingId: booking.id,
          hotelId,
          roomTypeId,
          date: new Date(nb.date),
          basePrice: nb.dynamicBreakdown?.basePrice || nb.basePricePerRoom,
          finalPrice: nb.dynamicBreakdown?.finalPrice || nb.basePricePerRoom,
          breakdown: {
            ...(nb.dynamicBreakdown || {}),
            pricingVersion: 'ai_v1_beta',
            model: nb.dynamicBreakdown?.aiModel || 'rule-based',
            source: nb.dynamicBreakdown?.aiSource || 'SYSTEM',
            workerRunId: runId
          }
        }));
        if (snapshots.length > 0) {
          await tx.pricingSnapshot.createMany({ data: snapshots });
        }
      }

      // F. Financial Logic (Phase 8.5)
      const commissionPercent = 15; // Default 15% Zivo commission
      const taxPercent = 12; // Default 12% GST

      const settlement = await settlementService.createSettlement({
        bookingId: booking.id,
        hotelId,
        grossAmount: pricing.finalAmount,
        commissionPercent,
        taxPercent
      }, tx);

      await ledgerService.record([
        { 
          referenceId: booking.id, 
          account: 'USER', 
          type: 'DEBIT', 
          amount: pricing.finalAmount, 
          description: `Booking ${booking.id} payment` 
        },
        { 
          referenceId: booking.id, 
          account: 'HOTEL', 
          type: 'CREDIT', 
          amount: settlement.netPayable, 
          description: `Net payable for booking ${booking.id}` 
        },
        { 
          referenceId: booking.id, 
          account: 'ZIVO', 
          type: 'CREDIT', 
          amount: settlement.commissionAmount, 
          description: `Commission for booking ${booking.id}` 
        }
      ], tx);

      // G. Update PricingState for rate-change cap memory
      const lastNight = pricing.dynamicPricing?.nightlyBreakdowns?.at(-1);
      if (lastNight?.dynamicBreakdown?.finalPrice) {
        await tx.pricingState.upsert({
          where: { hotelId_roomTypeId: { hotelId, roomTypeId } },
          update: { lastAppliedPrice: lastNight.dynamicBreakdown.finalPrice },
          create: { hotelId, roomTypeId, lastAppliedPrice: lastNight.dynamicBreakdown.finalPrice }
        });
      }

      // H. B2B Agent Credit Utilization (Phase 8.7)
      if (agentId) {
        await agentService.utilizeCredit(agentId, pricing.finalAmount, tx);
      }

      return booking;
    }, { timeout: 10000 });

    // 7. Channel Manager Sync (Phase 8)
    const hotel = await prisma.hotel.findUnique({
      where: { id: hotelId },
      select: { integrationMode: true }
    });
    if (hotel?.integrationMode === 'CHANNEL_MANAGER') {
      channelManagerService.pushBooking(hotelId, bookingResult)
        .catch(e => console.error('[ChannelManager] Async push failed:', e.message));
    }

    // 8. Loyalty Reward (Phase 8.7)
    if (userId) {
      const points = loyaltyService.calculateEarnedPoints(pricing.finalAmount);
      loyaltyService.awardPoints(userId, points, 'BOOKING')
        .catch(e => console.error('[Loyalty] Error awarding points:', e));
    }

    if (paymentType === 'PAY_AT_HOTEL') {
      sendBookingConfirmationEmail(bookingResult.id).catch(e => console.error('[EmailService] PAY_AT_HOTEL confirmation email dispatch failed:', e));
    }

    return { booking: bookingResult, isIdempotent: false };
  },

  /**
   * Fail a booking gracefully
   */
  failBooking: async (id, context) => {
    const booking = await bookingRepository.findById(id);
    if (!booking) throw new Error('Booking not found');
    if (booking.status !== 'PENDING') throw new Error('Only PENDING bookings can be marked as failed.');

    await prisma.$transaction(async (tx) => {
      await bookingRepository.update(tx, id, { status: 'CANCELLED' });
      await inventoryRepository.restoreInventory(tx, booking);
      await bookingRepository.logAudit(tx, {
        action: 'BOOKING_FAILED',
        entityType: 'BOOKING',
        entityId: id,
        userId: context.userId || 'SYSTEM',
        details: { reason: 'Payment or Manual Failure' }
      });
    });
    return true;
  },

  updateBookingStatus: async (bookingId, newStatus, context) => {
    const { transitionBookingStatus } = await import('./bookingStateMachine.js');
    return transitionBookingStatus(bookingId, newStatus, context.userId);
  }
};

export default bookingService;
