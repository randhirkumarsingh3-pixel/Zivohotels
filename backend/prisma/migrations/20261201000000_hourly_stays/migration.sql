-- Hourly stays: hotel settings, per room type hourly rooms and prices, day overrides, booking slot
ALTER TABLE "Hotel" ADD COLUMN "hourlySettings" JSONB;

ALTER TABLE "RoomType" ADD COLUMN "hourlyEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "RoomType" ADD COLUMN "hourlyRooms" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "RoomType" ADD COLUMN "hourlyPrices" JSONB;

ALTER TABLE "Booking" ADD COLUMN "stayType" TEXT NOT NULL DEFAULT 'NIGHTLY';
ALTER TABLE "Booking" ADD COLUMN "slotStart" TIMESTAMP(3);
ALTER TABLE "Booking" ADD COLUMN "slotEnd" TIMESTAMP(3);
ALTER TABLE "Booking" ADD COLUMN "hours" INTEGER;
CREATE INDEX "Booking_stayType_roomTypeId_slotStart_idx" ON "Booking"("stayType", "roomTypeId", "slotStart");

CREATE TABLE "HourlyAllocation" (
    "id" TEXT NOT NULL,
    "roomTypeId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "rooms" INTEGER NOT NULL,
    "stopSell" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "HourlyAllocation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "HourlyAllocation_roomTypeId_date_key" ON "HourlyAllocation"("roomTypeId", "date");
ALTER TABLE "HourlyAllocation" ADD CONSTRAINT "HourlyAllocation_roomTypeId_fkey" FOREIGN KEY ("roomTypeId") REFERENCES "RoomType"("id") ON DELETE CASCADE ON UPDATE CASCADE;
