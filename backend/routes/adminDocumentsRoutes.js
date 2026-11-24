/**
 * Admin → Settings → Documents & emails, and Admin → Setup checklist.
 * Mounted at /api/v1/admin/documents and /api/v1/admin/setup (settings.view to read,
 * settings.manage to change).
 *
 *  GET  /documents                 the settings (and the invoice modes)
 *  PUT  /documents                 change them
 *  GET  /documents/preview/:kind   a sample from the latest confirmed booking, with the current
 *                                  settings: guest-invoice | guest-voucher | hotel-voucher (PDF),
 *                                  guest-email | hotel-email (HTML)
 *  GET  /setup                     every setting a super admin configures, with its status
 */
import express from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import prisma from '../config/db.js';
import { getDocumentSettings, saveDocumentSettings, INVOICE_MODES, brandContext } from '../services/documents/documentSettings.js';
import { setupStatus } from '../services/documents/setupStatus.js';

export const documentsRouter = express.Router();
export const setupRouter = express.Router();

documentsRouter.get('/', asyncHandler(async (req, res) => {
  res.json({ success: true, data: { settings: await getDocumentSettings(), modes: INVOICE_MODES } });
}));

documentsRouter.put('/', asyncHandler(async (req, res) => {
  try {
    res.json({ success: true, data: { settings: await saveDocumentSettings(req.body || {}, req.user.id) } });
  } catch (e) {
    if (e.statusCode === 400) return res.status(400).json({ success: false, message: e.message });
    throw e;
  }
}));

const sampleBooking = () => prisma.booking.findFirst({
  where: { status: { in: ['CONFIRMED', 'CHECKED_IN', 'COMPLETED'] } },
  orderBy: [{ updatedAt: 'desc' }],
  select: { id: true },
});

documentsRouter.get('/preview/:kind', asyncHandler(async (req, res) => {
  const kind = String(req.params.kind);
  const b = await sampleBooking();
  if (!b) return res.status(404).json({ success: false, message: 'There is no confirmed booking yet to make a sample from.' });
  const v = await import('../services/voucherService.js');
  const sendPdf = (buf, name) => { res.setHeader('Content-Type', 'application/pdf'); res.setHeader('Content-Disposition', `inline; filename="${name}"`); res.send(buf); };

  if (kind === 'guest-voucher' || kind === 'hotel-voucher') {
    const d = await v.loadVoucherData(b.id);
    const html = kind === 'guest-voucher' ? v.guestVoucherHtml(d) : v.hotelierVoucherHtml(d, await v.hotelierFigures(d));
    return sendPdf(await v.renderPdf(html, d), `Sample-${kind}.pdf`);
  }
  if (kind === 'guest-invoice') {
    const { guestInvoiceHtml } = await import('../services/documents/guestInvoiceHtml.js');
    const { renderPdf, footerLine } = await import('../services/documents/theme.js');
    const { BOOKING_ROOMS_INCLUDE } = await import('../services/bookingRoomsView.js');
    const booking = await prisma.booking.findUnique({ where: { id: b.id }, include: { hotel: true, roomType: { select: { name: true } }, ratePlan: { select: { name: true, mealPlan: true } }, ...BOOKING_ROOMS_INCLUDE } });
    const brand = await brandContext();
    const settings = await getDocumentSettings();
    const html = guestInvoiceHtml({ booking, hotel: booking.hotel, rooms: booking.bookingRooms || [], invoiceRef: `${settings.guestInvoice.prefix}/SAMPLE/000000`, brand });
    return sendPdf(await renderPdf(html, { footer: footerLine(brand.company, brand.support) }), 'Sample-guest-invoice.pdf');
  }
  if (kind === 'guest-email' || kind === 'hotel-email') {
    const { previewBookingEmail } = await import('../services/documents/emailPreview.js');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(await previewBookingEmail(b.id, kind === 'guest-email' ? 'guest' : 'hotel'));
  }
  return res.status(404).json({ success: false, message: 'Unknown sample' });
}));

setupRouter.get('/', asyncHandler(async (req, res) => {
  res.json({ success: true, data: await setupStatus() });
}));

export default { documentsRouter, setupRouter };
