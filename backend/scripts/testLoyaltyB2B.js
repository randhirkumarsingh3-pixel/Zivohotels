import { loyaltyService } from '../services/finance/loyaltyService.js';
import { agentService } from '../services/finance/agentService.js';
import prisma from '../config/db.js';
import { Prisma } from '@prisma/client';

async function testStrategicExpansion() {
  console.log('--- Testing Phase 8.7 Loyalty & B2B Expansion ---');

  // 1. Test B2B Agent
  const agent = await prisma.agent.upsert({
    where: { email: 'test@agent.com' },
    update: {},
    create: { name: 'Test Agent', email: 'test@agent.com', creditLimit: new Prisma.Decimal(50000) }
  });
  
  await agentService.authorizeBooking(agent.id, 5000);
  await agentService.utilizeCredit(agent.id, 5000);
  const updatedAgent = await prisma.agent.findUnique({ where: { id: agent.id } });
  console.log('✅ Agent Credit Utilized:', updatedAgent.usedCredit.toString());

  // 2. Test Loyalty Award
  const userId = 'test-user-loyalty';
  const points = loyaltyService.calculateEarnedPoints(10000); // Should earn 100 pts
  await loyaltyService.awardPoints(userId, points);
  console.log('✅ Loyalty Points Awarded:', points);

  // 3. Test Loyalty Redemption
  await loyaltyService.redeemPoints(userId, 100); // 100 pts -> 10 INR
  const userPoints = await prisma.loyaltyPoint.aggregate({ where: { userId }, _sum: { points: true } });
  console.log('✅ Loyalty Balance after Redemption:', userPoints._sum.points);

  console.log('--- Test Complete ---');
  process.exit(0);
}

testStrategicExpansion().catch(err => {
  console.error(err);
  process.exit(1);
});
