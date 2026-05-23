import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  console.log('Seeding initial experiments...');

  await prisma.experiment.upsert({
    where: { name: 'badge_urgency' },
    update: {
      status: 'ACTIVE',
      variants: [
        { name: 'control', weight: 50 },
        { name: 'variantA', weight: 50 }
      ]
    },
    create: {
      name: 'badge_urgency',
      status: 'ACTIVE',
      variants: [
        { name: 'control', weight: 50 },
        { name: 'variantA', weight: 50 }
      ]
    }
  });

  console.log('Experiments seeded successfully.');
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
