import prisma from '../config/db.js';
import eventBus from '../events/eventBus.js';

export const trackOtpAbuse = async (email, ipAddress) => {
  // Check failed attempts and excessive requests in the last hour
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  
  const failedVerifications = await prisma.securityLog.count({
    where: {
      type: 'OTP_FAILED',
      ip: ipAddress,
      createdAt: { gte: oneHourAgo }
    }
  });

  const sentRequests = await prisma.securityLog.count({
    where: {
      type: 'OTP_SENT',
      ip: ipAddress,
      createdAt: { gte: oneHourAgo }
    }
  });

  let riskLevel = 'LOW';
  let reason = '';

  if (failedVerifications > 10 || sentRequests > 15) {
    riskLevel = 'CRITICAL';
    reason = 'Extreme OTP request/failure rate from IP';
  } else if (failedVerifications > 5 || sentRequests > 10) {
    riskLevel = 'HIGH';
    reason = 'High OTP failure/request rate from IP';
  } else if (failedVerifications > 3 || sentRequests > 5) {
    riskLevel = 'MEDIUM';
    reason = 'Elevated OTP activity';
  }

  if (riskLevel !== 'LOW') {
    eventBus.emitEvent('OTP_ABUSE_DETECTED', { email, ipAddress, riskLevel, reason, timestamp: new Date() });
    
    // Log fraud
    await prisma.fraudLog.create({
      data: {
        riskScore: riskLevel === 'CRITICAL' ? 95 : riskLevel === 'HIGH' ? 80 : 60,
        reason,
        status: 'FLAGGED',
        userId: email, // Treating email as identifier for now
        createdAt: new Date()
      }
    });
  }
};
