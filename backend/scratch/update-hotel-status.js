import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function run() {
  try {
    const result = await prisma.hotel.updateMany({
      where: { status: 'LIVE' },
      data: { status: 'ACTIVE' }
    });
    console.log(`Successfully updated status from LIVE to ACTIVE for ${result.count} hotels.`);
    process.exit(0);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

run();
