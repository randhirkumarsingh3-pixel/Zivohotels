-- Partner Hub bookings: the travel agent's commission funded by the hotel, taken from its payout
ALTER TABLE "Settlement" ADD COLUMN "agentCommissionAmount" DECIMAL(12,2) NOT NULL DEFAULT 0;
