import prisma from '../../config/db.js';
import { logActivity } from '../../services/activityService.js';
import { checkFeatureGate } from '../../services/featureGateService.js';

export const getPromotions = async (req, res) => {
  try {
    const hotelId = req.scopedHotelId;
    res.json({ success: true, data: [] });
  } catch (error) {
    console.error('Error fetching extranet promotions:', error);
    res.status(500).json({ success: false, message: 'Server error fetching promotions' });
  }
};

export const createPromotion = async (req, res) => {
  try {
    const hotelId = req.scopedHotelId;
    
    // Feature Gate: Prevent promotion creation if property is throttled or suspended
    const isPromoEnabled = await checkFeatureGate(hotelId, 'PROMOTIONS_ENGINE');
    if (!isPromoEnabled) {
      return res.status(403).json({ success: false, message: 'Promotions engine is currently disabled for this property.' });
    }

    const promoData = req.body;

    await logActivity({
      hotelId,
      userId: req.user.id,
      action: 'PROMOTION_CREATED',
      entityType: 'Promotion',
      entityId: 'NEW',
      details: promoData
    });

    res.json({ success: true, message: 'Promotion created successfully.' });
  } catch (error) {
    console.error('Error creating promotion:', error);
    res.status(500).json({ success: false, message: 'Server error creating promotion' });
  }
};
