-- Guest requests to the hotel about a booking (concierge)
CREATE TABLE "StayRequest" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "userId" TEXT,
    "type" TEXT NOT NULL,
    "details" TEXT NOT NULL DEFAULT '',
    "requestedTime" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "hotelReply" TEXT,
    "respondedAt" TIMESTAMP(3),
    "respondedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "StayRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "StayRequest_hotelId_status_idx" ON "StayRequest"("hotelId", "status");
CREATE INDEX "StayRequest_bookingId_idx" ON "StayRequest"("bookingId");

ALTER TABLE "StayRequest" ADD CONSTRAINT "StayRequest_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StayRequest" ADD CONSTRAINT "StayRequest_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
