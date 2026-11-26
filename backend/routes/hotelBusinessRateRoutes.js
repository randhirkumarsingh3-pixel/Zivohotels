/**
 * Extranet → Business rates (/api/v1/extranet/business-rates/:hotelId; rates.view to read,
 * rates.manage to change): the hotel's discount for companies and for travel agents.
 */
import express from 'express';
import prisma from '../config/db.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { managesHotel } from '../utils/hotelAccess.js';
import { getHotelBusinessRates, saveHotelBusinessRates } from '../services/business/hotelBusinessRates.js';
import { getBusinessSettings } from '../services/business/businessSettings.js';
import corporateRates from '../services/business/corporateRates.js';
import groups from '../services/business/groupBookings.js';

const router = express.Router();
const hotelFor = async (req, res) => {
  const hotel = await prisma.hotel.findUnique({ where: { id: req.params.hotelId }, select: { id: true, ownerId: true, name: true } });
  if (!hotel || !managesHotel(req.user, hotel)) { res.status(404).json({ success: false, message: 'Property not found.' }); return null; }
  return hotel;
};
const portals = async () => { const s = await getBusinessSettings(); return { corporateOpen: s.corporate.enabled, agencyOpen: s.agency.enabled }; };

router.get('/:hotelId', asyncHandler(async (req, res) => {
  const hotel = await hotelFor(req, res); if (!hotel) return;
  res.json({ success: true, data: { ...(await getHotelBusinessRates(hotel.id)), ...(await portals()) } });
}));
router.put('/:hotelId', asyncHandler(async (req, res) => {
  const hotel = await hotelFor(req, res); if (!hotel) return;
  try {
    res.json({ success: true, data: { ...(await saveHotelBusinessRates(hotel.id, req.user, req.body || {})), ...(await portals()) } });
  } catch (e) {
    if (e.statusCode && e.statusCode < 500) return res.status(e.statusCode).json({ success: false, message: e.message });
    throw e;
  }
}));

// Company rates ZivoPlus proposed for this hotel: accept or decline
router.get('/:hotelId/contracts', asyncHandler(async (req, res) => {
  const hotel = await hotelFor(req, res); if (!hotel) return;
  res.json({ success: true, data: await corporateRates.hotelList(hotel.id) });
}));
router.post('/:hotelId/contracts/:rateId/decision', asyncHandler(async (req, res) => {
  const hotel = await hotelFor(req, res); if (!hotel) return;
  try {
    res.json({ success: true, data: await corporateRates.hotelDecide(hotel.id, req.user, req.params.rateId, req.body || {}) });
  } catch (e) {
    if (e.statusCode && e.statusCode < 500) return res.status(e.statusCode).json({ success: false, message: e.message });
    throw e;
  }
}));

// Group requests from companies and travel agents: quote a rate per room type, or decline
const answer = (fn) => asyncHandler(async (req, res) => {
  const hotel = await hotelFor(req, res); if (!hotel) return;
  try {
    res.json({ success: true, data: await fn(hotel, req) });
  } catch (e) {
    if (e.statusCode && e.statusCode < 500) return res.status(e.statusCode).json({ success: false, message: e.message });
    throw e;
  }
});
router.get('/:hotelId/groups', answer((hotel) => groups.hotelList(hotel.id)));
router.post('/:hotelId/groups/:id/quote', answer((hotel, req) => groups.hotelQuote(hotel.id, req.user, req.params.id, req.body || {})));
router.post('/:hotelId/groups/:id/decline', answer((hotel, req) => groups.hotelDecline(hotel.id, req.user, req.params.id, req.body || {})));

export default router;
