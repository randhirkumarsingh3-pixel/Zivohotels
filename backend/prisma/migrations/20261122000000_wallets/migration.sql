-- Wallets: Zivo Cash movements with a reason and booking link; Zivo Cash used on a booking.
ALTER TABLE "WalletTransaction" ADD COLUMN "category" TEXT NOT NULL DEFAULT 'OTHER';
ALTER TABLE "WalletTransaction" ADD COLUMN "description" TEXT;
ALTER TABLE "WalletTransaction" ADD COLUMN "bookingId" TEXT;
ALTER TABLE "WalletTransaction" ADD COLUMN "balanceAfter" DECIMAL(12,2);
ALTER TABLE "WalletTransaction" ADD COLUMN "createdById" TEXT;
CREATE INDEX "WalletTransaction_walletId_createdAt_idx" ON "WalletTransaction"("walletId", "createdAt");
CREATE INDEX "WalletTransaction_bookingId_idx" ON "WalletTransaction"("bookingId");
ALTER TABLE "Booking" ADD COLUMN "walletAmount" DECIMAL(12,2) NOT NULL DEFAULT 0;
