import prisma from '../config/db.js';
import { supportFrom } from '../config/supportContacts.js';
import { payLaterSettings } from '../domains/payLater.js';
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

  // Guest support contacts (help page, My Bookings)
  const saved = await prisma.systemConfig.findUnique({ where: { key: 'support_settings' } });
  configMap.support = supportFrom(saved?.value || {});
  // Reserve now, pay later: whether it's offered and how many hours guests get to pay
  const bookingSettings = await prisma.systemConfig.findUnique({ where: { key: 'booking_settings' } });
  configMap.payLater = payLaterSettings(bookingSettings?.value || {});

  res.status(200).json({ success: true, data: configMap });
});

// --- PUT /api/v1/admin/system/config ---
const configSchema = z.record(z.any());

const phoneRule = z.string().trim().max(20).refine((v) => !v || /^\+?[\d\s-]{10,15}$/.test(v), 'Enter a phone number with at least 10 digits');
const supportSettingsSchema = z.object({
  phone: phoneRule.optional().default(''),
  whatsapp: phoneRule.optional().default(''),
  email: z.string().trim().max(120).refine((v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), 'Enter a valid email address').optional().default(''),
  hours: z.string().trim().max(120).optional().default(''),
});

export const updateConfig = asyncHandler(async (req, res) => {
  const validation = configSchema.safeParse(req.body);
  if (!validation.success) {
    return res.status(422).json({ success: false, errors: validation.error.format() });
  }

  // Support contacts are shown to every guest: check them before saving
  if (req.body.support_settings !== undefined) {
    const sup = supportSettingsSchema.safeParse(req.body.support_settings);
    if (!sup.success) {
      return res.status(422).json({ success: false, message: sup.error.issues[0]?.message || 'Check the support details', errors: sup.error.format() });
    }
    req.body.support_settings = sup.data;
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

  // Every booking is priced from these slabs; a gap, overlap or missing open-ended slab makes some
  // tariffs unbookable ("No applicable tax rule found"), so the set is checked before replacing.
  const rows = slabs.map(s => ({
    name: String(s.name || '').trim(),
    min: Number(s.minThreshold),
    max: s.maxThreshold === 'Infinity' || s.maxThreshold === null || s.maxThreshold === '' || s.maxThreshold === undefined ? null : Number(s.maxThreshold),
    pct: Number(s.percentage),
    active: s.status === 'Active' || s.isActive === true
  }));
  const invalid = rows.find(r => !r.name || !(r.min >= 0) || (r.max !== null && !(r.max > r.min)) || !(r.pct >= 0 && r.pct <= 28));
  if (invalid) {
    return res.status(422).json({ success: false, message: `Invalid slab "${invalid.name || '(no name)'}": check the tariffs and that GST % is between 0 and 28.` });
  }
  const active = rows.filter(r => r.active).sort((a, b) => a.min - b.min);
  const contiguous = active.length > 0 && active[0].min === 0 && active.at(-1).max === null &&
    active.every((r, i) => i === active.length - 1 || (r.max !== null && active[i + 1].min === r.max));
  if (!contiguous) {
    return res.status(422).json({ success: false, message: 'Active slabs must start at ₹0, follow on without gaps or overlaps, and the highest must have no upper limit.' });
  }

  await prisma.$transaction([
    prisma.taxRule.deleteMany({}),
    prisma.taxRule.createMany({
      data: rows.map(r => ({
        name: r.name,
        minThreshold: r.min,
        maxThreshold: r.max,
        percentage: r.pct,
        isActive: r.active,
      }))
    })
  ]);

  res.status(200).json({ success: true, message: 'Tax rules updated successfully.' });
});

// --- WORKER HEALTH ---
export const getWorkerHealth = asyncHandler(async (req, res) => {
  res.status(200).json({
    success: true,
    data: {
      status: 'healthy',
      activeWorkers: 0,
      queues: {}
    }
  });
});

