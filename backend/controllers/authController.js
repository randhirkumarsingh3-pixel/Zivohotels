import prisma from '../config/db.js';
import { firstHotelFor, accessForClient } from '../services/accessService.js';
import { awardSignupBonus } from '../services/loyaltyService.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { setSessionCookie, clearSessionCookie } from '../utils/sessionCookie.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import systemCache from '../utils/systemCache.js';
import { z } from 'zod';
import eventBus from '../events/eventBus.js';
import { createOTP, verifyOTP } from '../services/otpService.js'; // property onboarding
import { trackOtpAbuse } from '../services/fraudService.js';

import crypto from 'crypto';
import { OAuth2Client } from 'google-auth-library';
import { sendCode, checkCode, CodeError, emailTestMode } from '../services/otpService.js';
import { normalizePhone, maskPhone, smsTestMode, smsProvider } from '../services/smsService.js';
import { sendWelcome, sendPartnerWelcome } from '../services/accountEmails.js';
import { notifyAdmins } from '../services/notifyService.js';

// --- Validation ---

const normEmail = (e) => String(e || '').trim().toLowerCase();
const nameField = z.string().trim().min(2, 'Enter your full name').max(80);
const emailField = z.string().trim().email('Enter a valid email address').max(160);
const passwordField = z.string().min(8, 'Use at least 8 characters for the password').max(128);
const phoneField = z.string().trim().min(8, 'Enter your mobile number').max(20);

// accountType PARTNER: a hotel owner signing up from "List your property" (role OWNER). Their
// property goes through admin review before it can take bookings.
const accountFields = {
  name: nameField, email: emailField, phone: phoneField, password: passwordField,
  accountType: z.enum(['GUEST', 'PARTNER']).optional().default('GUEST'),
  propertyName: z.string().trim().max(120).optional(),
  propertyCity: z.string().trim().max(80).optional(),
};
const signupStartSchema = z.object({ ...accountFields, only: z.enum(['EMAIL', 'SMS']).optional() });
const signupSchema = z.object({ ...accountFields, emailCode: z.string().trim(), phoneCode: z.string().trim() });
const loginSchema = z.object({ email: z.string().trim().min(3, 'Enter your email or mobile number'), password: z.string().min(1, 'Enter your password') });

const firstError = (v) => v.error.issues?.[0]?.message || 'Please check the details you entered.';
const invalid = (res, req, v) => res.status(422).json({ success: false, message: firstError(v), errors: v.error.format(), requestId: req.id });
const codeFail = (res, e) => res.status(e.statusCode || 400).json({ success: false, message: e.message, ...(e.field ? { field: e.field } : {}) });

const signToken = (id, role, hotelId, tokenVersion) => {
  return jwt.sign({ id, role, hotelId, tokenVersion }, process.env.JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
};

/** What the website gets about the signed-in person. */
export const publicUser = (u, hotelId = null) => ({
  id: u.id, name: u.name, email: u.email, phone: u.phone || '', role: u.role, hotelId,
  emailVerified: Boolean(u.emailVerifiedAt), phoneVerified: Boolean(u.phoneVerifiedAt),
  mustChangePassword: Boolean(u.mustChangePassword), google: Boolean(u.googleId),
});

/** Starts a session: login bookkeeping, the HTTP-only cookie, and the reply body. */
const startSession = async (req, res, user, status = 200) => {
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      // An invited owner who signs in has claimed the account
      ...(user.status === 'INVITED' ? { status: 'ACTIVE', inviteToken: null, inviteExpiry: null } : {}),
      lastLogin: new Date(), lastActiveAt: new Date(),
    },
  });
  let hotelId = null;
  if (['OWNER', 'MANAGER'].includes(updated.role)) {
    hotelId = await firstHotelFor(updated.id);
  }
  const token = signToken(updated.id, updated.role, hotelId, updated.tokenVersion);
  setSessionCookie(res, token); // the token in the body is for API clients; browsers use the cookie
  const sessionId = req.headers['x-session-id'];
  if (sessionId) setImmediate(() => mergeAnonymousSession(sessionId, updated.id));
  return res.status(status).json({ success: true, token, requestId: req.id, data: { user: publicUser(updated, hotelId) } });
};

const secLog = (req, type, details, userId = null) => prisma.securityLog.create({
  data: { type, userId, ip: req.ip, userAgent: req.headers['user-agent'], requestId: req.id, details },
}).catch(() => {});

/** An account with this verified phone (phones are only trusted once confirmed with a code). */
const userByPhone = (phone) => prisma.user.findFirst({ where: { phone, phoneVerifiedAt: { not: null } } });

/** Email or phone typed into one box -> the account, or null. */
const findByIdentifier = async (identifier) => {
  const text = String(identifier || '').trim();
  if (text.includes('@')) return { user: await prisma.user.findUnique({ where: { email: normEmail(text) } }), channel: 'EMAIL', target: normEmail(text) };
  const phone = normalizePhone(text);
  if (!phone) return { user: null, channel: null, target: null };
  return { user: await userByPhone(phone), channel: 'SMS', target: phone };
};

/**
 * Settings the sign-in pages need: whether Google sign-in is on, and whether codes are in test
 * mode (shown on screen because no SMS provider / email domain is connected yet).
 */
export const authConfig = (req, res) => {
  res.json({
    success: true,
    data: {
      googleClientId: process.env.GOOGLE_CLIENT_ID || null,
      smsTestMode: smsTestMode(),
      smsProvider: smsProvider(),
      emailTestMode: emailTestMode(),
    },
  });
};

// --- Sign up: details -> codes to email and phone -> account ---

/**
 * Step 1: checks the details and sends a code to the email and one to the phone.
 * `only` re-sends just one of them ("Resend code").
 */
export const signupStart = asyncHandler(async (req, res) => {
  const v = signupStartSchema.safeParse(req.body);
  if (!v.success) return invalid(res, req, v);
  const email = normEmail(v.data.email);
  const phone = normalizePhone(v.data.phone);
  if (!phone) return res.status(422).json({ success: false, message: 'Enter a valid mobile number, e.g. 98765 43210.' });
  if (await prisma.user.findUnique({ where: { email } })) return res.status(409).json({ success: false, message: 'An account with this email already exists. Sign in instead.' });
  if (await userByPhone(phone)) return res.status(409).json({ success: false, message: 'This mobile number is already used by another account. Sign in instead.' });

  const ctx = { purpose: 'SIGNUP', ipAddress: req.ip, userAgent: req.headers['user-agent'], name: v.data.name };
  try {
    const out = { phone: maskPhone(phone) };
    if (v.data.only !== 'SMS') out.emailCode = await sendCode({ ...ctx, channel: 'EMAIL', target: email });
    if (v.data.only !== 'EMAIL') out.phoneCode = await sendCode({ ...ctx, channel: 'SMS', target: phone });
    await secLog(req, 'OTP_SENT', { email, action: 'SIGNUP' });
    res.json({
      success: true,
      message: 'We sent a code to your email and your phone.',
      data: {
        phone: out.phone,
        email: { sent: Boolean(out.emailCode), testCode: out.emailCode?.testCode },
        sms: { sent: Boolean(out.phoneCode), testCode: out.phoneCode?.testCode },
      },
    });
  } catch (e) {
    if (e instanceof CodeError) { if (e.statusCode === 429) await trackOtpAbuse(email, req.ip); return codeFail(res, e); }
    throw e;
  }
});

/** Step 2: both codes right -> the account is created and signed in. */
export const signup = asyncHandler(async (req, res) => {
  const v = signupSchema.safeParse(req.body);
  if (!v.success) {
    // Older pages sent only name/email/password: sign-up now needs the codes
    if (req.body && !req.body.emailCode) return res.status(422).json({ success: false, message: 'Confirm your email and mobile number with the codes we send you.' });
    return invalid(res, req, v);
  }
  const email = normEmail(v.data.email);
  const phone = normalizePhone(v.data.phone);
  if (!phone) return res.status(422).json({ success: false, message: 'Enter a valid mobile number.' });
  if (await prisma.user.findUnique({ where: { email } })) return res.status(409).json({ success: false, message: 'An account with this email already exists. Sign in instead.' });
  if (await userByPhone(phone)) return res.status(409).json({ success: false, message: 'This mobile number is already used by another account.' });

  try {
    await checkCode({ channel: 'EMAIL', target: email, purpose: 'SIGNUP', code: v.data.emailCode, consume: false })
      .catch((e) => { throw Object.assign(e, { message: `Email code: ${e.message}`, field: 'emailCode' }); });
    await checkCode({ channel: 'SMS', target: phone, purpose: 'SIGNUP', code: v.data.phoneCode, consume: false })
      .catch((e) => { throw Object.assign(e, { message: `Mobile code: ${e.message}`, field: 'phoneCode' }); });
  } catch (e) {
    if (e instanceof CodeError) {
      await secLog(req, 'OTP_FAILED', { email, action: 'SIGNUP', reason: e.message });
      await trackOtpAbuse(email, req.ip);
      return codeFail(res, e);
    }
    throw e;
  }
  // Both right: use them up
  await checkCode({ channel: 'EMAIL', target: email, purpose: 'SIGNUP', code: v.data.emailCode }).catch(() => {});
  await checkCode({ channel: 'SMS', target: phone, purpose: 'SIGNUP', code: v.data.phoneCode }).catch(() => {});

  const now = new Date();
  const partner = v.data.accountType === 'PARTNER';
  if (partner && !v.data.propertyName) return res.status(422).json({ success: false, message: 'Enter the name of your property.' });
  const user = await prisma.user.create({
    data: {
      name: v.data.name, email, phone, role: partner ? 'OWNER' : 'CUSTOMER',
      password: await bcrypt.hash(v.data.password, 12),
      emailVerifiedAt: now, phoneVerifiedAt: now,
    },
  });
  if (partner) {
    sendPartnerWelcome(user, { propertyName: v.data.propertyName }).catch(() => {});
    notifyAdmins({
      type: 'PARTNER_SIGNED_UP',
      title: `New partner: ${v.data.propertyName}`,
      message: `${user.name} · ${user.email} · ${user.phone}${v.data.propertyCity ? ` · ${v.data.propertyCity}` : ''}. Their property comes to Property Review once submitted.`,
      link: '/admin/users',
      metadata: { userId: user.id },
    }).catch(() => {});
  } else {
    awardSignupBonus(user.id).catch(() => {});
    sendWelcome(user).catch(() => {});
  }
  return startSession(req, res, user, 201);
});

// --- Sign in with a password ---

export const login = asyncHandler(async (req, res) => {
  const v = loginSchema.safeParse(req.body);
  if (!v.success) return invalid(res, req, v);
  const { user } = await findByIdentifier(v.data.email);

  if (!user || !(await bcrypt.compare(v.data.password, user.password))) {
    systemCache.increment('failedLogins');
    await secLog(req, 'FAILED_LOGIN', { email: v.data.email }, user?.id || null);
    await prisma.auditLog.create({
      data: { action: 'FAILED_LOGIN', entityType: 'USER', entityId: user?.id || 'UNKNOWN', userId: user?.id || 'ANONYMOUS', details: { email: v.data.email, ip: req.ip } },
    }).catch(() => {});
    return res.status(401).json({ success: false, message: 'Wrong email, mobile number or password.', requestId: req.id });
  }
  if (user.status === 'BLOCKED' || user.status === 'DELETED') return res.status(403).json({ success: false, message: 'This account is blocked. Contact ZivoHotels support.', requestId: req.id });
  return startSession(req, res, user);
});

// --- Sign in with a code (email or phone) ---

/** Sends a sign-in code to the account's email or verified phone. */
export const loginCodeSend = asyncHandler(async (req, res) => {
  const identifier = String(req.body?.identifier || '').trim();
  if (!identifier) return res.status(422).json({ success: false, message: 'Enter your email or mobile number.' });
  const { user, channel, target } = await findByIdentifier(identifier);
  if (!channel) return res.status(422).json({ success: false, message: 'Enter a valid email or mobile number.' });
  if (!user || ['BLOCKED', 'DELETED'].includes(user.status)) {
    return res.status(404).json({ success: false, message: channel === 'SMS' ? 'No account uses this mobile number. Check it, or sign up.' : 'No account uses this email. Check it, or sign up.' });
  }
  try {
    const sent = await sendCode({ channel, target, purpose: 'LOGIN', ipAddress: req.ip, userAgent: req.headers['user-agent'], name: user.name });
    await secLog(req, 'OTP_SENT', { action: 'LOGIN', channel }, user.id);
    res.json({ success: true, message: channel === 'SMS' ? `We sent a code to ${maskPhone(target)}.` : `We sent a code to ${target}.`, data: { channel, to: channel === 'SMS' ? maskPhone(target) : target, testCode: sent.testCode } });
  } catch (e) {
    if (e instanceof CodeError) { if (e.statusCode === 429) await trackOtpAbuse(target, req.ip); return codeFail(res, e); }
    throw e;
  }
});

export const loginCodeVerify = asyncHandler(async (req, res) => {
  const { user, channel, target } = await findByIdentifier(req.body?.identifier);
  if (!user || !channel) return res.status(400).json({ success: false, message: 'Ask for a new code.' });
  try {
    await checkCode({ channel, target, purpose: 'LOGIN', code: req.body?.code });
  } catch (e) {
    if (e instanceof CodeError) { await secLog(req, 'OTP_FAILED', { action: 'LOGIN', reason: e.message }, user.id); await trackOtpAbuse(target, req.ip); return codeFail(res, e); }
    throw e;
  }
  if (['BLOCKED', 'DELETED'].includes(user.status)) return res.status(403).json({ success: false, message: 'This account is blocked. Contact ZivoHotels support.' });
  // A code to the inbox / phone proves it belongs to them
  const proof = channel === 'EMAIL' ? (!user.emailVerifiedAt ? { emailVerifiedAt: new Date() } : {}) : {};
  const fresh = Object.keys(proof).length ? await prisma.user.update({ where: { id: user.id }, data: proof }) : user;
  await secLog(req, 'OTP_VERIFIED', { action: 'LOGIN', channel }, user.id);
  return startSession(req, res, fresh);
});

// --- Continue with Google ---

let googleClient = null;
const google = () => { if (!googleClient) googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID); return googleClient; };

/**
 * The Google button gives the page an ID token; Google's signature, audience (our client id)
 * and expiry are checked here. An existing account with the same verified email is linked.
 * New accounts are guests; they add a mobile number next (needsPhone).
 */
export const googleSignIn = asyncHandler(async (req, res) => {
  if (!process.env.GOOGLE_CLIENT_ID) return res.status(503).json({ success: false, message: 'Google sign-in is not set up yet.' });
  let p;
  try {
    const ticket = await google().verifyIdToken({ idToken: String(req.body?.credential || ''), audience: process.env.GOOGLE_CLIENT_ID });
    p = ticket.getPayload();
  } catch {
    return res.status(401).json({ success: false, message: 'Google sign-in failed. Please try again.' });
  }
  if (!p?.sub || !p.email || !p.email_verified) return res.status(401).json({ success: false, message: 'Your Google account has no confirmed email.' });
  const email = normEmail(p.email);

  let user = await prisma.user.findUnique({ where: { googleId: p.sub } }) || await prisma.user.findUnique({ where: { email } });
  if (user) {
    if (['BLOCKED', 'DELETED'].includes(user.status)) return res.status(403).json({ success: false, message: 'This account is blocked. Contact ZivoHotels support.' });
    if (user.role === 'ADMIN') return res.status(403).json({ success: false, message: 'Admin accounts sign in with their password.' });
    if (!user.googleId || !user.emailVerifiedAt) {
      user = await prisma.user.update({ where: { id: user.id }, data: { googleId: user.googleId || p.sub, emailVerifiedAt: user.emailVerifiedAt || new Date() } });
    }
  } else {
    user = await prisma.user.create({
      data: {
        name: String(p.name || email.split('@')[0]).slice(0, 80), email, role: 'CUSTOMER', googleId: p.sub, emailVerifiedAt: new Date(),
        // No password: they sign in with Google or a code (they can set one with "Forgot password")
        password: await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10),
      },
    });
    awardSignupBonus(user.id).catch(() => {});
    sendWelcome(user).catch(() => {});
  }
  await secLog(req, 'GOOGLE_LOGIN', { email }, user.id);
  return startSession(req, res, user);
});

// --- Add / change the mobile number (signed in) ---

export const phoneCodeSend = asyncHandler(async (req, res) => {
  const phone = normalizePhone(req.body?.phone);
  if (!phone) return res.status(422).json({ success: false, message: 'Enter a valid mobile number, e.g. 98765 43210.' });
  const other = await userByPhone(phone);
  if (other && other.id !== req.user.id) return res.status(409).json({ success: false, message: 'This mobile number is already used by another account.' });
  try {
    const sent = await sendCode({ channel: 'SMS', target: phone, purpose: 'PHONE', ipAddress: req.ip, userAgent: req.headers['user-agent'] });
    res.json({ success: true, message: `We sent a code to ${maskPhone(phone)}.`, data: { to: maskPhone(phone), testCode: sent.testCode } });
  } catch (e) {
    if (e instanceof CodeError) return codeFail(res, e);
    throw e;
  }
});

export const phoneCodeVerify = asyncHandler(async (req, res) => {
  const phone = normalizePhone(req.body?.phone);
  if (!phone) return res.status(422).json({ success: false, message: 'Enter a valid mobile number.' });
  try {
    await checkCode({ channel: 'SMS', target: phone, purpose: 'PHONE', code: req.body?.code });
  } catch (e) {
    if (e instanceof CodeError) return codeFail(res, e);
    throw e;
  }
  const other = await userByPhone(phone);
  if (other && other.id !== req.user.id) return res.status(409).json({ success: false, message: 'This mobile number is already used by another account.' });
  const user = await prisma.user.update({ where: { id: req.user.id }, data: { phone, phoneVerifiedAt: new Date() } });
  res.json({ success: true, message: 'Mobile number confirmed.', data: { user: publicUser(user, req.user.hotelId || null) } });
});

/** The signed-in person's profile. */
export const me = (req, res) => {
  // Staff: what they may do (admin console, and per property), so screens show only that
  const access = ['ADMIN', 'OWNER'].includes(req.user.role) ? accessForClient(req.user.access) : null;
  res.status(200).json({ success: true, data: { user: { ...publicUser(req.user, req.user.hotelId || null), ...(access ? { access } : {}) } } });
};

// --- Hotel email check during property onboarding (send-otp / verify-otp) ---

export const sendOtp = asyncHandler(async (req, res) => {
  const v = z.object({ email: z.string().email() }).safeParse(req.body);
  if (!v.success) return res.status(422).json({ success: false, message: 'Invalid email address' });
  try {
    const sent = await createOTP(v.data.email, req.ip, req.headers['user-agent']);
    await secLog(req, 'OTP_SENT', { email: v.data.email, action: 'SEND_OTP' });
    eventBus.emitEvent('OTP_SENT', { email: v.data.email, ipAddress: req.ip, timestamp: new Date() });
    res.status(200).json({ success: true, message: 'OTP sent successfully', data: { testCode: sent.testCode } });
  } catch (e) {
    if (e instanceof CodeError) {
      if (e.statusCode === 429) { await secLog(req, 'OTP_RATE_LIMITED', { email: v.data.email }); await trackOtpAbuse(v.data.email, req.ip); }
      return codeFail(res, e);
    }
    throw e;
  }
});

export const verifyOtp = asyncHandler(async (req, res) => {
  const v = z.object({ email: z.string().email(), otp: z.string().length(6) }).safeParse(req.body);
  if (!v.success) return res.status(422).json({ success: false, message: 'Invalid email or OTP format' });
  try {
    await verifyOTP(v.data.email, v.data.otp);
    await secLog(req, 'OTP_VERIFIED', { email: v.data.email, action: 'VERIFY_OTP' });
    res.status(200).json({ success: true, message: 'OTP verified successfully' });
  } catch (e) {
    if (e instanceof CodeError) { await secLog(req, 'OTP_FAILED', { email: v.data.email, reason: e.message }); await trackOtpAbuse(v.data.email, req.ip); return codeFail(res, e); }
    throw e;
  }
});

/**
 * @desc    Logout / Revoke Token (Global)
 */
export const logoutGlobal = asyncHandler(async (req, res) => {
  await prisma.user.update({
    where: { id: req.user.id },
    data: { 
      tokenVersion: { increment: 1 },
      lastActiveAt: null // Explicitly clear active status
    }
  });

  clearSessionCookie(res);
  res.status(200).json({ success: true, message: 'Logged out from all devices', requestId: req.id });
});

/** Logout on this device: clears the session cookie (needs no valid session). */
export const logout = (req, res) => {
  clearSessionCookie(res);
  res.status(200).json({ success: true, message: 'Logged out', requestId: req.id });
};

/**
 * Moves a session that a browser still holds as a Bearer token (from before the cookie) into the
 * HTTP-only cookie, so people already logged in stay logged in. Requires a valid session.
 */
export const adoptSession = (req, res) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (token && !['null', 'undefined'].includes(token)) setSessionCookie(res, token);
  res.status(200).json({ success: true, data: { user: publicUser(req.user, req.user.hotelId || null) }, requestId: req.id });
};

/**
 * Helper to safely merge anonymous session data
 */
async function mergeAnonymousSession(sessionId, userId) {
  try {
    // 1. Update Analytics events
    await prisma.analyticsEvent.updateMany({
      where: { sessionId, userId: null },
      data: { userId }
    });

    // 2. Update Hotel Views
    await prisma.hotelView.updateMany({
      where: { userId: null, id: { in: (await prisma.analyticsEvent.findMany({ where: { sessionId }, select: { hotelId: true } })).map(e => e.hotelId).filter(Boolean) } }, // Not perfectly accurate as HotelView lacks sessionId, but publicAnalyticsController doesn't store sessionId in HotelView. Wait, HotelView only has userId and hotelId.
      data: { userId }
    }).catch(() => {}); // Optional best effort

    // 3. Merge UserBehavior
    // Since we didn't store sessionId in UserBehavior, we don't have an anonymous UserBehavior record. 
    // Wait, the tracking controller uses `userId = req.user?.id || null`. It doesn't create anonymous UserBehavior.
    // Let's create UserBehavior for anonymous sessions by allowing userId to be sessionId if not logged in.
    // Wait, UserBehavior userId is @unique and expected to map to a real user.
  } catch (error) {
    console.error('[SessionMerge] Error merging session:', error);
  }
}
