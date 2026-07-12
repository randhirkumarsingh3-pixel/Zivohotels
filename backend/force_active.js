import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function forceActive() {
  const hotel = await prisma.hotel.findFirst({
    where: { name: 'Lotus Park' }
  });

  if (!hotel) {
    console.log("Hotel not found");
    return;
  }

  await prisma.hotel.update({
    where: { id: hotel.id },
    data: { status: 'ACTIVE' }
  });

  console.log(`Successfully updated ${hotel.name} to ACTIVE status.`);
}

forceActive().catch(console.error).finally(() => prisma.$disconnect());
