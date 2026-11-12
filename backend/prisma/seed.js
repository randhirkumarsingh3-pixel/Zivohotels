import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import hotelsData from '../data/hotels.js';

const prisma = new PrismaClient();

// SAFETY: this script DELETES all users, hotels and bookings before inserting test data.
// Refuse to run against anything except a database on this machine, and never in production.
const assertSafeToSeed = () => {
  const url = process.env.DATABASE_URL || '';
  let host = '';
  try { host = new URL(url).hostname; } catch { /* unparsable URL -> treated as unsafe */ }
  const isLocal = ['localhost', '127.0.0.1', '::1', '[::1]'].includes(host);
  if (process.env.NODE_ENV === 'production' || (!isLocal && process.env.ALLOW_REMOTE_SEED !== 'true')) {
    console.error(
      `\n❌ Refusing to seed: it deletes ALL users, hotels and bookings.\n` +
      `   DATABASE_URL host is "${host || 'unknown'}"${process.env.NODE_ENV === 'production' ? ' and NODE_ENV=production' : ''}.\n` +
      `   Seeding only runs against localhost. For a disposable remote database (never production),\n` +
      `   set ALLOW_REMOTE_SEED=true.\n`
    );
    process.exit(1);
  }
};

// Test-account passwords: override via env, defaults are for local development only.
const SEED_ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD || 'admin123';
const SEED_OWNER_PASSWORD = process.env.SEED_OWNER_PASSWORD || 'ZivoExtranet@2026';
const SEED_CUSTOMER_PASSWORD = process.env.SEED_CUSTOMER_PASSWORD || 'customer123';

async function main() {
  assertSafeToSeed();
  console.log('Start seeding...');
  
  // Clean up existing data to prevent duplicates
  await prisma.booking.deleteMany();
  await prisma.roomType.deleteMany();
  await prisma.hotel.deleteMany();
  await prisma.user.deleteMany();
  await prisma.propertyLead.deleteMany();
  await prisma.kYCRecord.deleteMany();
  await prisma.propertyTask.deleteMany();
  await prisma.propertyAudit.deleteMany();
  await prisma.propertyAgreement.deleteMany();
  await prisma.channelMapping.deleteMany();

  // Create Default Admin
  const salt = await bcrypt.genSalt(10);
  const hashedAdminPassword = await bcrypt.hash(SEED_ADMIN_PASSWORD, salt);
  const admin = await prisma.user.create({
    data: {
      name: "Super Admin",
      email: "admin@zivohotels.com",
      password: hashedAdminPassword,
      role: "ADMIN"
    }
  });
  console.log(`Created Admin user: ${admin.email}`);

  // Create Default Owner (Extranet)
  const hashedOwnerPassword = await bcrypt.hash(SEED_OWNER_PASSWORD, salt);
  const owner = await prisma.user.create({
    data: {
      name: "Property Owner",
      email: "extranet@zivotechretreat.com",
      password: hashedOwnerPassword,
      role: "OWNER"
    }
  });
  console.log(`Created Owner user: ${owner.email}`);

  // Create Default Customer
  const hashedCustomerPassword = await bcrypt.hash(SEED_CUSTOMER_PASSWORD, salt);
  const customer = await prisma.user.create({
    data: {
      name: "Regular Guest",
      email: "user@zivohotels.com",
      password: hashedCustomerPassword,
      role: "CUSTOMER"
    }
  });
  console.log(`Created Customer user: ${customer.email}`);

  for (const hotel of hotelsData) {
    const createdHotel = await prisma.hotel.create({
      data: {
        name: hotel.name,
        location: hotel.location,
        city: hotel.city,
        rating: hotel.rating,
        reviews: hotel.reviews,
        amenities: hotel.amenities,
        description: hotel.description,
        ownerId: owner.id,
        status: 'LIVE',
        mode: 'INTERNAL',
        onboardingStep: 12, // Fully onboarded
        legalName: `${hotel.name} Pvt Ltd`,
        brandName: hotel.name,
        gstin: "07AABCG1234A1Z5",
        pan: "AABCG1234A",
        mediaScore: 85.5,
        complianceScore: 100,
        revenueReadinessScore: 92,
        readinessBreakdown: {
          media: 85,
          pricing: 95,
          compliance: 100,
          distribution: 90
        },
        activationDate: new Date(),
        media: {
          create: hotel.images ? hotel.images.map(url => ({ 
            url, 
            category: 'GENERAL',
            aiScore: 0.9,
            aiAnalysis: { quality: "HIGH", containsWatermark: false }
          })) : []
        },
        roomTypes: {
          create: [
            {
              code: "STD",
              name: "Standard Room",
              description: "A comfortable deluxe room with premium bedding.",
              maxOccupancy: 2,
              baseOccupancy: 2,
              totalInventory: Math.floor(hotel.roomsAvailable * 0.6) || 10,
              amenities: hotel.amenities.slice(0, 3)
            },
            {
              code: "PRM",
              name: "Premium Suite",
              description: "Spacious suite with city views and separate living area.",
              maxOccupancy: 3,
              baseOccupancy: 2,
              totalInventory: Math.floor(hotel.roomsAvailable * 0.4) || 5,
              amenities: hotel.amenities
            }
          ]
        }
      },
      include: { roomTypes: true }
    });

    // Create a RatePlan for each RoomType
    for (const rt of createdHotel.roomTypes) {
      const isPremium = rt.code === 'PRM';
      const basePrice = isPremium ? hotel.price * 1.5 : hotel.price;
      
      const _ratePlan = await prisma.ratePlan.create({
        data: {
          name: "Standard Rate",
          mealPlan: "NONE",
          cancellationPolicy: "Free cancellation before 24 hrs",
          basePrice: basePrice,
          roomTypeId: rt.id
        }
      });

      // Create Inventory for the next 7 days
      const inventoryData = [];
      for (let i = 0; i < 7; i++) {
        const date = new Date();
        date.setDate(date.getDate() + i);
        date.setHours(0, 0, 0, 0);
        inventoryData.push({
          date: date,
          totalRooms: rt.totalInventory,
          availableRooms: rt.totalInventory,
          bookedRooms: 0,
          roomTypeId: rt.id
        });
      }
      await prisma.inventory.createMany({ data: inventoryData });
    }
    console.log(`Created hotel with id: ${createdHotel.id} and its rate plans/inventory`);
  }
  
  console.log('Seeding finished.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
