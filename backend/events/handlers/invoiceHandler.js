import invoiceService from '../../services/invoiceService.js';
import prisma from '../../config/db.js';

/**
 * Handles all invoice-related events asynchronously
 */
export const handleInvoiceEvents = async (payload) => {
  const { bookingId } = payload;

  try {
    if (!bookingId) throw new Error('Missing bookingId in event payload');

    // Idempotent. If the PDF can't be drawn now, the invoice is kept (PDF_FAILED) and the
    // catch-up job (every 10 minutes) draws it.
    await invoiceService.generateInvoice(bookingId);

  } catch (error) {
    if (error.code === 'NOT_YET') return; // issued on the departure date by the invoice job
    console.error(`[InvoiceHandler] Event Failed for Booking ${bookingId}:`, error.message);
    
    // Log failure to Audit Log without blocking main thread
    try {
      await prisma.auditLog.create({
        data: {
          action: 'EVENT_FAILED',
          entityType: 'INVOICE',
          entityId: bookingId,
          userId: 'SYSTEM',
          details: { error: error.message, stack: error.stack }
        }
      });
    } catch (auditError) {
      console.error('[InvoiceHandler] Failed to write AuditLog:', auditError.message);
    }
  }
};

export default handleInvoiceEvents;
