-- CreateTable
CREATE TABLE "GroupRequest" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "requesterMemberId" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "checkIn" DATE NOT NULL,
    "checkOut" DATE NOT NULL,
    "lines" JSONB NOT NULL,
    "purpose" TEXT NOT NULL,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
    "quote" JSONB,
    "quoteValidUntil" DATE,
    "declineNote" TEXT,
    "bookingId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GroupRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GroupRequest_organisationId_status_idx" ON "GroupRequest"("organisationId", "status");

-- CreateIndex
CREATE INDEX "GroupRequest_hotelId_status_idx" ON "GroupRequest"("hotelId", "status");

-- AddForeignKey
ALTER TABLE "GroupRequest" ADD CONSTRAINT "GroupRequest_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupRequest" ADD CONSTRAINT "GroupRequest_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
