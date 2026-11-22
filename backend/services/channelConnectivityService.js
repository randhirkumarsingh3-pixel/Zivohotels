import crypto from 'crypto';
import prisma from '../config/db.js';
import { toMoney } from '../utils/money.js';
import ariService from './ariService.js';

/**
 * Channel manager connectivity, with ZivoPlus as the OTA.
 *
 * A property either manages rates & availability in the ZivoPlus extranet, or connects its own
 * channel manager (STAAH, AxisRooms, eZee Centrix, SiteMinder...). For a connected property:
 *  - the admin records the provider, the property's code there, and maps each room type and rate
 *    plan to the channel manager's room / rate codes;
 *  - the channel manager authenticates with a per-property API key (only its hash is stored) and
 *      POSTs rates & availability   -> /api/v1/channel-manager/ari
 *      GETs new / changed bookings  -> /api/v1/channel-manager/bookings?since=
 *      GETs the mapped codes        -> /api/v1/channel-manager/property
 *  - while ACTIVE, the channel manager is the source of truth: owners can't edit ARI by hand.
 */

export const PROVIDERS = ['STAAH', 'AxisRooms', 'eZee Centrix', 'SiteMinder', 'RateGain', 'Djubo', 'Hotelogix', 'Cloudbeds', 'Other'];
const STATUSES = ['PENDING', 'ACTIVE', 'PAUSED'];
const err = (status, message) => Object.assign(new Error(message), { status });
const hashKey = (key) => crypto.createHash('sha256').update(String(key)).digest('hex');
const IST_MS = 330 * 60 * 1000;
const indiaDay = (d) => new Date(new Date(d).getTime() + IST_MS).toISOString().slice(0, 10);

const roomsAndPlans = (hotelId) => prisma.roomType.findMany({
  where: { hotelId, isActive: true },
  orderBy: { name: 'asc' },
  select: { id: true, name: true, ratePlans: { where: { isActive: true }, orderBy: { name: 'asc' }, select: { id: true, name: true, mealPlan: true } } }
});

const mappingCoverage = (rooms, mappings, provider) => {
  const mine = mappings.filter((m) => m.externalProvider === provider);
  const roomCodes = new Map(mine.filter((m) => !m.zivoRatePlanId).map((m) => [m.zivoRoomTypeId, m.externalRoomCode]));
  const rateCodes = new Map(mine.filter((m) => m.zivoRatePlanId).map((m) => [m.zivoRatePlanId, m.externalRateCode]));
  const plans = rooms.flatMap((r) => r.ratePlans);
  return {
    roomCodes, rateCodes,
    roomsMapped: rooms.filter((r) => roomCodes.get(r.id)).length, roomsTotal: rooms.length,
    plansMapped: plans.filter((p) => rateCodes.get(p.id)).length, plansTotal: plans.length,
  };
};

/** Every property with its connectivity: mode, provider, status, mapping coverage, last update. */
export const getOverview = async () => {
  const hotels = await prisma.hotel.findMany({
    where: { isDeleted: false },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, city: true, status: true, integrationMode: true }
  });
  const ids = hotels.map((h) => h.id);
  const [integrations, mappings, rooms] = await Promise.all([
    prisma.channelIntegration.findMany({ where: { hotelId: { in: ids } } }),
    prisma.channelMapping.findMany({ where: { hotelId: { in: ids } } }),
    prisma.roomType.findMany({ where: { hotelId: { in: ids }, isActive: true }, select: { id: true, hotelId: true, ratePlans: { where: { isActive: true }, select: { id: true } } } }),
  ]);
  return hotels.map((h) => {
    const integ = integrations.find((i) => i.hotelId === h.id);
    const cov = integ ? mappingCoverage(rooms.filter((r) => r.hotelId === h.id), mappings.filter((m) => m.hotelId === h.id), integ.provider) : null;
    return {
      ...h,
      mode: h.integrationMode === 'CHANNEL_MANAGER' ? 'CHANNEL_MANAGER' : 'EXTRANET',
      provider: integ?.provider || null,
      externalHotelCode: integ?.externalHotelCode || null,
      status: integ?.status || null,
      hasApiKey: Boolean(integ?.apiKeyHash),
      lastAriAt: integ?.lastAriAt || null,
      lastAriError: integ?.lastAriError || null,
      coverage: cov && { roomsMapped: cov.roomsMapped, roomsTotal: cov.roomsTotal, plansMapped: cov.plansMapped, plansTotal: cov.plansTotal },
    };
  });
};

/** One property's connection: settings, room types / rate plans and their codes. */
export const getConnection = async (hotelId) => {
  const hotel = await prisma.hotel.findUnique({ where: { id: hotelId }, select: { id: true, name: true, city: true, integrationMode: true, isDeleted: true } });
  if (!hotel || hotel.isDeleted) throw err(404, 'Property not found');
  const [integ, rooms, mappings] = await Promise.all([
    prisma.channelIntegration.findUnique({ where: { hotelId } }),
    roomsAndPlans(hotelId),
    prisma.channelMapping.findMany({ where: { hotelId } }),
  ]);
  const cov = integ ? mappingCoverage(rooms, mappings, integ.provider) : { roomCodes: new Map(), rateCodes: new Map() };
  return {
    hotel: { id: hotel.id, name: hotel.name, city: hotel.city },
    mode: hotel.integrationMode === 'CHANNEL_MANAGER' ? 'CHANNEL_MANAGER' : 'EXTRANET',
    provider: integ?.provider || '',
    externalHotelCode: integ?.externalHotelCode || '',
    status: integ?.status || 'PENDING',
    apiKeyHint: integ?.apiKeyHint || null,
    lastAriAt: integ?.lastAriAt || null,
    lastAriError: integ?.lastAriError || null,
    providers: PROVIDERS,
    roomTypes: rooms.map((r) => ({
      id: r.id, name: r.name, externalRoomCode: cov.roomCodes.get(r.id) || '',
      ratePlans: r.ratePlans.map((p) => ({ id: p.id, name: p.name, mealPlan: p.mealPlan, externalRateCode: cov.rateCodes.get(p.id) || '' })),
    })),
  };
};

const cleanCode = (v) => String(v ?? '').trim().slice(0, 64);

/** Saves mode, provider, property code and status. Going ACTIVE needs a key and full mapping. */
export const saveConnection = async (hotelId, { mode, provider, externalHotelCode, status }) => {
  const current = await getConnection(hotelId);
  if (mode === 'EXTRANET') {
    await prisma.$transaction([
      prisma.hotel.update({ where: { id: hotelId }, data: { integrationMode: 'INTERNAL', channelProvider: null, cmSyncStatus: 'INACTIVE' } }),
      prisma.channelIntegration.updateMany({ where: { hotelId }, data: { status: 'PAUSED', isActive: false } }),
    ]);
    return getConnection(hotelId);
  }
  if (mode !== 'CHANNEL_MANAGER') throw err(400, 'Choose how rates and availability are managed');
  if (!PROVIDERS.includes(provider)) throw err(400, 'Choose the channel manager');
  const code = cleanCode(externalHotelCode);
  if (!code) throw err(400, "Enter the property's code at the channel manager");
  const nextStatus = STATUSES.includes(status) ? status : 'PENDING';
  const providerChanged = current.provider && current.provider !== provider;

  if (nextStatus === 'ACTIVE') {
    const integ = await prisma.channelIntegration.findUnique({ where: { hotelId } });
    if (!integ?.apiKeyHash || providerChanged) throw err(400, 'Create an API key for the channel manager before activating');
    const rooms = await roomsAndPlans(hotelId);
    const cov = mappingCoverage(rooms, await prisma.channelMapping.findMany({ where: { hotelId } }), provider);
    if (cov.roomsMapped < cov.roomsTotal || cov.plansMapped < cov.plansTotal) {
      throw err(400, `Map every room type and rate plan before activating (${cov.roomsMapped}/${cov.roomsTotal} rooms, ${cov.plansMapped}/${cov.plansTotal} rate plans mapped)`);
    }
  }

  await prisma.$transaction([
    prisma.channelIntegration.upsert({
      where: { hotelId },
      create: { hotelId, provider, credentials: {}, externalHotelCode: code, status: nextStatus, isActive: nextStatus !== 'PAUSED' },
      update: {
        provider, externalHotelCode: code, status: nextStatus, isActive: nextStatus !== 'PAUSED',
        // A different channel manager must get its own key
        ...(providerChanged ? { apiKeyHash: null, apiKeyHint: null } : {}),
      },
    }),
    prisma.hotel.update({
      where: { id: hotelId },
      data: { integrationMode: 'CHANNEL_MANAGER', channelProvider: provider, cmSyncStatus: nextStatus === 'ACTIVE' ? 'ACTIVE' : 'INACTIVE' },
    }),
  ]);
  return getConnection(hotelId);
};

/** Replaces the room / rate code mapping for the property's current provider. */
export const saveMappings = async (hotelId, roomTypes) => {
  const integ = await prisma.channelIntegration.findUnique({ where: { hotelId } });
  if (!integ) throw err(400, 'Save the channel manager connection first');
  const rooms = await roomsAndPlans(hotelId);
  const rows = [];
  const seenRooms = new Map();
  for (const rt of Array.isArray(roomTypes) ? roomTypes : []) {
    const room = rooms.find((r) => r.id === rt.id);
    if (!room) continue;
    const roomCode = cleanCode(rt.externalRoomCode);
    if (!roomCode) continue;
    if (seenRooms.has(roomCode)) throw err(400, `Room code "${roomCode}" is used for both ${seenRooms.get(roomCode)} and ${room.name}`);
    seenRooms.set(roomCode, room.name);
    rows.push({ hotelId, externalProvider: integ.provider, zivoRoomTypeId: room.id, externalRoomCode: roomCode, zivoRatePlanId: null, externalRateCode: null });
    const seenRates = new Set();
    for (const rp of rt.ratePlans || []) {
      const plan = room.ratePlans.find((p) => p.id === rp.id);
      const rateCode = cleanCode(rp.externalRateCode);
      if (!plan || !rateCode) continue;
      if (seenRates.has(rateCode)) throw err(400, `Rate code "${rateCode}" is used twice in ${room.name}`);
      seenRates.add(rateCode);
      rows.push({ hotelId, externalProvider: integ.provider, zivoRoomTypeId: room.id, externalRoomCode: roomCode, zivoRatePlanId: plan.id, externalRateCode: rateCode });
    }
  }
  await prisma.$transaction([
    prisma.channelMapping.deleteMany({ where: { hotelId, externalProvider: integ.provider } }),
    ...(rows.length ? [prisma.channelMapping.createMany({ data: rows })] : []),
  ]);
  return getConnection(hotelId);
};

/** Creates (or replaces) the API key. The key is returned once; only its hash is stored. */
export const createApiKey = async (hotelId) => {
  const integ = await prisma.channelIntegration.findUnique({ where: { hotelId } });
  if (!integ) throw err(400, 'Save the channel manager connection first');
  const key = `zivo_cm_${crypto.randomBytes(24).toString('hex')}`;
  await prisma.channelIntegration.update({ where: { hotelId }, data: { apiKeyHash: hashKey(key), apiKeyHint: key.slice(-4) } });
  return { apiKey: key, hint: key.slice(-4) };
};

// ── channel manager API ───────────────────────────────────────────────────────

/** Finds the integration for an API key (PENDING and ACTIVE may call; PAUSED can't). */
export const authenticate = async (apiKey) => {
  if (!apiKey || !String(apiKey).startsWith('zivo_cm_')) throw err(401, 'Missing or invalid API key');
  const integ = await prisma.channelIntegration.findFirst({ where: { apiKeyHash: hashKey(apiKey) } });
  if (!integ) throw err(401, 'Missing or invalid API key');
  if (integ.status === 'PAUSED') throw err(403, 'This connection is paused in ZivoPlus');
  return integ;
};

/** The property's mapped codes, for the channel manager to verify its setup. */
export const propertyForChannel = async (integ) => {
  const c = await getConnection(integ.hotelId);
  return {
    hotelCode: integ.externalHotelCode,
    name: c.hotel.name,
    status: integ.status,
    rooms: c.roomTypes.filter((r) => r.externalRoomCode).map((r) => ({
      roomCode: r.externalRoomCode, name: r.name,
      rates: r.ratePlans.filter((p) => p.externalRateCode).map((p) => ({ rateCode: p.externalRateCode, name: p.name, mealPlan: p.mealPlan })),
    })),
  };
};

/**
 * Applies an ARI update:
 * { hotelCode, updates: [{ roomCode, rateCode?, from, to, available?, stopSell?, price? }] }
 * available = rooms left to sell on ZivoPlus (rooms to sell becomes booked + available, capped
 * at the physical count); price needs a rateCode (base occupancy, before GST).
 */
export const applyAri = async (integ, body) => {
  if (body?.hotelCode && cleanCode(body.hotelCode) !== integ.externalHotelCode) throw err(400, 'hotelCode does not match this API key');
  const updates = Array.isArray(body?.updates) ? body.updates : null;
  if (!updates || updates.length === 0) throw err(400, 'updates must be a non-empty array');
  if (updates.length > 500) throw err(400, 'Send at most 500 updates per request');

  const mappings = await prisma.channelMapping.findMany({ where: { hotelId: integ.hotelId, externalProvider: integ.provider } });
  const roomFor = (code) => mappings.find((m) => !m.zivoRatePlanId && m.externalRoomCode === code);
  const results = [];
  for (const [index, u] of updates.entries()) {
    try {
      const room = roomFor(cleanCode(u.roomCode));
      if (!room) throw err(400, `Unknown roomCode "${u.roomCode}"`);
      const days = ariService.daysBetween(u.from, u.to || u.from);
      let ratePlanId = null;
      if (u.rateCode != null) {
        const rate = mappings.find((m) => m.zivoRoomTypeId === room.zivoRoomTypeId && m.zivoRatePlanId && m.externalRateCode === cleanCode(u.rateCode));
        if (!rate) throw err(400, `Unknown rateCode "${u.rateCode}" for room "${u.roomCode}"`);
        ratePlanId = rate.zivoRatePlanId;
      }
      if (u.price != null && !ratePlanId) throw err(400, 'price needs a rateCode');
      if (u.available != null && !(Number.isInteger(u.available) && u.available >= 0)) throw err(400, 'available must be a whole number, 0 or more');

      if (u.available != null || u.stopSell != null) {
        const roomType = await prisma.roomType.findUnique({ where: { id: room.zivoRoomTypeId }, select: { totalInventory: true } });
        await prisma.$transaction(async (tx) => {
          const existing = await tx.inventory.findMany({ where: { roomTypeId: room.zivoRoomTypeId, date: { in: days } } });
          const byDay = new Map(existing.map((i) => [i.date.toISOString(), i]));
          for (const d of days) {
            const row = byDay.get(d.toISOString());
            const booked = row?.bookedRooms || 0;
            const total = u.available != null ? Math.min(roomType.totalInventory, booked + u.available) : (row?.totalRooms ?? roomType.totalInventory);
            const data = { totalRooms: total, availableRooms: Math.max(0, total - booked), ...(u.stopSell != null ? { stopSell: Boolean(u.stopSell) } : {}) };
            if (row) await tx.inventory.update({ where: { id: row.id }, data });
            else await tx.inventory.create({ data: { roomTypeId: room.zivoRoomTypeId, date: d, bookedRooms: 0, stopSell: Boolean(u.stopSell), ...data } });
          }
        }, { timeout: 30000 });
      }
      if (u.price != null) {
        await ariService.updateRates({ ratePlanId, start: u.from, end: u.to || u.from, price: Number(u.price), source: 'CHANNEL_MANAGER' });
      }
      results.push({ index, status: 'APPLIED', days: days.length });
    } catch (e) {
      results.push({ index, status: 'REJECTED', message: e.status ? e.message : 'Could not apply this update' });
    }
  }
  const rejected = results.filter((r) => r.status === 'REJECTED');
  await prisma.channelIntegration.update({
    where: { id: integ.id },
    data: { lastAriAt: new Date(), lastAriError: rejected.length ? `${rejected.length} of ${results.length} updates rejected: ${rejected[0].message}` : null },
  });
  return { applied: results.length - rejected.length, rejected: rejected.length, results };
};

/** Bookings created or changed since a time (confirmed and later; unpaid checkouts are skipped). */
export const bookingsForChannel = async (integ, { since, limit }) => {
  const from = since ? new Date(since) : new Date(Date.now() - 7 * 24 * 3600 * 1000);
  if (isNaN(from.getTime())) throw err(400, 'since must be an ISO date-time');
  const take = Math.min(Math.max(parseInt(limit) || 100, 1), 500);
  const [bookings, mappings] = await Promise.all([
    prisma.booking.findMany({
      where: { hotelId: integ.hotelId, updatedAt: { gt: from }, status: { not: 'PENDING' } },
      orderBy: { updatedAt: 'asc' },
      take,
      include: { bookingRooms: { orderBy: { roomNumber: 'asc' }, select: { roomNumber: true, roomTypeId: true, ratePlanId: true, adults: true, children: true, guestName: true, subtotal: true, cancelledAt: true } } },
    }),
    prisma.channelMapping.findMany({ where: { hotelId: integ.hotelId, externalProvider: integ.provider } }),
  ]);
  const roomCode = (id) => mappings.find((m) => !m.zivoRatePlanId && m.zivoRoomTypeId === id)?.externalRoomCode || null;
  const rateCode = (id) => mappings.find((m) => m.zivoRatePlanId === id)?.externalRateCode || null;
  const items = bookings.map((b) => {
    const total = toMoney(b.totalAmount) || 0;
    const paid = toMoney(b.paidAmount) || 0;
    return {
      bookingId: b.bookingRef,
      status: b.status === 'CANCELLED' ? 'CANCELLED' : b.status === 'NO_SHOW' ? 'NO_SHOW' : 'CONFIRMED',
      createdAt: b.createdAt, updatedAt: b.updatedAt,
      checkIn: indiaDay(b.checkIn), checkOut: indiaDay(b.checkOut),
      // Hourly stays (a slot on one day) use rooms set aside for hourly use, not night inventory
      stayType: b.stayType || 'NIGHTLY',
      ...(b.stayType === 'HOURLY' ? { slot: { start: b.slotStart, end: b.slotEnd, hours: b.hours } } : {}),
      roomCode: roomCode(b.roomTypeId), rateCode: rateCode(b.ratePlanId),
      rooms: b.rooms, adults: b.adults, children: b.children,
      // Each room with its own room / rate code, guests and lead guest (rooms of a booking can be
      // different types). roomCode / rateCode above are the first room's.
      roomStays: (b.bookingRooms?.length ? b.bookingRooms : Array.from({ length: b.rooms }, (_, i) => ({ roomNumber: i + 1, roomTypeId: b.roomTypeId, ratePlanId: b.ratePlanId, adults: null, children: null, guestName: b.guestName })))
        .map((r) => ({ roomNumber: r.roomNumber, status: r.cancelledAt ? 'CANCELLED' : 'BOOKED', roomCode: roomCode(r.roomTypeId), rateCode: rateCode(r.ratePlanId), adults: r.adults, children: r.children, guestName: r.guestName, amountBeforeTax: r.subtotal != null ? toMoney(r.subtotal) : null })),
      guest: { name: b.guestName, email: b.guestEmail, phone: b.guestPhone },
      company: b.guestCompanyName ? { name: b.guestCompanyName, gstin: b.guestCompanyGstin, address: b.guestCompanyAddress } : null,
      amounts: { currency: 'INR', total, tax: toMoney(b.taxAmount) || 0, paidOnline: paid, payAtHotel: Math.max(0, Math.round((total - paid) * 100) / 100), refunded: toMoney(b.refundAmount) || 0 },
      paymentType: b.paymentType,
    };
  });
  return { bookings: items, next: items.length ? items[items.length - 1].updatedAt : from.toISOString(), hasMore: items.length === take };
};

export default {
  PROVIDERS, getOverview, getConnection, saveConnection, saveMappings, createApiKey,
  authenticate, propertyForChannel, applyAri, bookingsForChannel,
};
