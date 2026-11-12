-- Catch-up migration: brings a database built from the earlier migrations up to the full
-- current schema.prisma (64 tables had only ever been created via 'prisma db push').
-- Databases built with 'prisma db push' must mark this as applied instead of running it —
-- see backend/docs/database-migrations.md.

-- CreateEnum
CREATE TYPE "PropertyMode" AS ENUM ('INTERNAL', 'CHANNEL_MANAGER', 'HYBRID');

-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('NEW', 'CONTACTED', 'QUALIFIED', 'ONBOARDING', 'CONVERTED', 'LOST');

-- CreateEnum
CREATE TYPE "LeadSource" AS ENUM ('DIRECT', 'SALES', 'REFERRAL', 'AGGREGATOR', 'API');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('GST', 'PAN', 'TRADE_LICENSE', 'OWNERSHIP_PROOF', 'BANK_PROOF', 'FIRE_SAFETY');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "AuditSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('OPEN', 'COMPLETED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('INITIATED', 'SUCCESS', 'FAILED');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('SEARCH_STARTED', 'DESTINATION_SELECTED', 'HOTEL_VIEWED', 'BOOKING_STARTED', 'BOOKING_COMPLETED');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED', 'RETRY');

-- AlterEnum
BEGIN;
CREATE TYPE "MealPlan_new" AS ENUM ('NONE', 'EP', 'CP', 'MAP', 'AP');
ALTER TABLE "RatePlan" ALTER COLUMN "mealPlan" DROP DEFAULT;
ALTER TABLE "RatePlan" ALTER COLUMN "mealPlan" TYPE "MealPlan_new" USING ("mealPlan"::text::"MealPlan_new");
ALTER TYPE "MealPlan" RENAME TO "MealPlan_old";
ALTER TYPE "MealPlan_new" RENAME TO "MealPlan";
DROP TYPE "MealPlan_old";
ALTER TABLE "RatePlan" ALTER COLUMN "mealPlan" SET DEFAULT 'NONE';
COMMIT;




-- AlterTable
ALTER TABLE "Agreement" ADD COLUMN     "documentUrl" TEXT,
ADD COLUMN     "ipAddress" TEXT;

-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN     "traceId" TEXT;

-- AlterTable
ALTER TABLE "BankDetail" ADD COLUMN     "upiId" TEXT;

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "adults" INTEGER NOT NULL DEFAULT 2,
ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "children" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "couponCode" TEXT,
ADD COLUMN     "extraBedCharges" DOUBLE PRECISION DEFAULT 0,
ADD COLUMN     "extraBeds" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "extraGuestCharges" DOUBLE PRECISION DEFAULT 0,
ADD COLUMN     "mealCharges" DOUBLE PRECISION DEFAULT 0,
ADD COLUMN     "metadata" JSONB DEFAULT '{}',
ADD COLUMN     "pricingType" TEXT DEFAULT 'STANDARD',
ADD COLUMN     "refundAmount" DOUBLE PRECISION DEFAULT 0,
ADD COLUMN     "requestId" TEXT,
ADD COLUMN     "roomPrice" DOUBLE PRECISION DEFAULT 0,
ADD COLUMN     "sessionId" TEXT;

-- AlterTable
ALTER TABLE "Hotel" DROP COLUMN "image",
DROP COLUMN "images",
ADD COLUMN     "activationDate" TIMESTAMP(3),
ADD COLUMN     "approvedBy" TEXT,
ADD COLUMN     "brandName" TEXT,
ADD COLUMN     "channelProvider" TEXT,
ADD COLUMN     "cmSyncStatus" TEXT DEFAULT 'INACTIVE',
ADD COLUMN     "competitivenessRating" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
ADD COLUMN     "complianceScore" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "country" TEXT DEFAULT 'India',
ADD COLUMN     "createdBy" TEXT,
ADD COLUMN     "creditScore" DOUBLE PRECISION NOT NULL DEFAULT 700,
ADD COLUMN     "dynamicCommissionRate" DOUBLE PRECISION NOT NULL DEFAULT 15.0,
ADD COLUMN     "gstin" TEXT,
ADD COLUMN     "healthScore" INTEGER NOT NULL DEFAULT 70,
ADD COLUMN     "incorporationType" TEXT DEFAULT 'INDIVIDUAL',
ADD COLUMN     "integrationMode" TEXT NOT NULL DEFAULT 'INTERNAL',
ADD COLUMN     "integrationSettings" JSONB DEFAULT '{}',
ADD COLUMN     "isThrottled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "landmark" TEXT,
ADD COLUMN     "lastAuditAt" TIMESTAMP(3),
ADD COLUMN     "legalName" TEXT,
ADD COLUMN     "mediaScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "mode" "PropertyMode" NOT NULL DEFAULT 'INTERNAL',
ADD COLUMN     "onboardingStep" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "pan" TEXT,
ADD COLUMN     "payoutCycle" TEXT NOT NULL DEFAULT 'T+2',
ADD COLUMN     "pincode" TEXT,
ADD COLUMN     "readinessBreakdown" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "revenueReadinessScore" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "reviewNote" TEXT,
ADD COLUMN     "reviewedBy" TEXT,
ADD COLUMN     "state" TEXT,
ADD COLUMN     "statusReason" TEXT,
ADD COLUMN     "statusUpdatedAt" TIMESTAMP(3),
ADD COLUMN     "statusUpdatedBy" TEXT,
ADD COLUMN     "type" TEXT DEFAULT 'hotel',
ADD COLUMN     "updatedBy" TEXT,
ALTER COLUMN "description" DROP NOT NULL,
ALTER COLUMN "description" SET DEFAULT '',
ALTER COLUMN "status" SET DEFAULT 'DRAFT';

-- AlterTable
ALTER TABLE "Inventory" DROP COLUMN "price";

-- AlterTable
ALTER TABLE "RatePlan" ADD COLUMN     "extraAdultPrice" DOUBLE PRECISION DEFAULT 0,
ADD COLUMN     "extraBedIncluded" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "extraBedPrice" DOUBLE PRECISION,
ADD COLUMN     "extraChildPrice" DOUBLE PRECISION DEFAULT 0,
ADD COLUMN     "isConfigured" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "mealPriceAdult" DOUBLE PRECISION,
ADD COLUMN     "mealPriceChild" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "RoomType" DROP COLUMN "basePrice",
DROP COLUMN "capacity",
DROP COLUMN "image",
DROP COLUMN "images",
DROP COLUMN "originalPrice",
ADD COLUMN     "extraBedAllowed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "maxExtraBeds" INTEGER;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "lastActiveAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "HotelImage" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "tags" TEXT[],
    "category" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "aiScore" DOUBLE PRECISION,
    "aiAnalysis" JSONB DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HotelImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoomTypeImage" (
    "id" TEXT NOT NULL,
    "roomTypeId" TEXT NOT NULL,
    "imageId" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "RoomTypeImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OccupancyPricing" (
    "id" TEXT NOT NULL,
    "ratePlanId" TEXT NOT NULL,
    "occupancy" INTEGER NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "OccupancyPricing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SecurityLog" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "userId" TEXT,
    "ip" TEXT NOT NULL,
    "userAgent" TEXT,
    "details" JSONB,
    "requestId" TEXT,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SecurityLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemConfig" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "description" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppState" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "experimentWorkerRunning" BOOLEAN NOT NULL DEFAULT false,
    "globalExperimentToggle" BOOLEAN NOT NULL DEFAULT true,
    "systemMode" TEXT NOT NULL DEFAULT 'NORMAL',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Refund" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "status" "RefundStatus" NOT NULL DEFAULT 'INITIATED',
    "reason" TEXT,
    "razorpayRefundId" TEXT,
    "requestId" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Refund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CancellationPolicy" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "freeCancellationHours" INTEGER NOT NULL DEFAULT 24,
    "partialRefundPercent" DOUBLE PRECISION NOT NULL DEFAULT 50,
    "noRefundHours" INTEGER NOT NULL DEFAULT 6,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CancellationPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceSequence" (
    "id" SERIAL NOT NULL,
    "year" INTEGER NOT NULL,
    "counter" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "InvoiceSequence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "invoiceRef" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "pdfUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'GENERATED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Review" (
    "id" TEXT NOT NULL,
    "rating" DOUBLE PRECISION NOT NULL,
    "comment" TEXT,
    "bookingId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isVerified" BOOLEAN NOT NULL DEFAULT true,
    "editableUntil" TIMESTAMP(3),
    "status" "ReviewStatus" NOT NULL DEFAULT 'PENDING',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Coupon" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "discountType" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "expiry" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "maxUses" INTEGER,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "maxDiscount" DOUBLE PRECISION,
    "minBookingAmount" DOUBLE PRECISION,
    "maxUsesPerUser" INTEGER,

    CONSTRAINT "Coupon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CouponUsage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "couponId" TEXT NOT NULL,
    "usedCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CouponUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoyaltyWallet" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "balance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LoyaltyWallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserBehavior" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lastSearchedCity" TEXT,
    "lastSearchAt" TIMESTAMP(3),
    "preferredMinPrice" DOUBLE PRECISION,
    "preferredMaxPrice" DOUBLE PRECISION,
    "lastViewedHotels" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "recentlyRecommendedHotels" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "UserBehavior_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalyticsEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "sessionId" TEXT NOT NULL,
    "eventType" "EventType" NOT NULL,
    "metadata" JSONB NOT NULL,
    "hotelId" TEXT,
    "city" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "experiments" JSONB,
    "experimentId" TEXT,
    "variantId" TEXT,

    CONSTRAINT "AnalyticsEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HotelView" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "hotelId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HotelView_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Experiment" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "variants" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "category" TEXT NOT NULL,
    "concludedAt" TIMESTAMP(3),
    "endAt" TIMESTAMP(3),
    "owner" TEXT,
    "startAt" TIMESTAMP(3),
    "traffic" INTEGER NOT NULL DEFAULT 100,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "winner" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'LOW',
    "lastEvaluationAt" TIMESTAMP(3),
    "lastUplift" DOUBLE PRECISION,
    "guardrailMetrics" JSONB,
    "stratification" JSONB,

    CONSTRAINT "Experiment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExperimentInsight" (
    "id" TEXT NOT NULL,
    "experimentId" TEXT NOT NULL,
    "experimentName" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "winner" TEXT,
    "relativeUplift" DOUBLE PRECISION NOT NULL,
    "absoluteUplift" DOUBLE PRECISION NOT NULL,
    "confidence" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resultType" TEXT NOT NULL,
    "segmentKey" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "ExperimentInsight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PricingRule" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT,
    "roomTypeId" TEXT,
    "type" TEXT NOT NULL,
    "condition" JSONB NOT NULL,
    "adjustment" DOUBLE PRECISION NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PricingRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DemandSignal" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "searches" INTEGER NOT NULL DEFAULT 0,
    "views" INTEGER NOT NULL DEFAULT 0,
    "bookings" INTEGER NOT NULL DEFAULT 0,
    "demandScore" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "roomTypeId" TEXT NOT NULL DEFAULT '_all',

    CONSTRAINT "DemandSignal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PricingSnapshot" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT,
    "hotelId" TEXT NOT NULL,
    "roomTypeId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "basePrice" DOUBLE PRECISION NOT NULL,
    "finalPrice" DOUBLE PRECISION NOT NULL,
    "breakdown" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PricingSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PricingState" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "roomTypeId" TEXT NOT NULL,
    "lastAppliedPrice" DOUBLE PRECISION NOT NULL,
    "lastUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PricingState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HolidayCalendar" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "city" TEXT,
    "name" TEXT NOT NULL,
    "multiplier" DOUBLE PRECISION NOT NULL DEFAULT 0.15,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HolidayCalendar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PricingFeatureLog" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "roomTypeId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "basePrice" DOUBLE PRECISION NOT NULL,
    "finalPrice" DOUBLE PRECISION NOT NULL,
    "demandScore" DOUBLE PRECISION NOT NULL,
    "occupancy" DOUBLE PRECISION NOT NULL,
    "daysToCheckIn" INTEGER NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "segment" TEXT,
    "device" TEXT,
    "wasBooked" BOOLEAN NOT NULL DEFAULT false,
    "revenue" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PricingFeatureLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PricingPrediction" (
    "id" TEXT NOT NULL,
    "contextHash" TEXT NOT NULL,
    "multiplier" DOUBLE PRECISION NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "modelVersion" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PricingPrediction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PricingFeedback" (
    "id" TEXT NOT NULL,
    "predictionId" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "revenue" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PricingFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChannelIntegration" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "credentials" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChannelIntegration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChannelMapping" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "externalProvider" TEXT NOT NULL,
    "zivoRoomTypeId" TEXT NOT NULL,
    "externalRoomCode" TEXT NOT NULL,
    "zivoRatePlanId" TEXT,
    "externalRateCode" TEXT,
    "mappingConfidence" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "syncStatus" TEXT NOT NULL DEFAULT 'ACTIVE',
    "lastSyncAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChannelMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT,
    "userId" TEXT,
    "type" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "status" TEXT NOT NULL,
    "gateway" TEXT,
    "gatewayRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Settlement" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "grossAmount" DECIMAL(12,2) NOT NULL,
    "commissionAmount" DECIMAL(12,2) NOT NULL,
    "taxAmount" DECIMAL(12,2) NOT NULL,
    "netPayable" DECIMAL(12,2) NOT NULL,
    "status" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "holdUntil" TIMESTAMP(3),
    "payoutDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cgstAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "igstAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "placeOfSupply" TEXT,
    "sgstAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,

    CONSTRAINT "Settlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerEntry" (
    "id" TEXT NOT NULL,
    "referenceId" TEXT NOT NULL,
    "referenceType" TEXT,
    "traceId" TEXT,
    "account" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "description" TEXT NOT NULL,
    "hash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "periodId" TEXT,

    CONSTRAINT "LedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payout" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "totalAmount" DECIMAL(12,2) NOT NULL,
    "status" TEXT NOT NULL,
    "reference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Dispute" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Dispute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialPeriod" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinancialPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Wallet" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "hotelId" TEXT,
    "balance" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "creditLimit" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "kycStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "tier" TEXT NOT NULL DEFAULT 'BRONZE',

    CONSTRAINT "Wallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WalletTransaction" (
    "id" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "reference" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WalletTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FraudLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "bookingId" TEXT,
    "riskScore" DOUBLE PRECISION NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FraudLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayoutQueue" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "status" TEXT NOT NULL,
    "retries" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "holdUntil" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayoutQueue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailOTP" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "otpHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "verifiedAt" TIMESTAMP(3),
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailOTP_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoyaltyPoint" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoyaltyPoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Agent" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "creditLimit" DECIMAL(12,2) NOT NULL,
    "usedCredit" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Agent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "sessionId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "city" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SessionLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DemandForecast" (
    "id" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "predictedDemand" DOUBLE PRECISION NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DemandForecast_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HotelInteraction" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "sessionId" TEXT,
    "type" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HotelInteraction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PropertyLead" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "name" TEXT,
    "propertyName" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "source" "LeadSource" NOT NULL DEFAULT 'DIRECT',
    "status" "LeadStatus" NOT NULL DEFAULT 'NEW',
    "assignedTo" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 1,
    "notes" TEXT,
    "conversionProbability" DOUBLE PRECISION DEFAULT 0.0,
    "expectedRevenue" DECIMAL(20,4),
    "followUpAt" TIMESTAMP(3),
    "convertedAt" TIMESTAMP(3),
    "hotelId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PropertyLead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KYCRecord" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "documentType" "DocumentType" NOT NULL,
    "documentUrl" TEXT NOT NULL,
    "documentStatus" "DocumentStatus" NOT NULL DEFAULT 'PENDING',
    "version" INTEGER NOT NULL DEFAULT 1,
    "rejectionReason" TEXT,
    "ocrMetadata" JSONB DEFAULT '{}',
    "expiryDate" TIMESTAMP(3),
    "verifiedAt" TIMESTAMP(3),
    "verifiedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KYCRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PropertyTask" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "TaskStatus" NOT NULL DEFAULT 'OPEN',
    "priority" INTEGER NOT NULL DEFAULT 1,
    "dueAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "metadata" JSONB DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PropertyTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PropertyAudit" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "auditorId" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "breakdown" JSONB NOT NULL DEFAULT '{}',
    "severity" "AuditSeverity" NOT NULL DEFAULT 'LOW',
    "actionItems" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "findings" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PropertyAudit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PropertyAgreement" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "signedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "documentUrl" TEXT NOT NULL,
    "status" "AgreementStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PropertyAgreement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminActionLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminActionLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DecisionLog" (
    "id" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "inputs" JSONB NOT NULL,
    "output" JSONB NOT NULL,
    "reason" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DecisionLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionRecord" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT,
    "path" JSONB NOT NULL,
    "revenue" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "dropOffPoint" TEXT,
    "isConverted" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SessionRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionAggregate" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "totalSessions" INTEGER NOT NULL DEFAULT 0,
    "conversions" INTEGER NOT NULL DEFAULT 0,
    "totalRevenue" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "dropOffs" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SessionAggregate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemActionLog" (
    "id" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "triggeredBy" TEXT NOT NULL,
    "impact" JSONB,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "revertedAt" TIMESTAMP(3),
    "revertedBy" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SystemActionLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemEvent" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "source" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SystemEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DecisionVersion" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DecisionVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PolicyTemplate" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PolicyTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HotelPolicy" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "policyCode" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HotelPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingTimelineEvent" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BookingTimelineEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingIntelligence" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "wifiRating" TEXT NOT NULL DEFAULT 'Excellent',
    "peakCheckIn" TEXT NOT NULL DEFAULT '12 PM - 2 PM',
    "airportDistance" TEXT NOT NULL DEFAULT '20 mins',
    "trafficAlert" TEXT,
    "aiTags" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "BookingIntelligence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationSyncLog" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationSyncLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BackgroundJob" (
    "id" TEXT NOT NULL,
    "queue" TEXT NOT NULL,
    "jobType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 5,
    "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "lockedBy" TEXT,
    "lockedAt" TIMESTAMP(3),
    "runAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BackgroundJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HotelImage_hotelId_category_idx" ON "HotelImage"("hotelId", "category");

-- CreateIndex
CREATE INDEX "RoomTypeImage_roomTypeId_idx" ON "RoomTypeImage"("roomTypeId");

-- CreateIndex
CREATE UNIQUE INDEX "RoomTypeImage_roomTypeId_imageId_key" ON "RoomTypeImage"("roomTypeId", "imageId");

-- CreateIndex
CREATE UNIQUE INDEX "OccupancyPricing_ratePlanId_occupancy_key" ON "OccupancyPricing"("ratePlanId", "occupancy");

-- CreateIndex
CREATE INDEX "SecurityLog_ip_idx" ON "SecurityLog"("ip");

-- CreateIndex
CREATE INDEX "SecurityLog_type_idx" ON "SecurityLog"("type");

-- CreateIndex
CREATE INDEX "SecurityLog_createdAt_idx" ON "SecurityLog"("createdAt");

-- CreateIndex
CREATE INDEX "Notification_hotelId_isRead_idx" ON "Notification"("hotelId", "isRead");

-- CreateIndex
CREATE INDEX "Notification_createdAt_idx" ON "Notification"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SystemConfig_key_key" ON "SystemConfig"("key");

-- CreateIndex
CREATE UNIQUE INDEX "Refund_bookingId_key" ON "Refund"("bookingId");

-- CreateIndex
CREATE UNIQUE INDEX "CancellationPolicy_hotelId_key" ON "CancellationPolicy"("hotelId");

-- CreateIndex
CREATE UNIQUE INDEX "InvoiceSequence_year_key" ON "InvoiceSequence"("year");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_invoiceRef_key" ON "Invoice"("invoiceRef");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_bookingId_key" ON "Invoice"("bookingId");

-- CreateIndex
CREATE UNIQUE INDEX "Review_bookingId_key" ON "Review"("bookingId");

-- CreateIndex
CREATE UNIQUE INDEX "Coupon_code_key" ON "Coupon"("code");

-- CreateIndex
CREATE UNIQUE INDEX "CouponUsage_userId_couponId_key" ON "CouponUsage"("userId", "couponId");

-- CreateIndex
CREATE UNIQUE INDEX "LoyaltyWallet_userId_key" ON "LoyaltyWallet"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserBehavior_userId_key" ON "UserBehavior"("userId");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_eventType_createdAt_idx" ON "AnalyticsEvent"("eventType", "createdAt");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_userId_idx" ON "AnalyticsEvent"("userId");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_hotelId_idx" ON "AnalyticsEvent"("hotelId");

-- CreateIndex
CREATE INDEX "HotelView_hotelId_createdAt_idx" ON "HotelView"("hotelId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Experiment_name_key" ON "Experiment"("name");

-- CreateIndex
CREATE UNIQUE INDEX "DemandSignal_hotelId_roomTypeId_date_key" ON "DemandSignal"("hotelId", "roomTypeId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "PricingState_hotelId_roomTypeId_key" ON "PricingState"("hotelId", "roomTypeId");

-- CreateIndex
CREATE INDEX "HolidayCalendar_date_idx" ON "HolidayCalendar"("date");

-- CreateIndex
CREATE UNIQUE INDEX "ChannelIntegration_hotelId_key" ON "ChannelIntegration"("hotelId");

-- CreateIndex
CREATE UNIQUE INDEX "ChannelMapping_hotelId_zivoRoomTypeId_externalProvider_key" ON "ChannelMapping"("hotelId", "zivoRoomTypeId", "externalProvider");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_gatewayRef_key" ON "Transaction"("gatewayRef");

-- CreateIndex
CREATE INDEX "Transaction_bookingId_idx" ON "Transaction"("bookingId");

-- CreateIndex
CREATE INDEX "Transaction_gatewayRef_idx" ON "Transaction"("gatewayRef");

-- CreateIndex
CREATE UNIQUE INDEX "Settlement_bookingId_key" ON "Settlement"("bookingId");

-- CreateIndex
CREATE INDEX "Settlement_hotelId_idx" ON "Settlement"("hotelId");

-- CreateIndex
CREATE INDEX "Settlement_status_idx" ON "Settlement"("status");

-- CreateIndex
CREATE INDEX "LedgerEntry_referenceId_idx" ON "LedgerEntry"("referenceId");

-- CreateIndex
CREATE INDEX "LedgerEntry_account_idx" ON "LedgerEntry"("account");

-- CreateIndex
CREATE INDEX "LedgerEntry_createdAt_idx" ON "LedgerEntry"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "LedgerEntry_referenceId_account_type_amount_description_key" ON "LedgerEntry"("referenceId", "account", "type", "amount", "description");

-- CreateIndex
CREATE UNIQUE INDEX "Payout_reference_key" ON "Payout"("reference");

-- CreateIndex
CREATE INDEX "Payout_hotelId_idx" ON "Payout"("hotelId");

-- CreateIndex
CREATE INDEX "Dispute_transactionId_idx" ON "Dispute"("transactionId");

-- CreateIndex
CREATE INDEX "Dispute_bookingId_idx" ON "Dispute"("bookingId");

-- CreateIndex
CREATE UNIQUE INDEX "Wallet_userId_key" ON "Wallet"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Wallet_hotelId_key" ON "Wallet"("hotelId");

-- CreateIndex
CREATE INDEX "EmailOTP_email_idx" ON "EmailOTP"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Agent_email_key" ON "Agent"("email");

-- CreateIndex
CREATE UNIQUE INDEX "SessionLog_sessionId_key" ON "SessionLog"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "DemandForecast_city_date_key" ON "DemandForecast"("city", "date");

-- CreateIndex
CREATE INDEX "HotelInteraction_hotelId_type_idx" ON "HotelInteraction"("hotelId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "PropertyLead_email_key" ON "PropertyLead"("email");

-- CreateIndex
CREATE UNIQUE INDEX "PropertyLead_hotelId_key" ON "PropertyLead"("hotelId");

-- CreateIndex
CREATE INDEX "PropertyLead_status_idx" ON "PropertyLead"("status");

-- CreateIndex
CREATE INDEX "PropertyLead_assignedTo_idx" ON "PropertyLead"("assignedTo");

-- CreateIndex
CREATE INDEX "PropertyLead_city_idx" ON "PropertyLead"("city");

-- CreateIndex
CREATE INDEX "KYCRecord_hotelId_documentType_idx" ON "KYCRecord"("hotelId", "documentType");

-- CreateIndex
CREATE INDEX "PropertyTask_hotelId_status_idx" ON "PropertyTask"("hotelId", "status");

-- CreateIndex
CREATE INDEX "PropertyAudit_hotelId_timestamp_idx" ON "PropertyAudit"("hotelId", "timestamp");

-- CreateIndex
CREATE INDEX "PropertyAgreement_hotelId_status_idx" ON "PropertyAgreement"("hotelId", "status");

-- CreateIndex
CREATE INDEX "AdminActionLog_userId_idx" ON "AdminActionLog"("userId");

-- CreateIndex
CREATE INDEX "AdminActionLog_entity_entityId_idx" ON "AdminActionLog"("entity", "entityId");

-- CreateIndex
CREATE INDEX "AdminActionLog_timestamp_idx" ON "AdminActionLog"("timestamp");

-- CreateIndex
CREATE INDEX "DecisionLog_entityId_type_idx" ON "DecisionLog"("entityId", "type");

-- CreateIndex
CREATE INDEX "DecisionLog_timestamp_idx" ON "DecisionLog"("timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "SessionRecord_sessionId_key" ON "SessionRecord"("sessionId");

-- CreateIndex
CREATE INDEX "SessionRecord_userId_idx" ON "SessionRecord"("userId");

-- CreateIndex
CREATE INDEX "SessionRecord_isConverted_idx" ON "SessionRecord"("isConverted");

-- CreateIndex
CREATE INDEX "SessionRecord_createdAt_idx" ON "SessionRecord"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SessionAggregate_date_key" ON "SessionAggregate"("date");

-- CreateIndex
CREATE INDEX "SessionAggregate_date_idx" ON "SessionAggregate"("date");

-- CreateIndex
CREATE INDEX "SystemActionLog_actionType_idx" ON "SystemActionLog"("actionType");

-- CreateIndex
CREATE INDEX "SystemActionLog_timestamp_idx" ON "SystemActionLog"("timestamp");

-- CreateIndex
CREATE INDEX "SystemEvent_type_idx" ON "SystemEvent"("type");

-- CreateIndex
CREATE INDEX "SystemEvent_timestamp_idx" ON "SystemEvent"("timestamp");

-- CreateIndex
CREATE INDEX "DecisionVersion_entityType_version_idx" ON "DecisionVersion"("entityType", "version");

-- CreateIndex
CREATE UNIQUE INDEX "PolicyTemplate_code_key" ON "PolicyTemplate"("code");

-- CreateIndex
CREATE UNIQUE INDEX "HotelPolicy_hotelId_policyCode_key" ON "HotelPolicy"("hotelId", "policyCode");

-- CreateIndex
CREATE INDEX "BookingTimelineEvent_bookingId_idx" ON "BookingTimelineEvent"("bookingId");

-- CreateIndex
CREATE INDEX "BookingTimelineEvent_createdAt_idx" ON "BookingTimelineEvent"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "BookingIntelligence_bookingId_key" ON "BookingIntelligence"("bookingId");

-- CreateIndex
CREATE INDEX "NotificationSyncLog_bookingId_idx" ON "NotificationSyncLog"("bookingId");

-- CreateIndex
CREATE INDEX "BackgroundJob_status_queue_runAt_idx" ON "BackgroundJob"("status", "queue", "runAt");

-- CreateIndex
CREATE INDEX "BackgroundJob_priority_idx" ON "BackgroundJob"("priority");

-- CreateIndex
CREATE INDEX "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Booking_requestId_key" ON "Booking"("requestId");

-- CreateIndex
CREATE INDEX "Booking_hotelId_idx" ON "Booking"("hotelId");

-- CreateIndex
CREATE INDEX "Booking_userId_idx" ON "Booking"("userId");

-- CreateIndex
CREATE INDEX "Booking_checkIn_checkOut_idx" ON "Booking"("checkIn", "checkOut");

-- CreateIndex
CREATE INDEX "Booking_status_idx" ON "Booking"("status");

-- CreateIndex
CREATE INDEX "Hotel_ownerId_idx" ON "Hotel"("ownerId");

-- CreateIndex
CREATE INDEX "Hotel_city_idx" ON "Hotel"("city");

-- CreateIndex
CREATE INDEX "Hotel_status_idx" ON "Hotel"("status");

-- CreateIndex
CREATE INDEX "Hotel_state_idx" ON "Hotel"("state");

-- CreateIndex
CREATE INDEX "Hotel_country_idx" ON "Hotel"("country");

-- CreateIndex
CREATE INDEX "Hotel_pincode_idx" ON "Hotel"("pincode");

-- CreateIndex
CREATE INDEX "RatePlan_roomTypeId_idx" ON "RatePlan"("roomTypeId");

-- AddForeignKey
ALTER TABLE "HotelImage" ADD CONSTRAINT "HotelImage_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomTypeImage" ADD CONSTRAINT "RoomTypeImage_imageId_fkey" FOREIGN KEY ("imageId") REFERENCES "HotelImage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomTypeImage" ADD CONSTRAINT "RoomTypeImage_roomTypeId_fkey" FOREIGN KEY ("roomTypeId") REFERENCES "RoomType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OccupancyPricing" ADD CONSTRAINT "OccupancyPricing_ratePlanId_fkey" FOREIGN KEY ("ratePlanId") REFERENCES "RatePlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "SessionLog"("sessionId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CancellationPolicy" ADD CONSTRAINT "CancellationPolicy_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CouponUsage" ADD CONSTRAINT "CouponUsage_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "Coupon"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CouponUsage" ADD CONSTRAINT "CouponUsage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyaltyWallet" ADD CONSTRAINT "LoyaltyWallet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelMapping" ADD CONSTRAINT "ChannelMapping_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletTransaction" ADD CONSTRAINT "WalletTransaction_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PropertyLead" ADD CONSTRAINT "PropertyLead_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KYCRecord" ADD CONSTRAINT "KYCRecord_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PropertyTask" ADD CONSTRAINT "PropertyTask_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PropertyAudit" ADD CONSTRAINT "PropertyAudit_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PropertyAgreement" ADD CONSTRAINT "PropertyAgreement_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HotelPolicy" ADD CONSTRAINT "HotelPolicy_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingTimelineEvent" ADD CONSTRAINT "BookingTimelineEvent_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingIntelligence" ADD CONSTRAINT "BookingIntelligence_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationSyncLog" ADD CONSTRAINT "NotificationSyncLog_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

