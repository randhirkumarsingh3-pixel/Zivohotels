import prisma from '../config/db.js';
import { canAtHotel } from '../services/accessService.js';

/**
 * Middleware to ensure the authenticated user owns the requested hotel or is on its team (with
 * the permission the request needs there).
 * Extract `hotelId` from req.params, req.query, or req.body, depending on the route.
 * If hotelId is not explicitly provided, it will check if the user has exactly one hotel
 * and implicitly scope to that.
 */
export const hotelScopeGuard = async (req, res, next) => {
  try {
    const requestedHotelId = req.params.hotelId || req.query.hotelId || req.body.hotelId || req.user.hotelId;
    const userId = req.user.id;

    // Admins usually own no hotels, so the ownership lookup below rejects them. When an admin
    // names a hotel explicitly they may act on it. Without a hotelId they fall through to the
    // normal owner logic, so the extranet keeps its existing behaviour (403 "no properties" ->
    // the frontend redirects to onboarding) instead of a 400 the frontend doesn't handle.
    if (req.user.role === 'ADMIN' && requestedHotelId) {
      const hotel = await prisma.hotel.findUnique({ where: { id: requestedHotelId }, select: { id: true, isDeleted: true } });
      if (!hotel || hotel.isDeleted) {
        return res.status(404).json({ success: false, message: 'Hotel not found.' });
      }
      req.scopedHotelId = hotel.id;
      return next();
    }

    // The properties this person may open: the ones they own, and the ones whose team they're on
    // (services/accessService.js). Owned first, then in name order for a stable default.
    const allowedIds = Object.keys(req.user.access?.hotels || {});
    const validHotels = allowedIds.length
      ? await prisma.hotel.findMany({ where: { id: { in: allowedIds }, isDeleted: false }, select: { id: true, ownerId: true }, orderBy: { name: 'asc' } })
      : [];
    if (!validHotels.length) {
      return res.status(403).json({ success: false, message: 'Forbidden: No properties associated with your account.' });
    }
    validHotels.sort((a, b) => Number(b.ownerId === userId) - Number(a.ownerId === userId));
    const validHotelIds = validHotels.map((h) => h.id);

    // No property named: the first one
    const targetHotelId = requestedHotelId || validHotelIds[0];

    // Verify scope
    if (!validHotelIds.includes(targetHotelId)) {
      // Security Log
      await prisma.securityLog.create({
        data: {
          type: 'SCOPE_VIOLATION_ATTEMPT',
          userId: userId,
          ip: req.ip,
          userAgent: req.headers['user-agent'],
          details: { requestedHotelId: targetHotelId, allowedHotels: validHotelIds }
        }
      });
      return res.status(403).json({ success: false, message: 'Forbidden: Cross-property data access denied.' });
    }

    // Their role at THIS property must allow what the request does (permissionGate only checked
    // that they have it somewhere)
    if (req.user.permission && !canAtHotel(req.user, targetHotelId, req.user.permission)) {
      return res.status(403).json({ success: false, code: 'NO_PERMISSION', message: 'Your role at this property doesn\'t allow this. Ask the owner for access.' });
    }

    // Pass the validated hotelId down the pipeline
    req.scopedHotelId = targetHotelId;
    next();
  } catch (error) {
    console.error('Scope Guard Error:', error);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
};
