-- CreateEnum
CREATE TYPE "Role" AS ENUM ('CUSTOMER', 'OWNER', 'ADMIN');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'INVITED', 'BLOCKED', 'DELETED');

-- CreateEnum
CREATE TYPE "PropertyStatus" AS ENUM ('PENDING', 'ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "MealPlan" AS ENUM ('NONE', 'BREAKFAST', 'HALF_BOARD', 'FULL_BOARD');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CANCELLED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "PaymentType" AS ENUM ('PAY_AT_HOTEL', 'PARTIAL', 'PREPAID');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PARTIAL_PAID', 'PAID', 'FAILED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "AgreementStatus" AS ENUM ('DRAFT', 'PENDING_SIGNATURE', 'SIGNED', 'EXPIRED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'CUSTOMER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "phone" TEXT,
    "inviteToken" TEXT,
    "inviteExpiry" TIMESTAMP(3),
    "mustChangePassword" BOOLEAN DEFAULT false,
    "status" "UserStatus" DEFAULT 'ACTIVE',
    "loyalty" INTEGER DEFAULT 0,
    "tokenVersion" INTEGER NOT NULL DEFAULT 1,
    "lastLogin" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Hotel" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "rating" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reviews" INTEGER NOT NULL DEFAULT 0,
    "image" TEXT NOT NULL,
    "images" JSONB NOT NULL DEFAULT '[]',
    "amenities" JSONB NOT NULL DEFAULT '[]',
    "description" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ownerId" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "status" "PropertyStatus" DEFAULT 'PENDING',
    "checkInTime" TEXT DEFAULT '14:00',
    "checkOutTime" TEXT DEFAULT '11:00',
    "policies" JSONB NOT NULL DEFAULT '[]',
    "isDeleted" BOOLEAN DEFAULT false,

    CONSTRAINT "Hotel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoomType" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "basePrice" DOUBLE PRECISION NOT NULL,
    "originalPrice" DOUBLE PRECISION,
    "capacity" INTEGER NOT NULL,
    "totalInventory" INTEGER NOT NULL,
    "image" TEXT,
    "images" JSONB NOT NULL DEFAULT '[]',
    "amenities" JSONB NOT NULL DEFAULT '[]',
    "hotelId" TEXT NOT NULL,
    "code" TEXT DEFAULT '',
    "maxOccupancy" INTEGER DEFAULT 2,
    "baseOccupancy" INTEGER DEFAULT 2,
    "bedType" TEXT,
    "roomSize" TEXT,
    "viewType" TEXT,
    "isActive" BOOLEAN DEFAULT true,

    CONSTRAINT "RoomType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RatePlan" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mealPlan" "MealPlan" DEFAULT 'NONE',
    "cancellationPolicy" TEXT,
    "basePrice" DOUBLE PRECISION NOT NULL,
    "isActive" BOOLEAN DEFAULT true,
    "roomTypeId" TEXT NOT NULL,

    CONSTRAINT "RatePlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Booking" (
    "id" TEXT NOT NULL,
    "bookingRef" TEXT NOT NULL,
    "guestName" TEXT NOT NULL,
    "guestEmail" TEXT NOT NULL,
    "guestPhone" TEXT NOT NULL,
    "checkIn" TIMESTAMP(3) NOT NULL,
    "checkOut" TIMESTAMP(3) NOT NULL,
    "guests" INTEGER NOT NULL,
    "rooms" INTEGER NOT NULL,
    "totalAmount" DOUBLE PRECISION NOT NULL,
    "status" "BookingStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "hotelId" TEXT NOT NULL,
    "roomTypeId" TEXT NOT NULL,
    "userId" TEXT,
    "razorpayOrderId" TEXT,
    "razorpayPaymentId" TEXT,
    "razorpaySignature" TEXT,
    "paidAmount" DOUBLE PRECISION DEFAULT 0,
    "remainingAmount" DOUBLE PRECISION DEFAULT 0,
    "expiresAt" TIMESTAMP(3),
    "paymentType" "PaymentType" DEFAULT 'PREPAID',
    "paymentStatus" "PaymentStatus" DEFAULT 'PENDING',
    "taxAmount" DOUBLE PRECISION DEFAULT 0,
    "baseAmount" DOUBLE PRECISION DEFAULT 0,
    "ratePlanId" TEXT,

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxRule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "minThreshold" DOUBLE PRECISION DEFAULT 0,
    "maxThreshold" DOUBLE PRECISION,
    "percentage" DOUBLE PRECISION NOT NULL,
    "isActive" BOOLEAN DEFAULT true,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "TaxRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Agreement" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "status" "AgreementStatus" DEFAULT 'DRAFT',
    "commissionRate" DOUBLE PRECISION DEFAULT 15.0,
    "sentAt" TIMESTAMP(3),
    "signedAt" TIMESTAMP(3),
    "expiryAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "Agreement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankDetail" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "ifscCode" TEXT NOT NULL,
    "branchName" TEXT,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "BankDetail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Inventory" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "totalRooms" INTEGER NOT NULL,
    "bookedRooms" INTEGER DEFAULT 0,
    "availableRooms" INTEGER NOT NULL,
    "price" DOUBLE PRECISION,
    "roomTypeId" TEXT NOT NULL,

    CONSTRAINT "Inventory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "details" JSONB,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OwnerProperty" (
    "id" TEXT NOT NULL,
    "commission" DOUBLE PRECISION DEFAULT 15.0,
    "userId" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,

    CONSTRAINT "OwnerProperty_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Permission" (
    "id" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "canRead" BOOLEAN DEFAULT true,
    "canWrite" BOOLEAN DEFAULT false,
    "userId" TEXT NOT NULL,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "RoomType_hotelId_code_key" ON "RoomType"("hotelId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Booking_bookingRef_key" ON "Booking"("bookingRef");

-- CreateIndex
CREATE UNIQUE INDEX "Agreement_hotelId_key" ON "Agreement"("hotelId");

-- CreateIndex
CREATE UNIQUE INDEX "BankDetail_hotelId_key" ON "BankDetail"("hotelId");

-- CreateIndex
CREATE UNIQUE INDEX "Inventory_roomTypeId_date_key" ON "Inventory"("roomTypeId", "date");

-- AddForeignKey
ALTER TABLE "Hotel" ADD CONSTRAINT "Hotel_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomType" ADD CONSTRAINT "RoomType_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RatePlan" ADD CONSTRAINT "RatePlan_roomTypeId_fkey" FOREIGN KEY ("roomTypeId") REFERENCES "RoomType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_roomTypeId_fkey" FOREIGN KEY ("roomTypeId") REFERENCES "RoomType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_ratePlanId_fkey" FOREIGN KEY ("ratePlanId") REFERENCES "RatePlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inventory" ADD CONSTRAINT "Inventory_roomTypeId_fkey" FOREIGN KEY ("roomTypeId") REFERENCES "RoomType"("id") ON DELETE CASCADE ON UPDATE CASCADE;
