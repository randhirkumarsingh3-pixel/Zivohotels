import invoiceService from '../../services/invoiceService.js';
import prisma from '../../config/db.js';

/**
 * Handles all invoice-related events asynchronously
 */
export const handleInvoiceEvents = async (payload) => {
  const { bookingId } = payload;

  try {
    if (!bookingId) throw new Error('Missing bookingId in event payload');

    // Generate Invoice
    // This function is idempotent and uses puppeteer safely
    await invoiceService.generateInvoice(bookingId);

  } catch (error) {
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
