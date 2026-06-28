import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function run() {
  const hotel = await prisma.hotel.findFirst({
    include: { owner: true }
  });

  if (!hotel) {
    console.log("No hotel found to test.");
    process.exit(0);
  }

  console.log("Found hotel:", hotel.id);
  console.log("Completeness Score:", hotel.complianceScore);
  console.log("Readiness Breakdown:", hotel.readinessBreakdown);

  const audits = await prisma.auditLog.findMany({
    where: { entityId: hotel.id },
    orderBy: { createdAt: 'desc' },
    take: 5
  });

  console.log("\nRecent Audit Logs:");
  audits.forEach(a => console.log(a.action, JSON.stringify(a.details)));

  console.log("\nOptimistic Concurrency - lastUpdatedAt:");
  console.log(hotel.updatedAt);
  
  process.exit(0);
}

run().catch(console.error);
