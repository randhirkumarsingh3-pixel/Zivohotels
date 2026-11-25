import prisma from '../config/db.js';
import eventBus from '../events/eventBus.js';
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
import { roomLinesFrom, roomsPerType } from '../domains/roomLines.js';
import { uniqueBookingRef } from '../utils/bookingRef.js';
import { payLaterDeadline, payLaterSettings } from '../domains/payLater.js';
import { sendPayLaterEmail, payLaterLabel } from './payLaterService.js';

/**
 * Loads what pricing needs for each room of a stay: its room type (of this hotel) and rate plan (of
 * that room type), checks no night is closed for sale, and the plan's daily rates.
 */
const loadStayRooms = async (lines, { hotelId, checkInDate, checkOutDate }) => {
  const typeIds = [...new Set(lines.map((l) => l.roomTypeId))];
  const planIds = [...new Set(lines.map((l) => l.ratePlanId))];
  const [types, plans] = await Promise.all([
    prisma.roomType.findMany({ where: { id: { in: typeIds } }, include: { hotel: true } }),
    prisma.ratePlan.findMany({ where: { id: { in: planIds } }, include: { occupancyPricing: true } }),
  ]);
  const typeById = new Map(types.map((t) => [t.id, t]));
  const planById = new Map(plans.map((p) => [p.id, p]));
  const hotel = typeById.get(lines[0].roomTypeId)?.hotel;
  const bad = (m) => Object.assign(new Error(m), { statusCode: 400 });

  const stayNights = getDatesInRange(checkInDate, checkOutDate);
  const closedChecked = new Set();
  const ratesByPlan = new Map();
  const rooms = [];
  for (const [i, l] of lines.entries()) {
    const roomType = typeById.get(l.roomTypeId);
    if (!roomType || roomType.isActive === false) throw bad(`The room chosen for room ${i + 1} is not available`);
    if (roomType.hotelId !== (hotelId || hotel?.id)) throw bad('All rooms must be in the same hotel');
    const ratePlan = planById.get(l.ratePlanId);
    if (!ratePlan || ratePlan.isActive === false || ratePlan.roomTypeId !== roomType.id) throw bad(`The plan chosen for room ${i + 1} is not available for ${roomType.name}`);
    if (!closedChecked.has(roomType.id)) {
      closedChecked.add(roomType.id);
      const closed = await stopSellNights(roomType.id, stayNights);
      if (closed.length) {
        throw Object.assign(new Error(`${roomType.name} isn't available on ${closed.map(d => d.toDateString()).join(', ')} (closed for sale). Please choose other dates or another room.`), { statusCode: 409, status: 409 });
      }
    }
    if (!ratesByPlan.has(ratePlan.id)) ratesByPlan.set(ratePlan.id, await dailyRatesFor(ratePlan.id, stayNights));
    rooms.push({ roomType, ratePlan, adults: l.adults, children: l.children, extraBeds: l.extraBeds, dailyRates: ratesByPlan.get(ratePlan.id) });
  }
  return { rooms, hotel };
};

/** Each room's price with its room type and plan names, for the hotel page, checkout and booking. */
const describeRooms = (pricing, rooms, lines = []) => pricing.roomsBreakdown.map((r, i) => ({
  ...r,
  roomTypeName: rooms[i].roomType.name,
  ratePlanName: rooms[i].ratePlan.name,
  mealPlan: rooms[i].ratePlan.mealPlan,
  guestName: lines[i]?.guestName || undefined,
}));

/**
 * Prices a stay and applies the best promotion it qualifies for: price it once to get the pre-tax
 * subtotal (promotion conditions like minimum amount use it), choose the promotion, then price it
 * again with that promotion. Used by preview and booking so both give the same result.
 * A promotion for some room types only discounts those rooms.
 */
const priceWithPromotion = async (stayInput, ctx) => {
  const membership = await membershipFor(ctx.userId);
  const base = pricingDomain.calculateStay(stayInput);
  const lines = stayInput.rooms.map((r, i) => ({ roomTypeId: r.roomType.id, ratePlanId: r.ratePlan.id, subtotal: base.roomsBreakdown[i].subtotal }));
  const { promotion, codeStatus } = await resolveBest({
    ...ctx, membership, subtotal: base.subtotal, lines, roomTypeId: lines[0].roomTypeId, ratePlanId: lines[0].ratePlanId,
  });
  let input = promotion ? { ...stayInput, appliedPromotion: promotion.raw, promotionRoomIndexes: promotion.roomIndexes } : stayInput;
  let pricing = promotion ? pricingDomain.calculateStay(input) : base;
  // Membership: the hotel's member price (hotel-funded) and the paid plan's extra (Zivo-funded)
  const hotelMemberPercent = stayInput.hotel?.memberDiscountPercent;
  const member = membership
    ? memberDiscounts(membership, hotelMemberPercent, pricing.subtotal - pricing.discountAmount)
    : { hotel: 0, zivo: 0 };
  if (member.hotel + member.zivo > 0) {
    input = { ...input, memberDiscountAmount: member.hotel + member.zivo };
    pricing = pricingDomain.calculateStay(input);
  }
  // Zivo Rewards: points the member chose to use (and what the stay will earn, plan multiplier included)
  const loyalty = ctx.userId
    ? await planForCheckout({ userId: ctx.userId, eligibleAmount: pricing.subtotal - pricing.discountAmount, requestedPoints: ctx.usePoints, extraMultiplier: membership?.benefits?.pointsMultiplier || 1 })
    : null;
  if (loyalty?.pointsApplied) pricing = pricingDomain.calculateStay({ ...input, loyaltyDiscountAmount: loyalty.discount });
  const membershipSummary = membership ? {
    plan: membership.plan.name, code: membership.plan.code, isPaid: membership.isPaid,
    hotelDiscount: member.hotel, zivoDiscount: member.zivo,
    hotelMemberPercent: hotelMemberPercent || 0,
    pointsMultiplier: membership.benefits.pointsMultiplier,
    freeCancelExtraHours: membership.benefits.freeCancelExtraHours,
    prioritySupport: membership.benefits.prioritySupport,
  } : null;
  return { pricing, promotion, codeStatus, loyalty, membership: membershipSummary };
};

/** Taxes and the pay-now discount, shared by preview and booking */
const pricingSettings = async () => {
  const taxRules = await prisma.taxRule.findMany({ where: { isActive: true }, orderBy: { effectiveFrom: 'desc' } });
  const systemConfig = await getSystemConfig();
  return { taxRules, systemConfig, prepaidDiscountPercent: systemConfig.prepaidDiscountPercent ?? 5 };
};

export const bookingService = {

  /**
   * Generates a preview of the booking costs
   */
  previewBooking: async (params) => {
    const { checkIn, checkOut, paymentType, couponCode } = params;
    const lines = roomLinesFrom(params);
    const checkInDate = new Date(checkIn);
    const checkOutDate = new Date(checkOut);
    const { rooms, hotel } = await loadStayRooms(lines, { hotelId: params.hotelId, checkInDate, checkOutDate });
    const { taxRules, prepaidDiscountPercent } = await pricingSettings();

    // Dynamic prices reach checkout as daily rates (dynamicPricingService), so safe mode here keeps
    // the price exactly what the hotel page showed.
    const stayInput = {
      rooms, hotel, taxRules, prepaidDiscountPercent, checkInDate, checkOutDate, paymentType,
      dynamicContext: { safeMode: true, userSegment: 'STANDARD', device: 'WEB' },
    };

    const { pricing, promotion, codeStatus, loyalty, membership } = await priceWithPromotion(stayInput, {
      hotelId: hotel.id, checkIn: checkInDate, checkOut: checkOutDate, userId: params.userId, code: couponCode, usePoints: params.usePoints
    });
    const { raw: _raw, roomIndexes: _ri, ...promotionSummary } = promotion || {};
    return {
      ...pricing,
      roomsBreakdown: describeRooms(pricing, rooms),
      promotion: promotion ? promotionSummary : null, promoCodeStatus: codeStatus, loyalty, membership,
    };
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

    // 1. The rooms: each with its room type, plan, guests and lead guest (older clients: one type
    // and plan for all rooms)
    const lines = roomLinesFrom({ ...pricingParams, roomTypeId, ratePlanId, guestName });
    const checkInDate = new Date(dates[0]);
    const checkOutDate = new Date(dates[dates.length - 1]);
    checkOutDate.setDate(checkOutDate.getDate() + 1);
    const { rooms: stayRooms, hotel } = await loadStayRooms(lines, { hotelId, checkInDate, checkOutDate });
    const roomType = stayRooms[0].roomType;
    const ratePlan = stayRooms[0].ratePlan;
    const { taxRules, systemConfig, prepaidDiscountPercent } = await pricingSettings();

    // Reserve now, pay later (PAY_AT_HOTEL): tentative until paid online by the deadline
    let payLaterBy = null;
    if (paymentType === 'PAY_AT_HOTEL') {
      payLaterBy = payLaterDeadline({ checkIn: checkInDate, settings: payLaterSettings(systemConfig.booking_settings) });
      if (!payLaterBy) {
        throw Object.assign(new Error(payLaterSettings(systemConfig.booking_settings).enabled
          ? 'Check-in is too close to pay later. Please choose Pay now.'
          : 'Pay later is not available right now. Please choose Pay now.'), { statusCode: 400 });
      }
    }

    // 2. Pricing Validation (Double Check)
    // Customers pay exactly the price shown on the hotel page and in the checkout preview, so
    // booking prices the stay the same way as previewBooking: daily rates (manual, channel manager
    // or dynamic pricing) plus the same promotion choice.
    const stayInput = {
      rooms: stayRooms, hotel, taxRules, prepaidDiscountPercent, checkInDate, checkOutDate, paymentType,
      dynamicContext: { safeMode: true, userSegment: 'STANDARD', device: 'WEB' },
    };

    const { pricing, promotion, codeStatus, loyalty, membership } = await priceWithPromotion(stayInput, {
      hotelId, checkIn: checkInDate, checkOut: checkOutDate, userId, code: couponCode, usePoints: context.usePoints
    });
    const rooms = pricing.rooms;
    const adults = pricing.adults;
    const children = pricing.children;
    const extraBeds = pricing.extraBeds;
    const roomsDetail = describeRooms(pricing, stayRooms, lines);
    const roomSummary = [...new Set(roomsDetail.map(r => r.roomTypeName))].join(', ');
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
      
      // A. Lock Inventory: each room type for the rooms booked in it (same order every time)
      for (const group of roomsPerType(lines)) {
        await inventoryRepository.lockInventory(tx, {
          roomTypeId: group.roomTypeId, checkInDate, checkOutDate, rooms: group.rooms
        });
      }


      // C. Create Booking
      // Unpaid bookings are cancelled at expiresAt: 30 minutes to pay now, or the pay-later deadline
      const expiresAt = payLaterBy || new Date(Date.now() + 30 * 60 * 1000);
      const bookingData = {
        bookingRef: await uniqueBookingRef(tx),
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
        // The first room's type and plan; every room is in BookingRoom
        roomTypeId: roomType.id,
        ratePlanId: ratePlan.id,
        paymentType,
        couponCode: promotion?.code || null,
        // Every booking is tentative (PENDING) until paid; pay later only gets longer to pay
        status: 'PENDING',
        expiresAt,
        requestId,
        userId: userId || null,
        sessionId: sessionId || null,
        metadata: {
           pricingVersion: 'DDD-V1',
           ...(payLaterBy ? { payLater: { deadline: payLaterBy.toISOString() } } : {}),
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
           taxPercentage: pricing.taxPercentage,
           ...(pricing.taxBreakdown?.length > 1 ? { taxBreakdown: pricing.taxBreakdown } : {}),
           ...(roomsDetail.some(r => r.roomTypeId !== roomType.id || r.ratePlanId !== ratePlan.id) ? { mixedRooms: true } : {})
        }
      };

      let booking = await bookingRepository.create(tx, bookingData);

      // Each room: type, plan, guests, lead guest and its share of the price
      await tx.bookingRoom.createMany({
        data: roomsDetail.map(r => ({
          bookingId: booking.id,
          roomNumber: r.roomNumber,
          roomTypeId: r.roomTypeId,
          ratePlanId: r.ratePlanId,
          adults: r.adults,
          children: r.children,
          guestName: r.guestName || guestName,
          roomPrice: r.roomPrice,
          extraGuestCharges: r.extraGuestCharges,
          mealCharges: r.mealCharges,
          extraBedCharges: r.extraBedCharges,
          subtotal: r.subtotal,
        }))
      });

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
          message: `Booking request generated for ${rooms} room${rooms > 1 ? 's' : ''} (${roomSummary}) at ${hotel.name}.`
        }
      });

      if (paymentType === 'PAY_AT_HOTEL') {
        await tx.bookingTimelineEvent.create({
          data: {
            bookingId: booking.id,
            status: 'PENDING_PAYMENT',
            title: 'Reserved: payment due',
            message: `Your rooms are held. Pay online by ${payLaterLabel(payLaterBy)} to confirm, or the booking is cancelled.`
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

      // (An invoice exists only for a paid booking: it is issued when the payment is confirmed)
      if (booking.status === 'CONFIRMED') {
        await tx.bookingTimelineEvent.create({
          data: {
            bookingId: booking.id,
            status: 'INVOICE_GENERATED',
            title: 'Invoice Generated',
            message: 'Booking invoice has been generated.'
          }
        });
      }

      // (The "trip intelligence" saved here was made up: a random airport distance and WiFi
      // rating. Removed.)



      // E. Save Pricing Snapshot (with versioning)
      if (pricing.dynamicPricing?.applied && pricing.dynamicPricing.nightlyBreakdowns) {
        const runId = Date.now().toString();
        const snapshots = pricing.dynamicPricing.nightlyBreakdowns.map(nb => ({
          bookingId: booking.id,
          hotelId,
          roomTypeId: roomType.id,
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
          where: { hotelId_roomTypeId: { hotelId, roomTypeId: roomType.id } },
          update: { lastAppliedPrice: lastNight.dynamicBreakdown.finalPrice },
          create: { hotelId, roomTypeId: roomType.id, lastAppliedPrice: lastNight.dynamicBreakdown.finalPrice }
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

    // Pay later: "reserved, pay by …" email (the confirmation follows the payment)
    if (paymentType === 'PAY_AT_HOTEL') {
      sendPayLaterEmail(bookingResult.id, 'reserved').catch(e => console.error('[PayLater] reserved email failed:', e.message));
    }
    if (bookingResult.status === 'CONFIRMED') {
      sendBookingConfirmationEmail(bookingResult.id).catch(e => console.error('[EmailService] confirmation email dispatch failed:', e));
    }
    // Paid in full with Zivo Cash: issue the invoice now
    if (bookingResult.status === 'CONFIRMED') {
      eventBus.emitEvent('BOOKING_CONFIRMED', { bookingId: bookingResult.id });
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
