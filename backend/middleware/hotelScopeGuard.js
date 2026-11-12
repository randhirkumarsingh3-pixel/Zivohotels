import prisma from '../config/db.js';

/**
 * Middleware to ensure the authenticated user owns or manages the requested hotel.
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

    // Fetch the user's allowed hotels
    // For OWNER role, it's properties they own. For MANAGER, it might be assigned.
    // Assuming simple mapping where user owns the hotel for now.
    const userWithHotels = await prisma.user.findUnique({
      where: { id: userId },
      include: { hotels: { select: { id: true, status: true, isDeleted: true } } }
    });

    if (!userWithHotels || !userWithHotels.hotels || userWithHotels.hotels.length === 0) {
      return res.status(403).json({ success: false, message: 'Forbidden: No properties associated with your account.' });
    }

    const validHotelIds = userWithHotels.hotels.filter(h => !h.isDeleted).map(h => h.id);

    let targetHotelId = requestedHotelId;

    // If no hotelId provided, but user has at least one hotel, auto-assign the first one
    if (!targetHotelId && validHotelIds.length > 0) {
      targetHotelId = validHotelIds[0];
    } else if (!targetHotelId) {
      // Every hotel on the account is deleted: same as having none (frontend -> onboarding)
      return res.status(403).json({ success: false, message: 'Forbidden: No active properties associated with your account.' });
    }

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

    // Pass the validated hotelId down the pipeline
    req.scopedHotelId = targetHotelId;
    next();
  } catch (error) {
    console.error('Scope Guard Error:', error);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
};
