import cron from 'node-cron';
import prisma from '../config/db.js';
import eventBus from '../events/eventBus.js';

/**
 * OTP Cleanup Worker
 * Deletes all EmailOTP records where expiresAt < currentTime
 * Runs every 60 minutes
 */
export const startOtpCleanupWorker = () => {
  cron.schedule('0 * * * *', async () => {
    console.log('[Worker] Running OTP Cleanup...');
    try {
      const now = new Date();
      
      const result = await prisma.emailOTP.deleteMany({
        where: {
          expiresAt: { lt: now }
        }
      });

      if (result.count > 0) {
        console.log(`[Worker] Successfully deleted ${result.count} expired OTP(s).`);
        
        // Log cleanup activity
        await prisma.auditLog.create({
          data: {
            action: 'OTP_CLEANUP',
            entityType: 'SYSTEM',
            entityId: 'SYSTEM',
            userId: 'SYSTEM',
            details: { deletedCount: result.count }
          }
        });

        // Emit cleanup metrics
        eventBus.emit('SYSTEM_METRIC', {
          metric: 'otp_cleanup_count',
          value: result.count,
          timestamp: new Date()
        });
      }
    } catch (error) {
      console.error('[Worker] Error during OTP Cleanup:', error);
    }
  });

  console.log('[Worker] OTP Cleanup Worker scheduled (Hourly).');
};
