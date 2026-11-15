-- Zivo Rewards point expiry: when each batch of points became usable, and expiry reminders.
ALTER TABLE "LoyaltyPoint" ADD COLUMN "availableAt" TIMESTAMP(3);
ALTER TABLE "LoyaltyPoint" ADD COLUMN "expiryNoticeAt" TIMESTAMP(3);
-- Points already usable count from when they were added
UPDATE "LoyaltyPoint" SET "availableAt" = "createdAt" WHERE "status" = 'AVAILABLE' AND "points" > 0;
