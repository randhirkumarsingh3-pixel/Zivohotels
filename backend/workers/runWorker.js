import { startIntegrityWorker } from './integrityWorker.js';
import { startPricingWorker } from './pricingWorker.js';
import { startInventoryWorker } from './inventoryWorker.js';
import { startCleanupWorker } from './cleanupWorker.js';
import { startEmailWorker } from './emailWorker.js';
import { startNotificationWorker } from './notificationWorker.js';
import { startAnalyticsWorker } from './analyticsWorker.js';
import { startReportWorker } from './reportWorker.js';

// Legacy / Unchanged (for now, unless user specifies)
import { startExperimentWorker } from './experimentWorker.js';
import { startPricingTrainer } from './pricingTrainer.js';
import { startFinanceWorker } from './financeWorker.js';

const workers = {
  integrity: startIntegrityWorker,
  pricing: startPricingWorker,
  inventory: startInventoryWorker,
  cleanup: startCleanupWorker,
  email: startEmailWorker,
  notification: startNotificationWorker,
  analytics: startAnalyticsWorker,
  report: startReportWorker,
  
  // Legacy
  experiment: startExperimentWorker,
  'pricing-trainer': startPricingTrainer,
  finance: startFinanceWorker,
};

const workerName = process.argv[2];

if (!workerName || !workers[workerName]) {
  console.error(`Please provide a valid worker name. Available workers: ${Object.keys(workers).join(', ')}`);
  process.exit(1);
}

console.log(`Starting ${workerName} worker orchestration...`);
workers[workerName]();

// The graceful shutdown is handled inside each worker file now via process.on('SIGTERM').
// But we can also add a global fallback log here.
process.on('SIGINT', () => {
  console.log(`\nStopping ${workerName} orchestration...`);
  // Will let the individual worker's SIGINT handler do the DB cleanup and exit
});
