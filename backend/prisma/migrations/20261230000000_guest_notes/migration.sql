-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "taxAmount" DECIMAL(12,2),
ADD COLUMN     "totalAmount" DECIMAL(12,2);

-- CreateTable
CREATE TABLE "GuestNote" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "noteRef" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "taxAmount" DECIMAL(12,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "pdfUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GuestNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuestNoteSequence" (
    "kind" TEXT NOT NULL,
    "fy" INTEGER NOT NULL,
    "counter" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "GuestNoteSequence_pkey" PRIMARY KEY ("kind","fy")
);

-- CreateIndex
CREATE UNIQUE INDEX "GuestNote_noteRef_key" ON "GuestNote"("noteRef");

-- CreateIndex
CREATE UNIQUE INDEX "GuestNote_bookingId_key_key" ON "GuestNote"("bookingId", "key");

-- AddForeignKey
ALTER TABLE "GuestNote" ADD CONSTRAINT "GuestNote_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuestNote" ADD CONSTRAINT "GuestNote_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
