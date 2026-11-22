import express from 'express';
import { resolveHotelId } from '../services/hotelResolve.js';
import { isUuid } from '../utils/hotelSlug.js';
import { createHotel, updateHotel, deleteHotel, getAllHotels, getHotelById, searchHotels } from '../controllers/hotelController.js';
import { suggestNearby, lookupNearby } from '../controllers/nearbyController.js';
import { getHotelReviews } from '../controllers/reviewController.js';
import { searchHourly, hotelOffer } from '../controllers/hourlyController.js';
import { protect, authorizeRoles, extractUser } from '../middleware/authMiddleware.js';

const router = express.Router();

// /hotels/:id also takes the readable address (/hotel/z-stays-…-5a320d64): turned into the id here,
// so every handler below works with either
router.param('id', async (req, res, next, value) => {
  if (isUuid(value)) return next();
  try {
    const id = await resolveHotelId(value);
    if (!id) return res.status(404).json({ success: false, message: 'Hotel not found' });
    req.params.id = id;
    return next();
  } catch (err) { return next(err); }
});

router.route('/')
  .get(extractUser, getAllHotels)
  .post(protect, authorizeRoles('ADMIN', 'OWNER'), createHotel);

router.get('/search', searchHotels);
// Hourly stays: hotels offering a slot, and what one hotel offers by the hour on a date
router.get('/search/hourly', searchHourly);
router.get('/:id/hourly', hotelOffer);

// What's nearby (Location step): suggestions from OpenStreetMap around a pin, and place lookup
router.post('/nearby/suggest', protect, authorizeRoles('ADMIN', 'OWNER'), suggestNearby);
router.post('/nearby/lookup', protect, authorizeRoles('ADMIN', 'OWNER'), lookupNearby);

router.route('/:id')
  .get(extractUser, getHotelById) // optional login: owners/admins get the full record
  .put(protect, authorizeRoles('ADMIN', 'OWNER'), updateHotel)
  .patch(protect, authorizeRoles('ADMIN', 'OWNER'), updateHotel)
  .delete(protect, authorizeRoles('ADMIN'), deleteHotel);

router.post('/:id/sign-agreement', protect, authorizeRoles('ADMIN', 'OWNER'), async (req, res, next) => {
  import('../controllers/hotelController.js').then(m => m.signAgreement(req, res, next)).catch(next);
});

router.get('/:hotelId/reviews', getHotelReviews);

export default router;
