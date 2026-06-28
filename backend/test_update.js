import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function check() {
  const payload = {
    receptionPhone: "9876543210",
    receptionEmail: "test@example.com",
    managerName: "Test Manager",
    managerPhone: "1111111111",
    managerEmail: "mgr@example.com",
    channelProvider: "SiteMinder",
  };
  
  // mimic backend controller
  let newSettings = { addressDetails: { address: 'Test' } };
  const _contactInfo = {
    receptionPhone: payload.receptionPhone,
    receptionEmail: payload.receptionEmail,
    managerName: payload.managerName,
    managerPhone: payload.managerPhone,
    managerEmail: payload.managerEmail,
  };
  newSettings.contactInfo = { ..._contactInfo };
  
  await prisma.hotel.update({
    where: { id: '8f266dba-a5ea-44e2-a7a2-92fa4acfec05' },
    data: {
      channelProvider: payload.channelProvider,
      integrationSettings: newSettings
    }
  });

  const hotel = await prisma.hotel.findUnique({ where: { id: '8f266dba-a5ea-44e2-a7a2-92fa4acfec05' }});
  console.log(JSON.stringify(hotel, null, 2));
  await prisma.$disconnect();
}
check();
