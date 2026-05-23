import prisma from '../config/db.js';
import systemCache from '../utils/systemCache.js';

/**
 * Feature Gate Engine to control operational capabilities centrally.
 */
export const checkFeatureGate = async (hotelId, featureKey) => {
  try {
    const cacheKey = `feature_gate:${hotelId}:${featureKey}`;
    const cachedStatus = systemCache.get(cacheKey);
    
    if (cachedStatus !== undefined) return cachedStatus;

    // Fetch hotel configuration from DB
    const hotel = await prisma.hotel.findUnique({
      where: { id: hotelId },
      select: { integrationMode: true, isThrottled: true, status: true }
    });

    if (!hotel) return false;

    // Evaluate gate logic based on the requested feature
    let isEnabled = false;

    switch (featureKey) {
      case 'INVENTORY_EDITING':
        // Disable manual inventory edits if Channel Manager is active
        isEnabled = hotel.integrationMode === 'INTERNAL';
        break;
      
      case 'PROMOTIONS_ENGINE':
        // Disable promotions if property is suspended or throttled
        isEnabled = hotel.status === 'ACTIVE' && !hotel.isThrottled;
        break;

      case 'PRICING_AI_CONTROLS':
        // Disable AI controls if the hotel's AI is deactivated or in manual mode
        // For now, we'll allow it if the hotel is ACTIVE
        isEnabled = hotel.status === 'ACTIVE';
        break;

      case 'SAFE_MODE':
        // If true, global write-locks are active
        isEnabled = hotel.isThrottled;
        break;

      default:
        isEnabled = false;
    }

    // Cache the result for 5 minutes
    systemCache.set(cacheKey, isEnabled, 300);

    return isEnabled;
  } catch (error) {
    console.error('Feature Gate Check Error:', error);
    return false; // Default fail-closed for security
  }
};
