import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function verifyFiscalLogic() {
  console.log('--- Fiscal Engine Verification ---');

  const testCases = [
    { name: 'Boundary ₹7500 (5%)', tariff: 7500, expectedRate: 5 },
    { name: 'Boundary ₹7500.01 (18%)', tariff: 7500.01, expectedRate: 18 },
    { name: 'Standard Budget ₹3000 (5%)', tariff: 3000, expectedRate: 5 },
    { name: 'Premium Luxury ₹12000 (18%)', tariff: 12000, expectedRate: 18 }
  ];

  for (const tc of testCases) {
    const taxRule = await prisma.taxRule.findFirst({
      where: {
        isActive: true,
        effectiveFrom: { lte: new Date() },
        minThreshold: { lte: tc.tariff },
        OR: [
          { maxThreshold: null },
          { maxThreshold: { gte: tc.tariff } }
        ]
      },
      orderBy: { effectiveFrom: 'desc' }
    });

    if (!taxRule) {
      console.log(`❌ ${tc.name}: No rule found`);
      continue;
    }

    if (taxRule.percentage === tc.expectedRate) {
      console.log(`✅ ${tc.name}: Matched ${taxRule.percentage}%`);
    } else {
      console.log(`❌ ${tc.name}: Expected ${tc.expectedRate}%, got ${taxRule.percentage}%`);
    }
  }

  await prisma.$disconnect();
}

verifyFiscalLogic();
