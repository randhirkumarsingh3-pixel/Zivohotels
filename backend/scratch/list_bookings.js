import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const bookings = await prisma.booking.findMany({
    include: {
      user: { select: { id: true, email: true, name: true, role: true } },
      hotel: { select: { id: true, name: true } }
    }
  });
  console.log('Bookings in Database:', JSON.stringify(bookings, null, 2));

  const users = await prisma.user.findMany({
    select: { id: true, email: true, role: true, name: true }
  });
  console.log('All Users:', JSON.stringify(users, null, 2));
  
  process.exit(0);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
