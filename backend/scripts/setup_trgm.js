import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function setupTrgm() {
  console.log('🚀 Setting up PostgreSQL pg_trgm extension and GIN indexes...');
  
  try {
    // 1. Create the extension if it doesn't exist
    await prisma.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS pg_trgm;`);
    console.log('✅ Extension pg_trgm created or verified.');

    // 2. Drop existing indexes if we need to recreate them (optional, but safe)
    await prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS idx_hotel_name_trgm;`);
    await prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS idx_hotel_city_trgm;`);
    await prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS idx_hotel_location_trgm;`);

    // 3. Create the GIN indexes
    await prisma.$executeRawUnsafe(`CREATE INDEX idx_hotel_name_trgm ON "Hotel" USING gin (name gin_trgm_ops);`);
    console.log('✅ Index idx_hotel_name_trgm created.');

    await prisma.$executeRawUnsafe(`CREATE INDEX idx_hotel_city_trgm ON "Hotel" USING gin (city gin_trgm_ops);`);
    console.log('✅ Index idx_hotel_city_trgm created.');

    await prisma.$executeRawUnsafe(`CREATE INDEX idx_hotel_location_trgm ON "Hotel" USING gin (location gin_trgm_ops);`);
    console.log('✅ Index idx_hotel_location_trgm created.');

    console.log('🎉 Trigram setup complete!');
  } catch (err) {
    console.error('❌ Failed to setup trigram extensions/indexes:', err);
  } finally {
    await prisma.$disconnect();
  }
}

setupTrgm();
