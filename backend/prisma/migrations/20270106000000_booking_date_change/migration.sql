-- CreateTable
CREATE TABLE "DateChangeRequest" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "userId" TEXT,
    "oldCheckIn" TIMESTAMP(3) NOT NULL,
    "oldCheckOut" TIMESTAMP(3) NOT NULL,
    "newCheckIn" TIMESTAMP(3) NOT NULL,
    "newCheckOut" TIMESTAMP(3) NOT NULL,
    "oldTotal" DECIMAL(10,2) NOT NULL,
    "newTotal" DECIMAL(10,2) NOT NULL,
    "difference" DECIMAL(10,2) NOT NULL,
    "pricing" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "guestNote" TEXT,
    "hotelReply" TEXT,
    "respondedAt" TIMESTAMP(3),
    "respondedBy" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "orderId" TEXT,
    "paymentId" TEXT,
    "refund" JSONB,
    "appliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DateChangeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DateChangeRequest_orderId_key" ON "DateChangeRequest"("orderId");

-- CreateIndex
CREATE INDEX "DateChangeRequest_hotelId_status_idx" ON "DateChangeRequest"("hotelId", "status");

-- CreateIndex
CREATE INDEX "DateChangeRequest_bookingId_status_idx" ON "DateChangeRequest"("bookingId", "status");

-- AddForeignKey
ALTER TABLE "DateChangeRequest" ADD CONSTRAINT "DateChangeRequest_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

