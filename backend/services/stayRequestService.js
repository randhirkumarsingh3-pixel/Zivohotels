/**
 * Requests to the hotel (concierge): a guest asks for something about their stay — late arrival,
 * early check-in, airport pickup, parking… — from My Bookings. The hotel sees it in the extranet
 * (notification + email), confirms or declines it with a reply, and the guest is told by email and
 * sees the answer in My Bookings.
 */
import prisma from '../config/db.js';
import { createNotification } from './notificationService.js';
import { queueService } from './queueService.js';
import { eventBus } from './eventBus.js';
import { escapeHtml as h } from '../utils/html.js';

export const REQUEST_TYPES = {
  LATE_ARRIVAL: 'Late arrival',
  EARLY_CHECKIN: 'Early check-in',
  LATE_CHECKOUT: 'Late check-out',
  AIRPORT_PICKUP: 'Airport / station pickup',
  AIRPORT_DROP: 'Airport / station drop',
  PARKING: 'Parking',
  SPECIAL_OCCASION: 'Special occasion',
  OTHER: 'Other request',
};
const OPEN_STATUSES = ['PENDING', 'CONFIRMED'];
const MAX_OPEN_PER_BOOKING = 10;

export class StayRequestError extends Error {
  constructor(message, statusCode = 400) { super(message); this.statusCode = statusCode; }
}

const site = () => String(process.env.FRONTEND_URL || '').replace(/\/$/, '');
const fmtDay = (d) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });

import { hotelEmailRecipients, notifyUser } from './notifyService.js';
import { managesHotel } from '../utils/hotelAccess.js';

const sendEmail = (to, subject, html) => (to
  ? queueService.enqueue('email', 'SEND_STAY_REQUEST', { to, subject, html }, { priority: 3 }).catch((e) => console.error('[StayRequest] email not queued:', e.message))
  : null);

const emailShell = (title, body) => `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;color:#0f172a;max-width:560px;margin:0 auto;padding:20px">
  <h2 style="margin:0 0 12px;font-size:18px">${title}</h2>${body}
  <p style="color:#64748b;font-size:12px;margin-top:24px">ZivoHotels</p></body></html>`;

/** Who may see a booking's requests: the guest who booked, the hotel's owner, an admin. */
const canSeeBooking = (booking, user) => {
  if (!booking || !user) return false;
  if (user.role === 'ADMIN') return true;
  if (user.role === 'OWNER' && managesHotel(user, { ...booking.hotel, id: booking.hotelId || booking.hotel?.id }, 'bookings.view')) return true;
  return booking.userId === user.id;
};

const loadBooking = (bookingId) => prisma.booking.findUnique({
  where: { id: bookingId },
  include: { hotel: { select: { id: true, name: true, ownerId: true, integrationSettings: true, owner: { select: { email: true } } } } },
});

const clean = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

/** The guest's requests for one booking, newest first. */
export const listForBooking = async (bookingId, user) => {
  const booking = await loadBooking(bookingId);
  if (!canSeeBooking(booking, user)) throw new StayRequestError('Booking not found', 404);
  return prisma.stayRequest.findMany({ where: { bookingId }, orderBy: { createdAt: 'desc' } });
};

/** A guest asks the hotel for something. Only for their own confirmed booking, before check-out. */
export const createRequest = async (bookingId, user, input = {}) => {
  const booking = await loadBooking(bookingId);
  if (!booking || (booking.userId !== user.id && user.role !== 'ADMIN')) throw new StayRequestError('Booking not found', 404);
  if (!['CONFIRMED', 'CHECKED_IN'].includes(booking.status)) throw new StayRequestError('Requests can be sent for confirmed bookings only.');
  if (new Date(booking.checkOut) <= new Date()) throw new StayRequestError('This stay has ended.');

  const type = String(input.type || '').toUpperCase();
  if (!REQUEST_TYPES[type]) throw new StayRequestError('Choose what you would like to ask the hotel.');
  const details = clean(input.details, 500);
  const requestedTime = clean(input.requestedTime, 60) || null;
  if (type === 'OTHER' && details.length < 3) throw new StayRequestError('Tell the hotel what you need.');
  if (['LATE_ARRIVAL', 'AIRPORT_PICKUP', 'AIRPORT_DROP'].includes(type) && !requestedTime && details.length < 3) {
    throw new StayRequestError(type === 'LATE_ARRIVAL' ? 'Add the time you expect to arrive.' : 'Add your flight or train and its time.');
  }
  const open = await prisma.stayRequest.count({ where: { bookingId, status: { in: OPEN_STATUSES } } });
  if (open >= MAX_OPEN_PER_BOOKING) throw new StayRequestError('This booking already has 10 open requests. Wait for the hotel to answer them.');

  const request = await prisma.stayRequest.create({
    data: { bookingId, hotelId: booking.hotelId, userId: user.id, type, details, requestedTime },
  });

  const label = REQUEST_TYPES[type];
  const summary = [requestedTime, details].filter(Boolean).join(' · ');
  await createNotification({
    hotelId: booking.hotelId,
    type: 'GUEST_REQUEST',
    title: `${label}: ${booking.guestName}`,
    message: `${booking.bookingRef}, check-in ${fmtDay(booking.checkIn)}${summary ? `. ${summary}` : ''}. Answer it in Bookings.`,
    metadata: { bookingId, requestId: request.id },
  });
  eventBus.emitEvent('GUEST_REQUEST', { hotelId: booking.hotelId, bookingId, requestId: request.id }).catch(() => {});
  for (const to of hotelEmailRecipients(booking.hotel)) sendEmail(to, `Guest request: ${label} · ${booking.bookingRef}`, emailShell(`${h(label)} from ${h(booking.guestName)}`, `
    <p>Booking <b>${h(booking.bookingRef)}</b>, check-in ${fmtDay(booking.checkIn)}, check-out ${fmtDay(booking.checkOut)}.</p>
    ${requestedTime ? `<p><b>Time:</b> ${h(requestedTime)}</p>` : ''}
    ${details ? `<p><b>Details:</b> ${h(details)}</p>` : ''}
    <p>Please confirm or decline it in the extranet: ${h(site())}/extranet/bookings. The guest is told your answer.</p>`));
  return request;
};

/** The guest withdraws a request the hotel hasn't answered yet. */
export const cancelRequest = async (bookingId, requestId, user) => {
  const request = await prisma.stayRequest.findFirst({ where: { id: requestId, bookingId }, include: { booking: { select: { userId: true } } } });
  if (!request || (request.booking.userId !== user.id && user.role !== 'ADMIN')) throw new StayRequestError('Request not found', 404);
  if (request.status !== 'PENDING') throw new StayRequestError('The hotel has already answered this request.');
  const updated = await prisma.stayRequest.update({ where: { id: requestId }, data: { status: 'CANCELLED' } });
  eventBus.emitEvent('GUEST_REQUEST', { hotelId: request.hotelId, bookingId, requestId }).catch(() => {});
  return updated;
};

/** A hotel's requests (open ones first), with the booking they belong to. */
export const listForHotel = (hotelId, { status } = {}) => prisma.stayRequest.findMany({
  where: { hotelId, ...(status ? { status: String(status).toUpperCase() } : {}) },
  orderBy: [{ createdAt: 'desc' }],
  take: 200,
  include: { booking: { select: { id: true, bookingRef: true, guestName: true, guestPhone: true, checkIn: true, checkOut: true, status: true } } },
});

/** The hotel confirms or declines a request, with a reply the guest sees. */
export const respondToRequest = async (hotelId, requestId, { status, reply } = {}, user) => {
  const next = String(status || '').toUpperCase();
  if (!['CONFIRMED', 'DECLINED'].includes(next)) throw new StayRequestError('Choose Confirm or Decline.');
  const hotelReply = clean(reply, 500);
  if (next === 'DECLINED' && hotelReply.length < 3) throw new StayRequestError('Tell the guest why, or what you can offer instead.');

  const request = await prisma.stayRequest.findFirst({
    where: { id: requestId, hotelId },
    include: { booking: { select: { id: true, bookingRef: true, guestName: true, guestEmail: true } }, hotel: { select: { name: true } } },
  });
  if (!request) throw new StayRequestError('Request not found', 404);
  if (request.status === 'CANCELLED') throw new StayRequestError('The guest withdrew this request.');

  const updated = await prisma.stayRequest.update({
    where: { id: requestId },
    data: { status: next, hotelReply: hotelReply || null, respondedAt: new Date(), respondedBy: user?.id || null },
  });
  eventBus.emitEvent('GUEST_REQUEST', { hotelId, bookingId: request.bookingId, requestId }).catch(() => {});
  notifyUser(request.userId, {
    type: 'STAY_REQUEST_ANSWERED',
    title: `${request.hotel.name} ${next === 'CONFIRMED' ? 'confirmed' : 'replied to'} your request`,
    message: `${REQUEST_TYPES[request.type] || 'Request'}: ${next === 'CONFIRMED' ? 'confirmed' : 'not possible'}${hotelReply ? `. "${hotelReply.slice(0, 120)}"` : ''}`,
    link: '/my-bookings',
    metadata: { bookingId: request.bookingId, requestId },
  }).catch(() => {});

  const label = REQUEST_TYPES[request.type] || 'Your request';
  const verdict = next === 'CONFIRMED' ? 'confirmed' : 'could not arrange';
  sendEmail(request.booking.guestEmail, `${request.hotel.name} ${verdict} your request · ${request.booking.bookingRef}`, emailShell(
    `${h(request.hotel.name)} ${next === 'CONFIRMED' ? 'confirmed' : 'replied to'} your request`, `
    <p><b>${h(label)}</b> for booking ${h(request.booking.bookingRef)}: <b>${next === 'CONFIRMED' ? 'Confirmed' : 'Not possible'}</b>.</p>
    ${hotelReply ? `<p><b>The hotel says:</b> ${h(hotelReply)}</p>` : ''}
    <p>See it in My Bookings: ${h(site())}/my-bookings</p>`));
  return updated;
};
