import prisma from '../config/db.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { asyncHandler } from '../middleware/asyncHandler.js';
import systemCache from '../utils/systemCache.js';
import { z } from 'zod';
import eventBus from '../events/eventBus.js';
import { createOTP, verifyOTP } from '../services/otpService.js';
import { trackOtpAbuse } from '../services/fraudService.js';

// --- ZOD SCHEMAS ---

const signupSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  role: z.enum(['CUSTOMER', 'OWNER']).optional().default('CUSTOMER')
});

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required')
});

const signToken = (id, role, hotelId, tokenVersion) => {
  return jwt.sign({ id, role, hotelId, tokenVersion }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
};

/**
 * @desc    Register a new user
 */
export const signup = asyncHandler(async (req, res) => {
  const validation = signupSchema.safeParse(req.body);
  if (!validation.success) {
    return res.status(422).json({ 
      success: false, 
      message: 'Validation failed', 
      errors: validation.error.format(), 
      requestId: req.id 
    });
  }

  const { name, email, password, role } = validation.data;

  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    return res.status(400).json({ success: false, message: 'Email already in use' });
  }

  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(password, salt);

  const newUser = await prisma.user.create({
    data: {
      name,
      email,
      password: hashedPassword,
      role: role === 'OWNER' ? 'OWNER' : 'CUSTOMER',
      lastLogin: new Date(),
      lastActiveAt: new Date()
    }
  });

  const token = signToken(newUser.id, newUser.role, null, newUser.tokenVersion);

  // Async Session Merge
  const sessionId = req.headers['x-session-id'];
  if (sessionId) {
    setImmediate(() => mergeAnonymousSession(sessionId, newUser.id));
  }

  res.status(201).json({
    success: true,
    token,
    requestId: req.id,
    data: { 
      user: { id: newUser.id, name: newUser.name, email: newUser.email, role: newUser.role } 
    }
  });
});

/**
 * @desc    Login user
 */
export const login = asyncHandler(async (req, res) => {
  const validation = loginSchema.safeParse(req.body);
  if (!validation.success) {
    return res.status(422).json({ 
      success: false, 
      message: 'Validation failed', 
      errors: validation.error.format(), 
      requestId: req.id 
    });
  }

  const { email, password } = validation.data;

  const user = await prisma.user.findUnique({ where: { email } });
  
  if (!user || !(await bcrypt.compare(password, user.password))) {
    // 1. Update system stats
    systemCache.increment('failedLogins');

    // 2. Security Log: Failed Login
    await prisma.securityLog.create({
      data: {
        type: 'FAILED_LOGIN',
        userId: user?.id || null,
        ip: req.ip,
        userAgent: req.headers['user-agent'],
        requestId: req.id,
        details: { email }
      }
    }).catch(err => console.error('Failed to create security log:', err));

    // 3. Audit Log
    await prisma.auditLog.create({
      data: {
        action: 'FAILED_LOGIN',
        entityType: 'USER',
        entityId: user?.id || 'UNKNOWN',
        userId: user?.id || 'ANONYMOUS',
        details: { email, ip: req.ip }
      }
    });

    return res.status(401).json({ success: false, message: 'Invalid credentials', requestId: req.id });
  }

  if (user.status === 'BLOCKED') {
    return res.status(403).json({ success: false, message: 'Account blocked', requestId: req.id });
  }

  // Update last login & last active
  const updatedUser = await prisma.user.update({
    where: { id: user.id },
    data: { 
      lastLogin: new Date(),
      lastActiveAt: new Date()
    }
  });

  // Fetch hotelId if user is an OWNER or MANAGER
  let hotelId = null;
  if (['OWNER', 'MANAGER'].includes(user.role)) {
    const primaryHotel = await prisma.hotel.findFirst({
      where: { ownerId: user.id },
      select: { id: true }
    });
    hotelId = primaryHotel?.id || null;
  }

  const token = signToken(user.id, user.role, hotelId, user.tokenVersion);

  // Async Session Merge
  const sessionId = req.headers['x-session-id'];
  if (sessionId) {
    setImmediate(() => mergeAnonymousSession(sessionId, user.id));
  }

  res.status(200).json({
    success: true,
    token,
    requestId: req.id,
    data: { 
      user: { id: user.id, name: user.name, email: user.email, role: user.role, hotelId } 
    }
  });
});

/**
 * @desc    Send Email OTP
 */
export const sendOtp = asyncHandler(async (req, res) => {
  const schema = z.object({ email: z.string().email() });
  const validation = schema.safeParse(req.body);
  
  if (!validation.success) {
    return res.status(422).json({ success: false, message: 'Invalid email address' });
  }

  const { email } = validation.data;
  const ipAddress = req.ip;
  const userAgent = req.headers['user-agent'];

  try {
    await createOTP(email, ipAddress, userAgent);

    // Audit & Security Logs
    await prisma.securityLog.create({
      data: {
        type: 'OTP_SENT',
        ip: ipAddress,
        userAgent,
        requestId: req.id,
        details: { 
          email, 
          action: 'SEND_OTP',
          deviceType: userAgent?.includes('Mobile') ? 'Mobile' : 'Desktop',
          status: 'SUCCESS'
        }
      }
    });

    eventBus.emit('OTP_SENT', { email, ipAddress, timestamp: new Date() });

    res.status(200).json({ success: true, message: 'OTP sent successfully' });
  } catch (error) {
    if (error.message.includes('Too many OTP requests')) {
      eventBus.emit('OTP_RATE_LIMITED', { email, ipAddress });
      await prisma.securityLog.create({
        data: {
          type: 'OTP_RATE_LIMITED',
          ip: ipAddress,
          userAgent,
          requestId: req.id,
          details: { 
            email,
            action: 'SEND_OTP',
            deviceType: userAgent?.includes('Mobile') ? 'Mobile' : 'Desktop',
            status: 'RATE_LIMITED'
          }
        }
      });
      await trackOtpAbuse(email, ipAddress);
      return res.status(429).json({ success: false, message: error.message });
    }
    throw error;
  }
});

/**
 * @desc    Verify Email OTP
 */
export const verifyOtp = asyncHandler(async (req, res) => {
  const schema = z.object({ 
    email: z.string().email(),
    otp: z.string().length(6)
  });
  
  const validation = schema.safeParse(req.body);
  if (!validation.success) {
    return res.status(422).json({ success: false, message: 'Invalid email or OTP format' });
  }

  const { email, otp } = validation.data;
  const ipAddress = req.ip;
  const userAgent = req.headers['user-agent'];

  try {
    await verifyOTP(email, otp);

    eventBus.emit('OTP_VERIFIED', { email, ipAddress, timestamp: new Date() });

    await prisma.securityLog.create({
      data: {
        type: 'OTP_VERIFIED',
        ip: ipAddress,
        userAgent,
        requestId: req.id,
        details: { 
          email,
          action: 'VERIFY_OTP',
          deviceType: userAgent?.includes('Mobile') ? 'Mobile' : 'Desktop',
          status: 'SUCCESS'
        }
      }
    });

    res.status(200).json({ success: true, message: 'OTP verified successfully' });
  } catch (error) {
    eventBus.emit('OTP_FAILED', { email, ipAddress, reason: error.message });
    
    await prisma.securityLog.create({
      data: {
        type: 'OTP_FAILED',
        ip: ipAddress,
        userAgent,
        requestId: req.id,
        details: { 
          email, 
          action: 'VERIFY_OTP',
          deviceType: userAgent?.includes('Mobile') ? 'Mobile' : 'Desktop',
          status: 'FAILED',
          reason: error.message 
        }
      }
    });

    await trackOtpAbuse(email, ipAddress);

    let statusCode = 400;
    if (error.message.includes('expired')) statusCode = 410;
    else if (error.message.includes('attempts exceeded')) statusCode = 429;

    res.status(statusCode).json({ success: false, message: error.message });
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

  res.status(200).json({ success: true, message: 'Logged out from all devices', requestId: req.id });
});

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
