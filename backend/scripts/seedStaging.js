import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.NEW_DATABASE_URL } }
});

async function seed() {
  console.log('--- Seeding Staging Database for BAT (Sprint 5C) ---');

  if (!process.env.NEW_DATABASE_URL) {
    console.error('Error: NEW_DATABASE_URL must be provided.');
    process.exit(1);
  }

  try {
    // 1. Get the single Hotel that migrated over
    const hotel = await prisma.hotel.findFirst();
    if (!hotel) {
      console.error('❌ No Hotel found in the migrated staging database.');
      process.exit(1);
    }
    console.log(`✅ Found Hotel: ${hotel.name}`);

    // 2. Create a RoomType for testing
    const roomType = await prisma.roomType.create({
      data: {
        hotelId: hotel.id,
        name: 'Deluxe Suite (Staging Test)',
        description: 'A luxurious suite created specifically for Business Acceptance Testing.',
        maxOccupancy: 2,
        baseOccupancy: 2,
        totalInventory: 5,
        amenities: ['WiFi', 'AC', 'Breakfast', 'Pool Access'],
        isActive: true
      }
    });
    console.log(`✅ Seeded RoomType: ${roomType.name} (ID: ${roomType.id})`);

    // 3. Create a RatePlan for the RoomType
    const ratePlan = await prisma.ratePlan.create({
      data: {
        name: 'Standard Rate (BAT)',
        basePrice: 5000,
        roomTypeId: roomType.id,
        isActive: true,
        isConfigured: true
      }
    });
    console.log(`✅ Seeded RatePlan: ${ratePlan.name}`);

    // 4. Create Inventory for the next 7 days
    const today = new Date();
    for (let i = 0; i < 7; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);
      
      await prisma.inventory.create({
        data: {
          roomTypeId: roomType.id,
          date: date,
          totalRooms: 5,
          availableRooms: 5
        }
      });
    }
    console.log(`✅ Seeded 7 days of Inventory availability for testing.`);

    console.log('\n🟢 SEEDING COMPLETE. You can now execute the E2E BAT flows.');

  } catch (error) {
    console.error('❌ Seeding failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

seed();
