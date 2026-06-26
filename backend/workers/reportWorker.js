import { queueService } from '../services/queueService.js';
import os from 'os';

const workerId = `report-worker-${os.hostname()}-${process.pid}`;
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
    const { reportType, hotelId, dateRange } = job.payload;
    
    // Placeholder for heavy report generation using Puppeteer (PDF) or Excel
    console.log(`[${workerId}] Generating ${reportType} report for Hotel ${hotelId}...`);
    
    // Simulate heavy I/O and processing
    await new Promise(r => setTimeout(r, 5000));

    console.log(`[${workerId}] Report generation complete. Uploading to S3 and emailing link...`);

    // Mark complete
    await queueService.complete(job.id);
  } catch (err) {
    console.error(`[${workerId}] Job ${job.id} failed:`, err.message);
    await queueService.failWithRetry(job.id, err.message);
  }
};

export const startReportWorker = async () => {
  console.log(`[${workerId}] Started polling for 'report' queue...`);
  
  while (isRunning) {
    try {
      const job = await queueService.fetchAndLock('report', workerId);
      
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

if (process.argv[1] && process.argv[1].endsWith('reportWorker.js')) {
  startReportWorker();
}
