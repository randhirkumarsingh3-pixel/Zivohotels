import crypto from 'crypto';
import systemCache from '../utils/systemCache.js';
import prisma from '../config/db.js';
import winston from 'winston';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.simple(),
    }),
  ],
});

/**
 * logger.js
 * Production-grade request logging with Masking, Tracing, and System Monitoring
 */
export const requestLogger = (req, res, next) => {
  // Attach a unique ID to every request
  req.id = crypto.randomUUID();
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    const status = res.statusCode;
    const method = req.method;
    const url = req.originalUrl;
    const user = req.user?.id || 'PUBLIC';
    
    // 1. Update Error Stats in Cache
    if (status >= 500) {
      systemCache.increment('errors5xx');
    } else if (status >= 400) {
      systemCache.increment('errors4xx');
    }

    // 2. Throttled Session Tracking (lastActiveAt)
    // Only update if user is logged in and it's been > 5 mins since last update
    if (req.user) {
      const fiveMinsAgo = new Date(Date.now() - 5 * 60 * 1000);
      if (!req.user.lastActiveAt || req.user.lastActiveAt < fiveMinsAgo) {
        prisma.user.update({
          where: { id: req.user.id },
          data: { lastActiveAt: new Date() }
        }).catch(err => console.error('Throttled session update failed:', err));
      }
    }
    
    // 3. Mask sensitive body data
    let safeBody = null;
    if (req.body && Object.keys(req.body).length > 0) {
      safeBody = { ...req.body };
      ['password', 'token', 'creditCard', 'cvv'].forEach(key => {
        if (safeBody[key]) safeBody[key] = '***';
      });
    }
    
    const logLine = `[${req.id}] ${method} ${url} ${status} - ${duration}ms | User: ${user}`;
    
    if (status >= 500) {
      logger.error(`🔴 ${logLine} | Body: ${JSON.stringify(safeBody)}`);
    } else if (status >= 400) {
      logger.warn(`🟡 ${logLine} | Body: ${JSON.stringify(safeBody)}`);
    } else {
      logger.info(`🟢 ${logLine}`);
    }
  });
  
  next();
};
/**
 * criticalLogger
 * For high-severity events like refund failures or DB connection losses.
 */
export const criticalLogger = (action, details = {}, reqId = 'SYSTEM') => {
  const timestamp = new Date().toISOString();
  const logData = {
    level: 'CRITICAL',
    timestamp,
    reqId,
    action,
    ...details
  };
  
  logger.error(`🚨 [CRITICAL] [${reqId}] ${action} | ${JSON.stringify(details)}`);
  
  // In a real environment, this would also trigger a PagerDuty/Email/Slack alert
  // For now, we ensure it's prominently logged for cloud monitoring (CloudWatch/Loki)
  prisma.auditLog.create({
    data: {
      action: `CRITICAL_${action}`,
      entityType: 'SYSTEM',
      details: logData,
      requestId: reqId
    }
  }).catch(err => console.error('CRITICAL LOG PERSISTENCE FAILED:', err));
};
