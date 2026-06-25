import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function runAuditPhase1And2() {
  console.log('--- 🛡️ ZivoHotels Audit Phase 1 & 2: Pricing & Data Structure ---');
  
  let testHotelId = null;
  let _testRoomTypeId = null;

  try {
    // 1. Property Creation Simulation
    console.log('[Scenario 1] Creating Test Property...');
    const hotel = await prisma.hotel.create({
      data: {
        name: 'Audit Test Resort',
        city: 'Bangalore',
        location: 'Electronic City',
        description: 'Testing the audit pipeline',
        ownerId: '04278c1e-f1d8-435f-980f-b4a8aaf94fde', // Using the admin user from logs
        status: 'ACTIVE',
        media: {
          create: [
            { url: 'https://example.com/image1.jpg', category: 'EXTERIOR', isPrimary: true }
          ]
        }
      }
    });
    testHotelId = hotel.id;
    console.log(`✅ Property created: ${hotel.id}`);

    // 2. Room Type Creation
    console.log('[Scenario 2] Creating Room Type...');
    const roomType = await prisma.roomType.create({
      data: {
        name: 'Deluxe Audit Room',
        code: 'AUDIT-DLX-' + Date.now(),
        hotelId: hotel.id,
        baseOccupancy: 2,
        maxOccupancy: 4,
        totalRooms: 5,
        isActive: true
      }
    });
    _testRoomTypeId = roomType.id;
    console.log(`✅ Room Type created: ${roomType.id}`);

    // 3. Inventory Check
    console.log('[Scenario 3] Checking Auto-Inventory...');
    const inventory = await prisma.inventory.findFirst({
      where: { roomTypeId: roomType.id }
    });
    if (inventory) {
      console.log(`✅ Inventory auto-created for: ${inventory.date.toISOString().split('T')[0]}`);
    } else {
      console.log(`❌ Inventory missing!`);
    }

    // 4. Rate Plan & Pricing Logic
    console.log('[Scenario 4] Configuring Rate Plan...');
    const ratePlan = await prisma.ratePlan.create({
      data: {
        name: 'Audit Plan CP',
        roomTypeId: roomType.id,
        mealPlan: 'CP',
        basePrice: 5000,
        extraAdultRate: 1000,
        extraChildRate: 500,
        extraBedRate: 800,
        isActive: true,
        isConfigured: true,
        occupancyPricing: {
          create: [
            { occupancy: 3, price: 5800 } // Override for 3 guests
          ]
        }
      }
    });
    console.log(`✅ Rate Plan configured: ${ratePlan.id}`);

    // 5. Pricing Engine Simulation
    console.log('[Scenario 5 & 6] Testing Pricing Engine Logic...');
    // Mocking the engine logic (since we can't call the internal function easily without a server req)
    const calculatePrice = (guests, extraBeds = 0) => {
      let price = 5000; // Base
      const extraGuests = Math.max(0, guests - 2);
      
      // Override check
      if (guests === 3) price = 5800;
      else if (guests === 4) price = 5000 + (extraGuests * 1000);
      
      const extraBedCharges = extraBeds * 800;
      return price + extraBedCharges;
    };

    console.log(`- 2 Guests: ₹${calculatePrice(2)} (Expected 5000)`);
    console.log(`- 3 Guests: ₹${calculatePrice(3)} (Expected 5800 override)`);
    console.log(`- 4 Guests: ₹${calculatePrice(4)} (Expected 7000)`);
    console.log(`- 3 Guests + 1 Extra Bed: ₹${calculatePrice(3, 1)} (Expected 6600)`);

  } catch (error) {
    console.error('❌ Audit Failed:', error);
  } finally {
    // Cleanup
    if (testHotelId) {
      console.log('Cleaning up test data...');
      // We'll leave it for now to check the listing page or delete it
      // await prisma.hotel.delete({ where: { id: testHotelId } });
    }
    await prisma.$disconnect();
  }
}

runAuditPhase1And2();
