import prisma from '../config/db.js';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { z } from 'zod';

// --- HELPERS ---

const isStrongPassword = (pw) => {
  if (!pw || pw.length < 8) return false;
  if (!/[a-zA-Z]/.test(pw)) return false;
  if (!/[0-9]/.test(pw))   return false;
  return true;
};

const generateInviteToken = () => {
  const raw = crypto.randomBytes(32).toString('hex');
  const hashed = crypto.createHash('sha256').update(raw).digest('hex');
  return { raw, hashed };
};

const buildInviteLink = (token) => {
  const base = process.env.FRONTEND_URL || 'http://localhost:5173';
  return `${base}/accept-invite?token=${token}`;
};

// --- SCHEMAS ---

const userQuerySchema = z.object({
  role: z.enum(['CUSTOMER', 'OWNER', 'ADMIN']).optional(),
  status: z.enum(['ACTIVE', 'INVITED', 'BLOCKED', 'DELETED']).optional(),
  search: z.string().optional(),
  page: z.preprocess((val) => parseInt(val), z.number().int().min(1).default(1)),
  limit: z.preprocess((val) => parseInt(val), z.number().int().min(1).max(100).default(10)),
  propertyId: z.string().uuid().optional()
});

// --- CONTROLLERS ---

export const getUsers = asyncHandler(async (req, res) => {
  const validation = userQuerySchema.safeParse(req.query);
  if (!validation.success) {
    return res.status(422).json({ success: false, message: 'Invalid query parameters', errors: validation.error.format(), requestId: req.id });
  }

  const { role, status, search, page, limit, propertyId } = validation.data;
  const skip = (page - 1) * limit;

  const where = {
    status: status ? status : { not: 'DELETED' },
    ...(role ? { role } : {}),
    ...(search ? {
      OR: [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } }
      ]
    } : {}),
    ...(propertyId && role === 'OWNER' ? { ownerProperties: { some: { hotelId: propertyId } } } : {})
  };

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, name: true, email: true, phone: true, role: true, status: true, 
        mustChangePassword: true, createdAt: true, lastLogin: true, lastActiveAt: true,
        ...(role === 'CUSTOMER' && { _count: { select: { bookings: true } }, loyalty: true }),
        ...(role === 'OWNER' && { hotels: { select: { id: true, name: true } } }),
      }
    }),
    prisma.user.count({ where })
  ]);

  // Enrich customers with total spend (N+1 queries but localized for small page size)
  if (role === 'CUSTOMER') {
    for (const user of users) {
      const agg = await prisma.booking.aggregate({
        where: { userId: user.id, status: { in: ['CONFIRMED', 'COMPLETED'] } },
        _sum: { totalAmount: true }
      });
      user.totalSpend = agg._sum.totalAmount || 0;
    }
  }

  res.status(200).json({ 
    success: true, 
    data: users, 
    meta: { total, page, limit, totalPages: Math.ceil(total / limit) }, 
    requestId: req.id 
  });
});

export const updateUserStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!['ACTIVE', 'BLOCKED', 'DELETED'].includes(status)) {
    return res.status(422).json({ success: false, message: 'Invalid status', requestId: req.id });
  }

  const user = await prisma.user.update({
    where: { id },
    data: { status }
  });

  await prisma.auditLog.create({
    data: {
      action: 'UPDATE_USER_STATUS',
      entityType: 'USER',
      entityId: id,
      userId: req.user.id,
      requestId: req.id,
      details: { status }
    }
  });

  res.status(200).json({ success: true, data: user, requestId: req.id });
});

export const addUser = asyncHandler(async (req, res) => {
  const { name, email, password, role, phone } = req.body;

  if (!email || !password || !name) {
    return res.status(422).json({ success: false, message: 'Name, email and password are required', requestId: req.id });
  }

  if (!isStrongPassword(password)) {
    return res.status(422).json({ success: false, message: 'Password too weak', requestId: req.id });
  }

  const exists = await prisma.user.findUnique({ where: { email } });
  if (exists) {
    return res.status(409).json({ success: false, message: 'Email already exists', requestId: req.id });
  }

  const hashed = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: {
      name, email, phone, role: role || 'CUSTOMER',
      password: hashed,
      status: 'ACTIVE',
      mustChangePassword: true
    }
  });

  await prisma.auditLog.create({
    data: { action: 'ADD_USER', entityType: 'USER', entityId: user.id, userId: req.user.id, requestId: req.id }
  });

  res.status(201).json({ success: true, data: user, requestId: req.id });
});

export const inviteUser = asyncHandler(async (req, res) => {
  const { name, email, role, propertyId } = req.body;

  if (!email) {
    return res.status(422).json({ success: false, message: 'Email is required', requestId: req.id });
  }

  const exists = await prisma.user.findUnique({ where: { email } });
  if (exists) {
    return res.status(409).json({ success: false, message: 'Email already exists', requestId: req.id });
  }

  const { raw, hashed } = generateInviteToken();
  const expiry = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const placeholderHash = await bcrypt.hash(crypto.randomBytes(16).toString('hex'), 10);

  const user = await prisma.user.create({
    data: {
      name: name || email.split('@')[0],
      email,
      role: role || 'CUSTOMER',
      password: placeholderHash,
      status: 'INVITED',
      inviteToken: hashed,
      inviteExpiry: expiry,
      mustChangePassword: true
    }
  });

  if (role === 'OWNER' && propertyId) {
    await prisma.ownerProperty.create({
      data: { userId: user.id, hotelId: propertyId }
    }).catch(() => {});
  }

  const inviteLink = buildInviteLink(raw);
  if (process.env.NODE_ENV === 'development') {
    console.log(`\n🔗 [INVITE LINK]: ${inviteLink}\n`);
  }

  await prisma.auditLog.create({
    data: { action: 'INVITE_USER', entityType: 'USER', entityId: user.id, userId: req.user.id, requestId: req.id }
  });

  res.status(201).json({
    success: true,
    data: user,
    ...(process.env.NODE_ENV === 'development' && { inviteLink }),
    requestId: req.id
  });
});

export const acceptInvite = asyncHandler(async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) {
    return res.status(422).json({ success: false, message: 'Token and password required', requestId: req.id });
  }

  const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
  const user = await prisma.user.findFirst({
    where: { inviteToken: hashedToken, inviteExpiry: { gt: new Date() }, status: 'INVITED' }
  });

  if (!user) {
    return res.status(400).json({ success: false, message: 'Invalid or expired token', requestId: req.id });
  }

  const hashedPw = await bcrypt.hash(password, 12);
  await prisma.user.update({
    where: { id: user.id },
    data: { password: hashedPw, status: 'ACTIVE', inviteToken: null, inviteExpiry: null, mustChangePassword: false }
  });

  res.status(200).json({ success: true, message: 'Account activated', requestId: req.id });
});

export const resendInvite = asyncHandler(async (req, res) => {
  const { email } = req.body;
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user || user.status !== 'INVITED') {
    return res.status(400).json({ success: false, message: 'User not in invited state', requestId: req.id });
  }

  const { raw, hashed } = generateInviteToken();
  await prisma.user.update({
    where: { email },
    data: { inviteToken: hashed, inviteExpiry: new Date(Date.now() + 24 * 60 * 60 * 1000) }
  });

  const inviteLink = buildInviteLink(raw);
  res.status(200).json({ 
    success: true, 
    message: 'Invite resent', 
    ...(process.env.NODE_ENV === 'development' && { inviteLink }),
    requestId: req.id 
  });
});
