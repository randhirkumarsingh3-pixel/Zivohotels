-- AlterTable
ALTER TABLE "Organisation" ADD COLUMN     "accreditation" JSONB,
ADD COLUMN     "bankCheckRef" TEXT,
ADD COLUMN     "bankDetails" TEXT,
ADD COLUMN     "bankLast4" TEXT,
ADD COLUMN     "bankNote" TEXT,
ADD COLUMN     "bankStatus" TEXT,
ADD COLUMN     "businessProfile" JSONB,
ADD COLUMN     "contactDesignation" TEXT,
ADD COLUMN     "contactName" TEXT,
ADD COLUMN     "declarationAt" TIMESTAMP(3),
ADD COLUMN     "draftReminderAt" TIMESTAMP(3),
ADD COLUMN     "gstDeclaration" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isSignatory" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "submittedAt" TIMESTAMP(3);

