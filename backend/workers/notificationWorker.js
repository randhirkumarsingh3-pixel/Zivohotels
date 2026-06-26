import { queueService } from '../services/queueService.js';
import os from 'os';

const workerId = `notification-worker-${os.hostname()}-${process.pid}`;
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
    const { userId, title, message, type } = job.payload;
    
    // In a real implementation, you would emit this to Socket.IO using an external adapter/emitter 
    // or send an SMS using Twilio.
    console.log(`[${workerId}] Emitting notification to User ${userId}: ${title}`);
    
    // Simulate async work
    await new Promise(r => setTimeout(r, 100));

    // Mark complete
    await queueService.complete(job.id);
  } catch (err) {
    console.error(`[${workerId}] Job ${job.id} failed:`, err.message);
    await queueService.failWithRetry(job.id, err.message);
  }
};

export const startNotificationWorker = async () => {
  console.log(`[${workerId}] Started polling for 'notification' queue...`);
  
  while (isRunning) {
    try {
      const job = await queueService.fetchAndLock('notification', workerId);
      
      if (job) {
        await processJob(job);
      } else {
        await new Promise(res => setTimeout(res, 2000));
      }
    } catch (err) {
      console.error(`[${workerId}] Polling error:`, err.message);
      await new Promise(res => setTimeout(res, 5000));
    }
  }
};

if (process.argv[1] && process.argv[1].endsWith('notificationWorker.js')) {
  startNotificationWorker();
}
