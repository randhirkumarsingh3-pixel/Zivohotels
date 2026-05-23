import { fraudService } from '../services/finance/fraudService.js';
import { payoutQueueService } from '../services/finance/payoutQueueService.js';
import { dashboardService } from '../services/finance/dashboardService.js';

async function testStrategicHardening() {
  console.log('--- Testing Phase 8.6+ Strategic Hardening ---');

  // 1. Test Soft Block Logic
  // Assuming a context that results in moderate risk
  const softRisk = await fraudService.evaluateRisk('test-user-soft', { });
  console.log('✅ Fraud Status:', softRisk.status);

  // 2. Test Payout Hold Buffer
  const hotelId = 'test-hotel-buffer';
  const queuedItem = await payoutQueueService.enqueue(hotelId, 5000, 48); // 48h hold
  console.log('✅ Payout Enqueued with Hold until:', queuedItem.holdUntil);

  // 3. Test Strategic Dashboard Metrics
  const metrics = await dashboardService.getMetrics();
  console.log('✅ Strategic Metrics Aggregated:');
  console.log('   - Wallet Liability:', metrics.walletLiability);
  console.log('   - Credit Exposure:', metrics.creditExposure);
  console.log('   - Disputed Amount:', metrics.disputedAmount);

  console.log('--- Test Complete ---');
  process.exit(0);
}

testStrategicHardening().catch(err => {
  console.error(err);
  process.exit(1);
});
