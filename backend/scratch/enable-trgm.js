import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function run() {
  try {
    await prisma.$executeRawUnsafe('CREATE EXTENSION IF NOT EXISTS pg_trgm;');
    console.log('Successfully enabled pg_trgm extension.');
    process.exit(0);
  } catch (error) {
    console.error('Failed to enable pg_trgm extension:', error);
    process.exit(1);
  }
}

run();
