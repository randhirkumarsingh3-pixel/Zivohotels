import { asyncHandler } from '../middleware/asyncHandler.js';
import nearby from '../services/nearbyPlacesService.js';

/** POST /hotels/nearby/suggest { lat, lng } -> places near the pin (takes about 40 seconds). */
export const suggestNearby = asyncHandler(async (req, res) => {
  try {
    const data = await nearby.suggest(req.body?.lat, req.body?.lng);
    res.json({ success: true, data, requestId: req.id });
  } catch (e) {
    res.status(e.status || 500).json({ success: false, message: e.status ? e.message : 'Could not look up nearby places', requestId: req.id });
  }
});

/** POST /hotels/nearby/lookup { q, lat, lng } -> matching places, with distance from the pin. */
export const lookupNearby = asyncHandler(async (req, res) => {
  try {
    const data = await nearby.search(req.body?.q, req.body?.lat, req.body?.lng);
    res.json({ success: true, data, requestId: req.id });
  } catch (e) {
    res.status(e.status || 500).json({ success: false, message: e.status ? e.message : 'Place search failed', requestId: req.id });
  }
});
