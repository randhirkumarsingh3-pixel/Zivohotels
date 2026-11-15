import express from 'express';
import { createHotel, updateHotel, deleteHotel, getAllHotels, getHotelById, searchHotels } from '../controllers/hotelController.js';
import { suggestNearby, lookupNearby } from '../controllers/nearbyController.js';
import { getHotelReviews } from '../controllers/reviewController.js';
import { protect, authorizeRoles, extractUser } from '../middleware/authMiddleware.js';

const router = express.Router();

router.route('/')
  .get(extractUser, getAllHotels)
  .post(protect, authorizeRoles('ADMIN', 'OWNER'), createHotel);

router.get('/search', searchHotels);

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
