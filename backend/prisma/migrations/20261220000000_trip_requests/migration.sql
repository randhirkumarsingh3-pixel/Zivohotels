-- ZivoPlus for Business: trip requests for the travel desk; approval delegation
-- AlterTable
ALTER TABLE "OrgMember" ADD COLUMN     "delegateMemberId" TEXT,
ADD COLUMN     "delegateUntil" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "TripRequest" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "requesterMemberId" TEXT NOT NULL,
    "travellerMemberId" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "checkIn" TIMESTAMP(3) NOT NULL,
    "checkOut" TIMESTAMP(3) NOT NULL,
    "rooms" INTEGER NOT NULL DEFAULT 1,
    "adults" INTEGER NOT NULL DEFAULT 1,
    "purpose" TEXT NOT NULL,
    "preferredHotelId" TEXT,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
    "bookingId" TEXT,
    "handledByMemberId" TEXT,
    "handledAt" TIMESTAMP(3),
    "handlerNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TripRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TripRequest_organisationId_status_idx" ON "TripRequest"("organisationId", "status");

-- CreateIndex
CREATE INDEX "TripRequest_travellerMemberId_idx" ON "TripRequest"("travellerMemberId");

-- AddForeignKey
ALTER TABLE "TripRequest" ADD CONSTRAINT "TripRequest_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

