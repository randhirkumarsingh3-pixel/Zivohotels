import { getDatesInRange } from '../utils/dateUtils.js';
import revenueDomain from './revenueDomain.js';
import dynamicPricingDomain from './dynamicPricingDomain.js';
import { discountFor } from './promotionDomain.js';

/**
 * Pricing Domain (Pure Business Logic)
 * 
 * Rules:
 * - NO database queries (Prisma)
 * - NO external side-effects
 * - Pure Input -> Output
 */
export const pricingDomain = {
  
  /**
   * Main calculation engine for booking costs
   * 
   * @param {Object} input
   * @param {Object} input.roomType - Room Type config
   * @param {Object} input.ratePlan - Rate Plan config
   * @param {Array} input.taxRules - List of tax slabs
   * @param {Number} input.prepaidDiscountPercent - Discount percentage
   * @param {Date} input.checkInDate - Check-in date
   * @param {Date} input.checkOutDate - Check-out date
   * @param {Number} input.rooms - Number of rooms
   * @param {Number} input.adults - Number of adults
   * @param {Number} input.children - Number of children
   * @param {Number} input.extraBeds - Number of extra beds
   * @param {String} input.paymentType - PREPAID, PAY_AT_HOTEL, PARTIAL
   * @param {Object} input.dynamicContext - Context for dynamic pricing (demandScore, rules, safeMode)
   * @returns {Object} Calculated fiscal data
   */
  calculate: (input) => {
    const { 
      roomType, ratePlan, taxRules, prepaidDiscountPercent,
      checkInDate, checkOutDate, rooms, adults, children, 
      extraBeds, paymentType, appliedCoupon = null,
      appliedPromotion = null, // promotion chosen by promotionService (one per booking)
      loyaltyDiscountAmount = 0, // Zivo Rewards points used (rupees), worked out by loyaltyService
      memberDiscountAmount = 0, // member prices (hotel) + paid-plan extra (Zivo), from membershipService
      dynamicContext = null,
      dailyRates = {} // { [night ISO string]: price } from Inventory & Rates / the channel manager
    } = input;

    const datesToBook = getDatesInRange(checkInDate, checkOutDate);
    const nights = datesToBook.length;

    if (nights <= 0) throw new Error('Check-out must be after check-in');

    // Guests validation
    const guests = adults + children;
    const guestsPerRoom = Math.ceil(guests / rooms);
    
    if (guestsPerRoom > (roomType.maxOccupancy || 2)) {
      throw new Error(`Guests per room (${guestsPerRoom}) exceeds max occupancy (${roomType.maxOccupancy})`);
    }

    const extraBedsPerRoom = Math.ceil(extraBeds / rooms);
    if (!roomType.extraBedAllowed && extraBeds > 0) {
      throw new Error("Extra beds are not allowed for this room type");
    }
    if (extraBedsPerRoom > (roomType.maxExtraBeds || 0)) {
      throw new Error(`Extra beds per room (${extraBedsPerRoom}) exceeds max allowed (${roomType.maxExtraBeds})`);
    }

    // Calculation Variables
    let rawBaseAmount = 0;
    let totalExtraGuestCharges = 0;
    let totalExtraBedCharges = 0;
    let totalMealCharges = 0;
    const nightlyBreakdowns = [];

    // Step 1: Occupancy Override OR Base + Extra Guest
    const baseOccupancy = roomType.baseOccupancy || 2;
    const occupancyOverride = ratePlan.occupancyPricing?.find(op => op.occupancy === guestsPerRoom);
    const pricingType = occupancyOverride ? 'OVERRIDE' : 'EXTRA_GUEST';
    
    const dailyExtraGuestCostPerRoom = occupancyOverride 
      ? 0 
      : Math.max(0, guestsPerRoom - baseOccupancy) * (ratePlan.extraAdultPrice || 0);

    // Step 2: Extra bed
    const dailyExtraBedCostPerRoom = extraBedsPerRoom * (ratePlan.extraBedPrice || 0);

    // Step 3: Meals
    let dailyMealCostPerRoom = 0;
    if (ratePlan.mealPlan && ratePlan.mealPlan !== 'EP' && ratePlan.mealPlan !== 'NONE') {
      const adultsPerRoom = Math.ceil(adults / rooms);
      const childrenPerRoom = Math.ceil(children / rooms);
      dailyMealCostPerRoom = 
        (adultsPerRoom * (ratePlan.mealPriceAdult || 0)) + 
        (childrenPerRoom * (ratePlan.mealPriceChild || 0));
    }

    // Calculate Nightly Totals
    for (const date of datesToBook) {
      // A daily rate is the price at base occupancy for that night: it replaces the base price (and
      // any occupancy override), and extra guests are charged on top as usual
      const dailyRate = dailyRates[date.toISOString()];
      let basePricePerRoom = dailyRate ?? (occupancyOverride ? occupancyOverride.price : ratePlan.basePrice);
      if (!(Number(basePricePerRoom) > 0)) {
        // A plan without a price must never be sold for ₹0
        throw new Error('This rate plan has no price for the selected dates and can\'t be booked.');
      }
      const extraGuestCostTonight = dailyRate != null
        ? Math.max(0, guestsPerRoom - baseOccupancy) * (ratePlan.extraAdultPrice || 0)
        : dailyExtraGuestCostPerRoom;
      
      let dynamicBreakdown = null;
      if (dynamicContext && !dynamicContext.safeMode) {
        const nightlyContext = {
          basePrice: basePricePerRoom,
          date: date,
          demandScore: dynamicContext.demandSignals?.[date.toISOString().split('T')[0]]?.demandScore || 0.5,
          availableRooms: dynamicContext.availableRooms || 999,
          userSegment: dynamicContext.userSegment || 'STANDARD',
          experimentModifiers: dynamicContext.experimentModifiers || {},
          pricingRules: dynamicContext.pricingRules || {},
          previousPrice: dynamicContext.previousPrice || null,
          holidays: dynamicContext.holidays || []
        };
        dynamicBreakdown = dynamicPricingDomain.calculateDynamicPrice(nightlyContext);
        
        // Add auditing metadata for the signal source
        if (dynamicBreakdown) {
          const dateKey = date.toISOString().split('T')[0];
          dynamicBreakdown.signalSource = dynamicContext.signalSources?.[dateKey] || 'GLOBAL';
          if (dynamicContext.aiPrediction) {
            dynamicBreakdown.predictionId = dynamicContext.aiPrediction.predictionId;
          }
        }

        basePricePerRoom = dynamicBreakdown.finalPrice;

        // GST Floor Guard: prevent dynamic pricing from dropping a room into a LOWER GST slab
        // than what the original base price (before dynamic adjustment) belonged to.
        // This only applies if the original base price was in a HIGHER slab than the dynamic result.
        if (taxRules?.length > 0) {
          // Find the original base price's tax slab (before dynamic adjustment)
          const originalBasePrice = nightlyContext.basePrice;
          const originalTaxRule = taxRules.find(rule => {
            if (rule.maxThreshold !== null) {
              return originalBasePrice >= rule.minThreshold && originalBasePrice <= rule.maxThreshold;
            } else {
              return originalBasePrice > rule.minThreshold;
            }
          });

          // Only apply the floor if the original base price belonged to a slab
          // with minThreshold > 0 AND dynamic pricing dropped below that threshold
          if (
            originalTaxRule &&
            originalTaxRule.minThreshold > 0 &&
            basePricePerRoom < originalTaxRule.minThreshold
          ) {
            basePricePerRoom = originalTaxRule.minThreshold;
            if (dynamicBreakdown) dynamicBreakdown.gstFloorApplied = true;
          }
        }
      }

      rawBaseAmount += Math.round(basePricePerRoom * rooms);
      totalExtraGuestCharges += Math.round(extraGuestCostTonight * rooms);
      totalExtraBedCharges += Math.round(dailyExtraBedCostPerRoom * rooms);
      totalMealCharges += Math.round(dailyMealCostPerRoom * rooms);

      nightlyBreakdowns.push({
        date: date.toISOString().split('T')[0],
        basePricePerRoom,
        dynamicBreakdown
      });
    }

    // Step 4: Subtotal
    const rawSubtotal = rawBaseAmount + totalExtraGuestCharges + totalExtraBedCharges + totalMealCharges;

    let discountAmount = 0;
    if (paymentType === 'PREPAID') {
      discountAmount = Math.round(rawSubtotal * (prepaidDiscountPercent / 100));
    }
    
    // Calculate coupon discount if present
    let couponDiscountAmount = 0;
    if (appliedCoupon) {
      couponDiscountAmount = revenueDomain.calculateDiscountValue(appliedCoupon, rawSubtotal);
    }
    
    // Promotion (Admin or property offer) on the same pre-tax subtotal
    const promotionDiscountAmount = appliedPromotion ? discountFor(appliedPromotion, rawSubtotal) : 0;

    const memberDiscount = Math.max(0, Math.min(Math.round(Number(memberDiscountAmount) || 0), rawSubtotal - discountAmount - couponDiscountAmount - promotionDiscountAmount));
    const pointsDiscount = Math.max(0, Math.min(Math.round(Number(loyaltyDiscountAmount) || 0), rawSubtotal - discountAmount - couponDiscountAmount - promotionDiscountAmount - memberDiscount));

    // Total discount is prepaid discount + coupon discount + promotion + reward points
    const totalDiscountAmount = discountAmount + couponDiscountAmount + promotionDiscountAmount + memberDiscount + pointsDiscount;
    const baseAmountAfterDiscount = Math.max(0, rawSubtotal - totalDiscountAmount);

    // Step 5: Determine Tax Slab based on post-discount per-night rate
    const perNightRate = baseAmountAfterDiscount / (nights * rooms);

    // Find applicable tax rule (sorted by effectiveFrom desc, so first match is current)
    // Assume service passes pre-filtered and sorted taxRules array
    const taxRule = taxRules.find(rule => {
      if (rule.maxThreshold !== null) {
        return perNightRate >= rule.minThreshold && perNightRate <= rule.maxThreshold;
      } else {
        return perNightRate > rule.minThreshold;
      }
    });

    if (!taxRule) {
      throw new Error(`No applicable tax rule found for tariff ₹${perNightRate.toFixed(2)}`);
    }

    // Step 6: Apply Tax and Round
    const taxAmount = Math.round(baseAmountAfterDiscount * (taxRule.percentage / 100));
    const totalAmount = Math.round(baseAmountAfterDiscount + taxAmount);

    return {
      rawBaseAmount,
      roomPrice: rawBaseAmount, 
      discountAmount: totalDiscountAmount,
      prepaidDiscountAmount: discountAmount,
      couponDiscountAmount,
      promotionDiscountAmount,
      loyaltyDiscountAmount: pointsDiscount,
      memberDiscountAmount: memberDiscount,
      baseAmount: baseAmountAfterDiscount, 
      taxAmount,
      totalAmount,
      finalAmount: totalAmount, // Alias for consistency with legacy controller
      subtotal: rawSubtotal, // Alias
      extraGuestCharges: totalExtraGuestCharges,
      extraBedCharges: totalExtraBedCharges,
      mealCharges: totalMealCharges,
      pricingType,
      taxPercentage: taxRule.percentage,
      perNightRate,
      nights,
      rooms,
      guests,
      adults,
      children,
      extraBeds,
      dynamicPricing: {
        applied: !!(dynamicContext && !dynamicContext.safeMode),
        nightlyBreakdowns
      }
    };
  },

  /**
   * Price of a stay of one or more rooms, each with its own room type, rate plan and guests
   * (a suite for 3 and a standard room for 1 in one booking).
   *
   * Each room is priced for its own occupancy (extra guests, meals, extra beds). Discounts are
   * worked out on the whole stay as in calculate(); a promotion only counts the rooms it is valid
   * for (input.promotionRoomIndexes, default all). GST is per room: each room's tariff after its
   * share of the discounts picks its slab (a ₹9,000 suite at 18% and a ₹3,000 room at 5% in the
   * same booking). With every room the same type, plan and occupancy the result equals calculate().
   *
   * @param {Object} input  shared fields as calculate(), plus
   * @param {Array}  input.rooms  [{ roomType, ratePlan, adults, children, extraBeds, dailyRates }]
   */
  calculateStay: (input) => {
    const {
      rooms: roomInputs = [], taxRules, prepaidDiscountPercent, checkInDate, checkOutDate, paymentType,
      appliedPromotion = null, promotionRoomIndexes = null,
      loyaltyDiscountAmount = 0, memberDiscountAmount = 0, dynamicContext = null,
      // Business rate (ZivoPlus for Business / Partner Hub): the hotel's company or agent discount
      businessDiscountAmount = 0,
    } = input;
    if (!roomInputs.length) throw new Error('Choose at least one room');

    // 1. Each room on its own (no discounts yet)
    const rooms = roomInputs.map((r, i) => {
      const occupancy = (Number(r.adults) || 0) + (Number(r.children) || 0);
      if (occupancy > (r.roomType.maxOccupancy || 2)) {
        throw new Error(`${r.roomType.name} fits up to ${r.roomType.maxOccupancy || 2} guests; room ${i + 1} has ${occupancy}. Choose a bigger room or add a room.`);
      }
      const one = pricingDomain.calculate({
        roomType: r.roomType, ratePlan: r.ratePlan, taxRules, prepaidDiscountPercent: 0,
        checkInDate, checkOutDate, rooms: 1, adults: Number(r.adults) || 1, children: Number(r.children) || 0,
        extraBeds: Number(r.extraBeds) || 0, paymentType: 'PAY_AT_HOTEL', dynamicContext, dailyRates: r.dailyRates || {},
      });
      return {
        roomTypeId: r.roomType.id, ratePlanId: r.ratePlan.id,
        adults: one.adults, children: one.children, extraBeds: one.extraBeds,
        roomPrice: one.rawBaseAmount, extraGuestCharges: one.extraGuestCharges, mealCharges: one.mealCharges,
        extraBedCharges: one.extraBedCharges, subtotal: one.subtotal, pricingType: one.pricingType,
        nightlyBreakdowns: one.dynamicPricing.nightlyBreakdowns, nights: one.nights,
      };
    });
    const nights = rooms[0].nights;
    const sum = (k, list = rooms) => list.reduce((t, r) => t + r[k], 0);
    const rawSubtotal = sum('subtotal');

    // 2. Discounts on the whole stay (same order and limits as calculate())
    const prepaid = paymentType === 'PREPAID' ? Math.round(rawSubtotal * ((prepaidDiscountPercent || 0) / 100)) : 0;
    const promoIdx = Array.isArray(promotionRoomIndexes) ? new Set(promotionRoomIndexes) : null;
    const promoRooms = promoIdx ? rooms.filter((_, i) => promoIdx.has(i)) : rooms;
    const promotionDiscountAmount = appliedPromotion ? discountFor(appliedPromotion, sum('subtotal', promoRooms)) : 0;
    const memberDiscount = Math.max(0, Math.min(Math.round(Number(memberDiscountAmount) || 0), rawSubtotal - prepaid - promotionDiscountAmount));
    const pointsDiscount = Math.max(0, Math.min(Math.round(Number(loyaltyDiscountAmount) || 0), rawSubtotal - prepaid - promotionDiscountAmount - memberDiscount));
    const businessDiscount = Math.max(0, Math.min(Math.round(Number(businessDiscountAmount) || 0), rawSubtotal - prepaid - promotionDiscountAmount - memberDiscount - pointsDiscount));
    const totalDiscountAmount = prepaid + promotionDiscountAmount + memberDiscount + pointsDiscount + businessDiscount;
    const baseAmountAfterDiscount = Math.max(0, rawSubtotal - totalDiscountAmount);

    // 3. Each room's share of the discounts (the promotion only over its rooms), exact to the rupee
    const share = (amount, weights) => {
      const total = weights.reduce((a, b) => a + b, 0);
      if (!amount || !total) return weights.map(() => 0);
      const exact = weights.map((w) => (amount * w) / total);
      const out = exact.map(Math.floor);
      let left = amount - out.reduce((a, b) => a + b, 0);
      exact.map((x, i) => [x - Math.floor(x), i]).sort((a, b) => b[0] - a[0]).forEach(([, i]) => { if (left > 0) { out[i] += 1; left -= 1; } });
      return out;
    };
    const subs = rooms.map((r) => r.subtotal);
    const promoShare = share(promotionDiscountAmount, rooms.map((r, i) => (!promoIdx || promoIdx.has(i) ? r.subtotal : 0)));
    const otherShare = share(prepaid + memberDiscount + pointsDiscount + businessDiscount, subs);

    // 4. GST slab per room from its tariff per night after discounts; tax per slab
    const findRule = (perNight) => taxRules.find((rule) => (rule.maxThreshold !== null
      ? perNight >= rule.minThreshold && perNight <= rule.maxThreshold
      : perNight > rule.minThreshold));
    const taxable = new Map();
    rooms.forEach((r, i) => {
      r.discount = promoShare[i] + otherShare[i];
      r.amountAfterDiscount = Math.max(0, r.subtotal - r.discount);
      const rule = findRule(r.amountAfterDiscount / nights);
      if (!rule) throw new Error(`No applicable tax rule found for tariff ₹${(r.amountAfterDiscount / nights).toFixed(2)}`);
      r.taxPercentage = rule.percentage;
      taxable.set(rule.percentage, (taxable.get(rule.percentage) || 0) + r.amountAfterDiscount);
    });
    const taxAmount = [...taxable.entries()].reduce((t, [pct, amt]) => t + Math.round(amt * (pct / 100)), 0);
    const totalAmount = Math.round(baseAmountAfterDiscount + taxAmount);
    const pcts = [...taxable.keys()];
    const adults = sum('adults');
    const children = sum('children');

    return {
      rawBaseAmount: sum('roomPrice'),
      roomPrice: sum('roomPrice'),
      discountAmount: totalDiscountAmount,
      prepaidDiscountAmount: prepaid,
      couponDiscountAmount: 0,
      promotionDiscountAmount,
      loyaltyDiscountAmount: pointsDiscount,
      memberDiscountAmount: memberDiscount,
      businessDiscountAmount: businessDiscount,
      baseAmount: baseAmountAfterDiscount,
      taxAmount,
      totalAmount,
      finalAmount: totalAmount,
      subtotal: rawSubtotal,
      extraGuestCharges: sum('extraGuestCharges'),
      extraBedCharges: sum('extraBedCharges'),
      mealCharges: sum('mealCharges'),
      pricingType: rooms[0].pricingType,
      // One rate for the booking when all rooms share it; otherwise the highest (each room's is below)
      taxPercentage: pcts.length === 1 ? pcts[0] : Math.max(...pcts),
      taxBreakdown: [...taxable.entries()].map(([percentage, amount]) => ({ percentage, taxableAmount: amount, taxAmount: Math.round(amount * (percentage / 100)) })),
      perNightRate: baseAmountAfterDiscount / (nights * rooms.length),
      nights,
      rooms: rooms.length,
      guests: adults + children,
      adults,
      children,
      extraBeds: sum('extraBeds'),
      roomsBreakdown: rooms.map(({ nightlyBreakdowns: _n, nights: _nn, ...r }, i) => ({ roomNumber: i + 1, ...r })),
      dynamicPricing: {
        applied: !!(dynamicContext && !dynamicContext.safeMode),
        nightlyBreakdowns: rooms[0].nightlyBreakdowns,
      },
    };
  }
};

export default pricingDomain;
