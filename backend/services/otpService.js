import prisma from '../config/db.js';
import bcrypt from 'bcryptjs';
import { sendOTPEmail } from './emailService.js';
import crypto from 'crypto';

const OTP_EXPIRY_MINUTES = parseInt(process.env.OTP_EXPIRY_MINUTES || '10', 10);

/**
 * Generate a 6-digit numeric OTP
 */
export const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

/**
 * Check if the user is rate limited for sending OTPs
 * Rule: Max 3 requests per email per 15 mins
 */
export const checkRateLimits = async (email) => {
  const fifteenMinsAgo = new Date(Date.now() - 15 * 60 * 1000);
  
  const recentOtps = await prisma.emailOTP.count({
    where: {
      email,
      createdAt: { gte: fifteenMinsAgo }
    }
  });

  if (recentOtps >= 3) {
    throw new Error('Too many OTP requests. Please try again in 15 minutes.');
  }
};

/**
 * Invalidate previous active OTPs
 */
export const invalidateOTP = async (email) => {
  await prisma.emailOTP.updateMany({
    where: { 
      email, 
      verified: false,
      expiresAt: { gt: new Date() }
    },
    data: { 
      expiresAt: new Date() // Expire them immediately
    }
  });
};

/**
 * Create and send OTP
 */
export const createOTP = async (email, ipAddress, userAgent) => {
  await checkRateLimits(email);
  await invalidateOTP(email);

  const otp = generateOTP();
  const salt = await bcrypt.genSalt(10);
  const otpHash = await bcrypt.hash(otp, salt);

  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

  const newOtp = await prisma.emailOTP.create({
    data: {
      email,
      otpHash,
      expiresAt,
      ipAddress,
      userAgent
    }
  });

  await sendOTPEmail(email, otp, OTP_EXPIRY_MINUTES);
  
  return newOtp;
};

/**
 * Verify OTP
 */
export const verifyOTP = async (email, otp) => {
  // Find the latest active OTP
  const record = await prisma.emailOTP.findFirst({
    where: { email },
    orderBy: { createdAt: 'desc' }
  });

  if (!record) {
    throw new Error('No OTP found for this email.');
  }

  // 5 failed attempts locks OTP verification (for 15 minutes handled by rate limit or just expiry)
  // Actually, we can check attempts
  if (record.attempts >= 5) {
    throw new Error('Maximum verification attempts exceeded. Please request a new OTP.');
  }

  if (record.expiresAt < new Date()) {
    throw new Error('OTP has expired. Please request a new one.');
  }

  if (record.verified) {
    throw new Error('OTP has already been used.');
  }

  // Increment attempt
  await prisma.emailOTP.update({
    where: { id: record.id },
    data: { attempts: record.attempts + 1 }
  });

  const isMatch = await bcrypt.compare(otp, record.otpHash);
  
  if (!isMatch) {
    throw new Error('Invalid OTP code.');
  }

  // Mark as verified
  await prisma.emailOTP.update({
    where: { id: record.id },
    data: { 
      verified: true,
      verifiedAt: new Date()
    }
  });

  return true;
};
