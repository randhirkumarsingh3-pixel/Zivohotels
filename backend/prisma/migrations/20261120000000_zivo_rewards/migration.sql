-- Zivo Rewards: points ledger with type/status and links, and program settings.
ALTER TABLE "LoyaltyPoint" ADD COLUMN "type" TEXT NOT NULL DEFAULT 'EARN';
ALTER TABLE "LoyaltyPoint" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'AVAILABLE';
ALTER TABLE "LoyaltyPoint" ADD COLUMN "bookingId" TEXT;
ALTER TABLE "LoyaltyPoint" ADD COLUMN "reviewId" TEXT;
ALTER TABLE "LoyaltyPoint" ADD COLUMN "description" TEXT;
ALTER TABLE "LoyaltyPoint" ADD COLUMN "createdById" TEXT;
ALTER TABLE "LoyaltyPoint" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
CREATE INDEX "LoyaltyPoint_userId_status_idx" ON "LoyaltyPoint"("userId", "status");
CREATE INDEX "LoyaltyPoint_bookingId_idx" ON "LoyaltyPoint"("bookingId");

-- Points awarded before Zivo Rewards were given when a booking was created (paid or not, and never
-- taken back on cancellation) and aren't linked to bookings. They are kept for the record but not
-- counted; points for completed stays are re-earned properly by the rewards backfill.
UPDATE "LoyaltyPoint" SET "type" = CASE WHEN "points" < 0 THEN 'REDEEM' ELSE 'EARN' END,
  "status" = 'VOID', "description" = 'Awarded before Zivo Rewards (not counted)';

CREATE TABLE "LoyaltySetting" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "config" JSONB NOT NULL,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LoyaltySetting_pkey" PRIMARY KEY ("id")
);
