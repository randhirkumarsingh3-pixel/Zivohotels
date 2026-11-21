-- Cancelling one room of a booking with several rooms
ALTER TABLE "BookingRoom" ADD COLUMN "cancelledAt" TIMESTAMP(3);
ALTER TABLE "BookingRoom" ADD COLUMN "refundAmount" DECIMAL(12,2);
