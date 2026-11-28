import express from 'express';
import { listBookingRequests, createBookingRequest, cancelBookingRequest } from '../controllers/stayRequestController.js';
import { getDateChange, quoteDateChange, requestDateChange, withdrawDateChange, payDateChange, verifyDateChange } from '../controllers/dateChangeController.js';
import { createBooking, previewBooking, getBookings, getMyBookings, updateBookingStatus, cleanupExpiredBookings, failBooking, cancelBooking, cancelPreview, downloadVoucher, roomCancelPreview, cancelRoom } from '../controllers/bookingController.js';
import { protect, authorizeRoles, extractUser } from '../middleware/authMiddleware.js';
import { previewHourly, bookHourly, getExtensionOptions, createExtension, confirmExtension } from '../controllers/hourlyController.js';
import { validateRequest } from '../middleware/validateRequest.js';
import { bookingSchema } from '../schemas/bookingSchema.js';

const router = express.Router();

router.route('/preview')
  .post(extractUser, previewBooking); // signed-out guests see the same price on the hotel page

// Hourly stays: price for a slot, and booking it (pending payment, 30 minutes)
router.post('/hourly/preview', extractUser, previewHourly);
router.post('/hourly', protect, bookHourly);
// Extra hours on a booked hourly stay: options, pay the difference, confirm the payment
router.get('/:id/hourly/extend', protect, getExtensionOptions);
router.post('/:id/hourly/extend', protect, createExtension);
router.post('/:id/hourly/extend/verify', protect, confirmExtension);

router.route('/my-bookings')
  .get(protect, getMyBookings);

router.route('/')
  .get(protect, authorizeRoles('ADMIN', 'OWNER'), getBookings)
  .post(protect, validateRequest(bookingSchema), createBooking); // Validated before controller

router.route('/:id/status')
  .patch(protect, authorizeRoles('ADMIN', 'OWNER'), updateBookingStatus);

// Internal cron route
router.route('/cleanup')
  .delete(protect, authorizeRoles('ADMIN'), cleanupExpiredBookings);

// Cancel booking endpoint
router.get('/:id/cancel-preview', protect, cancelPreview);
// One room of a booking with several rooms
router.get('/:id/rooms/:roomNumber/cancel-preview', protect, roomCancelPreview);
router.post('/:id/rooms/:roomNumber/cancel', protect, cancelRoom);
// Requests to the hotel (late arrival, early check-in, airport pickup…)
router.route('/:id/requests')
  .get(protect, listBookingRequests)
  .post(protect, createBookingRequest);
router.post('/:id/requests/:requestId/cancel', protect, cancelBookingRequest);
// Change dates: whether it's possible, the price for new dates, ask the hotel, withdraw, pay the difference
router.get('/:id/date-change', protect, getDateChange);
router.post('/:id/date-change/quote', protect, quoteDateChange);
router.post('/:id/date-change', protect, requestDateChange);
router.post('/:id/date-change/:requestId/withdraw', protect, withdrawDateChange);
router.post('/:id/date-change/:requestId/pay', protect, payDateChange);
router.post('/:id/date-change/:requestId/verify', protect, verifyDateChange);
router.get('/:id/voucher', protect, downloadVoucher);
router.route('/:id/cancel')
  .post(protect, cancelBooking);

// Fail booking endpoint
router.route('/:id/fail')
  .post(protect, failBooking);

export default router;
