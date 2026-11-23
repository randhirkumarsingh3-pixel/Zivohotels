/**
 * Data retention: how long each kind of record is kept, and the daily clean-up that applies it
 * (runs at 03:40 IST in the process that runs timed jobs). Records needed for tax and accounts
 * (bookings, payments, invoices, ledger, finance documents) are never removed here.
 *
 * Audit tables are append-only in the database (migration 20261208000000_data_protection); the
 * clean-up switches that guard off for its own transaction only, and records what it removed in
 * the audit log.
 */
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import prisma from '../config/db.js';

const DAY = 24 * 60 * 60 * 1000;
const ago = (days) => new Date(Date.now() - days * DAY);

/** Retention periods in days. Shown on the data map; change here only. */
export const RETENTION = {
  analytics: 395, // 13 months: views, events, behaviour, sessions
  securityLog: 730, // 2 years
  auditLog: 365 * 8, // 8 years (covers tax-record periods)
  readNotifications: 365,
  finishedJobs: 90, // sent emails / finished background jobs
  logFiles: 90, // app log files on the server (LOG_DIR)
  deletedAccountScrub: 30, // personal details removed 30 days after an account is deleted
};

const SCRUBBED_DOMAIN = 'deleted.zivoplus.invalid';

/** Removes personal details from accounts deleted more than 30 days ago (bookings stay for tax). */
export const scrubDeletedAccounts = async () => {
  const users = await prisma.user.findMany({
    where: { status: 'DELETED', updatedAt: { lt: ago(RETENTION.deletedAccountScrub) }, NOT: { email: { endsWith: `@${SCRUBBED_DOMAIN}` } } },
    select: { id: true },
  });
  for (const u of users) {
    await prisma.user.update({
      where: { id: u.id },
      data: {
        name: 'Deleted user',
        email: `user-${u.id}@${SCRUBBED_DOMAIN}`,
        phone: null,
        googleId: null,
        password: `!scrubbed-${crypto.randomBytes(16).toString('hex')}`, // not a bcrypt hash: can never sign in
        inviteToken: null, inviteExpiry: null, passwordResetToken: null, passwordResetExpiry: null,
        tokenVersion: { increment: 1 },
      },
    });
    await prisma.userBehavior.deleteMany({ where: { userId: u.id } }).catch(() => {});
    await prisma.userNotification.deleteMany({ where: { userId: u.id } }).catch(() => {});
  }
  return users.length;
};

/** Runs the clean-up once. Returns what was removed per kind. */
export const runRetention = async () => {
  const done = {};
  const del = async (key, fn) => { try { done[key] = (await fn())?.count ?? 0; } catch (e) { done[key] = `error: ${e.message}`; } };

  await del('analyticsEvents', () => prisma.analyticsEvent.deleteMany({ where: { createdAt: { lt: ago(RETENTION.analytics) } } }));
  await del('hotelViews', () => prisma.hotelView.deleteMany({ where: { createdAt: { lt: ago(RETENTION.analytics) } } }));
  await del('hotelInteractions', () => prisma.hotelInteraction.deleteMany({ where: { createdAt: { lt: ago(RETENTION.analytics) } } }));
  await del('userBehavior', () => prisma.userBehavior.deleteMany({ where: { updatedAt: { lt: ago(RETENTION.analytics) } } }));
  await del('sessionLogs', () => prisma.sessionLog.deleteMany({ where: { createdAt: { lt: ago(RETENTION.analytics) } } }));
  await del('sessionAggregates', () => prisma.sessionAggregate.deleteMany({ where: { createdAt: { lt: ago(RETENTION.analytics) } } }));
  await del('readNotifications', () => prisma.userNotification.deleteMany({ where: { isRead: true, createdAt: { lt: ago(RETENTION.readNotifications) } } }));
  await del('finishedJobs', () => prisma.backgroundJob.deleteMany({ where: { status: { in: ['COMPLETED', 'FAILED'] }, updatedAt: { lt: ago(RETENTION.finishedJobs) } } }));
  await del('expiredCodes', () => prisma.emailOTP.deleteMany({ where: { expiresAt: { lt: new Date() } } }));
  await del('deletedAccountsScrubbed', async () => ({ count: await scrubDeletedAccounts() }));

  await del('logFiles', async () => {
    if (!process.env.LOG_DIR) return { count: 0 };
    let count = 0;
    for (const f of await fs.readdir(process.env.LOG_DIR).catch(() => [])) {
      const p = path.join(process.env.LOG_DIR, f);
      const st = await fs.stat(p).catch(() => null);
      if (st?.isFile() && st.mtime < ago(RETENTION.logFiles)) { await fs.unlink(p).catch(() => {}); count += 1; }
    }
    return { count };
  });

  // Audit tables: guard switched off for this transaction only
  try {
    const [, sec, aud] = await prisma.$transaction([
      prisma.$executeRaw`SELECT set_config('zivo.allow_audit_change', 'on', true)`,
      prisma.$executeRaw`DELETE FROM "SecurityLog" WHERE "createdAt" < ${ago(RETENTION.securityLog)}`,
      prisma.$executeRaw`DELETE FROM "AuditLog" WHERE "createdAt" < ${ago(RETENTION.auditLog)}`,
    ]);
    done.securityLogs = sec; done.auditLogs = aud;
  } catch (e) { done.auditTables = `error: ${e.message}`; }

  const removed = Object.values(done).reduce((t, v) => t + (typeof v === 'number' ? v : 0), 0);
  if (removed) {
    await prisma.auditLog.create({ data: { action: 'DATA_RETENTION_CLEANUP', entityType: 'SYSTEM', entityId: 'retention', userId: 'SYSTEM', details: { removed: done, periodsDays: RETENTION } } }).catch(() => {});
  }
  return done;
};

/** Daily at 03:40 India time (22:10 UTC). */
export const startRetentionJob = () => {
  const schedule = () => {
    const now = new Date();
    const next = new Date(now);
    next.setUTCHours(22, 10, 0, 0);
    if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
    setTimeout(async () => {
      const r = await runRetention().catch((e) => ({ error: e.message }));
      console.log('🧹 Data retention clean-up:', JSON.stringify(r));
      schedule();
    }, next - now).unref?.();
  };
  schedule();
};

export default { RETENTION, runRetention, scrubDeletedAccounts, startRetentionJob };
