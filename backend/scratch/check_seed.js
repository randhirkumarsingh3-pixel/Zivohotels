import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function check() {
  try {
    const count = await prisma.taxRule.count();
    const rules = await prisma.taxRule.findMany();
    console.log(`Found ${count} tax rules.`);
    console.log(JSON.stringify(rules, null, 2));
  } catch (err) {
    console.error('Check failed:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}

check();
