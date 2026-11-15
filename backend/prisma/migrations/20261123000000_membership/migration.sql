-- Membership: plans (free Member + paid plans), guests' paid memberships, hotel member prices,
-- and member-only promotions.
CREATE TABLE "MembershipPlan" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "durationDays" INTEGER NOT NULL DEFAULT 365,
    "isFree" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "benefits" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MembershipPlan_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MembershipPlan_code_key" ON "MembershipPlan"("code");

CREATE TABLE "Membership" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING_PAYMENT',
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "pricePaid" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "paymentMethod" TEXT,
    "razorpayOrderId" TEXT,
    "razorpayPaymentId" TEXT,
    "note" TEXT,
    "reminderSentAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Membership_razorpayOrderId_key" ON "Membership"("razorpayOrderId");
CREATE INDEX "Membership_userId_status_idx" ON "Membership"("userId", "status");
CREATE INDEX "Membership_endsAt_idx" ON "Membership"("endsAt");
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_planId_fkey" FOREIGN KEY ("planId") REFERENCES "MembershipPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Hotel" ADD COLUMN "memberDiscountPercent" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Promotion" ADD COLUMN "audience" TEXT NOT NULL DEFAULT 'ALL';

-- Default plans (editable in Admin -> Membership)
INSERT INTO "MembershipPlan" ("id","code","name","description","price","durationDays","isFree","isActive","sortOrder","benefits","updatedAt") VALUES
('plan-member','MEMBER','Member','Free for everyone with a ZivoHotels account',0,0,true,true,0,
 '{"hotelMemberRates":true,"zivoDiscountPercent":0,"zivoDiscountMax":0,"pointsMultiplier":1,"memberOffers":true,"freeCancelExtraHours":0,"prioritySupport":false}', CURRENT_TIMESTAMP),
('plan-prime','PRIME','Zivo Prime','Extra savings, more points and flexible cancellation for a year',999,365,false,true,1,
 '{"hotelMemberRates":true,"zivoDiscountPercent":5,"zivoDiscountMax":1500,"pointsMultiplier":2,"memberOffers":true,"freeCancelExtraHours":24,"prioritySupport":true}', CURRENT_TIMESTAMP);
