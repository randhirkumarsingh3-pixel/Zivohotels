import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const hotels = await prisma.hotel.findMany({
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: { id: true, name: true, status: true, ownerId: true }
  });
  console.log(JSON.stringify(hotels, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
