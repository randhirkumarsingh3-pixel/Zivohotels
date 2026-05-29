import prisma from '../config/db.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

/**
 * @desc    Get OTP and Authentication Analytics
 * @route   GET /api/v1/admin/security/otp-analytics
 * @access  Private/Admin
 */
export const getOtpAnalytics = asyncHandler(async (req, res) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const sentToday = await prisma.securityLog.count({
    where: {
      type: 'OTP_SENT',
      createdAt: { gte: today }
    }
  });

  const verifiedToday = await prisma.securityLog.count({
    where: {
      type: 'OTP_VERIFIED',
      createdAt: { gte: today }
    }
  });

  const failedToday = await prisma.securityLog.count({
    where: {
      type: 'OTP_FAILED',
      createdAt: { gte: today }
    }
  });

  const abuseAttempts = await prisma.fraudLog.count({
    where: {
      status: 'FLAGGED',
      createdAt: { gte: today }
    }
  });

  const verificationRate = sentToday > 0 ? ((verifiedToday / sentToday) * 100).toFixed(2) : 0;
  const failureRate = sentToday > 0 ? ((failedToday / sentToday) * 100).toFixed(2) : 0;

  res.status(200).json({
    success: true,
    data: {
      today: {
        sent: sentToday,
        verified: verifiedToday,
        failed: failedToday,
        abuseAttempts,
        verificationRate: `${verificationRate}%`,
        failureRate: `${failureRate}%`
      }
    }
  });
});
