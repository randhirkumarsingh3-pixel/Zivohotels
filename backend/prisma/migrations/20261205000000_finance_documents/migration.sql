-- AlterTable
ALTER TABLE "Settlement" ADD COLUMN     "invoiceId" TEXT;

-- CreateTable
CREATE TABLE "FinanceDocument" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "series" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "live" BOOLEAN NOT NULL DEFAULT false,
    "hotelId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "issueDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "placeOfSupply" TEXT,
    "supplier" JSONB NOT NULL,
    "recipient" JSONB NOT NULL,
    "lines" JSONB NOT NULL,
    "stays" INTEGER NOT NULL DEFAULT 0,
    "bookingValue" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "taxable" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "cgst" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "sgst" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "igst" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "originalId" TEXT,
    "reason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ISSUED',
    "emailedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentSequence" (
    "series" TEXT NOT NULL,
    "counter" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "DocumentSequence_pkey" PRIMARY KEY ("series")
);

-- CreateTable
CREATE TABLE "HotelAdjustment" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "documentId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "payoutId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HotelAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FinanceDocument_number_key" ON "FinanceDocument"("number");

-- CreateIndex
CREATE INDEX "FinanceDocument_hotelId_period_idx" ON "FinanceDocument"("hotelId", "period");

-- CreateIndex
CREATE INDEX "FinanceDocument_kind_period_idx" ON "FinanceDocument"("kind", "period");

-- CreateIndex
CREATE INDEX "HotelAdjustment_hotelId_status_idx" ON "HotelAdjustment"("hotelId", "status");

-- CreateIndex
CREATE INDEX "Settlement_invoiceId_idx" ON "Settlement"("invoiceId");
