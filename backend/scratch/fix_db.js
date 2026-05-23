import prisma from '../config/db.js';

async function fixDb() {
  console.log('--- ATTEMPTING TO DROP INVENTORY CONSTRAINT MANUALLY ---');
  try {
    // This targets the exact constraint name reported in your error log
    await prisma.$executeRawUnsafe(`ALTER TABLE "Inventory" DROP CONSTRAINT IF EXISTS "Inventory_roomTypeId_ratePlanId_date_key";`);
    console.log('✅ Constraint "Inventory_roomTypeId_ratePlanId_date_key" dropped successfully.');
    
    // Also drop the index if it exists separately
    await prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS "Inventory_roomTypeId_ratePlanId_date_key";`);
    console.log('✅ Index "Inventory_roomTypeId_ratePlanId_date_key" dropped successfully.');

    console.log('\nNow try running: npx prisma db push --accept-data-loss');
  } catch (err) {
    console.error('❌ Failed to drop constraint:', err.message);
    console.log('Try dropping the entire table if this persists:');
    console.log('await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "Inventory" CASCADE;`);');
  } finally {
    await prisma.$disconnect();
  }
}

fixDb();
