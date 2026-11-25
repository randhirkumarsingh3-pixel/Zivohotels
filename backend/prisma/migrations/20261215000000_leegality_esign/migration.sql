-- Aadhaar eSign of listing agreements through Leegality
ALTER TABLE "Agreement" ADD COLUMN "leegalityDocumentId" TEXT,
  ADD COLUMN "leegalitySignUrl" TEXT,
  ADD COLUMN "leegalityStatus" TEXT,
  ADD COLUMN "leegalityRequestedAt" TIMESTAMP(3),
  ADD COLUMN "leegalityContentHash" TEXT,
  ADD COLUMN "signerCertificate" JSONB;
CREATE UNIQUE INDEX "Agreement_leegalityDocumentId_key" ON "Agreement"("leegalityDocumentId");

CREATE TABLE "AgreementFile" (
    "id" TEXT NOT NULL,
    "agreementId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "content" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AgreementFile_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AgreementFile_agreementId_kind_key" ON "AgreementFile"("agreementId", "kind");
