import prisma from '../config/db.js';

// Consistent hash function for sampling
function shouldSample(sessionId, eventType) {
  const str = sessionId + eventType;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = Math.imul(31, hash) + str.charCodeAt(i) | 0;
  }
  const pct = Math.abs(hash) % 100;
  return pct < 30; // 30% chance to sample
}

export const trackEvent = async (req, res) => {
  let { eventType, metadata, hotelId, city, experiments } = req.body;
  if (typeof experiments !== 'object' || experiments === null) {
    experiments = {};
  }
  const userId = req.user?.id || null;
  // Get sessionId from headers, or fallback
  const sessionId = req.headers['x-session-id'] || 'anonymous';

  // 1. Immediately return 202 Accepted (Async pattern)
  res.status(202).json({ success: true });

  // 2. Fire and forget DB inserts
  setImmediate(async () => {
    try {
      // Event Sampling Logic (Only insert to AnalyticsEvent table if sampled or not a search event)
      const isSearchEvent = eventType === 'SEARCH_STARTED' || eventType === 'DESTINATION_SELECTED';
      const shouldLogToDb = !isSearchEvent || shouldSample(sessionId, eventType);

      if (shouldLogToDb) {
        // Insert raw analytics event
        await prisma.analyticsEvent.create({
          data: {
            userId,
            sessionId,
            eventType,
            metadata: metadata || {},
            experiments,
            hotelId,
            city
          }
        });
      }

      // Always update behavior and aggregates even if the raw event was skipped

      // Determine identity for UserBehavior
      const behaviorIdentity = userId || sessionId;

      // Specific logic for HOTEL_VIEWED
      if (eventType === 'HOTEL_VIEWED' && hotelId) {
        // Track the view aggregate
        await prisma.hotelView.create({
          data: {
            userId,
            hotelId
          }
        });

        // Update UserBehavior
        await updateBehavior(behaviorIdentity, { type: 'VIEW', hotelId });
      }

      // Specific logic for SEARCH_STARTED / DESTINATION_SELECTED
      if (isSearchEvent && city) {
        await updateBehavior(behaviorIdentity, { type: 'SEARCH', city });
      }

    } catch (err) {
      console.error("[Analytics] Background processing failed:", err);
    }
  });
};

/**
 * Helper to upsert UserBehavior
 */
async function updateBehavior(userId, action) {
  try {
    let behavior = await prisma.userBehavior.findUnique({ where: { userId } });
    
    if (!behavior) {
      behavior = await prisma.userBehavior.create({
        data: { userId }
      });
    }

    const updates = {};

    if (action.type === 'VIEW') {
      const { hotelId } = action;
      let list = [hotelId, ...(behavior.lastViewedHotels || [])];
      // Deduplicate and cap at 10
      list = [...new Set(list)].slice(0, 10);
      updates.lastViewedHotels = list;
    }

    if (action.type === 'SEARCH') {
      updates.lastSearchedCity = action.city;
      updates.lastSearchAt = new Date();
    }

    if (Object.keys(updates).length > 0) {
      await prisma.userBehavior.update({
        where: { userId },
        data: updates
      });
    }
  } catch (err) {
    console.error("[UserBehavior] Update failed:", err);
  }
}
