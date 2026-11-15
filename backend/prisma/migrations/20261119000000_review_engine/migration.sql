-- Review management: richer guest reviews, moderation, hotel replies and reports, and a hotel
-- review score kept apart from its star category.
ALTER TABLE "Review" ADD COLUMN "title" TEXT;
ALTER TABLE "Review" ADD COLUMN "aspectRatings" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "Review" ADD COLUMN "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Review" ADD COLUMN "photos" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "Review" ADD COLUMN "tripType" TEXT;
ALTER TABLE "Review" ADD COLUMN "publishedAt" TIMESTAMP(3);
ALTER TABLE "Review" ADD COLUMN "moderationNote" TEXT;
ALTER TABLE "Review" ADD COLUMN "moderatedById" TEXT;
ALTER TABLE "Review" ADD COLUMN "moderatedAt" TIMESTAMP(3);
ALTER TABLE "Review" ADD COLUMN "reply" TEXT;
ALTER TABLE "Review" ADD COLUMN "replyAt" TIMESTAMP(3);
ALTER TABLE "Review" ADD COLUMN "replyById" TEXT;
ALTER TABLE "Review" ADD COLUMN "reportedAt" TIMESTAMP(3);
ALTER TABLE "Review" ADD COLUMN "reportReason" TEXT;
ALTER TABLE "Review" ADD COLUMN "reportedById" TEXT;
ALTER TABLE "Review" ADD COLUMN "reportResolved" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX "Review_hotelId_status_idx" ON "Review"("hotelId", "status");
CREATE INDEX "Review_status_idx" ON "Review"("status");

ALTER TABLE "Hotel" ADD COLUMN "reviewScore" DOUBLE PRECISION;
ALTER TABLE "Hotel" ADD COLUMN "reviewCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Hotel" ADD COLUMN "reviewAspects" JSONB;
