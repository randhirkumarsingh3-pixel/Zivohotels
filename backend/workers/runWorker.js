import { startIntegrityWorker } from './integrityWorker.js';
import { startExperimentWorker } from './experimentWorker.js';
import { startPricingWorker } from './pricingWorker.js';
import { startPricingTrainer } from './pricingTrainer.js';
import { startFinanceWorker } from './financeWorker.js';
import { startMarketplaceBalancer } from './marketplaceBalancer.js';
import { startOtpCleanupWorker } from './otpCleanupWorker.js';

const workers = {
  integrity: startIntegrityWorker,
  experiment: startExperimentWorker,
  pricing: startPricingWorker,
  'pricing-trainer': startPricingTrainer,
  finance: startFinanceWorker,
  inventory: startMarketplaceBalancer,
  cleanup: startOtpCleanupWorker,
};

const workerName = process.argv[2];

if (!workerName || !workers[workerName]) {
  console.error(`Please provide a valid worker name. Available workers: ${Object.keys(workers).join(', ')}`);
  process.exit(1);
}

console.log(`Starting ${workerName} worker...`);
workers[workerName]();

// Keep process alive
process.on('SIGINT', () => {
  console.log(`\nStopping ${workerName} worker...`);
  process.exit(0);
});
