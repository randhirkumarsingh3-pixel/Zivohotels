import { z } from 'zod';
import prisma from '../config/db.js';
import reviews from '../services/reviewService.js';

/**
 * Reviews API.
 *  Guests:  POST /reviews, PUT /reviews/:id, GET /reviews/mine, GET /reviews/options
 *  Public:  GET /hotels/:hotelId/reviews
 *  Hotel:   /extranet/reviews (list, reply, delete reply, report) for the active property
 *  Admin:   /admin/reviews (moderation queue, decisions)
 */

const send = (res, req, status, fn) => fn().then(
  (data) => res.status(status).json({ success: true, data, requestId: req.id }),
  (err) => {
    if (err.status) return res.status(err.status).json({ success: false, message: err.message, requestId: req.id });
    console.error('[Reviews]', err);
    return res.status(500).json({ success: false, message: 'Something went wrong with the review. Please try again.', requestId: req.id });
  }
);
const firstIssue = (e) => e.issues[0]?.message || 'Check your review';

const reviewFields = {
  rating: z.number().int('Choose 1 to 5 stars').min(1, 'Choose 1 to 5 stars').max(5),
  title: z.string().trim().max(100, 'Keep the title under 100 characters').optional().nullable(),
  comment: z.string().trim().max(3000, 'Keep the review under 3000 characters').optional().nullable(),
  aspectRatings: z.record(z.number()).optional(),
  tags: z.array(z.string()).max(13).optional(),
  tripType: z.string().optional().nullable(),
  photos: z.array(z.union([z.string(), z.object({ url: z.string() })])).max(5, 'Up to 5 photos').optional(),
};
const createSchema = z.object({ bookingId: z.string().uuid(), ...reviewFields }).strip();
const editSchema = z.object(reviewFields).partial().strip();

export const getReviewOptions = (req, res) => res.json({ success: true, data: {
  aspects: reviews.ASPECTS, tags: reviews.REVIEW_TAGS, tripTypes: reviews.TRIP_TYPES, reportReasons: reviews.REPORT_REASONS,
} });

export const createReview = (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ success: false, message: firstIssue(parsed.error), requestId: req.id });
  return send(res, req, 201, () => reviews.createReview(parsed.data, { userId: req.user.id }));
};

export const editReview = (req, res) => {
  const parsed = editSchema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ success: false, message: firstIssue(parsed.error), requestId: req.id });
  return send(res, req, 200, () => reviews.editReview(req.params.id, parsed.data, { userId: req.user.id }));
};

export const getMyReviews = (req, res) => send(res, req, 200, () => reviews.listMine(req.user.id));

export const getHotelReviews = async (req, res) => {
  const hotel = await prisma.hotel.findUnique({ where: { id: req.params.hotelId }, select: { id: true, isDeleted: true } });
  if (!hotel || hotel.isDeleted) return res.status(404).json({ success: false, message: 'Hotel not found', requestId: req.id });
  return send(res, req, 200, () => reviews.publicList(hotel.id, req.query));
};

// ── Extranet (active property: req.scopedHotelId) ──
export const listHotelReviews = (req, res) => send(res, req, 200, () => reviews.listForHotel(req.scopedHotelId, req.query));
export const replyToReview = (req, res) => send(res, req, 200, () => reviews.replyAsHotel(req.params.reviewId, req.scopedHotelId, req.body?.replyText ?? req.body?.reply, req.user.id));
export const deleteReply = (req, res) => send(res, req, 200, () => reviews.deleteReplyAsHotel(req.params.reviewId, req.scopedHotelId, req.user.id).then(() => ({ removed: true })));
export const reportReview = (req, res) => send(res, req, 200, () => reviews.reportAsHotel(req.params.reviewId, req.scopedHotelId, req.body || {}, req.user.id).then(() => ({ reported: true })));

// ── Admin ──
const adminOnly = (req, res) => {
  if (req.user.role === 'ADMIN') return true;
  res.status(403).json({ success: false, message: 'Only Zivo admins moderate reviews', requestId: req.id });
  return false;
};
export const adminListReviews = (req, res) => adminOnly(req, res) && send(res, req, 200, () => reviews.listForAdmin(req.query));
export const adminModerateReview = (req, res) => adminOnly(req, res) && send(res, req, 200, () => reviews.moderate(req.params.id, req.body || {}, req.user.id));
