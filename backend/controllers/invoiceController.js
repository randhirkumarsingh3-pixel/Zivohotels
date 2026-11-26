import invoiceService from '../services/invoiceService.js';
import prisma from '../config/db.js';
import path from 'path';
import fs from 'fs';
import { managesHotel } from '../utils/hotelAccess.js';

export const regenerateInvoice = async (req, res, next) => {
  try {
    const { bookingId } = req.body;

    if (!bookingId) {
      return res.status(400).json({ success: false, message: 'bookingId is required' });
    }

    const updatedInvoice = await invoiceService.regenerateInvoice(bookingId);

    res.status(200).json({ 
      success: true, 
      message: 'Invoice regenerated successfully', 
      data: updatedInvoice,
      requestId: req.id
    });
  } catch (error) {
    if (error.message.includes('not found')) {
      return res.status(404).json({ success: false, message: error.message });
    }
    next(error);
  }
};

export const downloadInvoice = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    // Fetch invoice with booking to check ownership
    const invoice = await prisma.invoice.findUnique({
      where: { id },
      include: {
        booking: {
          include: { hotel: true }
        }
      }
    });

    if (!invoice || !invoice.pdfUrl) {
      return res.status(404).json({ success: false, message: 'Invoice not found or PDF not generated yet' });
    }

    const { booking } = invoice;
    const userId = req.user.id;
    const userRole = req.user.role;

    // Access Control
    // Admin: can access all
    // Owner: can access invoices for their hotels
    // Customer: can access their own bookings
    if (userRole === 'CUSTOMER' && booking.userId !== userId) {
      return res.status(403).json({ success: false, message: 'Access denied to this invoice' });
    }
    if (userRole === 'OWNER' && !managesHotel(req.user, { ...booking.hotel, id: booking.hotelId }, 'bookings.view')) {
      return res.status(403).json({ success: false, message: 'Access denied to this invoice' });
    }

    // Determine actual file path
    const absolutePath = path.join(process.cwd(), 'public', invoice.pdfUrl);

    if (!fs.existsSync(absolutePath)) {
      return res.status(404).json({ success: false, message: 'PDF file missing on server' });
    }

    res.download(absolutePath, `Invoice-${invoice.invoiceRef.replace(/\//g, '_')}.pdf`);
  } catch (error) {
    next(error);
  }
};

/** A credit or debit note's PDF: the guest's own, the hotel's team, or admins. */
export const downloadNote = async (req, res, next) => {
  try {
    const note = await prisma.guestNote.findUnique({ where: { id: req.params.id }, include: { booking: { include: { hotel: true } } } });
    if (!note || !note.pdfUrl) return res.status(404).json({ success: false, message: 'Note not found or PDF not drawn yet' });
    const { booking } = note;
    if (req.user.role === 'CUSTOMER' && booking.userId !== req.user.id) return res.status(403).json({ success: false, message: 'Access denied to this document' });
    if (req.user.role === 'OWNER' && !managesHotel(req.user, { ...booking.hotel, id: booking.hotelId }, 'bookings.view')) return res.status(403).json({ success: false, message: 'Access denied to this document' });
    const absolutePath = path.join(process.cwd(), 'public', note.pdfUrl);
    if (!fs.existsSync(absolutePath)) return res.status(404).json({ success: false, message: 'PDF file missing on server' });
    res.download(absolutePath, `${note.kind === 'CREDIT' ? 'Credit-note' : 'Debit-note'}-${note.noteRef.replace(/\//g, '_')}.pdf`);
  } catch (error) {
    next(error);
  }
};

/** The GST invoice the property uploaded for a business booking (booker, the business, staff). */
export const downloadHotelInvoice = async (req, res, next) => {
  try {
    const { readFile } = await import('../services/hotelGstInvoices.js');
    const f = await readFile(req.params.bookingId, req.user);
    res.type(f.mimeType).set({ 'Content-Disposition': `attachment; filename="${f.fileName.replace(/"/g, '')}"`, 'Cache-Control': 'private, no-store' }).send(f.buffer);
  } catch (e) {
    if (e.statusCode && e.statusCode < 500) return res.status(e.statusCode).json({ success: false, message: e.message });
    next(e);
  }
};
