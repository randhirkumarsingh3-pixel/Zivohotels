import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function setupTrgm() {
  console.log('🚀 Setting up PostgreSQL pg_trgm extension and GIN indexes...');
  
  try {
    // 1. Create the extension if it doesn't exist
    await prisma.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS pg_trgm;`);
    console.log('✅ Extension pg_trgm created or verified.');

    // 2. Fast "contains" matching for place search (city, name, address, landmark, area). Made once:
    // every later deploy finds them and moves on (they used to be dropped and rebuilt on every
    // deploy, which locks the hotel table while it runs).
    const indexes = {
      idx_hotel_name_trgm: 'name',
      idx_hotel_city_trgm: 'city',
      idx_hotel_location_trgm: 'location',
      idx_hotel_landmark_trgm: 'landmark',
      idx_hotel_area_trgm: `("integrationSettings"->'addressDetails'->>'area')`,
    };
    for (const [name, expr] of Object.entries(indexes)) {
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS ${name} ON "Hotel" USING gin (${expr} gin_trgm_ops);`);
      console.log(`✅ Index ${name} ready.`);
    }

    console.log('🎉 Trigram setup complete!');
  } catch (err) {
    console.error('❌ Failed to setup trigram extensions/indexes:', err);
  } finally {
    await prisma.$disconnect();
  }
}

setupTrgm();
