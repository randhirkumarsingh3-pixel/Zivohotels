/**
 * The hotel's feedback QR code. One code per hotel (front desk, rooms) linking to
 * <site>/feedback/<hotel address>. It holds no secret: whoever scans signs in, and only stays they
 * booked on ZivoPlus (or stayed on as the named guest, signed in with that email) at this hotel can
 * be rated; anyone else gets no form. Rating opens on the check-in day when it comes from the code.
 *
 *  qrPng(hotel)       the code as a PNG (print quality)
 *  qrCardPdf(hotel)   an A5 table card in the ZivoPlus document look
 *  feedbackPage(ref, user, meta)  the hotel, and the user's stays there with whether each can be rated
 */
import prisma from '../config/db.js';
import { PUBLIC_HOTEL_STATUSES } from '../constants/hotelStatus.js';
import { hotelSlug, slugIdPrefix, isUuid } from '../utils/hotelSlug.js';
import { reviewBlocker } from './reviewService.js';
import { shell, header, renderPdf, esc, COLORS } from './documents/theme.js';

const site = () => String(process.env.FRONTEND_URL || 'https://zivoplus.com').replace(/\/$/, '');
const fail = (m, statusCode = 400) => Object.assign(new Error(m), { statusCode });
const KEPT = ['CONFIRMED', 'CHECKED_IN', 'COMPLETED'];
const DAY = 86400000;

export const feedbackUrl = (hotel) => `${site()}/feedback/${hotelSlug(hotel)}`;

export const qrPng = async (hotel, width = 1200) => {
  const { default: QRCode } = await import('qrcode');
  return QRCode.toBuffer(feedbackUrl(hotel), { type: 'png', width, margin: 2, errorCorrectionLevel: 'M', color: { dark: '#062C4D', light: '#FFFFFF' } });
};

export const qrCardPdf = async (hotel) => {
  const png = await qrPng(hotel, 900);
  const c = COLORS || {};
  const body = `<div class="page" style="padding:10mm 12mm;text-align:center">
${header({ brandSub: 'Guest feedback', title: 'Rate your stay', sub: esc(hotel.name), ref: '' })}
<p style="font-size:15px;margin:18px 0 6px;color:${c.text || '#0f172a'}">Booked on ZivoPlus? Tell us how your stay is going.</p>
<img src="data:image/png;base64,${png.toString('base64')}" alt="" style="width:85mm;height:85mm;margin:6mm auto;display:block">
<p style="font-size:13px;margin:0 0 4px"><b>Scan with your phone camera</b>, sign in with the account you booked with, and rate your stay.</p>
<p style="font-size:11px;color:#64748b;margin:0">${esc(feedbackUrl(hotel).replace(/^https?:\/\//, ''))}</p>
<p style="font-size:10px;color:#64748b;margin:10mm 0 0">Only guests with a ZivoPlus booking at ${esc(hotel.name)} can leave a review. Reviews are checked before they are published.</p>
</div>`;
  return renderPdf(shell(`Feedback QR · ${hotel.name}`, body, { extraCss: '@page{size:A5;margin:0}' }), { footer: `${hotel.name} · ZivoPlus guest feedback` });
};

/** A live hotel from its address (readable slug ending in the id prefix) or id. */
export const hotelFromRef = async (ref) => {
  const r = String(ref || '');
  const where = { isDeleted: false, status: { in: PUBLIC_HOTEL_STATUSES } };
  if (isUuid(r)) return prisma.hotel.findFirst({ where: { ...where, id: r }, select: { id: true, name: true, city: true } });
  const prefix = slugIdPrefix(r);
  if (!prefix) return null;
  const list = await prisma.hotel.findMany({ where: { ...where, id: { startsWith: prefix } }, select: { id: true, name: true, city: true }, take: 5 });
  return list.find((h) => hotelSlug(h) === r) || list[0] || null;
};

/**
 * The scan page: the hotel, and (signed in) the user's stays there: booked by them, or by someone
 * else for them as the named guest when their email matches and is confirmed.
 */
export const feedbackPage = async (ref, user, meta = {}) => {
  const hotel = await hotelFromRef(ref);
  if (!hotel) throw fail('This feedback code isn\'t for a hotel on ZivoPlus any more.', 404);
  await prisma.analyticsEvent.create({ data: { eventType: 'FEEDBACK_QR_SCANNED', hotelId: hotel.id, sessionId: String(meta.sessionId || 'feedback-qr').slice(0, 100), userId: user?.id || null, metadata: { signedIn: Boolean(user) } } }).catch(() => {});
  const out = { hotel: { id: hotel.id, name: hotel.name, city: hotel.city, slug: hotelSlug(hotel) }, signedIn: Boolean(user), stays: [] };
  if (!user) return out;
  const me = await prisma.user.findUnique({ where: { id: user.id }, select: { email: true, emailVerifiedAt: true } });
  const asGuest = me?.email && me.emailVerifiedAt ? [{ guestEmail: { equals: me.email, mode: 'insensitive' } }] : [];
  const bookings = await prisma.booking.findMany({
    where: { hotelId: hotel.id, status: { in: KEPT }, checkOut: { gte: new Date(Date.now() - 91 * DAY) }, OR: [{ userId: user.id }, ...asGuest] },
    orderBy: { checkIn: 'desc' }, take: 10,
    select: {
      id: true, bookingRef: true, status: true, checkIn: true, checkOut: true, stayType: true, rooms: true, userId: true, guestName: true,
      roomType: { select: { name: true } }, review: { select: { id: true, rating: true, title: true, comment: true, status: true, editableUntil: true, userId: true } },
    },
  });
  out.stays = bookings.map((b) => {
    const blocker = b.review ? null : reviewBlocker(b, new Date(), { openOnCheckIn: true });
    return {
      bookingId: b.id, bookingRef: b.bookingRef, checkIn: b.checkIn, checkOut: b.checkOut, stayType: b.stayType, rooms: b.rooms, roomType: b.roomType?.name || null,
      bookedByMe: b.userId === user.id,
      review: b.review ? { id: b.review.id, rating: b.review.rating, title: b.review.title, comment: b.review.comment, status: b.review.status, mine: b.review.userId === user.id, canEdit: b.review.userId === user.id && Boolean(b.review.editableUntil && new Date() < b.review.editableUntil) } : null,
      canReview: !b.review && !blocker, blocker,
    };
  });
  return out;
};

/** How many published reviews came from the code, and scans in the last 30 days (extranet). */
export const qrStats = async (hotelId) => {
  const [reviews, scans] = await Promise.all([
    prisma.review.count({ where: { hotelId, source: 'QR' } }),
    prisma.analyticsEvent.count({ where: { hotelId, eventType: 'FEEDBACK_QR_SCANNED', createdAt: { gte: new Date(Date.now() - 30 * DAY) } } }),
  ]);
  return { reviews, scans30d: scans };
};

export default { feedbackUrl, qrPng, qrCardPdf, hotelFromRef, feedbackPage, qrStats };
