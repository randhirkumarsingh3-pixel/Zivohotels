-- ZivoPlus for Business and ZivoPlus Partner Hub: organisations, members, account ledger,
-- hotels' business rates, and business details on bookings

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "businessPricing" JSONB,
ADD COLUMN     "channel" TEXT NOT NULL DEFAULT 'B2C',
ADD COLUMN     "organisationId" TEXT;

-- CreateTable
CREATE TABLE "Organisation" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "legalName" TEXT NOT NULL,
    "incorporationType" TEXT,
    "pan" TEXT NOT NULL,
    "gstin" TEXT,
    "address" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "pincode" TEXT NOT NULL,
    "billingEmail" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "website" TEXT,
    "status" TEXT NOT NULL DEFAULT 'IN_REVIEW',
    "statusNote" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "paymentMode" TEXT,
    "creditLimit" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "creditDays" INTEGER,
    "invoiceMode" TEXT,
    "pricingModel" TEXT,
    "defaultMarkupPct" DECIMAL(5,2),
    "extraCommissionPct" DECIMAL(5,2),
    "tier" TEXT NOT NULL DEFAULT 'STANDARD',
    "documents" JSONB NOT NULL DEFAULT '[]',
    "settings" JSONB NOT NULL DEFAULT '{}',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organisation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrgMember" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "invitedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrgMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrgLedgerEntry" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "balanceAfter" DECIMAL(12,2) NOT NULL,
    "bookingId" TEXT,
    "reference" TEXT NOT NULL,
    "note" TEXT,
    "dueAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrgLedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HotelBusinessRate" (
    "hotelId" TEXT NOT NULL,
    "corporateEnabled" BOOLEAN NOT NULL DEFAULT false,
    "corporateDiscountPct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "agentEnabled" BOOLEAN NOT NULL DEFAULT false,
    "agentDiscountPct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HotelBusinessRate_pkey" PRIMARY KEY ("hotelId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Organisation_code_key" ON "Organisation"("code");

-- CreateIndex
CREATE INDEX "Organisation_kind_status_idx" ON "Organisation"("kind", "status");

-- CreateIndex
CREATE INDEX "Organisation_pan_idx" ON "Organisation"("pan");

-- CreateIndex
CREATE INDEX "OrgMember_userId_idx" ON "OrgMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "OrgMember_organisationId_userId_key" ON "OrgMember"("organisationId", "userId");

-- CreateIndex
CREATE INDEX "OrgLedgerEntry_organisationId_createdAt_idx" ON "OrgLedgerEntry"("organisationId", "createdAt");

-- CreateIndex
CREATE INDEX "OrgLedgerEntry_bookingId_idx" ON "OrgLedgerEntry"("bookingId");

-- CreateIndex
CREATE UNIQUE INDEX "OrgLedgerEntry_organisationId_type_reference_key" ON "OrgLedgerEntry"("organisationId", "type", "reference");

-- CreateIndex
CREATE INDEX "Booking_organisationId_idx" ON "Booking"("organisationId");

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgMember" ADD CONSTRAINT "OrgMember_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgMember" ADD CONSTRAINT "OrgMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgLedgerEntry" ADD CONSTRAINT "OrgLedgerEntry_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HotelBusinessRate" ADD CONSTRAINT "HotelBusinessRate_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

