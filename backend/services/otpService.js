/**
 * One-time codes: 6 digits, sent by email or SMS, for one purpose each.
 *
 *  - SIGNUP: confirms the email and the phone of a new account
 *  - LOGIN:  "sign in with a code" (no password)
 *  - PHONE:  adds or changes the phone on an account (e.g. after "Continue with Google")
 *  - VERIFY: checks a hotel's email during property onboarding
 *
 * A code is valid for OTP_EXPIRY_MINUTES (10), allows 5 tries, and works once. At most 5 codes
 * per address per 15 minutes. Only a hash of the code is stored.
 *
 * Test mode (no real provider yet): the code is returned to the page and shown as
 * "Test mode: your code is …". SMS: while SMS_PROVIDER is unset or "test". Email: only when
 * EMAIL_TEST_MODE=true (e.g. staging before the Resend domain is verified). Never set it live.
 */
import crypto from 'crypto';
import bcrypt from '../utils/bcrypt.js';
import prisma from '../config/db.js';
import { sendOTPEmail } from './emailService.js';
import { sendSms, smsTestMode } from './smsService.js';

const OTP_EXPIRY_MINUTES = parseInt(process.env.OTP_EXPIRY_MINUTES || '10', 10);
export const MAX_CODES_PER_15_MIN = 5;
const MAX_TRIES = 5;
export const PURPOSES = ['SIGNUP', 'LOGIN', 'PHONE', 'VERIFY'];

export class CodeError extends Error {
  constructor(message, statusCode = 400, field = null) { super(message); this.statusCode = statusCode; this.field = field; }
}

export const emailTestMode = () => String(process.env.EMAIL_TEST_MODE || '').toLowerCase() === 'true';
export const isTestChannel = (channel) => (channel === 'SMS' ? smsTestMode() : emailTestMode());

export const generateOTP = () => {
  // Local development only: a fixed code (TEST_OTP). Ignored in production.
  if (process.env.TEST_OTP && process.env.NODE_ENV !== 'production') return String(process.env.TEST_OTP);
  return crypto.randomInt(100000, 1000000).toString();
};

const normEmail = (e) => String(e || '').trim().toLowerCase();

/**
 * Creates and sends a code. Returns { channel, expiresInMinutes, testCode? } — testCode only in
 * test mode for that channel, for the page to show.
 */
export const sendCode = async ({ channel = 'EMAIL', target, purpose = 'VERIFY', ipAddress, userAgent, name }) => {
  if (!PURPOSES.includes(purpose)) throw new CodeError('Unknown code purpose.');
  const to = channel === 'EMAIL' ? normEmail(target) : String(target || '');
  if (!to) throw new CodeError(channel === 'EMAIL' ? 'Enter your email address.' : 'Enter your mobile number.');

  const since = new Date(Date.now() - 15 * 60 * 1000);
  const recent = await prisma.emailOTP.count({ where: { email: to, createdAt: { gte: since } } });
  if (recent >= MAX_CODES_PER_15_MIN) throw new CodeError('Too many codes requested. Please try again in 15 minutes.', 429);

  // Only the newest code for this address and purpose works
  await prisma.emailOTP.updateMany({
    where: { email: to, purpose, verified: false, expiresAt: { gt: new Date() } },
    data: { expiresAt: new Date() },
  });

  const code = generateOTP();
  await prisma.emailOTP.create({
    data: {
      email: to, channel, purpose,
      otpHash: await bcrypt.hash(code, 10),
      expiresAt: new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000),
      ipAddress: ipAddress || null, userAgent: userAgent || null,
    },
  });

  const test = isTestChannel(channel);
  if (channel === 'SMS') {
    await sendSms(to, `${code} is your ZivoPlus code. It is valid for ${OTP_EXPIRY_MINUTES} minutes. Do not share it with anyone.`, { otp: code });
  } else if (!test) {
    await sendOTPEmail(to, code, OTP_EXPIRY_MINUTES, { purpose, name });
  }
  return { channel, expiresInMinutes: OTP_EXPIRY_MINUTES, ...(test ? { testCode: code } : {}) };
};

/**
 * Checks a code for an address and purpose. Throws CodeError when it's wrong, expired, used, or
 * tried too often. `consume` (default) marks it used.
 */
export const checkCode = async ({ channel = 'EMAIL', target, purpose = 'VERIFY', code, consume = true }) => {
  const to = channel === 'EMAIL' ? normEmail(target) : String(target || '');
  const otp = String(code || '').trim();
  if (!/^\d{6}$/.test(otp)) throw new CodeError('Enter the 6-digit code.');
  const record = await prisma.emailOTP.findFirst({ where: { email: to, purpose }, orderBy: { createdAt: 'desc' } });
  const where = channel === 'SMS' ? 'your phone' : 'your email';
  if (!record) throw new CodeError(`No code was sent to ${where}. Ask for a new one.`);
  if (record.verified) throw new CodeError('This code has already been used. Ask for a new one.');
  if (record.expiresAt < new Date()) throw new CodeError('This code has expired. Ask for a new one.', 410);
  if (record.attempts >= MAX_TRIES) throw new CodeError('Too many wrong tries. Ask for a new code.', 429);

  if (!(await bcrypt.compare(otp, record.otpHash))) {
    // Only wrong tries count
    await prisma.emailOTP.update({ where: { id: record.id }, data: { attempts: { increment: 1 } } });
    const left = MAX_TRIES - record.attempts - 1;
    throw new CodeError(left > 0 ? `That code is not right. ${left} ${left === 1 ? 'try' : 'tries'} left.` : 'Too many wrong tries. Ask for a new code.', left > 0 ? 400 : 429);
  }
  if (consume) await prisma.emailOTP.update({ where: { id: record.id }, data: { verified: true, verifiedAt: new Date() } });
  return true;
};

// Property onboarding (hotel email check) uses these two
export const createOTP = (email, ipAddress, userAgent) => sendCode({ channel: 'EMAIL', target: email, purpose: 'VERIFY', ipAddress, userAgent });
export const verifyOTP = (email, otp) => checkCode({ channel: 'EMAIL', target: email, purpose: 'VERIFY', code: otp });
