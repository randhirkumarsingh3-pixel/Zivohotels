import cron from 'node-cron';
import payoutQueueService from '../services/finance/payoutQueueService.js';
import ledgerService from '../services/finance/ledgerService.js';
import autoThrottleService from '../services/finance/autoThrottleService.js';

/**
 * Finance Worker
 * 
 * Responsibilities:
 * 1. Process pending payouts in the queue.
 * 2. Perform periodic global balance checks.
 * 3. Log financial alerts for discrepancies.
 */
export const startFinanceWorker = () => {
  console.log('--- Starting Finance Worker (Automation Layer) ---');

  // 1. Process Payout Queue every 5 minutes
  cron.schedule('*/5 * * * *', async () => {
    console.log('[FinanceWorker] Processing Payout Queue...');
    await payoutQueueService.processBatch();
  });

  // 1.5. Monitor Anomalies every 15 minutes
  cron.schedule('*/15 * * * *', async () => {
    console.log('[FinanceWorker] Monitoring System Anomalies...');
    await autoThrottleService.monitorAnomalies();
  });

  // 2. Perform Integrity Check every hour
  cron.schedule('0 * * * *', async () => {
    console.log('[FinanceWorker] Running Global Ledger Integrity Check...');
    const health = await ledgerService.validateGlobalBalance();
    if (!health.isValid) {
      console.error('🚨 [CRITICAL] Ledger Imbalance Detected:', health.variance);
      // In production, fire Slack/Email alert
    } else {
      console.log('✅ Ledger is balanced.');
    }
  });
};

export default startFinanceWorker;
