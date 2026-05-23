import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function debug() {
  const hotelId = 'fee16e9f-510c-4651-aa28-44b27c1c8b71';
  console.log(`Debugging rooms for hotel: ${hotelId}`);
  
  try {
    const rooms = await prisma.roomType.findMany({
      where: { hotelId },
      include: { ratePlans: true }
    });
    console.log(`Success! Found ${rooms.length} rooms.`);
    console.log('Sample room:', JSON.stringify(rooms[0], null, 2));
  } catch (err) {
    console.error('DIAGNOSTIC FAILURE:', err.message);
    if (err.stack) console.error(err.stack);
  } finally {
    await prisma.$disconnect();
  }
}

debug();
