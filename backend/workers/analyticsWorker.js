import { queueService } from '../services/queueService.js';
import prisma from '../config/db.js';
import os from 'os';

const workerId = `analytics-worker-${os.hostname()}-${process.pid}`;
let isRunning = true;

const shutdown = async () => {
  console.log(`\n[${workerId}] Received termination signal. Shutting down gracefully...`);
  isRunning = false;
  await queueService.unlockJobsForWorker(workerId);
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

const processJob = async (job) => {
  console.log(`[${workerId}] Processing job: ${job.id} | Type: ${job.jobType}`);
  
  try {
    // In a real implementation, you would aggregate events here
    console.log(`[${workerId}] Aggregating analytics batch...`);
    
    // Simulate aggregation
    await new Promise(r => setTimeout(r, 2000));

    // Enqueue the next batch for 5 minutes from now
    await queueService.enqueue('analytics', 'AGGREGATE_BATCH', {}, { runAt: new Date(Date.now() + 5 * 60 * 1000) });

    // Mark complete
    await queueService.complete(job.id);
  } catch (err) {
    console.error(`[${workerId}] Job ${job.id} failed:`, err.message);
    await queueService.failWithRetry(job.id, err.message);
  }
};

export const startAnalyticsWorker = async () => {
  console.log(`[${workerId}] Started polling for 'analytics' queue...`);
  
  while (isRunning) {
    try {
      const job = await queueService.fetchAndLock('analytics', workerId);
      
      if (job) {
        await processJob(job);
      } else {
        await new Promise(res => setTimeout(res, 60000)); // Sleep for 1 min if no jobs
      }
    } catch (err) {
      console.error(`[${workerId}] Polling error:`, err.message);
      await new Promise(res => setTimeout(res, 5000));
    }
  }
};

if (process.argv[1] && process.argv[1].endsWith('analyticsWorker.js')) {
  startAnalyticsWorker();
}
