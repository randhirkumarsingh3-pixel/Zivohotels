import { queueService } from '../services/queueService.js';
import { Resend } from 'resend';
import os from 'os';

const resend = new Resend(process.env.RESEND_API_KEY || 're_test_key');
const workerId = `email-worker-${os.hostname()}-${process.pid}`;

let isRunning = true;

// Handle Graceful Shutdown
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
    const { to, subject, html, text } = job.payload;
    
    // Send email using Resend
    // Important: In a real system you may also enforce Idempotency by storing an IdempotencyKey
    const { data, error } = await resend.emails.send({
      from: process.env.EMAIL_FROM || 'ZivoHotels <noreply@zivohotels.com>',
      to,
      subject,
      html,
      text,
    });

    if (error) {
      throw new Error(`Resend Error: ${error.message}`);
    }

    console.log(`[${workerId}] Successfully sent email. Resend ID: ${data?.id}`);
    
    // Mark complete
    await queueService.complete(job.id);
  } catch (err) {
    console.error(`[${workerId}] Job ${job.id} failed:`, err.message);
    await queueService.failWithRetry(job.id, err.message);
  }
};

export const startEmailWorker = async () => {
  console.log(`[${workerId}] Started polling for 'email' queue...`);
  
  while (isRunning) {
    try {
      const job = await queueService.fetchAndLock('email', workerId);
      
      if (job) {
        await processJob(job);
      } else {
        // No jobs, sleep for 2 seconds
        await new Promise(res => setTimeout(res, 2000));
      }
    } catch (err) {
      console.error(`[${workerId}] Polling error:`, err.message);
      await new Promise(res => setTimeout(res, 5000));
    }
  }
};

// If run directly
if (process.argv[1] && process.argv[1].endsWith('emailWorker.js')) {
  startEmailWorker();
}
