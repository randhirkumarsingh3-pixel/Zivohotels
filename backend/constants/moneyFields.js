/**
 * Money columns stored as Decimal(12, 2) (rupees, exact to the paisa) that the API still exposes
 * as plain JavaScript numbers. config/db.js converts them on every read, so existing code and the
 * frontend keep working with numbers while the database never stores float rounding errors.
 *
 * The finance tables (Settlement, Transaction, LedgerEntry, Wallet, ...) were Decimal from the
 * start and are deliberately NOT listed: their code already works with Prisma.Decimal objects.
 *
 * Keys are Prisma client model names (first letter lower-case). A unit test checks this list
 * against schema.prisma.
 */
export const MONEY_FIELDS = {
  ratePlan: ['basePrice', 'extraAdultPrice', 'extraBedPrice', 'extraChildPrice', 'mealPriceAdult', 'mealPriceChild'],
  occupancyPricing: ['price'],
  booking: [
    'totalAmount', 'paidAmount', 'remainingAmount', 'taxAmount', 'baseAmount', 'refundAmount',
    'extraBedCharges', 'extraGuestCharges', 'mealCharges', 'roomPrice',
  ],
  taxRule: ['minThreshold', 'maxThreshold'],
  refund: ['amount'],
  coupon: ['value', 'maxDiscount', 'minBookingAmount'],
  loyaltyWallet: ['balance'],
};
