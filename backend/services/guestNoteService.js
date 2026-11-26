/**
 * Credit and debit notes against a guest's tax invoice (GST section 34). An issued invoice is never
 * redrawn with new figures; when the booking's value changes after it:
 *
 *  CREDIT   the value went down: the booking cancelled (refunded, or nothing charged), a room of it
 *           cancelled. Amount = the drop, GST included.
 *  DEBIT    the value went up: hours added to an hourly stay.
 *
 * Numbered per kind per financial year (ZCN/26-27/000001, ZDN/26-27/000001; prefixes in Admin →
 * Settings → Documents & emails), PDF drawn after the number is taken (retried by the invoice
 * catch-up job). When the guest got a payment receipt instead of a tax invoice (the hotel issues
 * it: HOTEL_ISSUES), the receipt is redrawn instead, as before.
 */
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import prisma from '../config/db.js';
import { BOOKING_ROOMS_INCLUDE } from './bookingRoomsView.js';
import { guestNoteHtml } from './documents/guestInvoiceHtml.js';
import { brandContext, getDocumentSettings } from './documents/documentSettings.js';
import { renderPdf as renderThemedPdf, footerLine } from './documents/theme.js';
import { fyStart, fyLabel } from '../utils/financialYear.js';

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

const loadBooking = (bookingId) => prisma.booking.findUnique({
  where: { id: bookingId },
  include: { hotel: true, roomType: { select: { name: true } }, ratePlan: { select: { name: true, mealPlan: true } }, ...BOOKING_ROOMS_INCLUDE },
});

/** Was the guest given a tax invoice (not a payment receipt)? */
const isTaxInvoice = async (booking) => {
  const mode = booking.businessPricing?.invoiceMode || (await getDocumentSettings()).guestInvoice.mode;
  return mode !== 'HOTEL_ISSUES';
};

/** The invoice's value now: as issued, plus debit notes, less credit notes. */
export const invoicedValue = async (invoice, fallback = {}) => {
  const notes = await prisma.guestNote.findMany({ where: { invoiceId: invoice.id }, select: { kind: true, amount: true, taxAmount: true } });
  let total = invoice.totalAmount != null ? Number(invoice.totalAmount) : Number(fallback.total || 0);
  let tax = invoice.taxAmount != null ? Number(invoice.taxAmount) : Number(fallback.tax || 0);
  for (const n of notes) {
    const s = n.kind === 'CREDIT' ? -1 : 1;
    total += s * Number(n.amount); tax += s * Number(n.taxAmount);
  }
  return { total: r2(total), tax: r2(tax) };
};

const drawPdf = async (note, booking = null) => {
  try {
    const b = booking || await loadBooking(note.bookingId);
    const invoice = await prisma.invoice.findUnique({ where: { id: note.invoiceId } });
    const brand = await brandContext();
    const html = guestNoteHtml({ booking: b, hotel: b.hotel, note, invoice, brand, taxPct: b.metadata?.taxPercentage ?? null });
    const pdf = await renderThemedPdf(html, { footer: footerLine(brand.company, brand.support) });
    const dir = path.join(process.cwd(), 'public', 'invoices', b.hotelId, b.id);
    await fs.mkdir(dir, { recursive: true });
    const file = `${note.noteRef.replace(/\//g, '_')}.pdf`;
    await fs.writeFile(`${path.join(dir, file)}.tmp`, pdf);
    await fs.rename(`${path.join(dir, file)}.tmp`, path.join(dir, file));
    return prisma.guestNote.update({ where: { id: note.id }, data: { pdfUrl: `/invoices/${b.hotelId}/${b.id}/${file}`, status: 'GENERATED' } });
  } catch (e) {
    await prisma.guestNote.update({ where: { id: note.id }, data: { status: 'PDF_FAILED' } }).catch(() => {});
    throw e;
  }
};

/**
 * Issues a note against the booking's invoice. change: { kind, amount (GST included), tax,
 * reason, key }; key makes it idempotent (one note per event, e.g. 'cancel', 'room-2',
 * 'hours-<orderId>'). Returns the note, or null when there is no tax invoice to adjust (the
 * receipt is redrawn instead) or nothing changed.
 */
export const issueNote = async (bookingId, { kind, amount, tax, reason, key }) => {
  const value = r2(amount);
  if (!(value > 0)) return null;
  const booking = await loadBooking(bookingId);
  const invoice = booking && await prisma.invoice.findUnique({ where: { bookingId } });
  if (!booking || !invoice) return null;
  if (!(await isTaxInvoice(booking))) {
    // A payment receipt, not a tax invoice: it shows what is paid now
    const { invoiceService } = await import('./invoiceService.js');
    await invoiceService.regenerateInvoice(bookingId).catch(() => {});
    return null;
  }
  const existing = await prisma.guestNote.findUnique({ where: { bookingId_key: { bookingId, key } } });
  if (existing) return existing;

  const settings = (await getDocumentSettings()).guestInvoice;
  const prefix = String((kind === 'CREDIT' ? settings.creditPrefix : settings.debitPrefix) || (kind === 'CREDIT' ? 'ZCN' : 'ZDN')).slice(0, 3);
  const fy = fyStart();
  const id = crypto.randomUUID();
  const taxValue = Math.min(r2(tax), value);
  let rows;
  try {
    rows = await prisma.$queryRaw`
    WITH seq AS (
      INSERT INTO "GuestNoteSequence" ("kind", "fy", "counter") VALUES (${kind}, ${fy}, 1)
      ON CONFLICT ("kind", "fy") DO UPDATE SET "counter" = "GuestNoteSequence"."counter" + 1
      RETURNING "counter"
    )
    INSERT INTO "GuestNote" ("id", "kind", "noteRef", "bookingId", "invoiceId", "amount", "taxAmount", "reason", "key", "status", "createdAt")
    SELECT ${id}, ${kind}, ${prefix} || '/' || ${fyLabel(fy)} || '/' || lpad("counter"::text, 6, '0'), ${bookingId}, ${invoice.id}, ${value}, ${taxValue}, ${reason}, ${key}, 'PENDING', now()
    FROM seq
    RETURNING *;
  `;
  } catch (e) {
    // Issued at the same moment by another request (one note per event); no number was used up
    const again = await prisma.guestNote.findUnique({ where: { bookingId_key: { bookingId, key } } });
    if (again) return again;
    throw e;
  }
  const note = rows[0];
  await prisma.auditLog.create({ data: { action: kind === 'CREDIT' ? 'CREDIT_NOTE_ISSUED' : 'DEBIT_NOTE_ISSUED', entityType: 'INVOICE', entityId: invoice.id, userId: 'SYSTEM', details: { bookingId, noteRef: note.noteRef, amount: value, tax: taxValue, reason } } }).catch(() => {});
  try { return await drawPdf(note, booking); } catch (e) {
    console.error(`[GuestNote] ${note.noteRef} PDF not drawn (retried later):`, e.message);
    return note;
  }
};

/** Credit note when a booking with an invoice is cancelled: what is no longer charged. */
export const creditForCancellation = async (bookingId, { retainedAmount = 0, before = {} } = {}) => {
  const invoice = await prisma.invoice.findUnique({ where: { bookingId } });
  if (!invoice) return null;
  const now = await invoicedValue(invoice, before);
  const credit = r2(now.total - Number(retainedAmount || 0));
  if (!(credit > 0)) return null;
  const tax = now.total > 0 ? r2(now.tax * (credit / now.total)) : 0;
  return issueNote(bookingId, { kind: 'CREDIT', amount: credit, tax, reason: retainedAmount > 0 ? 'Booking cancelled: amount not charged (the cancellation charge stays invoiced)' : 'Booking cancelled: full value reversed', key: 'cancel' });
};

/** Credit notes whose PDF wasn't drawn: drawn again (from the invoice catch-up job). */
export const catchUpNotes = async ({ limit = 25 } = {}) => {
  const stuck = await prisma.guestNote.findMany({ where: { status: { in: ['PENDING', 'PDF_FAILED'] }, createdAt: { lt: new Date(Date.now() - 2 * 60 * 1000) } }, take: limit });
  let done = 0;
  for (const n of stuck) { try { await drawPdf(n); done += 1; } catch { /* next time */ } }
  return done;
};

/** Notes of a booking, for the guest's and admin's documents list. */
export const notesFor = (bookingId) => prisma.guestNote.findMany({ where: { bookingId }, orderBy: { createdAt: 'asc' }, select: { id: true, kind: true, noteRef: true, amount: true, reason: true, status: true, createdAt: true } });

export default { issueNote, creditForCancellation, catchUpNotes, notesFor, invoicedValue };
