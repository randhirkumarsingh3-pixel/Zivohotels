import express from 'express';
import { createHotel, updateHotel, deleteHotel, getAllHotels, getHotelById, searchHotels } from '../controllers/hotelController.js';
import { getHotelReviews } from '../controllers/reviewController.js';
import { protect, authorizeRoles, extractUser } from '../middleware/authMiddleware.js';

const router = express.Router();

router.route('/')
  .get(extractUser, getAllHotels)
  .post(protect, authorizeRoles('ADMIN', 'OWNER'), createHotel);

router.get('/search', searchHotels);

router.route('/:id')
  .get(getHotelById)
  .put(protect, authorizeRoles('ADMIN', 'OWNER'), updateHotel)
  .delete(protect, authorizeRoles('ADMIN'), deleteHotel);

router.get('/:hotelId/reviews', getHotelReviews);

export default router;
