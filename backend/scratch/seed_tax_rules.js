import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding TaxRules...');

  // Delete existing TaxRules
  await prisma.taxRule.deleteMany();

  // Standard Slab (<= 7500)
  await prisma.taxRule.create({
    data: {
      name: 'GST 5%',
      minThreshold: 0,
      maxThreshold: 7500,
      percentage: 5,
      isActive: true,
      effectiveFrom: new Date('2024-01-01'),
    }
  });

  // Premium Slab (> 7500)
  await prisma.taxRule.create({
    data: {
      name: 'GST 18%',
      minThreshold: 7500,
      maxThreshold: null,
      percentage: 18,
      isActive: true,
      effectiveFrom: new Date('2024-01-01'),
    }
  });

  console.log('TaxRules seeded successfully.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
