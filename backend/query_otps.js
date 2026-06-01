import prisma from './config/db.js';

async function query() {
  const otps = await prisma.emailOTP.findMany({
    orderBy: { createdAt: 'desc' },
    take: 10
  });
  console.log(JSON.stringify(otps, null, 2));
}
query();
