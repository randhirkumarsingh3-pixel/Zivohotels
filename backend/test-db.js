import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function test() {
  try {
    const count = await prisma.user.count();
    console.log(`Connection successful! User count: ${count}`);
    process.exit(0);
  } catch (error) {
    console.error('Connection failed:', error);
    process.exit(1);
  }
}

test();
