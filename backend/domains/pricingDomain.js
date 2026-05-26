import { getDatesInRange } from '../utils/dateUtils.js';
import revenueDomain from './revenueDomain.js';
import dynamicPricingDomain from './dynamicPricingDomain.js';

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
      dynamicContext = null
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
      let basePricePerRoom = occupancyOverride ? occupancyOverride.price : ratePlan.basePrice;
      
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
      totalExtraGuestCharges += Math.round(dailyExtraGuestCostPerRoom * rooms);
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
    
    // Total discount is prepaid discount + coupon discount
    const totalDiscountAmount = discountAmount + couponDiscountAmount;
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
      couponDiscountAmount,
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
  }
};

export default pricingDomain;
