-- Verified email / phone and Google sign-in on accounts
ALTER TABLE "User" ADD COLUMN "emailVerifiedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "phoneVerifiedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "googleId" TEXT;
CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId");

-- Sign-in codes: by email or SMS, for a purpose
ALTER TABLE "EmailOTP" ADD COLUMN "channel" TEXT NOT NULL DEFAULT 'EMAIL';
ALTER TABLE "EmailOTP" ADD COLUMN "purpose" TEXT NOT NULL DEFAULT 'VERIFY';
CREATE INDEX "EmailOTP_email_purpose_idx" ON "EmailOTP"("email", "purpose");

-- In-app notifications for guests and admins
CREATE TABLE "UserNotification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "link" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserNotification_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "UserNotification_userId_isRead_idx" ON "UserNotification"("userId", "isRead");
CREATE INDEX "UserNotification_createdAt_idx" ON "UserNotification"("createdAt");

-- The old "deliver notification" queue had no worker: drop the jobs that piled up
DELETE FROM "BackgroundJob" WHERE "queue" = 'notification' AND "status" = 'PENDING';
