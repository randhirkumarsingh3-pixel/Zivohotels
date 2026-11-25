/**
 * Extranet → Agreement (mounted at /api/v1/extranet/agreement): the owner reads the listing
 * agreement ZivoPlus prepared, asks for a signing code, and signs. Only the property's owner
 * account can sign; team members can read it.
 */
import express from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import prisma from '../config/db.js';
import { managesHotel } from '../utils/hotelAccess.js';
import { ownerView, requestSigningCode, signAgreement, agreementPdf } from '../services/agreements/agreementService.js';

const router = express.Router();
const fail = (res, e) => {
  if (e.statusCode && e.statusCode < 500) return res.status(e.statusCode).json({ success: false, message: e.message });
  throw e;
};
const access = async (req, res) => {
  const hotel = await prisma.hotel.findUnique({ where: { id: req.params.hotelId }, select: { id: true, ownerId: true, name: true, status: true } });
  if (!hotel || !managesHotel(req.user, hotel, 'dashboard.view')) { res.status(404).json({ success: false, message: 'Property not found.' }); return null; }
  return hotel;
};
const ctx = (req) => ({ ip: req.ip, userAgent: req.headers['user-agent'] });

router.get('/:hotelId', asyncHandler(async (req, res) => {
  const hotel = await access(req, res); if (!hotel) return;
  const view = await ownerView(hotel.id, req.user);
  res.json({ success: true, data: view ? { ...view, property: { id: hotel.id, name: hotel.name, status: hotel.status }, canSign: req.user.role === 'OWNER' && hotel.ownerId === req.user.id, signerEmail: view.signerEmail || (hotel.ownerId === req.user.id ? req.user.email : null) } : null });
}));
router.post('/:hotelId/code', asyncHandler(async (req, res) => {
  const hotel = await access(req, res); if (!hotel) return;
  try { res.json({ success: true, data: await requestSigningCode(hotel.id, req.user, ctx(req)) }); } catch (e) { fail(res, e); }
}));
router.post('/:hotelId/sign', asyncHandler(async (req, res) => {
  const hotel = await access(req, res); if (!hotel) return;
  try {
    const a = await signAgreement(hotel.id, req.user, req.body || {}, ctx(req));
    res.json({ success: true, data: { status: a.status, signedAt: a.signedAt, reference: a.reference } });
  } catch (e) { fail(res, e); }
}));
router.get('/:hotelId/pdf', asyncHandler(async (req, res) => {
  const hotel = await access(req, res); if (!hotel) return;
  const pdf = await agreementPdf(hotel.id);
  if (!pdf) return res.status(404).json({ success: false, message: 'No agreement yet.' });
  res.type('application/pdf').set('Content-Disposition', `inline; filename="ZivoPlus-Agreement-${hotel.name.replace(/[^A-Za-z0-9]+/g, '-')}.pdf"`).send(Buffer.from(pdf));
}));

export default router;
