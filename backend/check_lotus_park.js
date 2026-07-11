import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function checkProperty() {
  const hotel = await prisma.hotel.findFirst({
    where: { name: 'Lotus Park' },
    include: {
      media: true,
    }
  });

  if (!hotel) {
    console.log("Hotel not found");
    return;
  }

  console.log("Property ID:", hotel.id);
  console.log("Compliance Score:", hotel.complianceScore);
  console.log("GSTIN:", hotel.gstin);
  console.log("PAN:", hotel.pan);
  
  const intSettings = hotel.integrationSettings || {};
  const comm = intSettings.commercials || {};
  console.log("Bank Details in integrationSettings:", !!comm.bankAccount);
  
  console.log("Status:", hotel.status);
  
  if (hotel.media && hotel.media.length > 0) {
    console.log("Media URLs:", hotel.media.map(m => m.url));
  } else {
    console.log("No media");
  }
}

checkProperty().catch(console.error).finally(() => prisma.$disconnect());
