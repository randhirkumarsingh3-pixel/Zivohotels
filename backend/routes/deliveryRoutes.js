import express from 'express';
import prisma from '../config/db.js';
import { authorizeRoles } from '../middleware/authMiddleware.js';
import { emailTestMode } from '../services/otpService.js';
import { smsProvider, smsTestMode } from '../services/smsService.js';
import { adminAlertEmails } from '../services/notifyService.js';

/**
 * Admin: is email / SMS really going out? Provider status and the latest emails with their
 * result (sent, waiting, failed + the provider's error). GET /api/v1/admin/delivery
 */
const router = express.Router();
router.use(authorizeRoles('ADMIN'));

const maskTo = (to) => String(to || '').replace(/^(.{2}).*(@.*)$/, '$1•••$2');

router.get('/', async (req, res, next) => {
  try {
    const since = new Date(Date.now() - 7 * 86400000);
    const [counts, recent] = await Promise.all([
      prisma.backgroundJob.groupBy({ by: ['status'], where: { queue: 'email', createdAt: { gte: since } }, _count: { _all: true } }),
      prisma.backgroundJob.findMany({
        where: { queue: 'email' }, orderBy: { createdAt: 'desc' }, take: 40,
        select: { id: true, jobType: true, status: true, attempts: true, lastError: true, createdAt: true, completedAt: true, payload: true },
      }),
    ]);
    const key = process.env.RESEND_API_KEY || '';
    res.json({
      success: true,
      data: {
        email: {
          provider: 'Resend',
          keySet: key.startsWith('re_') && key !== 're_test_key',
          from: process.env.EMAIL_FROM || 'ZivoPlus <noreply@zivoplus.com>',
          testMode: emailTestMode(),
          adminAlertEmails: adminAlertEmails().length,
        },
        sms: { provider: smsProvider(), testMode: smsTestMode() },
        google: { configured: Boolean(process.env.GOOGLE_CLIENT_ID) },
        last7Days: Object.fromEntries(counts.map((c) => [c.status, c._count._all])),
        recent: recent.map((j) => ({
          id: j.id, type: j.jobType, status: j.status, attempts: j.attempts, error: j.lastError,
          createdAt: j.createdAt, sentAt: j.completedAt, to: maskTo(j.payload?.to), subject: String(j.payload?.subject || '').slice(0, 120),
        })),
      },
    });
  } catch (e) { next(e); }
});

/** Retry the failed emails (e.g. after fixing the Resend key or domain). */
router.post('/retry-failed', async (req, res, next) => {
  try {
    const r = await prisma.backgroundJob.updateMany({
      // Old sign-in codes are useless by now: never re-send them
      where: { queue: 'email', status: 'FAILED', jobType: { not: 'SEND_OTP' }, createdAt: { gte: new Date(Date.now() - 3 * 86400000) } },
      data: { status: 'PENDING', attempts: 0, runAt: new Date(), lockedBy: null, lockedAt: null, failedAt: null },
    });
    res.json({ success: true, message: `${r.count} email(s) queued again.`, data: { count: r.count } });
  } catch (e) { next(e); }
});

export default router;
