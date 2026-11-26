/**
 * Extranet → GST invoices (/api/v1/extranet/gst-invoices; bookings.view to read, bookings.manage
 * to upload): the property's GST invoices for business (GSTIN) bookings, which it issues and
 * uploads; ZivoPlus is the facilitator.
 *
 *  GET  /:hotelId?status=PENDING|UPLOADED        the property's business bookings and their invoices
 *  POST /:hotelId/:bookingId                     { invoiceNumber, invoiceDate, amount, taxAmount?, file, fileName }
 *  GET  /:hotelId/:bookingId/file                the uploaded invoice
 */
import express from 'express';
import prisma from '../config/db.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { managesHotel } from '../utils/hotelAccess.js';
import gst from '../services/hotelGstInvoices.js';

const router = express.Router();
const hotelFor = async (req, res) => {
  const hotel = await prisma.hotel.findUnique({ where: { id: req.params.hotelId }, select: { id: true, ownerId: true } });
  if (!hotel || !managesHotel(req.user, hotel)) { res.status(404).json({ success: false, message: 'Property not found.' }); return null; }
  return hotel;
};
const answer = (fn) => asyncHandler(async (req, res) => {
  const hotel = await hotelFor(req, res); if (!hotel) return;
  try { await fn(hotel, req, res); } catch (e) {
    if (e.statusCode && e.statusCode < 500) return res.status(e.statusCode).json({ success: false, message: e.message });
    throw e;
  }
});

router.get('/:hotelId', answer(async (hotel, req, res) => res.json({ success: true, data: await gst.listForHotel(hotel.id, req.query) })));
router.post('/:hotelId/:bookingId', answer(async (hotel, req, res) => res.json({ success: true, data: await gst.upload(hotel.id, req.user, req.params.bookingId, req.body || {}) })));
router.get('/:hotelId/:bookingId/file', answer(async (hotel, req, res) => {
  const b = await prisma.booking.findFirst({ where: { id: req.params.bookingId, hotelId: hotel.id }, select: { id: true } });
  if (!b) return res.status(404).json({ success: false, message: 'Booking not found' });
  const f = await gst.readFile(b.id, req.user, { hotelAccess: true });
  res.locals.skipFormat = true;
  res.type(f.mimeType).set({ 'Content-Disposition': `attachment; filename="${f.fileName.replace(/"/g, '')}"`, 'Cache-Control': 'private, no-store' }).send(f.buffer);
}));

export default router;
