/**
 * Group stays for companies (ZivoPlus for Business) and travel agents (Partner Hub): 9 to 60 rooms
 * at one hotel, at a rate the hotel quotes.
 *
 *  request   the company's travel desk (admins, bookers) or an agent asks: hotel, dates, rooms per
 *            room type and guests per room, what it is for
 *  quote     the hotel (Extranet → Business rates) answers with a rate per room per night before
 *            GST and a rate plan for each room type, valid until a date (it can quote again while
 *            the request is open), or declines with a reason
 *  accept    the requester books it at the quote: paid from the account, or held until the
 *            deadline; it is never above the website's price for those dates
 *  rooming   the names in each room (businessBookingService.roomingList / saveRoomingList)
 *
 * Statuses: SUBMITTED → QUOTED → ACCEPTED; SUBMITTED | QUOTED → DECLINED (hotel) | CANCELLED
 * (requester). A quote past its date can't be accepted (the hotel can quote again).
 */
import prisma from '../../config/db.js';
import { notifyHotel, notifyUser } from '../notifyService.js';
import { membershipFor, can, PORTAL } from './organisationService.js';
import { groupQuotePrice, bookGroup } from './businessBookingService.js';

const fail = (m, code = 400) => Object.assign(new Error(m), { statusCode: code });
const clean = (v, max) => String(v ?? '').trim().replace(/\s+/g, ' ').slice(0, max);
const DAY = 86400000;
export const MIN_GROUP_ROOMS = 9;
export const MAX_GROUP_ROOMS = 60;
const ymd = (d) => new Date(d).toISOString().slice(0, 10);
const istToday = () => new Date(Date.now() + 5.5 * 3600000).toISOString().slice(0, 10);
const dateOnly = (v) => {
  const s = String(v || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00.000Z`);
  return Number.isNaN(+d) ? null : d;
};
const dayLabel = (d) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const nightsOf = (r) => Math.round((new Date(r.checkOut) - new Date(r.checkIn)) / DAY);
const roomsOf = (r) => (r.lines || []).reduce((t, l) => t + l.rooms, 0);

/** Who in the organisation handles group stays: company admins and bookers; anyone booking at an agency. */
const isGroupDesk = (org, member) => can(member, 'bookings.create') && (org.kind === 'AGENCY' || ['ADMIN', 'BOOKER'].includes(member.role));

const quoteView = (r) => {
  if (!r.quote) return null;
  const nights = nightsOf(r);
  const lines = r.quote.lines.map((q) => {
    const want = r.lines.find((l) => l.roomTypeId === q.roomTypeId) || { rooms: 0 };
    return { ...q, rooms: want.rooms, amount: Math.round(q.nightlyRate * want.rooms * nights) };
  });
  return { lines, total: lines.reduce((t, l) => t + l.amount, 0), validUntil: r.quote.validUntil, note: r.quote.note || null, quotedAt: r.quote.quotedAt, expired: r.status === 'QUOTED' && r.quote.validUntil < istToday() };
};

const view = (r, extra = {}) => ({
  id: r.id, status: r.status, hotelId: r.hotelId, checkIn: ymd(r.checkIn), checkOut: ymd(r.checkOut), nights: nightsOf(r), rooms: roomsOf(r),
  lines: r.lines, purpose: r.purpose, notes: r.notes, declineNote: r.declineNote, bookingId: r.bookingId, createdAt: r.createdAt,
  quote: quoteView(r),
  ...(r.hotel ? { hotel: { id: r.hotel.id, name: r.hotel.name, city: r.hotel.city } } : {}),
  ...(r.organisation ? { organisation: { id: r.organisation.id, name: r.organisation.name, code: r.organisation.code, kind: r.organisation.kind } } : {}),
  ...extra,
});
const include = { hotel: { select: { id: true, name: true, city: true } }, organisation: { select: { id: true, name: true, code: true, kind: true } } };

const groupCtx = async (orgId, user) => {
  const { org, member } = await membershipFor(orgId, user);
  if (org.status !== 'ACTIVE') throw fail('Your organisation isn\'t active on ZivoPlus.', 409);
  return { org, member };
};

// ─── Requester (company / agency) ────────────────────────────────────────────
/** Live hotels to ask, with their room types (name, how many guests fit). */
export const hotelChoices = async (orgId, user, q = '') => {
  const { org, member } = await groupCtx(orgId, user);
  if (!isGroupDesk(org, member)) throw fail('Only your travel desk can ask for group stays.', 403);
  const s = clean(q, 60);
  return prisma.hotel.findMany({
    where: { isDeleted: false, status: { in: ['LIVE', 'ACTIVE'] }, ...(s ? { OR: [{ name: { contains: s, mode: 'insensitive' } }, { city: { contains: s, mode: 'insensitive' } }] } : {}) },
    select: { id: true, name: true, city: true, roomTypes: { where: { isActive: true }, select: { id: true, name: true, maxOccupancy: true, totalInventory: true } } },
    orderBy: { name: 'asc' }, take: 20,
  });
};

export const submit = async (orgId, user, input = {}) => {
  const { org, member } = await groupCtx(orgId, user);
  if (!isGroupDesk(org, member)) throw fail('Only your travel desk can ask for group stays.', 403);
  const hotel = await prisma.hotel.findFirst({ where: { id: String(input.hotelId || ''), isDeleted: false, status: { in: ['LIVE', 'ACTIVE'] } }, select: { id: true, name: true, city: true, roomTypes: { where: { isActive: true }, select: { id: true, name: true, maxOccupancy: true } } } });
  if (!hotel) throw fail('Choose a hotel.');
  const checkIn = dateOnly(input.checkIn); const checkOut = dateOnly(input.checkOut);
  if (!checkIn || !checkOut || checkOut <= checkIn) throw fail('Choose check-in and check-out dates.');
  if (ymd(checkIn) <= istToday()) throw fail('Group stays start from tomorrow: the hotel needs time to quote.');
  if ((checkOut - checkIn) / DAY > 30) throw fail('A group stay can be up to 30 nights.');
  const seen = new Set();
  const lines = (Array.isArray(input.lines) ? input.lines : []).filter((l) => Number(l?.rooms) > 0).map((l) => {
    const rt = hotel.roomTypes.find((x) => x.id === String(l.roomTypeId));
    if (!rt) throw fail('Choose room types of this hotel.');
    if (seen.has(rt.id)) throw fail(`${rt.name} is listed twice.`);
    seen.add(rt.id);
    const rooms = Math.round(Number(l.rooms)); const adults = Math.round(Number(l.adults) || 1);
    if (!(adults >= 1 && adults <= (rt.maxOccupancy || 2))) throw fail(`${rt.name} fits 1 to ${rt.maxOccupancy || 2} guests per room.`);
    return { roomTypeId: rt.id, roomTypeName: rt.name, rooms, adults };
  });
  const total = lines.reduce((t, l) => t + l.rooms, 0);
  if (total < MIN_GROUP_ROOMS) throw fail(`A group is ${MIN_GROUP_ROOMS} rooms or more. For fewer, book them directly.`);
  if (total > MAX_GROUP_ROOMS) throw fail(`A group can be up to ${MAX_GROUP_ROOMS} rooms.`);
  const purpose = clean(input.purpose, 200);
  if (purpose.length < 3) throw fail('Say what the group is for (e.g. sales offsite, wedding guests).');
  const r = await prisma.groupRequest.create({ data: { organisationId: org.id, requesterMemberId: member.id, hotelId: hotel.id, checkIn, checkOut, lines, purpose, notes: clean(input.notes, 1000) || null }, include });
  await prisma.auditLog.create({ data: { action: 'ORG_GROUP_REQUESTED', entityType: 'ORGANISATION', entityId: org.id, userId: user.id, details: { groupRequestId: r.id, hotelId: hotel.id, rooms: total, checkIn: ymd(checkIn), checkOut: ymd(checkOut) } } }).catch(() => {});
  const what = `${total} rooms, ${dayLabel(checkIn)} to ${dayLabel(checkOut)} (${lines.map((l) => `${l.rooms} × ${l.roomTypeName}`).join(', ')}) for ${org.name}: ${purpose}`;
  await notifyHotel(hotel.id, {
    type: 'GROUP_REQUEST', title: 'Group request to quote', message: `${hotel.name}: ${what}. Quote it in Business rates.`, metadata: { groupRequestId: r.id, link: '/extranet/business-rates' },
    email: { subject: `Group request: ${total} rooms at ${hotel.name}`, html: `<p>${org.name} asks for a group stay at ${hotel.name}: <strong>${what}</strong>.</p>${r.notes ? `<p>Notes: ${r.notes.replace(/[<>&]/g, '')}</p>` : ''}<p>Quote a group rate or decline in the ZivoPlus extranet → Business rates.</p>` },
  }).catch(() => {});
  return view(r);
};

export const listForOrg = async (orgId, user) => {
  const { org, member } = await membershipFor(orgId, user);
  const where = { organisationId: org.id };
  if (!can(member, 'bookings.viewAll') && !isGroupDesk(org, member)) where.requesterMemberId = member.id;
  const rows = await prisma.groupRequest.findMany({ where, include, orderBy: { createdAt: 'desc' }, take: 100 });
  return { desk: isGroupDesk(org, member), requests: rows.map((r) => view(r)) };
};

const loadForOrg = async (org, id) => {
  const r = await prisma.groupRequest.findFirst({ where: { id: String(id), organisationId: org.id }, include });
  if (!r) throw fail('Group request not found', 404);
  return r;
};

export const cancel = async (orgId, user, id) => {
  const { org, member } = await groupCtx(orgId, user);
  const r = await loadForOrg(org, id);
  if (r.requesterMemberId !== member.id && !isGroupDesk(org, member)) throw fail('Only your travel desk can cancel this request.', 403);
  if (!['SUBMITTED', 'QUOTED'].includes(r.status)) throw fail('This request can\'t be cancelled now. Cancel the booking instead.', 409);
  const u = await prisma.groupRequest.update({ where: { id: r.id }, data: { status: 'CANCELLED' }, include });
  await notifyHotel(r.hotelId, { type: 'GROUP_REQUEST_CANCELLED', title: 'Group request withdrawn', message: `${org.name}: ${roomsOf(r)} rooms, ${dayLabel(r.checkIn)} to ${dayLabel(r.checkOut)}.`, metadata: { groupRequestId: r.id } }).catch(() => {});
  return view(u);
};

/** The exact price of the quote now (GST included), before accepting. */
export const price = async (orgId, user, id) => {
  const { org, member } = await groupCtx(orgId, user);
  if (!isGroupDesk(org, member)) throw fail('Only your travel desk can book group stays.', 403);
  const r = await loadForOrg(org, id);
  if (r.status !== 'QUOTED') throw fail('This request has no quote to accept.', 409);
  return groupQuotePrice(org.id, user, r);
};

export const accept = async (orgId, user, id, input = {}, ctx = {}) => {
  const { org, member } = await groupCtx(orgId, user);
  if (!isGroupDesk(org, member)) throw fail('Only your travel desk can book group stays.', 403);
  const r = await loadForOrg(org, id);
  if (r.status !== 'QUOTED') throw fail('This request has no quote to accept.', 409);
  if (r.quote.validUntil < istToday()) throw fail('The hotel\'s quote has expired. Ask them to quote again.', 409);
  // Claim the request first so it is booked once
  const claimed = await prisma.groupRequest.updateMany({ where: { id: r.id, status: 'QUOTED' }, data: { status: 'BOOKING' } });
  if (!claimed.count) throw fail('This request is already being booked.', 409);
  let booking;
  try {
    booking = await bookGroup(org.id, user, r, input, ctx);
  } catch (e) {
    await prisma.groupRequest.update({ where: { id: r.id }, data: { status: 'QUOTED' } });
    throw e;
  }
  await prisma.groupRequest.update({ where: { id: r.id }, data: { status: 'ACCEPTED', bookingId: booking.id } });
  await notifyHotel(r.hotelId, {
    type: 'GROUP_ACCEPTED', title: 'Group booked', message: `${org.name} booked ${roomsOf(r)} rooms at your group rate, ${dayLabel(r.checkIn)} to ${dayLabel(r.checkOut)} (${booking.bookingRef}).`, metadata: { groupRequestId: r.id, bookingId: booking.id },
  }).catch(() => {});
  return { request: view(await loadForOrg(org, r.id)), booking };
};

// ─── Hotel (extranet) ────────────────────────────────────────────────────────
export const hotelList = async (hotelId) => {
  const rows = await prisma.groupRequest.findMany({ where: { hotelId: String(hotelId), status: { not: 'BOOKING' } }, include, orderBy: { createdAt: 'desc' }, take: 100 });
  // Each room type's rate plans, to quote with (and their usual price as a guide)
  const plans = await prisma.ratePlan.findMany({ where: { roomType: { hotelId: String(hotelId) }, isActive: true }, select: { id: true, name: true, roomTypeId: true, basePrice: true } });
  return rows.map((r) => view(r, { ratePlans: Object.fromEntries(r.lines.map((l) => [l.roomTypeId, plans.filter((p) => p.roomTypeId === l.roomTypeId).map((p) => ({ id: p.id, name: p.name, basePrice: Number(p.basePrice) }))])) }));
};

const tellRequester = async (r, n) => {
  const ids = new Set();
  const requester = await prisma.orgMember.findUnique({ where: { id: r.requesterMemberId }, select: { userId: true } });
  if (requester) ids.add(requester.userId);
  const desk = await prisma.orgMember.findMany({ where: { organisationId: r.organisationId, status: 'ACTIVE', role: { in: ['ADMIN', 'BOOKER'] } }, select: { userId: true } });
  desk.forEach((d) => ids.add(d.userId));
  for (const uid of ids) await notifyUser(uid, n).catch(() => {});
};

export const hotelQuote = async (hotelId, user, id, input = {}) => {
  const r = await prisma.groupRequest.findFirst({ where: { id: String(id), hotelId: String(hotelId) }, include });
  if (!r) throw fail('Group request not found', 404);
  if (!['SUBMITTED', 'QUOTED'].includes(r.status)) throw fail('This request is closed.', 409);
  const plans = await prisma.ratePlan.findMany({ where: { roomType: { hotelId: r.hotelId }, isActive: true }, select: { id: true, name: true, roomTypeId: true } });
  const given = Array.isArray(input.lines) ? input.lines : [];
  const lines = r.lines.map((l) => {
    const q = given.find((x) => x.roomTypeId === l.roomTypeId);
    if (!q) throw fail(`Quote a rate for ${l.roomTypeName}.`);
    const plan = plans.find((p) => p.id === String(q.ratePlanId) && p.roomTypeId === l.roomTypeId);
    if (!plan) throw fail(`Choose the rate plan (meals) for ${l.roomTypeName}.`);
    const nightlyRate = Math.round(Number(q.nightlyRate));
    if (!(nightlyRate >= 300 && nightlyRate <= 500000)) throw fail(`The rate for ${l.roomTypeName} must be between ₹300 and ₹5,00,000 a night.`);
    return { roomTypeId: l.roomTypeId, roomTypeName: l.roomTypeName, ratePlanId: plan.id, ratePlanName: plan.name, nightlyRate };
  });
  const validUntil = dateOnly(input.validUntil);
  if (!validUntil || ymd(validUntil) < istToday()) throw fail('Choose until when the quote is valid (today or later).');
  if (validUntil >= new Date(r.checkIn)) throw fail('The quote must be valid until before check-in.');
  const quote = { lines, validUntil: ymd(validUntil), note: clean(input.note, 500) || null, quotedAt: new Date().toISOString(), quotedById: user.id };
  const u = await prisma.groupRequest.update({ where: { id: r.id }, data: { status: 'QUOTED', quote, quoteValidUntil: validUntil }, include });
  await prisma.auditLog.create({ data: { action: 'GROUP_QUOTED', entityType: 'HOTEL', entityId: r.hotelId, userId: user.id, details: { groupRequestId: r.id, lines: lines.map((l) => ({ roomTypeId: l.roomTypeId, nightlyRate: l.nightlyRate })), validUntil: quote.validUntil } } }).catch(() => {});
  const q = quoteView(u);
  await tellRequester(r, {
    type: 'GROUP_QUOTED', title: `Group quote from ${r.hotel.name}`, message: `${roomsOf(r)} rooms, ${dayLabel(r.checkIn)} to ${dayLabel(r.checkOut)}: ₹${q.total.toLocaleString('en-IN')} before GST, valid until ${dayLabel(validUntil)}.`, link: `${PORTAL[r.organisation.kind].path}?tab=groups`,
    email: { subject: `Group quote: ${r.hotel.name}, ${dayLabel(r.checkIn)}`, html: `<p>${r.hotel.name} quoted your group request (${roomsOf(r)} rooms, ${dayLabel(r.checkIn)} to ${dayLabel(r.checkOut)}):</p><ul>${q.lines.map((l) => `<li>${l.rooms} × ${l.roomTypeName}, ${l.ratePlanName}: ₹${l.nightlyRate.toLocaleString('en-IN')} a night</li>`).join('')}</ul><p>Total ₹${q.total.toLocaleString('en-IN')} before GST, valid until ${dayLabel(validUntil)}. Accept it in the Groups tab.</p>` },
  });
  return view(u);
};

export const hotelDecline = async (hotelId, user, id, { note } = {}) => {
  const r = await prisma.groupRequest.findFirst({ where: { id: String(id), hotelId: String(hotelId) }, include });
  if (!r) throw fail('Group request not found', 404);
  if (!['SUBMITTED', 'QUOTED'].includes(r.status)) throw fail('This request is closed.', 409);
  const text = clean(note, 300);
  if (text.length < 3) throw fail('Say why, for the company or agent.');
  const u = await prisma.groupRequest.update({ where: { id: r.id }, data: { status: 'DECLINED', declineNote: text }, include });
  await prisma.auditLog.create({ data: { action: 'GROUP_DECLINED', entityType: 'HOTEL', entityId: r.hotelId, userId: user.id, details: { groupRequestId: r.id, note: text } } }).catch(() => {});
  await tellRequester(r, { type: 'GROUP_DECLINED', title: `Group request declined: ${r.hotel.name}`, message: `${roomsOf(r)} rooms, ${dayLabel(r.checkIn)}: ${text}`, link: `${PORTAL[r.organisation.kind].path}?tab=groups` });
  return view(u);
};

export default { hotelChoices, submit, listForOrg, cancel, price, accept, hotelList, hotelQuote, hotelDecline, MIN_GROUP_ROOMS, MAX_GROUP_ROOMS };
