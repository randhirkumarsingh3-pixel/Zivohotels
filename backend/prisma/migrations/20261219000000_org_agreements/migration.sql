-- Agreements with business accounts (travel agents and companies)
-- CreateTable
CREATE TABLE "OrgAgreement" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING_SIGNATURE',
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "templateVersion" INTEGER NOT NULL DEFAULT 1,
    "termMonths" INTEGER NOT NULL DEFAULT 12,
    "preparedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "preparedById" TEXT,
    "signedAt" TIMESTAMP(3),
    "expiryAt" TIMESTAMP(3),
    "signerUserId" TEXT,
    "signerName" TEXT,
    "signerEmail" TEXT,
    "ipAddress" TEXT,
    "signerUserAgent" TEXT,
    "signatureMethod" TEXT,
    "leegalityDocumentId" TEXT,
    "leegalitySignUrl" TEXT,
    "leegalityStatus" TEXT,
    "leegalityRequestedAt" TIMESTAMP(3),
    "leegalityContentHash" TEXT,
    "signerCertificate" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrgAgreement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrgAgreement_organisationId_key" ON "OrgAgreement"("organisationId");

-- CreateIndex
CREATE UNIQUE INDEX "OrgAgreement_reference_key" ON "OrgAgreement"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "OrgAgreement_leegalityDocumentId_key" ON "OrgAgreement"("leegalityDocumentId");

-- AddForeignKey
ALTER TABLE "OrgAgreement" ADD CONSTRAINT "OrgAgreement_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

