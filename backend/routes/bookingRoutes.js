import express from 'express';
import { createBooking, previewBooking, getBookings, getMyBookings, updateBookingStatus, cleanupExpiredBookings, failBooking, cancelBooking } from '../controllers/bookingController.js';
import { protect, authorizeRoles } from '../middleware/authMiddleware.js';
import { validateRequest } from '../middleware/validateRequest.js';
import { bookingSchema } from '../schemas/bookingSchema.js';

const router = express.Router();

router.route('/preview')
  .post(protect, previewBooking);

router.route('/my-bookings')
  .get(protect, getMyBookings);

router.route('/')
  .get(protect, authorizeRoles('ADMIN', 'OWNER'), getBookings)
  .post(protect, validateRequest(bookingSchema), createBooking); // Validated before controller

router.route('/:id/status')
  .patch(protect, authorizeRoles('ADMIN', 'OWNER'), updateBookingStatus);

// Internal cron route
router.route('/cleanup')
  .delete(cleanupExpiredBookings);

// Cancel booking endpoint
router.route('/:id/cancel')
  .post(protect, cancelBooking);

// Fail booking endpoint
router.route('/:id/fail')
  .post(protect, failBooking);

export default router;
