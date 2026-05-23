import prisma from '../../config/db.js';
import { logActivity } from '../../services/activityService.js';
import { checkFeatureGate } from '../../services/featureGateService.js';

export const getProperty = async (req, res) => {
  try {
    const hotelId = req.scopedHotelId; // Injected by hotelScopeGuard

    const property = await prisma.hotel.findUnique({
      where: { id: hotelId },
      include: {
        media: true,
        cancellationPolicy: true,
      }
    });

    if (!property) {
      return res.status(404).json({ success: false, message: 'Property not found' });
    }

    res.json({ success: true, data: property });
  } catch (error) {
    console.error('Error fetching extranet property:', error);
    res.status(500).json({ success: false, message: 'Server error fetching property details' });
  }
};

export const updateProperty = async (req, res) => {
  try {
    const hotelId = req.scopedHotelId;
    const updateData = req.body;
    
    // Feature Gate: Check if property is in SAFE_MODE (throttled/locked)
    const isSafeMode = await checkFeatureGate(hotelId, 'SAFE_MODE');
    if (isSafeMode) {
      return res.status(403).json({ success: false, message: 'Property is in Safe Mode. Updates are temporarily locked.' });
    }

    // Prevent sensitive fields from being updated directly via extranet
    delete updateData.id;
    delete updateData.ownerId;
    delete updateData.status; // status changes (like ACTIVE -> SUSPENDED) are master admin only
    delete updateData.dynamicCommissionRate;
    delete updateData.healthScore;

    const before = await prisma.hotel.findUnique({ where: { id: hotelId } });

    const property = await prisma.hotel.update({
      where: { id: hotelId },
      data: updateData
    });

    await logActivity({
      hotelId,
      userId: req.user.id,
      action: 'PROPERTY_INFO_UPDATED',
      entityType: 'Hotel',
      entityId: hotelId,
      before,
      after: property
    });

    res.json({ success: true, data: property, message: 'Property details updated successfully.' });
  } catch (error) {
    console.error('Error updating extranet property:', error);
    res.status(500).json({ success: false, message: 'Server error updating property details' });
  }
};
