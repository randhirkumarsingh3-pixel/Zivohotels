import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function check() {
  try {
    const hotelsCount = await prisma.hotel.count();
    const roomsCount = await prisma.roomType.count();
    const usersCount = await prisma.user.count();
    
    console.log(`Hotels: ${hotelsCount}`);
    console.log(`Rooms: ${roomsCount}`);
    console.log(`Users: ${usersCount}`);
    
    const hotels = await prisma.hotel.findMany({ take: 5, select: { id: true, name: true, status: true } });
    console.log('Sample Hotels:', JSON.stringify(hotels, null, 2));
    
  } catch (err) {
    console.error('Check failed:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}

check();
