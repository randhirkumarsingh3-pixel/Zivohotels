import { weakPasswordReason } from '../utils/passwordPolicy.js';
import { unlock } from '../services/loginGuard.js';
import { sendPasswordChanged } from '../services/accountEmails.js';
import crypto from 'crypto';
import bcrypt from '../utils/bcrypt.js';
import jwt from 'jsonwebtoken';
import { setSessionCookie } from '../utils/sessionCookie.js';
import { z } from 'zod';
import prisma from '../config/db.js';
import { firstHotelFor } from '../services/accessService.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { queueService } from '../services/queueService.js';
import { escapeHtml } from '../utils/html.js';

/**
 * Passwords: change (signed in), "forgot password" (emailed link, 1 hour) and reset.
 * Changing or resetting a password signs the account out everywhere else (tokenVersion + 1); a
 * change hands the current device a fresh token so it stays signed in.
 */

const RESET_TTL_MS = 60 * 60 * 1000;
const PASSWORD_RULE = z.string().min(8, 'Use at least 8 characters').max(128, 'Use at most 128 characters');
const hashToken = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');

const signToken = (id, role, hotelId, tokenVersion) => jwt.sign({ id, role, hotelId, tokenVersion }, process.env.JWT_SECRET, {
  algorithm: 'HS256',
  // Staff (admin console) sessions last at most 12 hours, as at sign-in
  expiresIn: role === 'ADMIN' ? '12h' : (process.env.JWT_EXPIRES_IN || '7d'),
});

const fail = (res, req, status, message) => res.status(status).json({ success: false, message, requestId: req.id });

/** PUT /api/v1/auth/password { currentPassword, newPassword } */
export const changePassword = asyncHandler(async (req, res) => {
  const parsed = z.object({ currentPassword: z.string().min(1, 'Enter your current password'), newPassword: PASSWORD_RULE }).safeParse(req.body || {});
  if (!parsed.success) return fail(res, req, 422, parsed.error.issues[0].message);
  const { currentPassword, newPassword } = parsed.data;

  const user = await prisma.user.findUnique({ where: { id: req.user.id }, select: { id: true, role: true, password: true, email: true, phone: true, name: true } });
  if (!user || !(await bcrypt.compare(currentPassword, user.password))) return fail(res, req, 400, 'Your current password is not right');
  const weak = weakPasswordReason(newPassword, user);
  if (weak) return fail(res, req, 422, weak);
  if (await bcrypt.compare(newPassword, user.password)) return fail(res, req, 400, 'Choose a password different from your current one');

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { password: await bcrypt.hash(newPassword, 12), tokenVersion: { increment: 1 }, mustChangePassword: false, passwordChangedAt: new Date(), passwordResetToken: null, passwordResetExpiry: null },
    select: { id: true, role: true, tokenVersion: true, name: true, email: true },
  });
  sendPasswordChanged(updated, { ip: req.ip }).catch(() => {});
  const hotel = ['OWNER', 'MANAGER'].includes(updated.role) ? { id: await firstHotelFor(updated.id) } : null;
  await prisma.auditLog.create({ data: { action: 'PASSWORD_CHANGED', entityType: 'USER', entityId: updated.id, userId: updated.id, requestId: req.id, details: {} } }).catch(() => {});
  // A new session for this device (the old one stopped working with the version bump)
  const token = signToken(updated.id, updated.role, hotel?.id || null, updated.tokenVersion);
  setSessionCookie(res, token, updated.role === 'ADMIN' ? '12h' : undefined);
  res.json({ success: true, message: 'Password changed. Other devices have been signed out.', token, requestId: req.id });
});

/** POST /api/v1/auth/forgot-password { email } — same answer whether or not the account exists. */
export const forgotPassword = asyncHandler(async (req, res) => {
  const parsed = z.object({ email: z.string().email('Enter a valid email address') }).safeParse(req.body || {});
  if (!parsed.success) return fail(res, req, 422, parsed.error.issues[0].message);
  const email = parsed.data.email.trim().toLowerCase();
  const answer = { success: true, message: 'If an account exists for that email, we have sent a link to reset the password. It works for 1 hour.', requestId: req.id };

  const user = await prisma.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' } }, select: { id: true, name: true, email: true, status: true, role: true } });
  if (!user || ['SUSPENDED', 'BLOCKED', 'DELETED', 'INACTIVE'].includes(user.status)) return res.json(answer);

  const token = crypto.randomBytes(32).toString('hex');
  await prisma.user.update({ where: { id: user.id }, data: { passwordResetToken: hashToken(token), passwordResetExpiry: new Date(Date.now() + RESET_TTL_MS) } });
  const base = process.env.FRONTEND_URL || 'http://localhost:5173';
  const link = `${base}/reset-password?token=${token}`;
  const { emailLayout } = await import('../services/emailLayout.js');
  await queueService.enqueue('email', 'SEND_PASSWORD_RESET', {
    to: user.email,
    subject: 'Reset your ZivoPlus password',
    html: await emailLayout({
      title: 'Reset your password',
      body: `<p>Hi ${escapeHtml(user.name || 'there')},</p><p>We received a request to reset the password for your ZivoPlus account. The button below works for 1 hour.</p>`,
      cta: { label: 'Choose a new password', href: link },
      note: "If you didn't ask for this, you can ignore this email: your password stays the same.",
    }),
  }, { priority: 1 });
  res.json(answer);
});

/** POST /api/v1/auth/reset-password { token, password } */
export const resetPassword = asyncHandler(async (req, res) => {
  const parsed = z.object({ token: z.string().min(20, 'This reset link is not valid'), password: PASSWORD_RULE }).safeParse(req.body || {});
  if (!parsed.success) return fail(res, req, 422, parsed.error.issues[0].message);
  const user = await prisma.user.findFirst({ where: { passwordResetToken: hashToken(parsed.data.token), passwordResetExpiry: { gt: new Date() } }, select: { id: true, status: true, role: true, email: true, phone: true, name: true } });
  if (!user) return fail(res, req, 400, 'This reset link has expired or was already used. Ask for a new one.');
  const weak = weakPasswordReason(parsed.data.password, user);
  if (weak) return fail(res, req, 422, weak);
  const changed = await prisma.user.update({
    where: { id: user.id },
    select: { id: true, name: true, email: true },
    data: {
      password: await bcrypt.hash(parsed.data.password, 12),
      passwordResetToken: null, passwordResetExpiry: null, passwordChangedAt: new Date(),
      tokenVersion: { increment: 1 }, mustChangePassword: false,
      // An invited owner who resets from their email has proved they own it
      ...(user.status === 'INVITED' ? { status: 'ACTIVE', inviteToken: null, inviteExpiry: null } : {}),
    },
  });
  sendPasswordChanged(changed, { ip: req.ip }).catch(() => {});
  await unlock(user.id); // a reset lifts a sign-in pause
  await prisma.auditLog.create({ data: { action: 'PASSWORD_RESET', entityType: 'USER', entityId: user.id, userId: user.id, requestId: req.id, details: {} } }).catch(() => {});
  res.json({ success: true, message: 'Password updated. Log in with your new password.', requestId: req.id });
});
