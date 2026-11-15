import crypto from 'crypto';
import { awardReviewBonus } from './loyaltyService.js';
import prisma from '../config/db.js';
import { mediaService } from './MediaService.js';
import { createNotification } from './notificationService.js';
import { queueService } from './queueService.js';
import { escapeHtml } from '../utils/html.js';

/**
 * Review management engine.
 *
 *  Guest  -> writes one verified review per stay (from the day after check-in until 90 days after
 *            check-out): overall rating, aspect ratings, tags, title, text, trip type, photos.
 *            Can edit it for 48 hours. Clean reviews are published at once; reviews with
 *            contact details, links or abusive words wait for a Zivo moderator.
 *  Hotel  -> sees its published reviews and stats, replies publicly (guest is emailed), and can
 *            report a review to Zivo with a reason.
 *  Admin  -> moderation queue (held + reported), approve / reject with a note, removes replies.
 *
 * The hotel's review score (Hotel.reviewScore / reviewCount / reviewAspects) is recomputed from
 * published reviews whenever one changes, so it never drifts. Hotel.rating stays the star category.
 */

export const ASPECTS = ['cleanliness', 'staff', 'comfort', 'location', 'value'];
export const TRIP_TYPES = ['BUSINESS', 'COUPLE', 'FAMILY', 'FRIENDS', 'SOLO'];
export const REVIEW_TAGS = [
  'Clean Rooms', 'Friendly Staff', 'Great Location', 'Comfortable Stay', 'Fast Check-in', 'Good Food', 'Value for Money',
  'Noise Issue', 'Slow Service', 'Poor Cleanliness', 'AC Issue', 'Maintenance Issue', 'Check-in Delay',
];
const EDIT_HOURS = 48;
const REVIEW_WINDOW_DAYS = 90;
const MAX_PHOTOS = 5;
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const DAY = 24 * 60 * 60 * 1000;

// ── Automatic moderation ────────────────────────────────────────────────────

const ABUSIVE = ['fuck', 'shit', 'bitch', 'bastard', 'asshole', 'dick', 'chutiya', 'madarchod', 'behenchod', 'bhenchod', 'gandu', 'harami', 'randi', 'kutta', 'saala'];
/** Reasons a review needs a human look before publishing (empty = publish now). */
export const moderationFlags = (text) => {
  const t = String(text || '');
  const lower = t.toLowerCase();
  const flags = [];
  if (ABUSIVE.some((w) => new RegExp(`\\b${w}`, 'i').test(lower))) flags.push('Possible abusive language');
  if (/(\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}\b/.test(t)) flags.push('Contains a phone number');
  if (/[\w.+-]+@[\w-]+\.[\w.]+/.test(t)) flags.push('Contains an email address');
  if (/(https?:\/\/|www\.)\S+/i.test(t)) flags.push('Contains a link');
  return flags;
};

// ── Eligibility ─────────────────────────────────────────────────────────────

/** Can this booking be reviewed now? Returns null or the reason it can't. */
export const reviewBlocker = (booking, now = new Date()) => {
  if (!booking) return 'Booking not found';
  if (['CANCELLED', 'NO_SHOW', 'PENDING'].includes(booking.status)) return 'Only completed stays can be reviewed';
  const opens = new Date(booking.checkIn);
  opens.setHours(0, 0, 0, 0);
  opens.setDate(opens.getDate() + 1);
  if (now < opens) return `You can review this stay from ${opens.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`;
  if (now > new Date(new Date(booking.checkOut).getTime() + REVIEW_WINDOW_DAYS * DAY)) return `Reviews can be written up to ${REVIEW_WINDOW_DAYS} days after check-out`;
  return null;
};

// ── Validation helpers ──────────────────────────────────────────────────────

const cleanAspects = (input) => Object.fromEntries(
  ASPECTS.map((k) => [k, Number(input?.[k])]).filter(([, v]) => Number.isInteger(v) && v >= 1 && v <= 5)
);
const cleanTags = (tags) => [...new Set((tags || []).filter((t) => REVIEW_TAGS.includes(t)))].slice(0, 8);

/** Saves new photos (data URLs) and keeps already-saved ones (by url). */
const storePhotos = async (photos, reviewKey, existing = []) => {
  const keep = new Set((existing || []).map((p) => p.url));
  const out = [];
  for (const p of (photos || []).slice(0, MAX_PHOTOS)) {
    const value = typeof p === 'string' ? p : p?.url;
    if (!value) continue;
    if (keep.has(value)) { out.push({ url: value }); continue; }
    const m = /^data:(image\/(?:jpeg|jpg|png|webp));base64,(.+)$/.exec(value);
    if (!m) throw fail('Photos must be JPG, PNG or WebP images');
    const buffer = Buffer.from(m[2], 'base64');
    if (buffer.length > MAX_PHOTO_BYTES) throw fail('Each photo must be 5 MB or smaller');
    const ext = m[1].split('/')[1].replace('jpeg', 'jpg');
    const name = `${Date.now()}-${crypto.createHash('md5').update(buffer).digest('hex').slice(0, 8)}.${ext}`;
    const url = await mediaService.storage.uploadFile(buffer, `reviews/${reviewKey}/${name}`, m[1], false);
    out.push({ url });
  }
  return out;
};

const signPhotos = async (photos) => Promise.all((Array.isArray(photos) ? photos : []).map(async (p) => ({
  url: p.url?.startsWith('gs://') ? await mediaService.getSignedUrl(p.url) : p.url,
})));

// ── Aggregates ──────────────────────────────────────────────────────────────

/** Recomputes the hotel's review score, count and aspect averages from published reviews. */
export const recomputeHotelStats = async (hotelId, db = prisma) => {
  const rows = await db.review.findMany({ where: { hotelId, status: 'APPROVED' }, select: { rating: true, aspectRatings: true } });
  const count = rows.length;
  const score = count ? Math.round((rows.reduce((s, r) => s + r.rating, 0) / count) * 10) / 10 : null;
  const aspects = {};
  for (const k of ASPECTS) {
    const vals = rows.map((r) => Number(r.aspectRatings?.[k])).filter((v) => v >= 1 && v <= 5);
    if (vals.length) aspects[k] = Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
  }
  await db.hotel.update({ where: { id: hotelId }, data: { reviewScore: score, reviewCount: count, reviewAspects: aspects } });
  return { score, count, aspects };
};

/** Public summary: score, count, 1-5 distribution, aspect averages and most mentioned tags. */
export const hotelSummary = async (hotelId) => {
  const rows = await prisma.review.findMany({ where: { hotelId, status: 'APPROVED' }, select: { rating: true, aspectRatings: true, tags: true, reply: true } });
  const distribution = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
  const tagCounts = {};
  for (const r of rows) {
    distribution[Math.min(5, Math.max(1, Math.round(r.rating)))] += 1;
    (r.tags || []).forEach((t) => { tagCounts[t] = (tagCounts[t] || 0) + 1; });
  }
  const count = rows.length;
  const aspects = {};
  for (const k of ASPECTS) {
    const vals = rows.map((r) => Number(r.aspectRatings?.[k])).filter((v) => v >= 1 && v <= 5);
    if (vals.length) aspects[k] = Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
  }
  return {
    score: count ? Math.round((rows.reduce((s, r) => s + r.rating, 0) / count) * 10) / 10 : null,
    count,
    distribution,
    aspects,
    topTags: Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([tag, n]) => ({ tag, count: n })),
    replyRate: count ? Math.round((rows.filter((r) => r.reply).length / count) * 100) : 0,
  };
};

/** "Rahul S." from a full name: guests are shown by first name and initial only. */
const displayName = (name) => {
  const parts = String(name || 'Guest').trim().split(/\s+/);
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.` : parts[0];
};

const publicShape = async (r) => ({
  id: r.id,
  rating: r.rating,
  title: r.title,
  comment: r.comment,
  aspectRatings: r.aspectRatings || {},
  tags: r.tags || [],
  photos: await signPhotos(r.photos),
  tripType: r.tripType,
  guest: displayName(r.user?.name),
  roomType: r.booking?.roomType?.name || null,
  stayedIn: r.booking?.checkIn || null,
  nights: r.booking ? Math.max(1, Math.round((new Date(r.booking.checkOut) - new Date(r.booking.checkIn)) / DAY)) : null,
  publishedAt: r.publishedAt || r.createdAt,
  reply: r.reply ? { text: r.reply, at: r.replyAt } : null,
  verified: r.isVerified,
});

const REVIEW_INCLUDE = { user: { select: { name: true } }, booking: { select: { bookingRef: true, checkIn: true, checkOut: true, roomType: { select: { name: true } } } } };

/** Published reviews of a hotel for guests (paginated, sortable, filterable). */
export const publicList = async (hotelId, { page = 1, limit = 10, sort = 'recent', rating, withPhotos, tripType } = {}) => {
  const take = Math.min(Math.max(Number(limit) || 10, 1), 50);
  const skip = (Math.max(Number(page) || 1, 1) - 1) * take;
  const where = {
    hotelId, status: 'APPROVED',
    ...(rating ? { rating: { gte: Number(rating), lt: Number(rating) + 1 } } : {}),
    ...(withPhotos === 'true' ? { NOT: { photos: { equals: [] } } } : {}),
    ...(tripType && TRIP_TYPES.includes(tripType) ? { tripType } : {}),
  };
  const orderBy = sort === 'highest' ? [{ rating: 'desc' }, { publishedAt: 'desc' }]
    : sort === 'lowest' ? [{ rating: 'asc' }, { publishedAt: 'desc' }]
      : [{ publishedAt: 'desc' }, { createdAt: 'desc' }];
  const [rows, total, summary] = await Promise.all([
    prisma.review.findMany({ where, orderBy, skip, take, include: REVIEW_INCLUDE }),
    prisma.review.count({ where }),
    hotelSummary(hotelId),
  ]);
  return { summary, total, page: Math.max(Number(page) || 1, 1), pages: Math.ceil(total / take), reviews: await Promise.all(rows.map(publicShape)) };
};

// ── Guest ───────────────────────────────────────────────────────────────────

const applyModeration = (data) => {
  const flags = moderationFlags(`${data.title || ''}\n${data.comment || ''}`);
  return flags.length
    ? { status: 'PENDING', moderationNote: flags.join('; '), publishedAt: null }
    : { status: 'APPROVED', moderationNote: null, publishedAt: new Date() };
};

const notifyHotelOfReview = (review, hotelName) => createNotification({
  hotelId: review.hotelId,
  type: 'REVIEW',
  title: `New ${review.rating}★ review`,
  message: `A guest reviewed their stay at ${hotelName}${review.title ? `: "${review.title}"` : ''}. Reply from Extranet → Guest Reviews.`,
  metadata: { reviewId: review.id, rating: review.rating },
});

export const createReview = async (payload, { userId }) => {
  const booking = await prisma.booking.findUnique({ where: { id: payload.bookingId }, include: { hotel: { select: { id: true, name: true } } } });
  if (!booking || booking.userId !== userId) throw fail('Booking not found', 404);
  const blocker = reviewBlocker(booking);
  if (blocker) throw fail(blocker);
  if (await prisma.review.findUnique({ where: { bookingId: booking.id }, select: { id: true } })) throw fail('You have already reviewed this stay. You can edit your review instead.', 409);

  const base = {
    rating: payload.rating,
    title: payload.title?.trim() || null,
    comment: payload.comment?.trim() || null,
    aspectRatings: cleanAspects(payload.aspectRatings),
    tags: cleanTags(payload.tags),
    tripType: TRIP_TYPES.includes(payload.tripType) ? payload.tripType : null,
  };
  const photos = await storePhotos(payload.photos, booking.id);
  const review = await prisma.$transaction(async (tx) => {
    const r = await tx.review.create({
      data: {
        ...base, photos, ...applyModeration(base),
        isVerified: true,
        editableUntil: new Date(Date.now() + EDIT_HOURS * 60 * 60 * 1000),
        bookingId: booking.id, userId, hotelId: booking.hotelId,
      }
    });
    if (r.status === 'APPROVED') await recomputeHotelStats(booking.hotelId, tx);
    await tx.auditLog.create({ data: { action: 'REVIEW_CREATED', entityType: 'REVIEW', entityId: r.id, userId, details: { bookingId: booking.id, rating: r.rating, status: r.status } } });
    return r;
  });
  if (review.status === 'APPROVED') {
    notifyHotelOfReview(review, booking.hotel.name);
    awardReviewBonus(review).catch(() => {});
  }
  return review;
};

export const editReview = async (reviewId, payload, { userId }) => {
  const review = await prisma.review.findUnique({ where: { id: reviewId } });
  if (!review || review.userId !== userId) throw fail('Review not found', 404);
  if (review.status === 'REJECTED') throw fail('This review was not published and can no longer be edited');
  if (!review.editableUntil || new Date() > review.editableUntil) throw fail(`Reviews can be edited for ${EDIT_HOURS} hours after posting`);
  const next = {
    rating: payload.rating ?? review.rating,
    title: payload.title !== undefined ? (payload.title?.trim() || null) : review.title,
    comment: payload.comment !== undefined ? (payload.comment?.trim() || null) : review.comment,
    aspectRatings: payload.aspectRatings !== undefined ? cleanAspects(payload.aspectRatings) : review.aspectRatings,
    tags: payload.tags !== undefined ? cleanTags(payload.tags) : review.tags,
    tripType: payload.tripType !== undefined ? (TRIP_TYPES.includes(payload.tripType) ? payload.tripType : null) : review.tripType,
  };
  const photos = payload.photos !== undefined ? await storePhotos(payload.photos, review.bookingId, review.photos) : review.photos;
  const moderation = applyModeration(next);
  const updated = await prisma.$transaction(async (tx) => {
    const r = await tx.review.update({ where: { id: reviewId }, data: { ...next, photos, ...moderation, publishedAt: moderation.status === 'APPROVED' ? (review.publishedAt || new Date()) : null } });
    await recomputeHotelStats(review.hotelId, tx);
    if (r.status === 'APPROVED') awardReviewBonus(r).catch(() => {});
    await tx.auditLog.create({ data: { action: 'REVIEW_EDITED', entityType: 'REVIEW', entityId: reviewId, userId, details: { oldRating: review.rating, newRating: r.rating, status: r.status } } });
    return r;
  });
  return updated;
};

/** The guest's own reviews (for My Bookings), keyed by booking. */
export const listMine = async (userId) => {
  const rows = await prisma.review.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, include: { hotel: { select: { name: true } } } });
  return Promise.all(rows.map(async (r) => ({
    id: r.id, bookingId: r.bookingId, hotelName: r.hotel.name, rating: r.rating, title: r.title, comment: r.comment,
    aspectRatings: r.aspectRatings, tags: r.tags, tripType: r.tripType, photos: await signPhotos(r.photos),
    status: r.status, createdAt: r.createdAt, publishedAt: r.publishedAt,
    canEdit: r.status !== 'REJECTED' && Boolean(r.editableUntil && new Date() < r.editableUntil), editableUntil: r.editableUntil,
    rejectionReason: r.status === 'REJECTED' ? r.moderationNote : null,
    reply: r.reply ? { text: r.reply, at: r.replyAt } : null,
  })));
};

// ── Hotel ───────────────────────────────────────────────────────────────────

/** A hotel's reviews for the extranet: published ones (and ones it reported) with stats. */
export const listForHotel = async (hotelId, { filter = 'all', page = 1, limit = 20 } = {}) => {
  const take = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const where = {
    hotelId, status: 'APPROVED',
    ...(filter === 'unreplied' ? { reply: null } : {}),
    ...(filter === 'replied' ? { NOT: { reply: null } } : {}),
    ...(filter === 'negative' ? { rating: { lt: 3 } } : {}),
    ...(filter === 'reported' ? { NOT: { reportedAt: null } } : {}),
  };
  const [rows, total, summary, unreplied, pending] = await Promise.all([
    prisma.review.findMany({ where, orderBy: { publishedAt: 'desc' }, skip: (Math.max(Number(page) || 1, 1) - 1) * take, take, include: REVIEW_INCLUDE }),
    prisma.review.count({ where }),
    hotelSummary(hotelId),
    prisma.review.count({ where: { hotelId, status: 'APPROVED', reply: null } }),
    prisma.review.count({ where: { hotelId, status: 'PENDING' } }),
  ]);
  const reviews = await Promise.all(rows.map(async (r) => ({
    ...(await publicShape(r)),
    bookingRef: r.booking?.bookingRef,
    report: r.reportedAt ? { at: r.reportedAt, reason: r.reportReason, resolved: r.reportResolved } : null,
  })));
  return { summary, unreplied, inModeration: pending, total, reviews };
};

const loadForHotel = async (reviewId, hotelId) => {
  const review = await prisma.review.findFirst({ where: { id: reviewId, hotelId }, include: { user: { select: { email: true, name: true } }, hotel: { select: { name: true } } } });
  if (!review) throw fail('Review not found', 404);
  if (review.status !== 'APPROVED') throw fail('Only published reviews can be replied to or reported');
  return review;
};

export const replyAsHotel = async (reviewId, hotelId, text, userId) => {
  const review = await loadForHotel(reviewId, hotelId);
  const reply = String(text || '').trim();
  if (reply.length < 2) throw fail('Write a reply first');
  if (reply.length > 2000) throw fail('Replies can be up to 2000 characters');
  const flags = moderationFlags(reply);
  if (flags.length) throw fail(`Please remove this from your reply: ${flags.join(', ').toLowerCase()}`);
  const isNew = !review.reply;
  const updated = await prisma.review.update({ where: { id: reviewId }, data: { reply, replyAt: new Date(), replyById: userId } });
  await prisma.auditLog.create({ data: { action: isNew ? 'REVIEW_REPLIED' : 'REVIEW_REPLY_EDITED', entityType: 'REVIEW', entityId: reviewId, userId, details: { hotelId } } });
  if (isNew && review.user?.email) {
    queueService.enqueue('email', 'REVIEW_REPLY', {
      to: review.user.email,
      subject: `${review.hotel.name} replied to your review`,
      html: `<div style="font-family:sans-serif;max-width:560px;margin:auto;padding:20px">
        <h2 style="margin:0 0 12px">${escapeHtml(review.hotel.name)} replied to your review</h2>
        <p style="color:#555">Your review: ${'★'.repeat(Math.round(review.rating))}${review.title ? ` · ${escapeHtml(review.title)}` : ''}</p>
        <blockquote style="border-left:3px solid #e11d48;margin:16px 0;padding:8px 16px;color:#111;background:#f9fafb">${escapeHtml(reply).replace(/\n/g, '<br>')}</blockquote>
        <p style="color:#888;font-size:13px">See it in My Bookings on ZivoHotels.</p></div>`,
    }, { priority: 3 }).catch(() => {});
  }
  return updated;
};

export const deleteReplyAsHotel = async (reviewId, hotelId, userId) => {
  await loadForHotel(reviewId, hotelId);
  await prisma.review.update({ where: { id: reviewId }, data: { reply: null, replyAt: null, replyById: null } });
  await prisma.auditLog.create({ data: { action: 'REVIEW_REPLY_DELETED', entityType: 'REVIEW', entityId: reviewId, userId, details: { hotelId } } });
};

export const REPORT_REASONS = ['Not about this property', 'Abusive or offensive', 'Contains false information', 'Guest did not stay', 'Personal information', 'Competitor or conflict of interest', 'Other'];
export const reportAsHotel = async (reviewId, hotelId, { reason, details }, userId) => {
  const review = await loadForHotel(reviewId, hotelId);
  if (!REPORT_REASONS.includes(reason)) throw fail('Choose a reason');
  if (review.reportedAt && !review.reportResolved) throw fail('This review is already with Zivo for a decision');
  const text = details?.trim() ? `${reason}: ${details.trim().slice(0, 1000)}` : reason;
  await prisma.review.update({ where: { id: reviewId }, data: { reportedAt: new Date(), reportReason: text, reportedById: userId, reportResolved: false } });
  await prisma.auditLog.create({ data: { action: 'REVIEW_REPORTED', entityType: 'REVIEW', entityId: reviewId, userId, details: { hotelId, reason: text } } });
};

// ── Admin ───────────────────────────────────────────────────────────────────

/** Moderation queue and search. queue: held | reported | published | rejected | all */
export const listForAdmin = async ({ queue = 'held', hotelId, page = 1, limit = 25 } = {}) => {
  const take = Math.min(Math.max(Number(limit) || 25, 1), 100);
  const where = {
    ...(hotelId ? { hotelId } : {}),
    ...(queue === 'held' ? { status: 'PENDING' } : {}),
    ...(queue === 'reported' ? { NOT: { reportedAt: null }, reportResolved: false } : {}),
    ...(queue === 'published' ? { status: 'APPROVED' } : {}),
    ...(queue === 'rejected' ? { status: 'REJECTED' } : {}),
  };
  const [rows, total, counts] = await Promise.all([
    prisma.review.findMany({ where, orderBy: { createdAt: queue === 'held' ? 'asc' : 'desc' }, skip: (Math.max(Number(page) || 1, 1) - 1) * take, take, include: { ...REVIEW_INCLUDE, user: { select: { name: true, email: true } }, hotel: { select: { id: true, name: true, city: true } } } }),
    prisma.review.count({ where }),
    Promise.all([
      prisma.review.count({ where: { status: 'PENDING' } }),
      prisma.review.count({ where: { NOT: { reportedAt: null }, reportResolved: false } }),
      prisma.review.count({ where: { status: 'APPROVED' } }),
      prisma.review.count({ where: { status: 'REJECTED' } }),
    ]),
  ]);
  const reviews = await Promise.all(rows.map(async (r) => ({
    ...(await publicShape(r)),
    status: r.status,
    guestName: r.user?.name, guestEmail: r.user?.email,
    hotel: r.hotel, bookingRef: r.booking?.bookingRef,
    moderationNote: r.moderationNote, moderatedAt: r.moderatedAt,
    report: r.reportedAt ? { at: r.reportedAt, reason: r.reportReason, resolved: r.reportResolved } : null,
    createdAt: r.createdAt,
  })));
  return { counts: { held: counts[0], reported: counts[1], published: counts[2], rejected: counts[3] }, total, reviews };
};

/**
 * Admin decision. action: APPROVE (publish), REJECT (unpublish; note shown to the guest),
 * KEEP (reported review stays published), REMOVE_REPLY.
 */
export const moderate = async (reviewId, { action, note }, adminId) => {
  const review = await prisma.review.findUnique({ where: { id: reviewId }, include: { hotel: { select: { name: true } } } });
  if (!review) throw fail('Review not found', 404);
  let data;
  if (action === 'APPROVE') data = { status: 'APPROVED', publishedAt: review.publishedAt || new Date(), moderationNote: note?.trim() || null, reportResolved: true };
  else if (action === 'REJECT') {
    if (!note?.trim()) throw fail('Say why the review is not published (the guest sees this)');
    data = { status: 'REJECTED', publishedAt: null, moderationNote: note.trim(), reportResolved: true };
  } else if (action === 'KEEP') data = { reportResolved: true, moderationNote: note?.trim() || review.moderationNote };
  else if (action === 'REMOVE_REPLY') data = { reply: null, replyAt: null, replyById: null };
  else throw fail('Unknown action');
  const updated = await prisma.$transaction(async (tx) => {
    const r = await tx.review.update({ where: { id: reviewId }, data: { ...data, moderatedById: adminId, moderatedAt: new Date() } });
    await recomputeHotelStats(review.hotelId, tx);
    await tx.auditLog.create({ data: { action: `REVIEW_${action}`, entityType: 'REVIEW', entityId: reviewId, userId: adminId, details: { note: note || null, hotelId: review.hotelId } } });
    return r;
  });
  if (action === 'APPROVE' && review.status !== 'APPROVED') {
    notifyHotelOfReview(updated, review.hotel.name);
    awardReviewBonus(updated).catch(() => {});
  }
  if (review.reportedAt && !review.reportResolved && ['APPROVE', 'KEEP', 'REJECT'].includes(action)) {
    createNotification({
      hotelId: review.hotelId, type: 'REVIEW',
      title: action === 'REJECT' ? 'Reported review removed' : 'Reported review kept',
      message: action === 'REJECT' ? 'Zivo reviewed your report and removed the review.' : `Zivo reviewed your report and kept the review published${note ? `: ${note}` : '.'}`,
      metadata: { reviewId },
    });
  }
  return updated;
};

export default {
  ASPECTS, TRIP_TYPES, REVIEW_TAGS, REPORT_REASONS, moderationFlags, reviewBlocker, recomputeHotelStats, hotelSummary,
  publicList, createReview, editReview, listMine, listForHotel, replyAsHotel, deleteReplyAsHotel, reportAsHotel, listForAdmin, moderate,
};
