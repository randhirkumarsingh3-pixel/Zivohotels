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
    const { to, subject, text } = job.payload;
    // Every email in the ZivoPlus look, also older ones built without the shared layout
    const html = await (await import('../services/emailLayout.js')).brandEmail(job.payload.html);
    // Finance documents (invoice, statement, workbook) are built when sent, not stored in the job
    const attachments = job.payload.financeAttachments?.length
      ? await (await import('../services/finance/financeMail.js')).buildAttachments(job.payload.financeAttachments)
      : undefined;
    
    // Send email using Resend
    // Important: In a real system you may also enforce Idempotency by storing an IdempotencyKey
    const { data, error } = await resend.emails.send({
      from: process.env.EMAIL_FROM || 'ZivoPlus <noreply@zivoplus.com>',
      to,
      subject,
      html,
      text,
      ...(attachments?.length ? { attachments } : {}),
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
  
  let consecutiveErrors = 0;
  while (isRunning) {
    try {
      const job = await queueService.fetchAndLock('email', workerId);
      if (consecutiveErrors > 0) {
        console.log(`[${workerId}] Polling recovered after ${consecutiveErrors} failed attempt(s).`);
        consecutiveErrors = 0;
      }
      
      if (job) {
        await processJob(job);
      } else {
        // No jobs, sleep for 2 seconds
        await new Promise(res => setTimeout(res, 2000));
      }
    } catch (err) {
      // Exponential backoff (5s, 10s, 20s ... capped at 60s) and quieter logs, so a database
      // outage doesn't flood the logs every few seconds.
      consecutiveErrors += 1;
      const delayMs = Math.min(5000 * 2 ** (consecutiveErrors - 1), 60000);
      if (consecutiveErrors === 1 || consecutiveErrors % 10 === 0) {
        console.error(`[${workerId}] Polling error (attempt ${consecutiveErrors}, retrying in ${delayMs / 1000}s):`, err.message.trim().split('\n').pop());
      }
      await new Promise(res => setTimeout(res, delayMs));
    }
  }
};

// If run directly
if (process.argv[1] && process.argv[1].endsWith('emailWorker.js')) {
  startEmailWorker();
}
