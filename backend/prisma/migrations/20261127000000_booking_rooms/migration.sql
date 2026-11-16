-- One row per room of a booking (rooms of one booking can be different room types)
CREATE TABLE "BookingRoom" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "roomNumber" INTEGER NOT NULL,
    "roomTypeId" TEXT NOT NULL,
    "ratePlanId" TEXT,
    "adults" INTEGER NOT NULL DEFAULT 1,
    "children" INTEGER NOT NULL DEFAULT 0,
    "guestName" TEXT NOT NULL,
    "roomPrice" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "extraGuestCharges" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "mealCharges" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "extraBedCharges" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "subtotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BookingRoom_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BookingRoom_bookingId_roomNumber_key" ON "BookingRoom"("bookingId", "roomNumber");
CREATE INDEX "BookingRoom_roomTypeId_idx" ON "BookingRoom"("roomTypeId");

ALTER TABLE "BookingRoom" ADD CONSTRAINT "BookingRoom_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BookingRoom" ADD CONSTRAINT "BookingRoom_roomTypeId_fkey" FOREIGN KEY ("roomTypeId") REFERENCES "RoomType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BookingRoom" ADD CONSTRAINT "BookingRoom_ratePlanId_fkey" FOREIGN KEY ("ratePlanId") REFERENCES "RatePlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
