import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({
    select: { id: true, email: true, role: true, name: true }
  });
  console.log('Users in Database:', JSON.stringify(users, null, 2));
  process.exit(0);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
