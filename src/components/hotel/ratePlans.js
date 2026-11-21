/** Rate plan labels and prices shared by the hotel page (same rules as checkout). */
export const MEAL_LABELS = {
  NONE: 'Room only', EP: 'Room only',
  BREAKFAST: 'Breakfast included', CP: 'Breakfast included',
  MAP: 'Breakfast + lunch or dinner', HALF_BOARD: 'Breakfast + lunch or dinner',
  AP: 'All meals included', FULL_BOARD: 'All meals included',
};

export const fmt = (v) => `₹${Math.round(Number(v) || 0).toLocaleString('en-IN')}`;
export const nightlyPrice = (plan) => Number(plan?.stayNightlyPrice ?? plan?.basePrice ?? 0);
export const offerPrice = (plan) => (plan?.offer ? Number(plan.offer.nightlyPriceAfter) : nightlyPrice(plan));
export const offerDiscount = (offer, subtotal) => {
  if (!offer || !(subtotal > 0)) return 0;
  let d = offer.discountType === 'FLAT' ? offer.value : (subtotal * offer.value) / 100;
  if (offer.maxDiscount) d = Math.min(d, offer.maxDiscount);
  return Math.round(Math.min(d, subtotal));
};

