/**
 * Requests to the hotel (concierge). Guests: /api/v1/bookings/:id/requests. Hotels:
 * /api/v1/extranet/requests (the active property, from hotelScopeGuard).
 */
import * as stayRequests from '../services/stayRequestService.js';

const handle = (fn) => async (req, res, next) => {
  try {
    const data = await fn(req);
    res.status(req.method === 'POST' ? 201 : 200).json({ success: true, data, requestId: req.id });
  } catch (err) {
    if (err instanceof stayRequests.StayRequestError) {
      return res.status(err.statusCode).json({ success: false, message: err.message, requestId: req.id });
    }
    next(err);
  }
};

// Guests (and the hotel owner / admins, read-only)
export const listBookingRequests = handle((req) => stayRequests.listForBooking(req.params.id, req.user));
export const createBookingRequest = handle((req) => stayRequests.createRequest(req.params.id, req.user, req.body || {}));
export const cancelBookingRequest = handle((req) => stayRequests.cancelRequest(req.params.id, req.params.requestId, req.user));

// Hotels
export const listHotelRequests = handle((req) => stayRequests.listForHotel(req.scopedHotelId, { status: req.query.status }));
export const respondHotelRequest = handle((req) => stayRequests.respondToRequest(req.scopedHotelId, req.params.requestId, req.body || {}, req.user));
