import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const hotel = await prisma.hotel.findFirst({
    orderBy: { createdAt: 'desc' }
  });
  console.log(JSON.stringify(hotel, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
