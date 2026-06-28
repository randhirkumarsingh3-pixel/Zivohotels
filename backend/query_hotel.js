import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function run() {
  const hotel = await prisma.hotel.findUnique({
    where: { id: "8f266dba-a5ea-44e2-a7a2-92fa4acfec05" }
  });
  console.log(hotel);
  process.exit(0);
}
run();
