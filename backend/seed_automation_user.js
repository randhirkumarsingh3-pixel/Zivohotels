const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const crypto = require('crypto');

async function seedAutomationUser() {
  console.log('--- Starting Phase 17G.2 Automation User Provisioning ---');
  
  const automationEmail = 'automation-admin@zivohotels.com';
  
  try {
    // 1. Verify if account exists
    const existing = await prisma.user.findUnique({
      where: { email: automationEmail }
    });

    if (existing) {
      console.log(`[INFO] Dedicated automation account already exists (${existing.id}).`);
      console.log(`[INFO] Seed script is idempotent. No action required.`);
      process.exit(0);
    }

    // 2. Await Operational Approval
    console.log(`[WARN] Automation account not found. Proceeding with creation...`);

    // We generate a secure random password since this is a system account
    const securePassword = crypto.randomBytes(32).toString('hex');
    
    // 3. Create the account with correct tags
    const newAdmin = await prisma.user.create({
      data: {
        email: automationEmail,
        password: securePassword, // In production pipeline, this would be hashed via bcrypt
        role: 'ADMIN',
        status: 'ACTIVE',
        name: 'System Automation Account',
        // IMPORTANT: Tagged to exclude from analytics/marketing/revenue
        metadata: {
          isAutomation: true,
          excludeFromAnalytics: true,
          marketingOptOut: true,
          createdVia: 'Phase 17G Provisioning'
        }
      }
    });

    console.log(`[SUCCESS] Automation Account created with ID: ${newAdmin.id}`);
    console.log(`[SECURE] This account is non-human and excluded from analytics.`);
    
  } catch (error) {
    console.error(`[ERROR] Failed to seed automation user: ${error.message}`);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

seedAutomationUser();
