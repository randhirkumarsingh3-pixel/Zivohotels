-- Promotion engine: platform (Zivo) and property promotions, and their use on bookings.
CREATE TABLE "Promotion" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT,
    "hotelIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "name" TEXT NOT NULL,
    "description" TEXT,
    "code" TEXT,
    "discountType" TEXT NOT NULL DEFAULT 'PERCENT',
    "value" DECIMAL(12,2) NOT NULL,
    "maxDiscount" DECIMAL(12,2),
    "minBookingAmount" DECIMAL(12,2),
    "roomTypeIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "ratePlanIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "stayStart" TIMESTAMP(3),
    "stayEnd" TIMESTAMP(3),
    "bookStart" TIMESTAMP(3),
    "bookEnd" TIMESTAMP(3),
    "minNights" INTEGER NOT NULL DEFAULT 1,
    "minAdvanceDays" INTEGER,
    "maxAdvanceDays" INTEGER,
    "usageLimit" INTEGER,
    "perUserLimit" INTEGER,
    "firstBookingOnly" BOOLEAN NOT NULL DEFAULT false,
    "fundedBy" TEXT NOT NULL DEFAULT 'HOTEL',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdByRole" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Promotion_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Promotion_code_key" ON "Promotion"("code");
CREATE INDEX "Promotion_hotelId_idx" ON "Promotion"("hotelId");
CREATE INDEX "Promotion_isActive_idx" ON "Promotion"("isActive");

CREATE TABLE "PromotionRedemption" (
    "id" TEXT NOT NULL,
    "promotionId" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "userId" TEXT,
    "hotelId" TEXT NOT NULL,
    "discountAmount" DECIMAL(12,2) NOT NULL,
    "fundedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PromotionRedemption_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PromotionRedemption_bookingId_key" ON "PromotionRedemption"("bookingId");
CREATE INDEX "PromotionRedemption_promotionId_idx" ON "PromotionRedemption"("promotionId");
CREATE INDEX "PromotionRedemption_userId_idx" ON "PromotionRedemption"("userId");
ALTER TABLE "PromotionRedemption" ADD CONSTRAINT "PromotionRedemption_promotionId_fkey" FOREIGN KEY ("promotionId") REFERENCES "Promotion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
