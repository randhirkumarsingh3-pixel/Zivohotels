/**
 * Change dates. Guests: /api/v1/bookings/:id/date-change. Hotels: /api/v1/extranet/date-changes
 * (the active property, from hotelScopeGuard).
 */
import * as dc from '../services/dateChangeService.js';

const handle = (fn, created = false) => async (req, res, next) => {
  try {
    const data = await fn(req);
    res.status(created ? 201 : 200).json({ success: true, data, requestId: req.id });
  } catch (err) {
    if (err instanceof dc.DateChangeError) return res.status(err.statusCode).json({ success: false, message: err.message, requestId: req.id });
    next(err);
  }
};

export const getDateChange = handle((req) => dc.forGuest(req.params.id, req.user));
export const quoteDateChange = handle((req) => dc.quote(req.params.id, req.user, req.body || {}));
export const requestDateChange = handle((req) => dc.requestChange(req.params.id, req.user, req.body || {}), true);
export const withdrawDateChange = handle((req) => dc.withdraw(req.params.id, req.params.requestId, req.user));
export const payDateChange = handle((req) => dc.startPayment(req.params.id, req.params.requestId, req.user));
export const verifyDateChange = handle((req) => dc.verifyPayment(req.params.id, req.params.requestId, req.user, req.body || {}));

export const listHotelDateChanges = handle((req) => dc.listForHotel(req.scopedHotelId, { status: req.query.status }));
export const respondHotelDateChange = handle((req) => dc.respond(req.scopedHotelId, req.params.requestId, req.body || {}, req.user));
