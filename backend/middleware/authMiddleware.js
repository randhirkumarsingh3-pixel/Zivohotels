import jwt from 'jsonwebtoken';
import prisma from '../config/db.js';
import systemCache from '../utils/systemCache.js';
import { requestToken } from '../utils/sessionCookie.js';
import { isAllowedOrigin as isConfiguredOrigin } from '../config/origins.js';

// The page's own address (same-origin requests), or one of the configured site addresses
const isAllowedOrigin = (origin, req) => {
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  try { if (new URL(origin).host === host) return true; } catch { return false; }
  return isConfiguredOrigin(origin);
};

// Protect routes - Ensure user is logged in
export const protect = async (req, res, next) => {
  try {
    // 1. IP Blacklist check (Fastest)
    if (systemCache.isIpBlocked(req.ip)) {
      return res.status(403).json({ success: false, message: 'Access denied: Your IP is blacklisted.' });
    }

    // The session cookie (HTTP-only) or a Bearer header
    const { token, viaCookie } = requestToken(req);

    if (!token) {
      return res.status(401).json({ success: false, message: 'Not authorized: No token provided' });
    }

    // Signed in by cookie: a change (POST, PUT…) must come from our own site. SameSite already keeps
    // the cookie off other sites' requests; this also refuses one that names another origin.
    if (viaCookie && !['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.headers.origin && !isAllowedOrigin(req.headers.origin, req)) {
      return res.status(403).json({ success: false, message: 'Request refused: it did not come from ZivoHotels.' });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });

    // Check if user still exists & check token version
    const currentUser = await prisma.user.findUnique({ where: { id: decoded.id } });
    
    if (!currentUser) {
      return res.status(401).json({ success: false, message: 'User no longer exists' });
    }

    // A blocked or deleted account is signed out everywhere, not just refused at the next login
    if (currentUser.status === 'BLOCKED' || currentUser.status === 'DELETED') {
      return res.status(401).json({ success: false, message: 'This account is not active' });
    }

    // JWT Hardening: Check if token version matches (Revocation support)
    // Tokens issued before versioning carry no tokenVersion: treat them as version 1 (the
    // schema default) so they stop working once the user's tokenVersion is bumped
    // (logout-everywhere / password change), instead of skipping the check entirely.
    if ((decoded.tokenVersion ?? 1) !== currentUser.tokenVersion) {
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
    // Never expose credential fields downstream (e.g. GET /auth/me returns req.user).
    const { password: _password, ...safeUser } = currentUser;
    req.user = { ...safeUser, hotelId: decoded.hotelId };
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
      }).catch(err => console.error('Failed to create audit log:', err));

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
    const { token } = requestToken(req);

    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
      // We don't fetch full user to save DB calls, just attach ID and role
      req.user = { id: decoded.id, role: decoded.role };
    }
  } catch (error) {
    // Ignore invalid tokens for soft-auth
  }
  next();
};
