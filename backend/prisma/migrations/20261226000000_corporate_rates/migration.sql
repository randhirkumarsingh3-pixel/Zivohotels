-- CreateTable
CREATE TABLE "CorporateRate" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "roomTypeId" TEXT,
    "roomTypeName" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'PERCENT',
    "value" DECIMAL(10,2) NOT NULL,
    "validFrom" DATE NOT NULL,
    "validTo" DATE NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PROPOSED',
    "notes" TEXT,
    "proposedById" TEXT NOT NULL,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CorporateRate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CorporateRate_organisationId_hotelId_status_idx" ON "CorporateRate"("organisationId", "hotelId", "status");

-- CreateIndex
CREATE INDEX "CorporateRate_hotelId_status_idx" ON "CorporateRate"("hotelId", "status");

-- AddForeignKey
ALTER TABLE "CorporateRate" ADD CONSTRAINT "CorporateRate_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CorporateRate" ADD CONSTRAINT "CorporateRate_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
