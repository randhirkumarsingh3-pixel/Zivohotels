/**
 * Protects accounts against password guessing from many addresses (rate limits only count per
 * address): after MAX_FAILS wrong passwords for an account within WINDOW, password sign-in to it
 * is locked for LOCK minutes, even with the right password. The owner is told (bell + email),
 * and for ZivoPlus staff accounts every admin is told too. A successful sign-in clears the count.
 * Shared through Redis across server processes (memory when Redis is unavailable).
 */
import { redis } from '../config/redis.js';
import prisma from '../config/db.js';
import { notifyUser, notifyAdmins } from './notifyService.js';
import { emailLayout } from './emailLayout.js';

export const MAX_FAILS = 5;
export const WINDOW_S = 15 * 60;
export const LOCK_S = 15 * 60;

const mem = new Map(); // key -> { value, until }
const memGet = (k) => { const e = mem.get(k); if (!e) return null; if (e.until < Date.now()) { mem.delete(k); return null; } return e.value; };
const memIncr = (k, ttl) => { const v = (memGet(k) || 0) + 1; mem.set(k, { value: v, until: Date.now() + ttl * 1000 }); return v; };
const ready = () => Boolean(redis?.isReady);

const failKey = (id) => `zivo:login:fail:${id}`;
const lockKey = (id) => `zivo:login:lock:${id}`;

/** Seconds left on a lock, or 0. */
export const lockedFor = async (userId) => {
  if (!userId) return 0;
  if (ready()) {
    const ttl = await redis.ttl(lockKey(userId)).catch(() => -2);
    return ttl > 0 ? ttl : 0;
  }
  const e = mem.get(lockKey(userId));
  return e && e.until > Date.now() ? Math.ceil((e.until - Date.now()) / 1000) : 0;
};

/** Records a wrong password; locks the account at MAX_FAILS. Returns { fails, locked }. */
export const recordFailure = async (user, { ip } = {}) => {
  if (!user?.id) return { fails: 0, locked: false };
  let fails;
  if (ready()) {
    fails = await redis.incr(failKey(user.id)).catch(() => 1);
    if (fails === 1) await redis.expire(failKey(user.id), WINDOW_S).catch(() => {});
  } else fails = memIncr(failKey(user.id), WINDOW_S);
  if (fails < MAX_FAILS) return { fails, locked: false };
  if (ready()) {
    await redis.set(lockKey(user.id), '1', { EX: LOCK_S }).catch(() => {});
    await redis.del(failKey(user.id)).catch(() => {});
  } else { mem.set(lockKey(user.id), { value: 1, until: Date.now() + LOCK_S * 1000 }); mem.delete(failKey(user.id)); }
  await onLocked(user, ip).catch(() => {});
  return { fails, locked: true };
};

export const recordSuccess = async (userId) => {
  if (!userId) return;
  if (ready()) await redis.del(failKey(userId)).catch(() => {});
  else mem.delete(failKey(userId));
};

/** Lifts a lock (e.g. after a password reset). */
export const unlock = async (userId) => {
  if (!userId) return;
  if (ready()) await redis.del([lockKey(userId), failKey(userId)]).catch(() => {});
  else { mem.delete(lockKey(userId)); mem.delete(failKey(userId)); }
};

const onLocked = async (user, ip) => {
  await prisma.securityLog.create({ data: { type: 'ACCOUNT_LOCKED', userId: user.id, ip: ip || 'unknown', details: { minutes: LOCK_S / 60, role: user.role } } }).catch(() => {});
  const html = await emailLayout({
    title: 'Sign-in paused on your ZivoPlus account',
    body: `<p>Someone entered the wrong password for your account ${MAX_FAILS} times, so password sign-in is paused for ${LOCK_S / 60} minutes.</p><p>If this was you, wait and try again, or sign in with a code. <b>If it wasn't you, reset your password now</b>; your account is safe while sign-in is paused.</p>`,
    rows: [['From address', ip || 'unknown'], ['When', new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })]],
    cta: { href: '/forgot-password', label: 'Reset password' },
  }).catch(() => null);
  await notifyUser(user.id, {
    type: 'SECURITY', title: 'Sign-in paused after wrong passwords',
    message: `${MAX_FAILS} wrong passwords: password sign-in is paused for ${LOCK_S / 60} minutes. If it wasn't you, reset your password.`,
    link: '/forgot-password',
    email: html ? { subject: 'Security alert: sign-in paused on your ZivoPlus account', html, priority: 1 } : null,
  });
  if (user.role === 'ADMIN') {
    await notifyAdmins({ type: 'SECURITY', title: 'Staff account locked', message: `${user.email}: ${MAX_FAILS} wrong passwords from ${ip || 'an unknown address'}. Password sign-in paused for ${LOCK_S / 60} minutes.`, link: '/admin/staff' });
  }
};

export default { lockedFor, recordFailure, recordSuccess, unlock, MAX_FAILS, LOCK_S };
