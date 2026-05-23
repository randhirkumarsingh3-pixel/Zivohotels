import prisma from '../config/db.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import systemCache from '../utils/systemCache.js';
import { z } from 'zod';

/**
 * systemController.js
 * Logic for the System Control Center dashboard and operations.
 */

// --- GET /api/v1/admin/system/stats ---
export const getStats = asyncHandler(async (req, res) => {
  // 1. Get cached stats
  const cacheStats = systemCache.getStats();

  // 2. Count current active sessions (lastActiveAt > 15 mins)
  const fifteenMinsAgo = new Date(Date.now() - 15 * 60 * 1000);
  const activeSessions = await prisma.user.count({
    where: { lastActiveAt: { gte: fifteenMinsAgo } }
  });

  // 3. Aggregate some live business data for comparison
  const [confirmedToday, cancelledToday] = await Promise.all([
    prisma.booking.count({ where: { status: 'CONFIRMED', createdAt: { gte: new Date(new Date().setHours(0,0,0,0)) } } }),
    prisma.booking.count({ where: { status: 'CANCELLED', createdAt: { gte: new Date(new Date().setHours(0,0,0,0)) } } }),
  ]);

  res.status(200).json({
    success: true,
    data: {
      security: {
        activeSessions,
        failedLogins: cacheStats.failedLogins,
        forbiddenAccess: cacheStats.forbiddenAccess,
        errors4xx: cacheStats.errors4xx,
        errors5xx: cacheStats.errors5xx,
      },
      business: {
        confirmedToday,
        cancelledToday,
        refundsToday: cacheStats.refundsToday,
      }
    }
  });
});

// --- GET /api/v1/admin/system/security-logs ---
export const getSecurityLogs = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, type } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  const where = type ? { type } : {};

  const [logs, total] = await Promise.all([
    prisma.securityLog.findMany({
      where,
      skip,
      take: parseInt(limit),
      orderBy: { createdAt: 'desc' }
    }),
    prisma.securityLog.count({ where })
  ]);

  res.status(200).json({
    success: true,
    data: logs,
    meta: { total, page: parseInt(page), limit: parseInt(limit) }
  });
});

// --- GET /api/v1/admin/system/integrity ---
export const getIntegrityResult = asyncHandler(async (req, res) => {
  const result = systemCache.getIntegrityResult();
  res.status(200).json({ success: true, data: result });
});

// --- POST /api/v1/admin/system/actions ---
export const triggerAction = asyncHandler(async (req, res) => {
  const { action, target, value } = req.body;

  switch (action) {
    case 'BLOCK_IP':
      systemCache.blockIp(target);
      break;
    
    case 'UNBLOCK_IP':
      systemCache.unblockIp(target);
      break;

    case 'FORCE_LOGOUT':
      await prisma.user.update({
        where: { id: target },
        data: { 
          tokenVersion: { increment: 1 },
          lastActiveAt: null 
        }
      });
      break;

    case 'LOCK_ACCOUNT':
      await prisma.user.update({
        where: { id: target },
        data: { status: 'BLOCKED' }
      });
      break;

    default:
      return res.status(400).json({ success: false, message: 'Invalid action' });
  }

  // Log the administrative action
  await prisma.auditLog.create({
    data: {
      action: `SYS_ACTION_${action}`,
      entityType: 'SYSTEM',
      entityId: target || 'GLOBAL',
      userId: req.user.id,
      details: { action, target, value }
    }
  });

  res.status(200).json({ success: true, message: `Action ${action} executed successfully.` });
});

// --- GET /api/v1/admin/system/config (Admin) ---
export const getConfig = asyncHandler(async (req, res) => {
  const configs = await prisma.systemConfig.findMany();
  const configMap = configs.reduce((acc, curr) => {
    acc[curr.key] = curr.value;
    return acc;
  }, {});
  res.status(200).json({ success: true, data: configMap });
});

// --- GET /api/v1/system/config (Public) ---
export const getPublicConfig = asyncHandler(async (req, res) => {
  const configs = await prisma.systemConfig.findMany({
    where: {
      key: { in: ['partialPaymentPercent', 'prepaidDiscountPercent', 'maintenanceMode', 'isBookingDisabled'] }
    }
  });
  
  const configMap = configs.reduce((acc, curr) => {
    acc[curr.key] = curr.value;
    return acc;
  }, {});

  // Defaults if not set in DB
  if (configMap.partialPaymentPercent === undefined) configMap.partialPaymentPercent = 30;
  if (configMap.prepaidDiscountPercent === undefined) configMap.prepaidDiscountPercent = 5;

  res.status(200).json({ success: true, data: configMap });
});

// --- PUT /api/v1/admin/system/config ---
const configSchema = z.record(z.any());

export const updateConfig = asyncHandler(async (req, res) => {
  const validation = configSchema.safeParse(req.body);
  if (!validation.success) {
    return res.status(422).json({ success: false, errors: validation.error.format() });
  }

  const operations = Object.entries(req.body).map(([key, value]) => {
    return prisma.systemConfig.upsert({
      where: { key },
      create: { key, value },
      update: { value }
    });
  });

  await Promise.all(operations);
  res.status(200).json({ success: true, message: 'System configuration updated.' });
});

// --- TAX RULES MANAGEMENT ---
export const getTaxRules = asyncHandler(async (req, res) => {
  const rules = await prisma.taxRule.findMany({
    orderBy: { minThreshold: 'asc' }
  });
  res.status(200).json({ success: true, data: rules });
});

export const updateTaxRules = asyncHandler(async (req, res) => {
  const { slabs } = req.body;

  if (!Array.isArray(slabs)) {
    return res.status(422).json({ success: false, message: 'Invalid data format' });
  }

  await prisma.$transaction([
    prisma.taxRule.deleteMany({}),
    prisma.taxRule.createMany({
      data: slabs.map(s => ({
        name: s.name,
        minThreshold: parseFloat(s.minThreshold),
        maxThreshold: s.maxThreshold === 'Infinity' || s.maxThreshold === null ? null : parseFloat(s.maxThreshold),
        percentage: parseFloat(s.percentage),
        isActive: s.status === 'Active' || s.isActive === true,
      }))
    })
  ]);

  res.status(200).json({ success: true, message: 'Tax rules updated successfully.' });
});
