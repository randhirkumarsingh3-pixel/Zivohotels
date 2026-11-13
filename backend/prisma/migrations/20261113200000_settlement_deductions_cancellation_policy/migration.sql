-- Settlement kind (stay / cancellation fee / no-show) and statutory deductions (GST on commission,
-- TCS, TDS); each property's chosen cancellation policy.

-- AlterTable
ALTER TABLE "CancellationPolicy" ADD COLUMN     "policyCode" TEXT NOT NULL DEFAULT 'FREE_CANCEL_24H';

-- AlterTable
ALTER TABLE "Settlement" ADD COLUMN     "commissionGstAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'STAY',
ADD COLUMN     "tcsAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "tdsAmount" DECIMAL(12,2) NOT NULL DEFAULT 0;

