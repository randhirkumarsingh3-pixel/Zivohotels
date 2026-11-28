-- CreateTable
CREATE TABLE "SavedHotel" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "checkIn" TIMESTAMP(3),
    "checkOut" TIMESTAMP(3),
    "adults" INTEGER NOT NULL DEFAULT 2,
    "rooms" INTEGER NOT NULL DEFAULT 1,
    "alerts" BOOLEAN NOT NULL DEFAULT true,
    "savedPrice" DECIMAL(12,2),
    "lastPrice" DECIMAL(12,2),
    "lastCheckedAt" TIMESTAMP(3),
    "lastAlertPrice" DECIMAL(12,2),
    "lastAlertAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SavedHotel_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SavedHotel_alerts_checkIn_idx" ON "SavedHotel"("alerts", "checkIn");

-- CreateIndex
CREATE UNIQUE INDEX "SavedHotel_userId_hotelId_key" ON "SavedHotel"("userId", "hotelId");

-- AddForeignKey
ALTER TABLE "SavedHotel" ADD CONSTRAINT "SavedHotel_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedHotel" ADD CONSTRAINT "SavedHotel_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

