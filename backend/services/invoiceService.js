import puppeteer from 'puppeteer';
import fs from 'fs/promises';
import path from 'path';
import prisma from '../config/db.js';
import invoiceDomain from '../domains/invoiceDomain.js';
import bookingRepository from '../repositories/bookingRepository.js';

let browserInstance = null;

/**
 * Singleton Browser instance for Puppeteer
 */
const getBrowser = async () => {
  if (!browserInstance || !browserInstance.isConnected()) {
    browserInstance = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
  }
  return browserInstance;
};

process.on('SIGINT', async () => {
  if (browserInstance) {
    await browserInstance.close();
  }
  process.exit(0);
});

export const invoiceService = {

  /**
   * Generates a unique, atomic invoice number
   */
  generateInvoiceNumber: async (tx) => {
    const currentYear = new Date().getFullYear();
    
    // Ensure row exists safely outside the hot path locking if possible, or just standard upsert
    await tx.invoiceSequence.upsert({
      where: { year: currentYear },
      update: {},
      create: { year: currentYear, counter: 0 }
    });

    // Atomic increment with lock
    const sequences = await tx.$queryRaw`
      UPDATE "InvoiceSequence"
      SET "counter" = "counter" + 1
      WHERE "year" = ${currentYear}
      RETURNING "counter";
    `;
    
    const counter = sequences[0].counter;
    const paddedCounter = String(counter).padStart(6, '0');
    return `ZIV/${currentYear}/${paddedCounter}`;
  },

  /**
   * Core generation logic
   */
  generateInvoice: async (bookingId) => {
    // 1. Idempotency Check
    const existingInvoice = await prisma.invoice.findUnique({
      where: { bookingId }
    });
    if (existingInvoice) return existingInvoice;

    // 2. Fetch required snapshots and relations
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: { hotel: true, user: true }
    });

    if (!booking) throw new Error('Booking not found');

    // 3. Save DB Record inside transaction (includes atomic numbering and audit)
    const invoice = await prisma.$transaction(async (tx) => {
      // Atomic Number Generation
      const invoiceRef = await invoiceService.generateInvoiceNumber(tx);

      // Generate HTML using Pure Domain
      const htmlContent = invoiceDomain.generateHTML({
        booking,
        hotel: booking.hotel,
        invoiceRef,
        issueDate: new Date()
      });

      // Generate PDF using Puppeteer
      const browser = await getBrowser();
      const page = await browser.newPage();
      
      let pdfUrl = '';

      try {
        await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
        
        const safeInvoiceRef = invoiceRef.replace(/\//g, '_');
        const invoicesDir = path.join(process.cwd(), 'public', 'invoices', booking.hotelId, bookingId);
        await fs.mkdir(invoicesDir, { recursive: true });

        const fileName = `${safeInvoiceRef}.pdf`;
        const filePath = path.join(invoicesDir, fileName);
        const tmpPath = `${filePath}.tmp`;

        // Atomic file write
        await page.pdf({ path: tmpPath, format: 'A4', printBackground: true });
        await fs.rename(tmpPath, filePath); // atomic swap

        pdfUrl = `/invoices/${booking.hotelId}/${bookingId}/${fileName}`;
      } finally {
        await page.close();
      }

      const created = await tx.invoice.create({
        data: {
          invoiceRef,
          bookingId,
          pdfUrl,
          status: 'GENERATED'
        }
      });

      // Audit Log
      await tx.auditLog.create({
        data: {
          action: 'INVOICE_GENERATED',
          entityType: 'INVOICE',
          entityId: created.id,
          userId: 'SYSTEM',
          details: { bookingId, invoiceRef, pdfUrl }
        }
      });

      return created;
    });

    return invoice;
  },

  /**
   * Regenerates an existing invoice PDF without creating a new sequence
   */
  regenerateInvoice: async (bookingId) => {
    return await prisma.$transaction(async (tx) => {
      // Row lock to prevent concurrent regenerations
      const lockedInvoices = await tx.$queryRaw`
        SELECT id, "invoiceRef", "pdfUrl" FROM "Invoice" 
        WHERE "bookingId" = ${bookingId} FOR UPDATE
      `;
      
      if (!lockedInvoices || lockedInvoices.length === 0) {
        throw new Error('Invoice not found for this booking. Cannot regenerate.');
      }
      const existingInvoice = lockedInvoices[0];

      const booking = await tx.booking.findUnique({
        where: { id: bookingId },
        include: { hotel: true, user: true }
      });

      const htmlContent = invoiceDomain.generateHTML({
        booking,
        hotel: booking.hotel,
        invoiceRef: existingInvoice.invoiceRef,
        issueDate: new Date()
      });

      const browser = await getBrowser();
      const page = await browser.newPage();

      let newPdfUrl = '';

      try {
        await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
        
        const safeInvoiceRef = existingInvoice.invoiceRef.replace(/\//g, '_');
        const invoicesDir = path.join(process.cwd(), 'public', 'invoices', booking.hotelId, bookingId);
        await fs.mkdir(invoicesDir, { recursive: true });

        const fileName = `${safeInvoiceRef}.pdf`;
        const filePath = path.join(invoicesDir, fileName);
        const tmpPath = `${filePath}.tmp`;

        // Atomic file write
        await page.pdf({ path: tmpPath, format: 'A4', printBackground: true });
        await fs.rename(tmpPath, filePath); // atomic swap

        newPdfUrl = `/invoices/${booking.hotelId}/${bookingId}/${fileName}`;
      } finally {
        await page.close();
      }

      const updated = await tx.invoice.update({
        where: { id: existingInvoice.id },
        data: { pdfUrl: newPdfUrl }
      });

      await tx.auditLog.create({
        data: {
          action: 'INVOICE_REGENERATED',
          entityType: 'INVOICE',
          entityId: existingInvoice.id,
          userId: 'SYSTEM',
          details: { bookingId, invoiceRef: existingInvoice.invoiceRef }
        }
      });

      return updated;
    });
  }
};

export default invoiceService;
