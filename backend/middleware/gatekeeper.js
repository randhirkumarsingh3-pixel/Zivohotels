import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

/**
 * Gatekeeper Middleware
 * Enforces operational locks and feature access.
 */

export const checkChannelManagerLock = async (req, res, next) => {
  try {
    const hotelId = req.params.hotelId || req.body.hotelId || req.user.hotelId;
    
    if (!hotelId) {
      return res.status(400).json({ success: false, message: "Hotel Context required" });
    }

    const hotel = await prisma.hotel.findUnique({
      where: { id: hotelId },
      select: { integrationMode: true }
    });

    if (hotel?.integrationMode === 'CHANNEL_MANAGER') {
      return res.status(403).json({ 
        success: false, 
        message: "Action Locked: Property is currently managed via an external Channel Manager (STAAH/AxisRooms)." 
      });
    }

    next();
  } catch (error) {
    res.status(500).json({ success: false, message: "Gatekeeper error" });
  }
};

export const restrictToEntity = (paramName = 'hotelId') => {
  return (req, res, next) => {
    // Admin can access everything
    if (req.user.role === 'ADMIN') return next();

    const targetId = req.params[paramName] || req.body[paramName];
    
    if (targetId && targetId !== req.user.hotelId) {
      return res.status(403).json({ 
        success: false, 
        message: "Access Denied: Data isolation breach attempted." 
      });
    }

    next();
  };
};
