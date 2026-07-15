import prisma from '../config/db.js';


// Exponential backoff strategy (in milliseconds)
// Attempt 1 fails -> retry after 30s
// Attempt 2 fails -> retry after 5m (300s)
// Attempt 3 fails -> retry after 30m (1800s)
// Attempt 4 fails -> retry after 2h (7200s)
const BACKOFF_DELAYS = [
  30 * 1000,
  5 * 60 * 1000,
  30 * 60 * 1000,
  2 * 60 * 60 * 1000,
];

export const queueService = {
  /**
   * Enqueue a new background job.
   */
  async enqueue(queue, jobType, payload, options = {}) {
    const { priority = 5, runAt = new Date(), maxAttempts = 5 } = options;
    return prisma.backgroundJob.create({
      data: {
        queue,
        jobType,
        payload,
        priority,
        runAt,
        maxAttempts,
        status: 'PENDING',
      },
    });
  },

  /**
   * Fetch and lock the next available job for processing.
   * Utilizes raw SQL to ensure atomic locking and skip locked rows.
   */
  async fetchAndLock(queue, workerId) {
    // We use a raw query with FOR UPDATE SKIP LOCKED to prevent concurrent workers from picking the same job.
    // We select the highest priority (lowest number if 1 is highest, or we can treat 1 as highest. Let's say smaller number = higher priority).
    // The user example: Priority 1 (Payment), Priority 5 (Analytics). So ASC order for priority.
    const result = await prisma.$queryRaw`
      UPDATE "BackgroundJob"
      SET 
        "status" = 'PROCESSING'::"JobStatus",
        "lockedBy" = ${workerId},
        "lockedAt" = NOW(),
        "updatedAt" = NOW()
      WHERE "id" = (
        SELECT "id" 
        FROM "BackgroundJob"
        WHERE "queue" = ${queue}
          AND ("status" = 'PENDING'::"JobStatus" OR "status" = 'RETRY'::"JobStatus")
          AND "runAt" <= NOW()
        ORDER BY "priority" ASC, "runAt" ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      RETURNING *;
    `;
    
    if (result && result.length > 0) {
      return result[0];
    }
    return null;
  },

  /**
   * Mark a job as successfully completed.
   */
  async complete(jobId) {
    return prisma.backgroundJob.update({
      where: { id: jobId },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
        lockedBy: null,
      },
    });
  },

  /**
   * Mark a job as failed, automatically applying exponential backoff if retries remain.
   */
  async failWithRetry(jobId, errorMsg) {
    const job = await prisma.backgroundJob.findUnique({ where: { id: jobId } });
    if (!job) return null;

    const attempts = job.attempts + 1;
    const maxAttempts = job.maxAttempts;

    if (attempts >= maxAttempts) {
      // Dead letter
      return prisma.backgroundJob.update({
        where: { id: jobId },
        data: {
          status: 'FAILED',
          failedAt: new Date(),
          attempts,
          lastError: errorMsg,
          lockedBy: null,
        },
      });
    }

    // Determine backoff delay based on current attempt count (0-indexed for array)
    const delayIdx = Math.min(attempts - 1, BACKOFF_DELAYS.length - 1);
    const delayMs = BACKOFF_DELAYS[delayIdx];
    const nextRunAt = new Date(Date.now() + delayMs);

    return prisma.backgroundJob.update({
      where: { id: jobId },
      data: {
        status: 'RETRY',
        attempts,
        lastError: errorMsg,
        runAt: nextRunAt,
        lockedBy: null,
      },
    });
  },
  
  /**
   * Graceful shutdown utility to unlock stuck jobs that were in 'PROCESSING'
   * for a specific worker.
   */
  async unlockJobsForWorker(workerId) {
    return prisma.backgroundJob.updateMany({
      where: {
        lockedBy: workerId,
        status: 'PROCESSING'
      },
      data: {
        status: 'RETRY',
        lockedBy: null,
        lockedAt: null
      }
    });
  }
};
