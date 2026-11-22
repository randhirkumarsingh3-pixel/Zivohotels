import prisma from '../config/db.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import ariService from '../services/ariService.js';
import { scheduleRecompute } from '../services/dynamicPricingService.js';
import { managesHotel } from '../utils/hotelAccess.js';

/**
 * Rates & availability (ARI) for Admin -> Inventory & Rates and the extranet.
 * Admins: any property. Owners: their own. When the property is connected to an active channel
 * manager, that system is the source of truth: owners can't edit here, admins are warned.
 */

const loadHotelFor = async (req, hotelId) => {
  if (!hotelId) throw Object.assign(new Error('Choose a property'), { status: 400 });
  const hotel = await prisma.hotel.findUnique({ where: { id: hotelId }, select: { id: true, ownerId: true, integrationMode: true, channelProvider: true, isDeleted: true } });
  if (!hotel || hotel.isDeleted || !managesHotel(req.user, hotel)) {
    throw Object.assign(new Error('Property not found'), { status: 404 });
  }
  const integration = await prisma.channelIntegration.findUnique({ where: { hotelId }, select: { provider: true, status: true } });
  const cmActive = hotel.integrationMode === 'CHANNEL_MANAGER' && integration?.status === 'ACTIVE';
  return { hotel, cmActive, provider: integration?.provider || hotel.channelProvider };
};

const send = (res, req, fn) => fn().then(
  (data) => res.json({ success: true, data, requestId: req.id }),
  (err) => res.status(err.status || 500).json({ success: false, message: err.status ? err.message : 'Could not complete the request', requestId: req.id })
);

export const getCalendar = asyncHandler(async (req, res) => send(res, req, async () => {
  const { hotelId, start, end } = req.query;
  const { cmActive, provider } = await loadHotelFor(req, hotelId);
  const calendar = await ariService.getCalendar(hotelId, start, end);
  return { ...calendar, channelManager: cmActive ? { provider } : null };
}));

const guardManualEdit = (req, cmActive, provider) => {
  if (cmActive && req.user.role !== 'ADMIN') {
    throw Object.assign(new Error(`Rates and availability for this property come from ${provider}. Update them there.`), { status: 409 });
  }
};

const roomTypeHotel = async (roomTypeId) => (await prisma.roomType.findUnique({ where: { id: roomTypeId }, select: { hotelId: true } }))?.hotelId;
const ratePlanHotel = async (ratePlanId) => (await prisma.ratePlan.findUnique({ where: { id: ratePlanId }, select: { roomType: { select: { hotelId: true } } } }))?.roomType?.hotelId;

export const updateInventory = asyncHandler(async (req, res) => send(res, req, async () => {
  const { roomTypeId, start, end, weekdays, totalRooms, stopSell } = req.body;
  const hotelId = await roomTypeHotel(roomTypeId);
  const { cmActive, provider } = await loadHotelFor(req, hotelId);
  guardManualEdit(req, cmActive, provider);
  const result = await ariService.updateInventory({ roomTypeId, start, end, weekdays, totalRooms, stopSell });
  scheduleRecompute(hotelId); // occupancy % changes with rooms to sell
  return result;
}));

export const updateRates = asyncHandler(async (req, res) => send(res, req, async () => {
  const { ratePlanId, start, end, weekdays, price, adjustPercent } = req.body;
  const hotelId = await ratePlanHotel(ratePlanId);
  const { cmActive, provider } = await loadHotelFor(req, hotelId);
  guardManualEdit(req, cmActive, provider);
  const result = await ariService.updateRates({ ratePlanId, start, end, weekdays, price, adjustPercent });
  scheduleRecompute(hotelId); // a reset night goes back to its dynamic price, if dynamic pricing is on
  return result;
}));

/** Same availability / price change for several room types and rate plans of one property. */
export const bulkUpdate = asyncHandler(async (req, res) => send(res, req, async () => {
  const { hotelId, start, end, weekdays, inventory, rates } = req.body;
  const { cmActive, provider } = await loadHotelFor(req, hotelId);
  guardManualEdit(req, cmActive, provider);
  const result = await ariService.bulkUpdate({ hotelId, start, end, weekdays, inventory, rates });
  scheduleRecompute(hotelId);
  return result;
}));
