import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function run() {
  const images = await prisma.hotelImage.findMany({
    take: 5
  });
  console.log("HotelImages:", JSON.stringify(images, null, 2));
  
  // also check hotel.media for the specific hotel
  const hotel = await prisma.hotel.findUnique({
    where: { id: "8f266dba-a5ea-44e2-a7a2-92fa4acfec05" }
  });
  console.log("Hotel media (JSON format?):", JSON.stringify(hotel.media, null, 2));

  process.exit(0);
}
run();
