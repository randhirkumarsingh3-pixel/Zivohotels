import prisma from '../config/db.js';
import { membershipFor, memberDiscounts } from './membershipService.js';
import { scheduleRecompute } from './dynamicPricingService.js';
import { pricingDomain } from '../domains/pricingDomain.js';
import { dailyRatesFor, stopSellNights } from './ariService.js';
import { getDatesInRange } from '../utils/dateUtils.js';
import { inventoryRepository } from '../repositories/inventoryRepository.js';
import { bookingRepository } from '../repositories/bookingRepository.js';
import { resolveBest, redeem } from './promotionService.js';
import { planForCheckout, redeemForBooking, recordEarnForBooking } from './loyaltyService.js';
import { payForBooking } from './finance/walletService.js';
import { roundMoney } from '../utils/money.js';
import agentService from './finance/agentService.js';
import { getSystemConfig } from '../config/systemConfig.js';
import { sendBookingConfirmationEmail } from './emailService.js';

/**
 * Prices a stay and applies the best promotion it qualifies for: price it once to get the pre-tax
 * subtotal (promotion conditions like minimum amount use it), choose the promotion, then price it
 * again with that promotion. Used by preview and booking so both give the same result.
 */
const priceWithPromotion = async (calculationInput, ctx) => {
  const membership = await membershipFor(ctx.userId);
  const base = pricingDomain.calculate(calculationInput);
  const { promotion, codeStatus } = await resolveBest({ ...ctx, membership, subtotal: base.subtotal });
  let input = promotion ? { ...calculationInput, appliedPromotion: promotion.raw } : calculationInput;
  let pricing = promotion ? pricingDomain.calculate(input) : base;
  // Membership: the hotel's member price (hotel-funded) and the paid plan's extra (Zivo-funded)
  const member = membership
    ? memberDiscounts(membership, calculationInput.roomType?.hotel?.memberDiscountPercent, pricing.subtotal - pricing.discountAmount)
    : { hotel: 0, zivo: 0 };
  if (member.hotel + member.zivo > 0) {
    input = { ...input, memberDiscountAmount: member.hotel + member.zivo };
    pricing = pricingDomain.calculate(input);
  }
  // Zivo Rewards: points the member chose to use (and what the stay will earn, plan multiplier included)
  const loyalty = ctx.userId
    ? await planForCheckout({ userId: ctx.userId, eligibleAmount: pricing.subtotal - pricing.discountAmount, requestedPoints: ctx.usePoints, extraMultiplier: membership?.benefits?.pointsMultiplier || 1 })
    : null;
  if (loyalty?.pointsApplied) pricing = pricingDomain.calculate({ ...input, loyaltyDiscountAmount: loyalty.discount });
  const membershipSummary = membership ? {
    plan: membership.plan.name, code: membership.plan.code, isPaid: membership.isPaid,
    hotelDiscount: member.hotel, zivoDiscount: member.zivo,
    hotelMemberPercent: calculationInput.roomType?.hotel?.memberDiscountPercent || 0,
    pointsMultiplier: membership.benefits.pointsMultiplier,
    freeCancelExtraHours: membership.benefits.freeCancelExtraHours,
    prioritySupport: membership.benefits.prioritySupport,
  } : null;
  return { pricing, promotion, codeStatus, loyalty, membership: membershipSummary };
};

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

    // 2. Pricing preview. Dynamic prices reach checkout as daily rates (dynamicPricingService), so
    // safe mode here keeps the price exactly what the hotel page showed.
    const dynamicContext = {
      safeMode: true,
      availableRooms: roomType.totalInventory,
      userSegment: 'STANDARD',
      device: 'WEB'
    };

    // Daily rates and stop-sell from Inventory & Rates / the property's channel manager
    const stayNights = getDatesInRange(checkInDate, checkOutDate);
    const closed = await stopSellNights(roomType.id, stayNights);
    if (closed.length) {
      throw new Error(`${roomType.name} isn't available on ${closed.map(d => d.toDateString()).join(', ')}. Please choose other dates or another room.`);
    }
    const dailyRates = await dailyRatesFor(ratePlan.id, stayNights);

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
      dynamicContext,
      dailyRates
    };

    const { pricing, promotion, codeStatus, loyalty, membership } = await priceWithPromotion(calculationInput, {
      hotelId: roomType.hotelId, roomTypeId, ratePlanId, checkIn: checkInDate, checkOut: checkOutDate, userId: params.userId, code: couponCode, usePoints: params.usePoints
    });
    const { raw: _raw, ...promotionSummary } = promotion || {};
    return { ...pricing, promotion: promotion ? promotionSummary : null, promoCodeStatus: codeStatus, loyalty, membership };
  },

  /**
   * Orchestrates the creation of a new booking
   */
  createBooking: async (userId, hotelId, roomTypeId, dates, pricingParams, context = {}) => {
    const { 
      guestName, guestEmail, guestPhone, 
      ratePlanId, paymentType, couponCode, 
      requestId, sessionId, agentId, company
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

    // 2. Pricing Validation (Double Check)
    // Customers pay exactly the price shown on the hotel page and in the checkout preview, so
    // booking prices the stay the same way as previewBooking: daily rates (manual, channel manager
    // or dynamic pricing) plus the same promotion choice.
    const dynamicContext = {
      safeMode: true,
      availableRooms: roomType.totalInventory,
      userSegment: 'STANDARD',
      device: 'WEB'
    };

    // Daily rates and stop-sell from Inventory & Rates / the property's channel manager
    const stayNights = getDatesInRange(checkInDate, checkOutDate);
    const closed = await stopSellNights(roomType.id, stayNights);
    if (closed.length) {
      throw new Error(`${roomType.name} isn't available on ${closed.map(d => d.toDateString()).join(', ')}. Please choose other dates or another room.`);
    }
    const dailyRates = await dailyRatesFor(ratePlan.id, stayNights);

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
      dynamicContext,
      dailyRates
    };

    const { pricing, promotion, codeStatus, loyalty, membership } = await priceWithPromotion(calculationInput, {
      hotelId, roomTypeId, ratePlanId, checkIn: checkInDate, checkOut: checkOutDate, userId, code: couponCode, usePoints: context.usePoints
    });
    if (context.usePoints && loyalty?.reason) throw Object.assign(new Error(loyalty.reason), { statusCode: 400 });
    if (couponCode && codeStatus && !codeStatus.ok && !promotion) {
      throw Object.assign(new Error(codeStatus.message), { statusCode: 400 });
    }
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


      // C. Create Booking
      const expiresAt = new Date(Date.now() + (paymentType === 'PAY_AT_HOTEL' ? 24 * 60 : 30) * 60 * 1000);
      const bookingData = {
        bookingRef: `ZIVO-${Math.floor(100000 + Math.random() * 900000)}`,
        guestName, guestEmail, guestPhone,
        guestCompanyName: company?.name || null,
        guestCompanyGstin: company?.gstin || null,
        guestCompanyAddress: company?.address || null,
        checkIn: checkInDate,
        checkOut: checkOutDate,
        guests: adults + children,
        adults, children, rooms, extraBeds,
        totalAmount: pricing.finalAmount,
        // Price breakdown, so invoices and settlements show the real tax (not 0)
        baseAmount: pricing.baseAmount,
        taxAmount: pricing.taxAmount,
        roomPrice: pricing.roomPrice,
        extraGuestCharges: pricing.extraGuestCharges,
        extraBedCharges: pricing.extraBedCharges,
        mealCharges: pricing.mealCharges,
        hotelId,
        roomTypeId,
        ratePlanId,
        paymentType,
        couponCode: promotion?.code || null,
        status: paymentType === 'PAY_AT_HOTEL' ? 'CONFIRMED' : 'PENDING',
        expiresAt,
        requestId,
        userId: userId || null,
        sessionId: sessionId || null,
        metadata: {
           pricingVersion: 'DDD-V1',
           ratePlanName: ratePlan.name,
           discountAmount: pricing.discountAmount,
           couponDiscountAmount: pricing.couponDiscountAmount,
           prepaidDiscountAmount: pricing.prepaidDiscountAmount,
           promotion: promotion ? {
             id: promotion.id, name: promotion.name, code: promotion.code, label: promotion.label,
             discountAmount: pricing.promotionDiscountAmount, fundedBy: promotion.fundedBy, platform: promotion.platform
           } : null,
           // Membership at booking time: discounts (Zivo-funded part paid to the hotel in the
           // settlement), extended free cancellation and priority support
           membership: membership && (membership.isPaid || membership.hotelDiscount > 0) ? membership : null,
           loyalty: loyalty ? {
             pointsRedeemed: loyalty.pointsApplied, discountAmount: pricing.loyaltyDiscountAmount,
             pointsEarned: loyalty.earn, tier: loyalty.tier?.name, fundedBy: 'ZIVO'
           } : null,
           taxPercentage: pricing.taxPercentage
        }
      };

      let booking = await bookingRepository.create(tx, bookingData);

      // Zivo Cash: pay what is due now (full amount, or the part-payment) from the guest's wallet.
      // If it covers all of it the booking is confirmed straight away; otherwise the rest is paid
      // online and the wallet part is returned if that never happens.
      let walletPaidInFull = false;
      if (context.useWallet && userId && paymentType !== 'PAY_AT_HOTEL') {
        const dueNow = paymentType === 'PARTIAL'
          ? roundMoney(pricing.finalAmount * ((systemConfig.partialPaymentPercent ?? 30) / 100))
          : pricing.finalAmount;
        const used = await payForBooking(tx, { userId, bookingId: booking.id, bookingRef: booking.bookingRef, amountDue: dueNow });
        if (used > 0) {
          walletPaidInFull = used >= dueNow;
          booking = await tx.booking.update({
            where: { id: booking.id },
            data: {
              walletAmount: used,
              ...(walletPaidInFull ? {
                status: 'CONFIRMED',
                paymentStatus: paymentType === 'PARTIAL' ? 'PARTIAL_PAID' : 'PAID',
                paidAmount: used,
                remainingAmount: roundMoney(pricing.finalAmount - used),
              } : {}),
            }
          });
        }
      }

      // Zivo Rewards: spend the points chosen (checked again under a lock) and record what the stay
      // earns (pending until check-out)
      if (loyalty?.pointsApplied) {
        await redeemForBooking(tx, { userId, bookingId: booking.id, points: loyalty.pointsApplied, bookingRef: booking.bookingRef });
      }
      if (loyalty?.earn) {
        await recordEarnForBooking(tx, { userId, bookingId: booking.id, points: loyalty.earn, bookingRef: booking.bookingRef, tierName: loyalty.tier?.name });
      }

      // B. Promotion: recorded with its limits checked again under a lock
      if (promotion && pricing.promotionDiscountAmount > 0) {
        await redeem(tx, { promotionId: promotion.id, bookingId: booking.id, userId, hotelId, discountAmount: pricing.promotionDiscountAmount });
      }

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
      } else if (walletPaidInFull) {
        await tx.bookingTimelineEvent.create({
          data: {
            bookingId: booking.id,
            status: 'CONFIRMED',
            title: 'Booking Confirmed',
            message: `Paid ₹${Number(booking.walletAmount).toLocaleString('en-IN')} with Zivo Cash. Your stay is confirmed.`
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

      // F. Hotel settlement and ledger entries are created at check-out
      // (settlementService.createForCheckout), not here: an unpaid or cancelled booking must not
      // become money owed to the hotel.

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

    // 7. Channel manager: a property connected to one gets its bookings by pulling them from
    // GET /api/v1/channel-manager/bookings (services/channelConnectivityService.js). The old code
    // here "pushed" to a stub adapter that only logged and returned a made-up reference.

    // 8. Loyalty points are recorded inside the transaction above (Zivo Rewards).

    if (paymentType === 'PAY_AT_HOTEL' || bookingResult.status === 'CONFIRMED') {
      sendBookingConfirmationEmail(bookingResult.id).catch(e => console.error('[EmailService] PAY_AT_HOTEL confirmation email dispatch failed:', e));
    }

    // Occupancy changed: refresh this property's dynamic prices (debounced, in the background).
    scheduleRecompute(hotelId);

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
