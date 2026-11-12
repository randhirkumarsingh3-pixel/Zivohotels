-- New PropertyStatus values, in their own migration: PostgreSQL cannot use an enum value
-- in the same transaction that adds it, and the catch-up migration that follows does.
-- Databases built with 'prisma db push' must mark this as applied instead of running it —
-- see backend/docs/database-migrations.md.

ALTER TYPE "PropertyStatus" ADD VALUE 'DRAFT';
ALTER TYPE "PropertyStatus" ADD VALUE 'SUBMITTED';
ALTER TYPE "PropertyStatus" ADD VALUE 'IN_REVIEW';
ALTER TYPE "PropertyStatus" ADD VALUE 'INFORMATION_REQUESTED';
ALTER TYPE "PropertyStatus" ADD VALUE 'APPROVED';
ALTER TYPE "PropertyStatus" ADD VALUE 'PENDING_AGREEMENT';
ALTER TYPE "PropertyStatus" ADD VALUE 'AGREEMENT_SIGNED';
ALTER TYPE "PropertyStatus" ADD VALUE 'READY_FOR_GO_LIVE';
ALTER TYPE "PropertyStatus" ADD VALUE 'LIVE';
ALTER TYPE "PropertyStatus" ADD VALUE 'PAUSED';
ALTER TYPE "PropertyStatus" ADD VALUE 'SUSPENDED';
ALTER TYPE "PropertyStatus" ADD VALUE 'THROTTLED';
ALTER TYPE "PropertyStatus" ADD VALUE 'BLOCKED';
ALTER TYPE "PropertyStatus" ADD VALUE 'ARCHIVED';
ALTER TYPE "PropertyStatus" ADD VALUE 'DELETED';
