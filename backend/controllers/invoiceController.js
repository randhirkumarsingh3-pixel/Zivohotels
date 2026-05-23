import invoiceService from '../services/invoiceService.js';
import prisma from '../config/db.js';
import path from 'path';
import fs from 'fs';

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
    if (userRole === 'OWNER' && booking.hotel.ownerId !== userId) {
      return res.status(403).json({ success: false, message: 'Access denied to this invoice' });
    }

    // Determine actual file path
    const absolutePath = path.join(process.cwd(), 'public', invoice.pdfUrl);

    if (!fs.existsSync(absolutePath)) {
      return res.status(404).json({ success: false, message: 'PDF file missing on server' });
    }

    res.download(absolutePath, `Invoice-${invoice.invoiceRef.replace(/\\//g, '_')}.pdf`);
  } catch (error) {
    next(error);
  }
};
