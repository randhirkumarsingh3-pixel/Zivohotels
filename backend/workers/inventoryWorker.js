import { queueService } from '../services/queueService.js';
import os from 'os';

const workerId = `inventory-worker-${os.hostname()}-${process.pid}`;
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
    const { hotelId, action, data } = job.payload;
    
    console.log(`[${workerId}] Syncing inventory for Hotel ${hotelId} (Action: ${action})`);
    
    // Simulate OTA API call
    await new Promise(r => setTimeout(r, 2000));

    // Mark complete
    await queueService.complete(job.id);
  } catch (err) {
    console.error(`[${workerId}] Job ${job.id} failed:`, err.message);
    await queueService.failWithRetry(job.id, err.message);
  }
};

export const startInventoryWorker = async () => {
  console.log(`[${workerId}] Started polling for 'inventory' queue...`);
  
  while (isRunning) {
    try {
      const job = await queueService.fetchAndLock('inventory', workerId);
      
      if (job) {
        await processJob(job);
      } else {
        await new Promise(res => setTimeout(res, 5000));
      }
    } catch (err) {
      console.error(`[${workerId}] Polling error:`, err.message);
      await new Promise(res => setTimeout(res, 5000));
    }
  }
};

if (process.argv[1] && process.argv[1].endsWith('inventoryWorker.js')) {
  startInventoryWorker();
}
