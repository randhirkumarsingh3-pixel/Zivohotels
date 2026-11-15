-- Rates & availability: stop-sell per room type and date, daily rate per rate plan and date;
-- channel manager connection details (property code, ARI API key, status).




-- AlterTable
ALTER TABLE "ChannelIntegration" ADD COLUMN     "apiKeyHash" TEXT,
ADD COLUMN     "apiKeyHint" TEXT,
ADD COLUMN     "externalHotelCode" TEXT,
ADD COLUMN     "lastAriAt" TIMESTAMP(3),
ADD COLUMN     "lastAriError" TEXT,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE "Inventory" ADD COLUMN     "stopSell" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "DailyRate" (
    "id" TEXT NOT NULL,
    "ratePlanId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyRate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DailyRate_ratePlanId_date_key" ON "DailyRate"("ratePlanId", "date");

-- AddForeignKey
ALTER TABLE "DailyRate" ADD CONSTRAINT "DailyRate_ratePlanId_fkey" FOREIGN KEY ("ratePlanId") REFERENCES "RatePlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

