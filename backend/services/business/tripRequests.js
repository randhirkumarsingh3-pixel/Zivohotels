/**
 * ZivoPlus for Business: trip requests for the travel desk.
 *
 *  submit   an employee asks for a stay: city, dates, rooms, guests, purpose (for themselves; a
 *           booker or admin can ask for a colleague)
 *  queue    the travel desk (bookers and admins) sees requests waiting; booking one from the
 *           Book tab links the booking and marks the request BOOKED (approval rules still apply)
 *  decline  the travel desk declines with a reason; the requester cancels their own while waiting
 * The requester and traveller are notified at each step.
 */
import prisma from '../../config/db.js';
import { membershipFor, can, PORTAL } from './organisationService.js';
import { notifyUser } from '../notifyService.js';

const fail = (m, code = 400) => Object.assign(new Error(m), { statusCode: code });
const clean = (v, max) => String(v ?? '').trim().replace(/\s+/g, ' ').slice(0, max);
const day = (d) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
const isDesk = (member) => can(member, 'bookings.viewAll') && ['ADMIN', 'BOOKER'].includes(member.role);

const view = (t, names = {}) => ({
  id: t.id, status: t.status, city: t.city, checkIn: t.checkIn, checkOut: t.checkOut, rooms: t.rooms, adults: t.adults, purpose: t.purpose, notes: t.notes,
  preferredHotelId: t.preferredHotelId, bookingId: t.bookingId, handlerNote: t.handlerNote, handledAt: t.handledAt, createdAt: t.createdAt,
  requesterMemberId: t.requesterMemberId, travellerMemberId: t.travellerMemberId,
  requester: names[t.requesterMemberId] || null, traveller: names[t.travellerMemberId] || null, handledBy: names[t.handledByMemberId] || null,
});

const namesFor = async (orgId) => {
  const ms = await prisma.orgMember.findMany({ where: { organisationId: orgId }, include: { user: { select: { name: true } } } });
  return Object.fromEntries(ms.map((m) => [m.id, m.user.name]));
};

const companyCtx = async (orgId, user) => {
  const { org, member } = await membershipFor(orgId, user);
  if (org.kind !== 'CORPORATE') throw fail('Trip requests are for company accounts.');
  if (org.status !== 'ACTIVE') throw fail('Your organisation isn\'t active on ZivoPlus.', 409);
  return { org, member };
};

const notifyMember = async (memberId, n) => {
  const m = await prisma.orgMember.findUnique({ where: { id: memberId }, select: { userId: true } });
  if (m) await notifyUser(m.userId, n);
};

export const submitTrip = async (orgId, user, input = {}) => {
  const { org, member } = await companyCtx(orgId, user);
  let travellerId = member.id;
  if (input.travellerMemberId && input.travellerMemberId !== member.id) {
    if (!isDesk(member)) throw fail('Ask for your own trips; the travel desk can ask for others.', 403);
    const t = await prisma.orgMember.findFirst({ where: { id: String(input.travellerMemberId), organisationId: org.id, status: 'ACTIVE' } });
    if (!t) throw fail('Choose a traveller from your company.');
    travellerId = t.id;
  }
  const city = clean(input.city, 80);
  const purpose = clean(input.purpose, 300);
  const checkIn = new Date(input.checkIn); const checkOut = new Date(input.checkOut);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  if (city.length < 2) throw fail('Which city is the trip to?');
  if (Number.isNaN(+checkIn) || Number.isNaN(+checkOut) || checkOut <= checkIn) throw fail('Choose check-in and check-out dates.');
  if (checkIn < today) throw fail('Check-in can\'t be in the past.');
  if ((checkOut - checkIn) / 86400000 > 60) throw fail('A trip request can be up to 60 nights.');
  if (purpose.length < 3) throw fail('Say what the trip is for (e.g. client meeting).');
  const rooms = Math.min(Math.max(Math.round(Number(input.rooms) || 1), 1), 8);
  const adults = Math.min(Math.max(Math.round(Number(input.adults) || 1), 1), 6);
  const t = await prisma.tripRequest.create({ data: {
    organisationId: org.id, requesterMemberId: member.id, travellerMemberId: travellerId, city, checkIn, checkOut, rooms, adults, purpose,
    preferredHotelId: input.preferredHotelId ? String(input.preferredHotelId) : null, notes: clean(input.notes, 500) || null,
  } });
  await prisma.auditLog.create({ data: { action: 'ORG_TRIP_REQUESTED', entityType: 'ORGANISATION', entityId: org.id, userId: user.id, details: { tripRequestId: t.id, city, checkIn, checkOut } } }).catch(() => {});
  const desk = await prisma.orgMember.findMany({ where: { organisationId: org.id, status: 'ACTIVE', role: { in: ['BOOKER', 'ADMIN'] }, NOT: { id: member.id } }, select: { userId: true } });
  for (const d of desk) {
    await notifyUser(d.userId, { type: 'ORG_TRIP_REQUEST', title: 'New trip request', message: `${user.name}: ${city}, ${day(checkIn)} to ${day(checkOut)} (${purpose}).`, link: `${PORTAL[org.kind].path}?tab=trips` });
  }
  return view(t, await namesFor(org.id));
};

/** The travel desk sees every request; everyone else the ones they asked for or travel on. */
export const listTrips = async (orgId, user, { status } = {}) => {
  const { org, member } = await companyCtx(orgId, user);
  const where = { organisationId: org.id };
  if (['SUBMITTED', 'BOOKED', 'DECLINED', 'CANCELLED'].includes(status)) where.status = status;
  if (!isDesk(member)) where.OR = [{ requesterMemberId: member.id }, { travellerMemberId: member.id }];
  const rows = await prisma.tripRequest.findMany({ where, orderBy: [{ status: 'desc' }, { checkIn: 'asc' }], take: 200 });
  const names = await namesFor(org.id);
  return { desk: isDesk(member), trips: rows.map((t) => view(t, names)) };
};

const loadTrip = async (org, id) => {
  const t = await prisma.tripRequest.findFirst({ where: { id: String(id), organisationId: org.id } });
  if (!t) throw fail('Trip request not found', 404);
  return t;
};

export const declineTrip = async (orgId, user, id, { note } = {}) => {
  const { org, member } = await companyCtx(orgId, user);
  if (!isDesk(member)) throw fail('Only the travel desk (bookers and admins) can decline requests.', 403);
  const t = await loadTrip(org, id);
  if (t.status !== 'SUBMITTED') throw fail('This request was already handled.', 409);
  const text = clean(note, 300);
  if (text.length < 3) throw fail('Say why, for the traveller.');
  const u = await prisma.tripRequest.update({ where: { id: t.id }, data: { status: 'DECLINED', handledByMemberId: member.id, handledAt: new Date(), handlerNote: text } });
  for (const mid of new Set([t.requesterMemberId, t.travellerMemberId])) {
    await notifyMember(mid, { type: 'ORG_TRIP_DECLINED', title: 'Trip request declined', message: `${t.city}, ${day(t.checkIn)}: ${text}`, link: `${PORTAL[org.kind].path}?tab=trips`, email: { subject: `Trip request declined: ${t.city}, ${day(t.checkIn)}`, html: `<p>${user.name} declined your trip request to ${t.city} (${day(t.checkIn)} to ${day(t.checkOut)}): ${text.replace(/[<>&]/g, '')}</p>` } });
  }
  return view(u, await namesFor(org.id));
};

export const cancelTrip = async (orgId, user, id) => {
  const { org, member } = await companyCtx(orgId, user);
  const t = await loadTrip(org, id);
  if (t.requesterMemberId !== member.id && !isDesk(member)) throw fail('Only whoever asked for it can cancel this request.', 403);
  if (t.status !== 'SUBMITTED') throw fail('This request was already handled. Cancel the booking instead.', 409);
  const u = await prisma.tripRequest.update({ where: { id: t.id }, data: { status: 'CANCELLED', handledByMemberId: member.id, handledAt: new Date() } });
  return view(u, await namesFor(org.id));
};

/**
 * Checks a request can be booked by this person for this traveller (from book()), and after the
 * booking is made links it and tells the requester and traveller.
 */
export const tripForBooking = async (org, member, tripRequestId, travellerMemberId) => {
  if (!tripRequestId) return null;
  if (!isDesk(member)) throw fail('Only the travel desk books trip requests.', 403);
  const t = await loadTrip(org, tripRequestId);
  if (t.status !== 'SUBMITTED') throw fail('This trip request was already handled.', 409);
  if ((travellerMemberId || member.id) !== t.travellerMemberId) throw fail('Book this request for its traveller.');
  return t;
};

export const markTripBooked = async (org, member, user, trip, booking) => {
  await prisma.tripRequest.update({ where: { id: trip.id }, data: { status: 'BOOKED', bookingId: booking.id, handledByMemberId: member.id, handledAt: new Date() } });
  const pending = booking.status === 'PENDING';
  for (const mid of new Set([trip.requesterMemberId, trip.travellerMemberId])) {
    await notifyMember(mid, { type: 'ORG_TRIP_BOOKED', title: pending ? 'Trip booked: waiting for approval' : 'Trip booked', message: `${trip.city}, ${day(trip.checkIn)}: ${booking.hotel?.name || 'hotel'} (${booking.bookingRef}).`, link: `${PORTAL[org.kind].path}?tab=bookings` });
  }
};

export default { submitTrip, listTrips, declineTrip, cancelTrip, tripForBooking, markTripBooked };
