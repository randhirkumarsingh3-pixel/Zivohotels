import { dashboardService } from '../services/finance/dashboardService.js';
import { walletService } from '../services/finance/walletService.js';
import { fraudService } from '../services/finance/fraudService.js';

async function testOperatingSystem() {
  console.log('--- Testing Phase 8.6 Operating System Layer ---');

  // 1. Test Dashboard
  const metrics = await dashboardService.getMetrics();
  console.log('✅ Dashboard Metrics Aggregated:', metrics.ledgerHealth);

  // 2. Test Wallet
  const userId = 'test-user-' + Date.now();
  const wallet = await walletService.getOrCreateWallet(userId, 'USER');
  await walletService.adjustBalance(wallet.id, 'CREDIT', 1000, 'TEST_DEPOSIT');
  const updatedWallet = await walletService.adjustBalance(wallet.id, 'DEBIT', 200, 'TEST_PURCHASE');
  console.log('✅ Wallet Balance Adjusted:', updatedWallet.balance.toString());

  // 3. Test Fraud
  const risk = await fraudService.evaluateRisk(userId, {});
  console.log('✅ Fraud Risk Evaluated:', risk.riskScore);

  console.log('--- Test Complete ---');
  process.exit(0);
}

testOperatingSystem().catch(err => {
  console.error(err);
  process.exit(1);
});
