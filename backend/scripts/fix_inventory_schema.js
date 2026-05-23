import prisma from '../config/db.js';

async function fix() {
  console.log('🚀 Fixing Inventory table schema...');
  try {
    // 1. Add ratePlanId column
    await prisma.$executeRawUnsafe(`ALTER TABLE "Inventory" ADD COLUMN IF NOT EXISTS "ratePlanId" TEXT`);
    console.log('✅ Column ratePlanId added.');

    // 2. Link existing inventories to their RoomType's first RatePlan
    // This prevents foreign key violations when we add the constraint
    await prisma.$executeRawUnsafe(`
      UPDATE "Inventory" i
      SET "ratePlanId" = (
        SELECT id FROM "RatePlan" rp 
        WHERE rp."roomTypeId" = i."roomTypeId" 
        LIMIT 1
      )
      WHERE i."ratePlanId" IS NULL
    `);
    console.log('✅ Existing records linked to rate plans.');

    // 3. Delete any orphaned inventory records (where no rate plan found)
    const deleted = await prisma.$executeRawUnsafe(`DELETE FROM "Inventory" WHERE "ratePlanId" IS NULL`);
    console.log(`✅ Deleted ${deleted} orphaned inventory records.`);

    // 4. Set NOT NULL and add Foreign Key
    await prisma.$executeRawUnsafe(`ALTER TABLE "Inventory" ALTER COLUMN "ratePlanId" SET NOT NULL`);
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "Inventory" 
      DROP CONSTRAINT IF EXISTS "Inventory_roomTypeId_date_key",
      ADD CONSTRAINT "Inventory_roomTypeId_ratePlanId_date_unique" UNIQUE ("roomTypeId", "ratePlanId", "date")
    `);
    console.log('✅ Unique constraints updated.');

  } catch (err) {
    console.error('❌ Fix failed:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}

fix();
