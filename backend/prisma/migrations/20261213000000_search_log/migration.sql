-- Guest searches for Admin → Revenue per search and Demand forecasting
CREATE TABLE "SearchLog" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sessionId" TEXT,
    "userId" TEXT,
    "place" TEXT NOT NULL,
    "checkIn" DATE NOT NULL,
    "nights" INTEGER NOT NULL,
    "guests" INTEGER NOT NULL,
    "rooms" INTEGER NOT NULL,
    "results" INTEGER NOT NULL,
    "hourly" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "SearchLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SearchLog_createdAt_idx" ON "SearchLog"("createdAt");
CREATE INDEX "SearchLog_checkIn_idx" ON "SearchLog"("checkIn");
CREATE INDEX "SearchLog_place_createdAt_idx" ON "SearchLog"("place", "createdAt");
