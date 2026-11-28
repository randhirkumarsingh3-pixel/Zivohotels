/**
 * ZivoPlus for Business: rates agreed between a company and a hotel (CorporateRate).
 *
 *  propose   ZivoPlus (Admin → Organisations) enters the rate agreed with both sides: for all rooms
 *            or one room type, a % off or a fixed tariff per night, valid between two dates
 *  decide    the hotel accepts (it applies from then on) or declines with a reason, in the extranet
 *  end       ZivoPlus ends a rate early (or withdraws a proposal)
 *  price     company bookings at the hotel get, room by room, the agreed rate or the hotel's
 *            general company discount, whichever is better for the company; only on the nights
 *            the rate is valid for
 *
 * Statuses: PROPOSED → ACTIVE | DECLINED; PROPOSED | ACTIVE → ENDED. A rate past its end date is
 * shown as expired but needs no change.
 */
import prisma from '../../config/db.js';
import { notifyHotel, notifyUser } from '../notifyService.js';
import { PORTAL } from './organisationService.js';

const fail = (m, code = 400) => Object.assign(new Error(m), { statusCode: code });
const round = (n) => Math.round(Number(n) || 0);
const DAY = 86400000;
const KINDS = ['PERCENT', 'FIXED'];
const clean = (v, max) => String(v ?? '').trim().replace(/\s+/g, ' ').slice(0, max);
const dateOnly = (v) => {
  const s = String(v || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00.000Z`);
  return Number.isNaN(+d) ? null : d;
};
const ymd = (d) => new Date(d).toISOString().slice(0, 10);
const dayLabel = (d) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
/** A stay night's date (YYYY-MM-DD in India) */
const istDay = (d) => new Date(new Date(d).getTime() + 5.5 * 3600000).toISOString().slice(0, 10);

export const describeRate = (r) => (r.kind === 'FIXED'
  ? `₹${Number(r.value).toLocaleString('en-IN')} a night${r.roomTypeName ? ` for ${r.roomTypeName}` : ''}`
  : `${Number(r.value)}% off${r.roomTypeName ? ` ${r.roomTypeName}` : ' all rooms'}`);

const state = (r, today = ymd(new Date())) => {
  if (r.status === 'ACTIVE' && ymd(r.validTo) < today) return 'EXPIRED';
  if (r.status === 'ACTIVE' && ymd(r.validFrom) > today) return 'UPCOMING';
  return r.status;
};

const view = (r) => ({
  id: r.id, organisationId: r.organisationId, hotelId: r.hotelId, roomTypeId: r.roomTypeId, roomTypeName: r.roomTypeName,
  kind: r.kind, value: Number(r.value), validFrom: ymd(r.validFrom), validTo: ymd(r.validTo), status: r.status, state: state(r),
  label: describeRate(r), notes: r.notes, decisionNote: r.decisionNote, decidedAt: r.decidedAt, createdAt: r.createdAt,
  ...(r.organisation ? { organisation: { id: r.organisation.id, name: r.organisation.name, code: r.organisation.code } } : {}),
  ...(r.hotel ? { hotel: { id: r.hotel.id, name: r.hotel.name, city: r.hotel.city } } : {}),
});
const include = { organisation: { select: { id: true, name: true, code: true } }, hotel: { select: { id: true, name: true, city: true } } };

/** Rates overlapping [from, to] for the same company, hotel and room scope (all rooms or one type). */
const overlapping = (data, excludeId) => prisma.corporateRate.findFirst({
  where: {
    organisationId: data.organisationId, hotelId: data.hotelId, roomTypeId: data.roomTypeId, status: { in: ['PROPOSED', 'ACTIVE'] },
    validFrom: { lte: data.validTo }, validTo: { gte: data.validFrom }, ...(excludeId ? { NOT: { id: excludeId } } : {}),
  },
});

// ─── ZivoPlus admin ──────────────────────────────────────────────────────────
export const adminList = async ({ organisationId, hotelId } = {}) => {
  const where = {};
  if (organisationId) where.organisationId = String(organisationId);
  if (hotelId) where.hotelId = String(hotelId);
  const rows = await prisma.corporateRate.findMany({ where, include, orderBy: [{ createdAt: 'desc' }], take: 300 });
  return rows.map(view);
};

/** The hotels and room types ZivoPlus can agree a rate at (live hotels), for the admin form. */
export const hotelChoices = async (q = '') => {
  const s = clean(q, 60);
  const hotels = await prisma.hotel.findMany({
    where: { isDeleted: false, status: { in: ['LIVE', 'ACTIVE'] }, ...(s ? { OR: [{ name: { contains: s, mode: 'insensitive' } }, { city: { contains: s, mode: 'insensitive' } }] } : {}) },
    select: { id: true, name: true, city: true, roomTypes: { where: { isActive: true }, select: { id: true, name: true } } },
    orderBy: { name: 'asc' }, take: 20,
  });
  return hotels;
};

export const propose = async (orgId, admin, input = {}) => {
  const org = await prisma.organisation.findUnique({ where: { id: String(orgId) } });
  if (!org) throw fail('Organisation not found', 404);
  if (org.kind !== 'CORPORATE') throw fail('Agreed rates are for company accounts.');
  if (org.status !== 'ACTIVE') throw fail('Approve the company before agreeing rates for it.', 409);
  const hotel = await prisma.hotel.findFirst({ where: { id: String(input.hotelId || ''), isDeleted: false }, select: { id: true, name: true, city: true, status: true } });
  if (!hotel) throw fail('Choose a hotel.');
  if (!['LIVE', 'ACTIVE'].includes(hotel.status)) throw fail('The hotel isn\'t live on ZivoPlus.', 409);
  const kind = String(input.kind || 'PERCENT').toUpperCase();
  if (!KINDS.includes(kind)) throw fail('Choose a % off or a fixed rate per night.');
  let roomType = null;
  if (input.roomTypeId) {
    roomType = await prisma.roomType.findFirst({ where: { id: String(input.roomTypeId), hotelId: hotel.id, isActive: true }, select: { id: true, name: true } });
    if (!roomType) throw fail('Choose a room type of this hotel.');
  }
  if (kind === 'FIXED' && !roomType) throw fail('A fixed rate is for one room type: choose it.');
  const value = Math.round(Number(input.value) * 100) / 100;
  if (kind === 'PERCENT' && !(value >= 1 && value <= 60)) throw fail('The discount must be between 1% and 60%.');
  if (kind === 'FIXED' && !(value >= 300 && value <= 500000)) throw fail('The rate per night must be between ₹300 and ₹5,00,000.');
  const validFrom = dateOnly(input.validFrom); const validTo = dateOnly(input.validTo);
  if (!validFrom || !validTo) throw fail('Choose the dates the rate is valid from and to.');
  if (validTo < validFrom) throw fail('The end date must be on or after the start date.');
  if (ymd(validTo) < ymd(new Date())) throw fail('The rate would already have ended.');
  if ((validTo - validFrom) / DAY > 731) throw fail('A rate can be agreed for up to two years at a time.');
  const data = { organisationId: org.id, hotelId: hotel.id, roomTypeId: roomType?.id || null, roomTypeName: roomType?.name || null, kind, value, validFrom, validTo };
  const clash = await overlapping(data);
  if (clash) throw fail(`There is already a ${clash.status === 'ACTIVE' ? 'rate' : 'proposed rate'} for ${roomType ? roomType.name : 'all rooms'} at this hotel for ${org.name} from ${dayLabel(clash.validFrom)} to ${dayLabel(clash.validTo)}. End it first, or choose other dates.`, 409);
  const r = await prisma.corporateRate.create({ data: { ...data, notes: clean(input.notes, 500) || null, proposedById: admin.id }, include });
  await prisma.auditLog.create({ data: { action: 'CORPORATE_RATE_PROPOSED', entityType: 'ORGANISATION', entityId: org.id, userId: admin.id, details: { rateId: r.id, hotelId: hotel.id, kind, value, validFrom: ymd(validFrom), validTo: ymd(validTo), roomTypeId: data.roomTypeId } } }).catch(() => {});
  const what = `${describeRate(r)} for ${org.name}, ${dayLabel(validFrom)} to ${dayLabel(validTo)}`;
  await notifyHotel(hotel.id, {
    type: 'CORPORATE_RATE_PROPOSED', title: 'Company rate to accept', message: `${hotel.name}: ${what}. Accept or decline it in Business rates.`, metadata: { rateId: r.id, link: '/extranet/business-rates' },
    email: { subject: `Company rate to accept: ${org.name} at ${hotel.name}`, html: `<p>ZivoPlus has proposed a company rate at ${hotel.name}: <strong>${what}</strong>.</p><p>It applies to their bookings only after you accept it. Open the ZivoPlus extranet → Business rates to accept or decline it.</p>` },
  }).catch(() => {});
  return view(r);
};

export const endRate = async (orgId, admin, rateId, { note } = {}) => {
  const r = await prisma.corporateRate.findFirst({ where: { id: String(rateId), organisationId: String(orgId) }, include });
  if (!r) throw fail('Rate not found', 404);
  if (!['PROPOSED', 'ACTIVE'].includes(r.status)) throw fail('This rate has already ended or was declined.', 409);
  const text = clean(note, 300);
  if (text.length < 3) throw fail('Say why the rate ends (shown to the hotel).');
  const u = await prisma.corporateRate.update({ where: { id: r.id }, data: { status: 'ENDED', decidedById: admin.id, decidedAt: new Date(), decisionNote: text }, include });
  await prisma.auditLog.create({ data: { action: 'CORPORATE_RATE_ENDED', entityType: 'ORGANISATION', entityId: r.organisationId, userId: admin.id, details: { rateId: r.id, was: r.status, note: text } } }).catch(() => {});
  await notifyHotel(r.hotelId, { type: 'CORPORATE_RATE_ENDED', title: r.status === 'PROPOSED' ? 'Company rate withdrawn' : 'Company rate ended', message: `${describeRate(r)} for ${r.organisation.name}: ${text}`, metadata: { rateId: r.id } }).catch(() => {});
  return view(u);
};

// ─── Hotel (extranet) ────────────────────────────────────────────────────────
export const hotelList = async (hotelId) => {
  const rows = await prisma.corporateRate.findMany({ where: { hotelId: String(hotelId) }, include, orderBy: [{ createdAt: 'desc' }], take: 200 });
  return rows.map(view);
};

export const hotelDecide = async (hotelId, user, rateId, { decision, note } = {}) => {
  const r = await prisma.corporateRate.findFirst({ where: { id: String(rateId), hotelId: String(hotelId) }, include });
  if (!r) throw fail('Rate not found', 404);
  if (r.status !== 'PROPOSED') throw fail('This rate was already answered.', 409);
  const d = String(decision || '').toUpperCase();
  if (!['ACCEPT', 'DECLINE'].includes(d)) throw fail('Accept or decline the rate.');
  const text = clean(note, 300);
  if (d === 'DECLINE' && text.length < 3) throw fail('Say why, for ZivoPlus.');
  if (d === 'ACCEPT' && ymd(r.validTo) < ymd(new Date())) throw fail('This rate has already ended. Ask ZivoPlus for a new one.', 409);
  if (d === 'ACCEPT') {
    const clash = await overlapping(r, r.id);
    if (clash && clash.status === 'ACTIVE') throw fail('Another rate for these rooms and dates is already in place.', 409);
  }
  const u = await prisma.corporateRate.update({ where: { id: r.id }, data: { status: d === 'ACCEPT' ? 'ACTIVE' : 'DECLINED', decidedById: user.id, decidedAt: new Date(), decisionNote: text || null }, include });
  await prisma.auditLog.create({ data: { action: d === 'ACCEPT' ? 'CORPORATE_RATE_ACCEPTED' : 'CORPORATE_RATE_DECLINED', entityType: 'HOTEL', entityId: r.hotelId, userId: user.id, details: { rateId: r.id, organisationId: r.organisationId, note: text || null } } }).catch(() => {});
  await notifyUser(r.proposedById, {
    type: d === 'ACCEPT' ? 'CORPORATE_RATE_ACCEPTED' : 'CORPORATE_RATE_DECLINED', title: d === 'ACCEPT' ? 'Company rate accepted' : 'Company rate declined',
    message: `${r.hotel.name}: ${describeRate(r)} for ${r.organisation.name}${text ? ` (${text})` : ''}.`, link: `/admin/companies?id=${r.organisationId}`,
  }).catch(() => {});
  if (d === 'ACCEPT') {
    const admins = await prisma.orgMember.findMany({ where: { organisationId: r.organisationId, status: 'ACTIVE', role: { in: ['ADMIN', 'BOOKER'] } }, select: { userId: true } });
    for (const a of admins) {
      await notifyUser(a.userId, { type: 'CORPORATE_RATE_ACTIVE', title: 'New company rate', message: `${r.hotel.name}, ${r.hotel.city}: ${describeRate(r)}, ${dayLabel(r.validFrom)} to ${dayLabel(r.validTo)}.`, link: `${PORTAL.CORPORATE.path}?tab=book` }).catch(() => {});
    }
  }
  return view(u);
};

// ─── Company portal and pricing ──────────────────────────────────────────────
/** The company's agreed rates in place or coming up (for the Book tab). */
export const forOrganisation = async (orgId) => {
  const today = new Date(`${ymd(new Date())}T00:00:00.000Z`);
  const rows = await prisma.corporateRate.findMany({ where: { organisationId: String(orgId), status: 'ACTIVE', validTo: { gte: today } }, include, orderBy: [{ validFrom: 'asc' }] });
  return rows.map(view);
};

/** Accepted rates of the company at the hotel that cover any night of the stay. */
export const ratesForStay = async (orgId, hotelId, checkIn, checkOut) => {
  const first = new Date(`${istDay(checkIn)}T00:00:00.000Z`);
  const last = new Date(new Date(`${istDay(checkOut)}T00:00:00.000Z`).getTime() - DAY);
  if (last < first) return [];
  return prisma.corporateRate.findMany({ where: { organisationId: String(orgId), hotelId: String(hotelId), status: 'ACTIVE', validFrom: { lte: last }, validTo: { gte: first } } });
};

/**
 * Discount per room of a priced stay (pricingDomain.calculateStay → roomsBreakdown): for each
 * room the better of the agreed rate (its own room type before an all-rooms rate) and the general
 * company discount %. Only the nights the agreed rate covers use it. Returns { amount, rooms:
 * [{ roomNumber, amount, rateId, label }], rateIds }.
 */
export const stayDiscount = (pricing, rates, { generalPct = 0, checkIn }) => {
  const nights = pricing.nights || 1;
  const stayNights = [];
  for (let t = new Date(`${istDay(checkIn)}T00:00:00.000Z`).getTime(); stayNights.length < nights; t += DAY) stayNights.push(new Date(t).toISOString().slice(0, 10));
  const rooms = (pricing.roomsBreakdown || []).map((room) => {
    const general = round(room.subtotal * generalPct / 100);
    const candidates = rates.filter((r) => r.roomTypeId === room.roomTypeId).concat(rates.filter((r) => !r.roomTypeId));
    let best = { amount: general, rateId: null, label: null };
    for (const r of candidates) {
      const covered = stayNights.filter((n) => n >= ymd(r.validFrom) && n <= ymd(r.validTo)).length;
      if (!covered) continue;
      const share = covered / nights;
      // Uncovered nights still get the general discount
      const rest = round(room.subtotal * (1 - share) * generalPct / 100);
      const agreed = r.kind === 'FIXED'
        ? Math.max(0, round(room.roomPrice * share - Number(r.value) * covered))
        : round(room.subtotal * share * Number(r.value) / 100);
      if (agreed + rest > best.amount) best = { amount: agreed + rest, rateId: r.id, label: describeRate(r) };
    }
    return { roomNumber: room.roomNumber, ...best };
  });
  return { amount: rooms.reduce((t, r) => t + r.amount, 0), rooms, rateIds: [...new Set(rooms.map((r) => r.rateId).filter(Boolean))] };
};

export default { adminList, hotelChoices, propose, endRate, hotelList, hotelDecide, forOrganisation, ratesForStay, stayDiscount, describeRate };
