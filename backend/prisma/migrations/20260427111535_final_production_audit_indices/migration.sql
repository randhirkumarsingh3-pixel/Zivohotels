-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN     "requestId" TEXT;

-- CreateIndex
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_action_idx" ON "AuditLog"("createdAt", "action");
