-- Optional company name, GSTIN and address on a booking (GST invoice for business travel).

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "guestCompanyAddress" TEXT,
ADD COLUMN     "guestCompanyGstin" TEXT,
ADD COLUMN     "guestCompanyName" TEXT;

