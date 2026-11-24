import crypto from 'crypto';
import { getBrowser, closeBrowser } from '../utils/browser.js';
import fs from 'fs/promises';
import path from 'path';
import prisma from '../config/db.js';
import invoiceDomain from '../domains/invoiceDomain.js';
import { BOOKING_ROOMS_INCLUDE } from './bookingRoomsView.js';
import { getSupportContacts } from '../config/supportContacts.js';

// The company that runs ZivoPlus (the booking platform), printed on every invoice
const platformDetails = async () => {
  const support = await getSupportContacts();
  return {
    name: process.env.ZIVO_LEGAL_NAME || '',
    gstin: process.env.ZIVO_GSTIN || '',
    cin: process.env.ZIVO_CIN || '',
    pan: process.env.ZIVO_PAN || '',
    address: process.env.ZIVO_ADDRESS || '',
    email: support.email,
    phone: support.phone,
  };
};

// Shared browser (falls back to an installed Chrome where the bundled one can't run)
process.on('SIGINT', async () => {
  await closeBrowser();
  process.exit(0);
});

// PDFs drawn at the same time in one server process (each uses a browser tab)
const MAX_RENDERS = 2;
let rendering = 0;
const waiting = [];
const withRenderSlot = async (fn) => {
  if (rendering >= MAX_RENDERS) await new Promise((resolve) => waiting.push(resolve));
  rendering += 1;
  try { return await fn(); } finally {
    rendering -= 1;
    waiting.shift()?.();
  }
};

const loadBooking = (bookingId) => prisma.booking.findUnique({
  where: { id: bookingId },
  include: { hotel: true, user: true, ...BOOKING_ROOMS_INCLUDE },
});

/**
 * Draws the invoice PDF and saves it under public/invoices. Runs outside any database
 * transaction: nothing is locked while the browser works. Returns the file's address.
 */
const renderPdf = async (booking, invoiceRef) => {
  const htmlContent = invoiceDomain.generateHTML({
    booking,
    hotel: booking.hotel,
    invoiceRef,
    issueDate: new Date(),
    platform: await platformDetails(),
  });
  return withRenderSlot(async () => {
    const browser = await getBrowser();
    const page = await browser.newPage();
    try {
      // The invoice is self-contained HTML; don't wait for the network to go quiet
      await page.setContent(htmlContent, { waitUntil: 'load', timeout: 20000 });
      const safeInvoiceRef = invoiceRef.replace(/\//g, '_');
      const invoicesDir = path.join(process.cwd(), 'public', 'invoices', booking.hotelId, booking.id);
      await fs.mkdir(invoicesDir, { recursive: true });
      const fileName = `${safeInvoiceRef}.pdf`;
      const filePath = path.join(invoicesDir, fileName);
      const tmpPath = `${filePath}.tmp`;
      await page.pdf({ path: tmpPath, format: 'A4', printBackground: true, timeout: 20000 });
      await fs.rename(tmpPath, filePath); // replace in one step
      return `/invoices/${booking.hotelId}/${booking.id}/${fileName}`;
    } finally {
      await page.close().catch(() => {});
    }
  });
};

/** Invoice statuses: PENDING (number taken, PDF not drawn yet), GENERATED, PDF_FAILED (retried). */
export const INVOICE_STATUS = { PENDING: 'PENDING', GENERATED: 'GENERATED', PDF_FAILED: 'PDF_FAILED' };

/** Bookings that get an invoice once their departure date arrives: confirmed, in house, checked out. */
const INVOICED_STATUSES = ['CONFIRMED', 'CHECKED_IN', 'COMPLETED'];

/** Today's date in India as the stored check-out dates hold it (midnight UTC of that date). */
const indiaToday = (now = new Date()) => new Date(`${new Date(now.getTime() + 330 * 60000).toISOString().slice(0, 10)}T00:00:00Z`);

/**
 * Has the stay reached its departure? Nightly stays: on the check-out date (India time). Hourly
 * stays: once the slot has ended. A guest the hotel has checked out (COMPLETED) has departed.
 */
export const hasDeparted = (booking, now = new Date()) => booking.status === 'COMPLETED'
  || (booking.stayType === 'HOURLY' ? new Date(booking.checkOut) <= now : new Date(booking.checkOut) <= indiaToday(now));

/** The same rule as a database filter. */
const departedWhere = (now = new Date()) => ({
  OR: [
    { status: 'COMPLETED' },
    { stayType: 'HOURLY', checkOut: { lte: now } },
    { NOT: { stayType: 'HOURLY' }, checkOut: { lte: indiaToday(now) } },
  ],
});

/** Tells the guest their invoice is ready (bell + email), once. */
const tellGuestInvoiceReady = (booking, invoice) => {
  import('./notifyService.js').then(async ({ notifyUser }) => {
    if (!booking.userId) return;
    const { emailLayout } = await import('./emailLayout.js');
    await notifyUser(booking.userId, {
      type: 'INVOICE_READY',
      title: `Your invoice for ${booking.hotel?.name || 'your stay'} is ready`,
      message: `${invoice.invoiceRef} · booking ${booking.bookingRef}`,
      link: '/my-bookings',
      metadata: { bookingId: booking.id, invoiceId: invoice.id },
      email: {
        jobType: 'SEND_INVOICE_READY',
        to: booking.guestEmail || undefined,
        subject: `Your GST invoice ${invoice.invoiceRef} for booking ${booking.bookingRef}`,
        html: await emailLayout({
          title: 'Your invoice is ready',
          body: `<p>Thank you for staying at ${booking.hotel?.name || 'the hotel'}. Your GST invoice for booking ${booking.bookingRef} is ready to download in My Bookings → Financials.</p>`,
          rows: [['Invoice', invoice.invoiceRef], ['Booking', booking.bookingRef]],
          cta: { label: 'Download the invoice', href: '/my-bookings' },
        }),
      },
    });
  }).catch((e) => console.error('[Invoice] guest not told:', e.message));
};

export const invoiceService = {

  /**
   * Takes the next number for the year and saves the invoice record, in ONE database statement:
   * nothing waits between the two, so no long transaction holds the counter. Numbers have no gaps:
   * if the booking already has an invoice the statement fails as a whole and the counter is not
   * moved. Returns the new invoice, or the existing one.
   */
  createRecord: async (bookingId) => {
    const year = new Date().getFullYear();
    const id = crypto.randomUUID();
    try {
      const rows = await prisma.$queryRaw`
        WITH seq AS (
          INSERT INTO "InvoiceSequence" ("year", "counter") VALUES (${year}, 1)
          ON CONFLICT ("year") DO UPDATE SET "counter" = "InvoiceSequence"."counter" + 1
          RETURNING "counter"
        )
        INSERT INTO "Invoice" ("id", "invoiceRef", "bookingId", "status", "createdAt")
        SELECT ${id}, 'ZIV/' || ${year}::text || '/' || lpad("counter"::text, 6, '0'), ${bookingId}, ${INVOICE_STATUS.PENDING}, now()
        FROM seq
        RETURNING *;
      `;
      const created = rows[0];
      await prisma.auditLog.create({
        data: { action: 'INVOICE_GENERATED', entityType: 'INVOICE', entityId: created.id, userId: 'SYSTEM', details: { bookingId, invoiceRef: created.invoiceRef } },
      }).catch((e) => console.error('[Invoice] audit log not written:', e.message));
      return created;
    } catch (err) {
      // Issued at the same moment by another request (one invoice per booking)
      const existing = await prisma.invoice.findUnique({ where: { bookingId } });
      if (existing) return existing;
      throw err;
    }
  },

  /**
   * Issues the booking's invoice (idempotent): the number and record first, then the PDF. If the
   * PDF can't be drawn the invoice stays, marked PDF_FAILED, and the catch-up job draws it later.
   */
  generateInvoice: async (bookingId) => {
    let invoice = await prisma.invoice.findUnique({ where: { bookingId } });
    if (invoice?.pdfUrl && invoice.status === INVOICE_STATUS.GENERATED) return invoice;

    const booking = await loadBooking(bookingId);
    if (!booking) throw new Error('Booking not found');
    // Issued on the departure date only, so it shows exactly what the stay cost
    if (!invoice && !(INVOICED_STATUSES.includes(booking.status) && hasDeparted(booking))) {
      throw Object.assign(new Error('The invoice is issued on the departure date'), { code: 'NOT_YET' });
    }

    const isNew = !invoice;
    if (!invoice) invoice = await invoiceService.createRecord(bookingId);
    if (invoice.pdfUrl && invoice.status === INVOICE_STATUS.GENERATED) return invoice;
    const drawn = await invoiceService.drawPdf(invoice, booking);
    if (isNew || !invoice.pdfUrl) tellGuestInvoiceReady(booking, drawn);
    return drawn;
  },

  /** Draws (or redraws) the PDF for an existing invoice record and saves its address. */
  drawPdf: async (invoice, booking) => {
    try {
      const pdfUrl = await renderPdf(booking || await loadBooking(invoice.bookingId), invoice.invoiceRef);
      return await prisma.invoice.update({ where: { id: invoice.id }, data: { pdfUrl, status: INVOICE_STATUS.GENERATED } });
    } catch (err) {
      await prisma.invoice.update({ where: { id: invoice.id }, data: { status: INVOICE_STATUS.PDF_FAILED } }).catch(() => {});
      throw err;
    }
  },

  /** Redraws an existing invoice's PDF with the booking as it is now (same number). */
  regenerateInvoice: async (bookingId) => {
    const invoice = await prisma.invoice.findUnique({ where: { bookingId } });
    if (!invoice) throw new Error('Invoice not found for this booking. Cannot regenerate.');
    const updated = await invoiceService.drawPdf(invoice);
    await prisma.auditLog.create({
      data: { action: 'INVOICE_REGENERATED', entityType: 'INVOICE', entityId: invoice.id, userId: 'SYSTEM', details: { bookingId, invoiceRef: invoice.invoiceRef } },
    }).catch(() => {});
    return updated;
  },

  /**
   * Issues invoices for stays whose departure date has arrived (the hotel may not have checked the
   * guest out), and draws PDFs that failed or never finished. Returns what it did.
   */
  catchUp: async ({ limit = 100 } = {}) => {
    const stuckBefore = new Date(Date.now() - 2 * 60 * 1000); // leave ones being drawn right now
    const unfinished = await prisma.invoice.findMany({
      where: { OR: [{ status: { in: [INVOICE_STATUS.PDF_FAILED, INVOICE_STATUS.PENDING] } }, { pdfUrl: null }], createdAt: { lt: stuckBefore } },
      select: { id: true, bookingId: true, invoiceRef: true, status: true, pdfUrl: true },
      take: limit,
    });
    const missing = await prisma.booking.findMany({
      where: { status: { in: INVOICED_STATUSES }, invoice: null, ...departedWhere() },
      select: { id: true },
      orderBy: { createdAt: 'desc' }, // newest first: those guests are waiting now
      take: limit,
    });
    const done = { redrawn: 0, issued: 0, failed: 0 };
    for (const inv of unfinished) {
      try {
        const booking = await loadBooking(inv.bookingId);
        const drawn = await invoiceService.drawPdf(inv, booking);
        if (!inv.pdfUrl) tellGuestInvoiceReady(booking, drawn); // first time it can be downloaded
        done.redrawn += 1;
      } catch { done.failed += 1; }
    }
    for (const b of missing) {
      try { await invoiceService.generateInvoice(b.id); done.issued += 1; } catch { done.failed += 1; }
    }
    return done;
  },
};

/** Every 10 minutes in the process that runs timed jobs: departures get their invoice that day. */
export const startInvoiceCatchUpJob = () => {
  const run = async () => {
    const r = await invoiceService.catchUp().catch((e) => ({ error: e.message }));
    if (r.error || r.redrawn || r.issued || r.failed) console.log('🧾 Invoice catch-up:', JSON.stringify(r));
  };
  setTimeout(run, 60 * 1000).unref?.();
  setInterval(run, 10 * 60 * 1000).unref?.();
};

export default invoiceService;
