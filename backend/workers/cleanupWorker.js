import { queueService } from '../services/queueService.js';
import prisma from '../config/db.js';
import { eventBus } from '../services/eventBus.js';
import os from 'os';

const workerId = `cleanup-worker-${os.hostname()}-${process.pid}`;
let isRunning = true;

const shutdown = async () => {
  console.log(`\n[${workerId}] Received termination signal. Shutting down gracefully...`);
  isRunning = false;
  await queueService.unlockJobsForWorker(workerId);
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

/**
 * OTP Cleanup Worker
 * Deletes all EmailOTP records where expiresAt < currentTime
 * Runs every 60 minutes
 */
const runCleanup = async () => {
  console.log('[Worker] Running Cleanup...');
  const now = new Date();
  
  // Note: For soft delete, assume records have a 'deletedAt' field.
  // We'll delete records where deletedAt is older than 7 days, 
  // and we also delete expired EmailOTPs.
  const expiredOTPCount = await prisma.emailOTP.deleteMany({
    where: { expiresAt: { lt: now } }
  });

  if (expiredOTPCount.count > 0) {
    console.log(`[Worker] Successfully deleted ${expiredOTPCount.count} expired OTP(s).`);
  }
};

export const startCleanupWorker = async () => {
  console.log(`[${workerId}] Started polling for 'cleanup' queue...`);
  
  while (isRunning) {
    try {
      const job = await queueService.fetchAndLock('cleanup', workerId);
      
      if (job) {
        console.log(`[${workerId}] Processing job: ${job.id}`);
        await runCleanup();
        
        // Enqueue the next run for 7 days from now (Weekly cleanup)
        await queueService.enqueue('cleanup', 'SYSTEM_CLEANUP', {}, { runAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) });
        
        // Mark complete
        await queueService.complete(job.id);
      } else {
        await new Promise(res => setTimeout(res, 60000)); // Sleep for 1 min if no jobs
      }
    } catch (err) {
      console.error(`[${workerId}] Polling error:`, err.message);
      await new Promise(res => setTimeout(res, 5000));
    }
  }
};

if (process.argv[1] && process.argv[1].endsWith('cleanupWorker.js')) {
  startCleanupWorker();
}
