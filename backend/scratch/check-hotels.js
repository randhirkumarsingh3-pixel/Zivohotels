import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function check() {
  try {
    const hotels = await prisma.hotel.findMany({
      include: {
        media: true,
        roomTypes: {
          include: {
            ratePlans: true,
            inventories: true
          }
        }
      }
    });

    console.log(`Found ${hotels.length} hotels:`);
    hotels.forEach(h => {
      console.log(`\n========================================`);
      console.log(`Hotel: ${h.name} (${h.id})`);
      console.log(`Status: ${h.status}`);
      console.log(`isDeleted: ${h.isDeleted}`);
      console.log(`City: ${h.city}`);
      console.log(`Media Count: ${h.media.length}`);
      console.log(`Room Types Count: ${h.roomTypes.length}`);
      h.roomTypes.forEach(rt => {
        console.log(`  - Room Type: ${rt.name} (${rt.id})`);
        console.log(`    Active: ${rt.isActive}`);
        console.log(`    Rate Plans Count: ${rt.ratePlans.length}`);
        rt.ratePlans.forEach(rp => {
          console.log(`      * Rate Plan: ${rp.name} (Price: ${rp.basePrice}, Active: ${rp.isActive})`);
        });
        console.log(`    Inventory Count: ${rt.inventories.length}`);
        if (rt.inventories.length > 0) {
          console.log(`      * Available: ${rt.inventories[0].availableRooms} / ${rt.inventories[0].totalRooms} (Date: ${rt.inventories[0].date})`);
        }
      });
    });
    process.exit(0);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

check();
