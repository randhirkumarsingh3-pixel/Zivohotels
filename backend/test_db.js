import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function test() {
  try {
    const count = await prisma.user.count();
    console.log('User count:', count);
    process.exit(0);
  } catch (e) {
    console.error('Prisma connection failed:', e);
    process.exit(1);
  }
}

test();
