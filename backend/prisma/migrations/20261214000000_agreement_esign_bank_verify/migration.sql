-- Commission is set per property by ZivoPlus: no automatic 15%
ALTER TABLE "Agreement" ALTER COLUMN "commissionRate" DROP DEFAULT;

-- Agreement prepared from the admin template and signed electronically by the owner
ALTER TABLE "Agreement" ADD COLUMN "reference" TEXT,
  ADD COLUMN "templateVersion" INTEGER,
  ADD COLUMN "content" TEXT,
  ADD COLUMN "contentHash" TEXT,
  ADD COLUMN "payoutCycle" TEXT,
  ADD COLUMN "termMonths" INTEGER,
  ADD COLUMN "preparedAt" TIMESTAMP(3),
  ADD COLUMN "preparedBy" TEXT,
  ADD COLUMN "viewedAt" TIMESTAMP(3),
  ADD COLUMN "signerName" TEXT,
  ADD COLUMN "signerEmail" TEXT,
  ADD COLUMN "signerUserAgent" TEXT,
  ADD COLUMN "signatureMethod" TEXT;
CREATE UNIQUE INDEX "Agreement_reference_key" ON "Agreement"("reference");

-- Payout account checks
ALTER TABLE "BankDetail" ADD COLUMN "verificationStatus" TEXT NOT NULL DEFAULT 'UNVERIFIED',
  ADD COLUMN "verificationMethod" TEXT,
  ADD COLUMN "verificationRef" TEXT,
  ADD COLUMN "verificationNote" TEXT,
  ADD COLUMN "bankHolderName" TEXT,
  ADD COLUMN "verifiedAt" TIMESTAMP(3),
  ADD COLUMN "verifiedBy" TEXT;
