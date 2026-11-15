-- Dynamic pricing: rule names and rate-plan scope, per-property settings.
ALTER TABLE "PricingRule" ADD COLUMN "ratePlanId" TEXT;
ALTER TABLE "PricingRule" ADD COLUMN "name" TEXT NOT NULL DEFAULT '';
ALTER TABLE "PricingRule" ADD COLUMN "createdById" TEXT;
CREATE INDEX "PricingRule_hotelId_idx" ON "PricingRule"("hotelId");

CREATE TABLE "DynamicPricingSetting" (
    "hotelId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "minPercent" DOUBLE PRECISION NOT NULL DEFAULT -30,
    "maxPercent" DOUBLE PRECISION NOT NULL DEFAULT 50,
    "minPrice" DECIMAL(12,2),
    "maxPrice" DECIMAL(12,2),
    "applyHolidays" BOOLEAN NOT NULL DEFAULT true,
    "horizonDays" INTEGER NOT NULL DEFAULT 90,
    "lastRunAt" TIMESTAMP(3),
    "lastRunSummary" JSONB,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DynamicPricingSetting_pkey" PRIMARY KEY ("hotelId")
);
