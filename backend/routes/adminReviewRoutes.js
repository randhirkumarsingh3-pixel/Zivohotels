import express from 'express';
import { adminListReviews, adminModerateReview } from '../controllers/reviewController.js';
import prisma from '../config/db.js';

// Mounted at /api/v1/admin/reviews (protect + ADMIN/OWNER from /admin; the controller allows ADMIN only).
const router = express.Router();
router.get('/', adminListReviews);
// Properties to choose from (moderation filter and feedback QR codes): search by name or city
router.get('/hotels', async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim().slice(0, 80);
    const hotels = await prisma.hotel.findMany({
      where: { isDeleted: false, ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { city: { contains: q, mode: 'insensitive' } }] } : {}) },
      select: { id: true, name: true, city: true, status: true }, orderBy: { name: 'asc' }, take: q ? 50 : 500,
    });
    res.json({ success: true, data: hotels });
  } catch (e) { next(e); }
});
router.patch('/:id', adminModerateReview);

// Feedback QR code (services/feedbackQr.js): PNG and the printable A5 card, and how it's used
const sendQr = (kind, hotelOf) => async (req, res, next) => {
  try {
    const fq = await import('../services/feedbackQr.js');
    const hotel = await hotelOf(req);
    if (!hotel) return res.status(404).json({ success: false, message: 'Property not found' });
    const name = `feedback-qr-${String(hotel.name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
    res.locals.skipFormat = true;
    if (kind === 'png') return res.set({ 'Content-Type': 'image/png', 'Content-Disposition': `attachment; filename="${name}.png"`, 'Cache-Control': 'private, no-store' }).send(await fq.qrPng(hotel));
    return res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${name}.pdf"`, 'Cache-Control': 'private, no-store' }).send(await fq.qrCardPdf(hotel));
  } catch (e) { next(e); }
};
// Any property's feedback QR code (admins; e.g. to print for a hotel)
const hotelById = (req) => prisma.hotel.findUnique({ where: { id: String(req.params.hotelId) }, select: { id: true, name: true, city: true } });
router.get('/qr/:hotelId.png', sendQr('png', hotelById));
router.get('/qr/:hotelId.pdf', sendQr('pdf', hotelById));
export default router;
