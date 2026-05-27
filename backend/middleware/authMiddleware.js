import jwt from 'jsonwebtoken';
import prisma from '../config/db.js';
import systemCache from '../utils/systemCache.js';

// Protect routes - Ensure user is logged in
export const protect = async (req, res, next) => {
  try {
    // 1. IP Blacklist check (Fastest)
    if (systemCache.isIpBlocked(req.ip)) {
      return res.status(403).json({ success: false, message: 'Access denied: Your IP is blacklisted.' });
    }

    let token;
    
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({ success: false, message: 'Not authorized: No token provided' });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Check if user still exists & check token version
    const currentUser = await prisma.user.findUnique({ where: { id: decoded.id } });
    
    if (!currentUser) {
      return res.status(401).json({ success: false, message: 'User no longer exists' });
    }

    // JWT Hardening: Check if token version matches (Revocation support)
    if (decoded.tokenVersion !== undefined && currentUser.tokenVersion !== decoded.tokenVersion) {
      // Security Log for token abuse
      await prisma.securityLog.create({
        data: {
          type: 'TOKEN_MISMATCH',
          userId: currentUser.id,
          ip: req.ip,
          userAgent: req.headers['user-agent'],
          requestId: req.id,
          details: { reason: 'stale token used' }
        }
      }).catch(err => console.error('Failed to create security log:', err));

      return res.status(401).json({ success: false, message: 'Session expired. Please log in again.' });
    }

    // Grant access
    req.user = { ...currentUser, hotelId: decoded.hotelId };
    next();
  } catch (error) {
    console.error('Auth Error:', error.message);
    res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
};

// RBAC Middleware - Ensure user has correct role
export const authorizeRoles = (...roles) => {
  return async (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      // 1. Update system stats
      systemCache.increment('forbiddenAccess');

      // 2. Security Log
      await prisma.securityLog.create({
        data: {
          type: 'FORBIDDEN_ACCESS',
          userId: req.user.id,
          ip: req.ip,
          userAgent: req.headers['user-agent'],
          requestId: req.id,
          details: { endpoint: req.originalUrl, requiredRoles: roles }
        }
      }).catch(err => console.error('Failed to create security log:', err));

      // 3. Audit Log
      await prisma.auditLog.create({
        data: {
          action: 'FORBIDDEN_ACCESS_ATTEMPT',
          entityType: 'API_ROUTE',
          entityId: req.originalUrl,
          userId: req.user.id,
          details: { requiredRoles: roles, userRole: req.user.role, ip: req.ip }
        }
      });

      return res.status(403).json({ 
        success: false, 
        message: 'Forbidden: You do not have permission to access this resource' 
      });
    }
    next();
  };
};

// Soft-auth middleware - extracts user ID if token exists, but doesn't block if missing
export const extractUser = async (req, res, next) => {
  try {
    let token;
    
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      // We don't fetch full user to save DB calls, just attach ID and role
      req.user = { id: decoded.id, role: decoded.role };
    }
  } catch (error) {
    // Ignore invalid tokens for soft-auth
  }
  next();
};
