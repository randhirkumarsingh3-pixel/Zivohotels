-- Store money as exact decimals (rupees, 2 decimal places) instead of floating point.
-- Existing values are rounded to the nearest paisa by the cast. Percentages and scores stay Float.
-- (The trigram search indexes from scripts/setup_trgm.js are not managed by Prisma and are left alone.)

-- AlterTable
ALTER TABLE "Booking" ALTER COLUMN "totalAmount" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "paidAmount" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "remainingAmount" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "taxAmount" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "baseAmount" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "refundAmount" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "extraBedCharges" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "extraGuestCharges" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "mealCharges" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "roomPrice" SET DATA TYPE DECIMAL(12,2);

-- AlterTable
ALTER TABLE "Coupon" ALTER COLUMN "value" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "maxDiscount" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "minBookingAmount" SET DATA TYPE DECIMAL(12,2);

-- AlterTable
ALTER TABLE "LoyaltyWallet" ALTER COLUMN "balance" SET DATA TYPE DECIMAL(12,2);

-- AlterTable
ALTER TABLE "OccupancyPricing" ALTER COLUMN "price" SET DATA TYPE DECIMAL(12,2);

-- AlterTable
ALTER TABLE "RatePlan" ALTER COLUMN "basePrice" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "extraAdultPrice" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "extraBedPrice" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "extraChildPrice" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "mealPriceAdult" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "mealPriceChild" SET DATA TYPE DECIMAL(12,2);

-- AlterTable
ALTER TABLE "Refund" ALTER COLUMN "amount" SET DATA TYPE DECIMAL(12,2);

-- AlterTable
ALTER TABLE "TaxRule" ALTER COLUMN "minThreshold" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "maxThreshold" SET DATA TYPE DECIMAL(12,2);

