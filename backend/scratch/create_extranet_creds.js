import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  try {
    // 1. Find the most recently updated active hotel
    const hotel = await prisma.hotel.findFirst({
      where: { status: 'ACTIVE' },
      orderBy: { updatedAt: 'desc' },
      include: { owner: true }
    });

    if (!hotel) {
      console.log('No active hotel found.');
      // Fallback: search for any hotel
      const anyHotel = await prisma.hotel.findFirst({
        orderBy: { updatedAt: 'desc' },
        include: { owner: true }
      });
      if (!anyHotel) {
        console.error('No hotels found in database.');
        process.exit(1);
      }
      console.log(`Using non-active hotel: ${anyHotel.name} (${anyHotel.id})`);
      process.exit(0);
    }

    console.log(`Found active hotel: ${hotel.name} (${hotel.id})`);
    console.log(`Current owner: ${hotel.owner.email}`);

    // 2. Create a new extranet user for this property
    const extranetEmail = `extranet@${hotel.name.toLowerCase().replace(/\s+/g, '')}.com`;
    const password = 'ZivoExtranet@2026';
    const hashedPassword = await bcrypt.hash(password, 10);

    const extranetUser = await prisma.user.upsert({
      where: { email: extranetEmail },
      update: {
        password: hashedPassword,
        role: 'OWNER',
        status: 'ACTIVE'
      },
      create: {
        email: extranetEmail,
        name: `${hotel.name} Extranet Manager`,
        password: hashedPassword,
        role: 'OWNER',
        status: 'ACTIVE'
      }
    });

    // 3. Ensure the hotel is linked to this owner
    await prisma.hotel.update({
      where: { id: hotel.id },
      data: { ownerId: extranetUser.id }
    });

    console.log('--- EXTRANET CREDENTIALS ---');
    console.log(`Property: ${hotel.name}`);
    console.log(`Email: ${extranetEmail}`);
    console.log(`Password: ${password}`);
    console.log(`Role: OWNER`);
    console.log(`Dashboard URL: /extranet/dashboard`);
    console.log('---------------------------');

    process.exit(0);
  } catch (error) {
    console.error('Error creating extranet credential:', error);
    process.exit(1);
  }
}

main();
