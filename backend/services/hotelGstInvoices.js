/**
 * GST invoices the property issues for business (B2B) bookings. With Documents → "Business
 * (GSTIN) bookings" set to the property issuing them (the default), ZivoPlus is only the
 * facilitator: the guest gets a ZivoPlus payment receipt, and the property issues the GST invoice
 * in the business's name and uploads it here. The business downloads it from My Bookings or its
 * ZivoPlus for Business account and claims input tax credit against it.
 *
 *  list      the property's B2B bookings, with what is waiting (checked out, nothing uploaded)
 *  upload    PDF / JPG / PNG with the invoice number, date and amount; a corrected one replaces it
 *  read      the file, for the property's team, the booker, the business's admins/finance, staff
 *  remind    after check-out, the property is reminded once a day while it is missing (up to 7)
 */
import prisma from '../config/db.js';
import { detectFileType, saveKycFile, readKycFile, KYC_MAX_BYTES } from './kycStorage.js';
import { getDocumentSettings, invoiceModeFor } from './documents/documentSettings.js';
import { notifyHotel, notifyUser } from './notifyService.js';

const fail = (m, code = 400) => Object.assign(new Error(m), { statusCode: code });
const clean = (v, max) => String(v ?? '').trim().replace(/\s+/g, ' ').slice(0, max);
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const ymd = (d) => new Date(d).toISOString().slice(0, 10);
const istToday = () => new Date(Date.now() + 5.5 * 3600000).toISOString().slice(0, 10);
const DAY = 86400000;
const INVOICED = ['CONFIRMED', 'CHECKED_IN', 'COMPLETED'];

/** Does the property issue (and upload) this booking's GST invoice? */
export const hotelIssuesInvoice = (booking, settings) => Boolean(booking?.guestCompanyGstin) && invoiceModeFor(booking, settings) === 'HOTEL_ISSUES';

const view = (b, inv) => ({
  bookingId: b.id, bookingRef: b.bookingRef, status: b.status, checkIn: b.checkIn, checkOut: b.checkOut, guestName: b.guestName,
  company: { name: b.guestCompanyName, gstin: b.guestCompanyGstin, address: b.guestCompanyAddress || null },
  total: Number(b.totalAmount), tax: Number(b.taxAmount || 0),
  due: !inv && ymd(b.checkOut) <= istToday(),
  invoice: inv ? { invoiceNumber: inv.invoiceNumber, invoiceDate: ymd(inv.invoiceDate), amount: Number(inv.amount), taxAmount: inv.taxAmount != null ? Number(inv.taxAmount) : null, fileName: inv.fileName, uploadedAt: inv.uploadedAt } : null,
});

export const listForHotel = async (hotelId, { status = '' } = {}) => {
  const settings = await getDocumentSettings();
  const rows = await prisma.booking.findMany({
    where: { hotelId: String(hotelId), guestCompanyGstin: { not: null }, status: { in: INVOICED } },
    include: { hotelGstInvoice: true }, orderBy: { checkOut: 'desc' }, take: 300,
  });
  const list = rows.filter((b) => hotelIssuesInvoice(b, settings)).map((b) => view(b, b.hotelGstInvoice));
  const out = (status === 'PENDING' ? list.filter((x) => !x.invoice) : status === 'UPLOADED' ? list.filter((x) => x.invoice) : list)
    // Checked out and waiting first (oldest first), then the rest by check-out
    .sort((a, b) => (Number(b.due) - Number(a.due)) || (a.due ? new Date(a.checkOut) - new Date(b.checkOut) : new Date(b.checkOut) - new Date(a.checkOut)));
  return { bookings: out, waiting: list.filter((x) => x.due).length, toUpload: list.filter((x) => !x.invoice).length };
};

export const upload = async (hotelId, user, bookingId, input = {}) => {
  const b = await prisma.booking.findFirst({ where: { id: String(bookingId), hotelId: String(hotelId) }, include: { hotelGstInvoice: true } });
  if (!b) throw fail('Booking not found', 404);
  if (!hotelIssuesInvoice(b, await getDocumentSettings())) throw fail('ZivoPlus issues the invoice for this booking: there is nothing to upload.', 409);
  if (!INVOICED.includes(b.status)) throw fail('This booking was cancelled: there is no stay to invoice.', 409);
  const invoiceNumber = clean(input.invoiceNumber, 16);
  if (!/^[A-Za-z0-9/-]{1,16}$/.test(invoiceNumber)) throw fail('Enter your invoice number as printed (up to 16 letters, numbers, / or -).');
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(input.invoiceDate || '')) ? new Date(`${input.invoiceDate}T00:00:00.000Z`) : null;
  if (!date || Number.isNaN(+date)) throw fail('Enter the invoice date.');
  if (ymd(date) > istToday()) throw fail('The invoice date can\'t be in the future.');
  if (date < new Date(new Date(b.createdAt).getTime() - DAY)) throw fail('The invoice date is before the booking was made.');
  const amount = r2(input.amount);
  if (!(amount > 0)) throw fail('Enter the invoice total (GST included).');
  const taxAmount = input.taxAmount === '' || input.taxAmount == null ? null : r2(input.taxAmount);
  if (taxAmount != null && !(taxAmount >= 0 && taxAmount < amount)) throw fail('The GST amount must be less than the total.');
  const m = typeof input.file === 'string' ? input.file.match(/^data:[^;,]*;base64,(.+)$/s) : null;
  if (!m) throw fail('Attach the invoice (PDF, JPG or PNG).');
  const buffer = Buffer.from(m[1], 'base64');
  if (!buffer.length) throw fail('The file is empty.');
  if (buffer.length > KYC_MAX_BYTES) throw fail('The file is larger than 10 MB.', 413);
  const ft = detectFileType(buffer);
  if (!ft) throw fail('Only PDF, JPG and PNG files are accepted.', 415);
  const fileKey = await saveKycFile(buffer, ft, `gst-invoice-${b.hotelId}`);
  const data = { invoiceNumber, invoiceDate: date, amount, taxAmount, fileKey, fileName: clean(input.fileName, 120) || `invoice-${invoiceNumber.replace(/\//g, '-')}.${ft.ext}`, mimeType: ft.mimeType, size: buffer.length, uploadedById: user.id };
  const replaced = Boolean(b.hotelGstInvoice);
  const inv = await prisma.hotelGstInvoice.upsert({ where: { bookingId: b.id }, update: data, create: { bookingId: b.id, hotelId: b.hotelId, ...data } });
  await prisma.auditLog.create({ data: { action: replaced ? 'HOTEL_GST_INVOICE_REPLACED' : 'HOTEL_GST_INVOICE_UPLOADED', entityType: 'BOOKING', entityId: b.id, userId: user.id, details: { invoiceNumber, invoiceDate: ymd(date), amount, bookingTotal: Number(b.totalAmount) } } }).catch(() => {});
  await prisma.bookingTimelineEvent.create({ data: { bookingId: b.id, status: b.status, title: replaced ? 'GST invoice replaced' : 'GST invoice uploaded', message: `The property's GST invoice ${invoiceNumber} in the name of ${b.guestCompanyName} is ready to download.` } }).catch(() => {});
  // The booker, and the business's admins and finance when booked through its ZivoPlus account
  const ids = new Set(b.userId ? [b.userId] : []);
  if (b.organisationId) {
    const ms = await prisma.orgMember.findMany({ where: { organisationId: b.organisationId, status: 'ACTIVE', role: { in: ['ADMIN', 'FINANCE'] } }, select: { userId: true } });
    ms.forEach((x) => ids.add(x.userId));
  }
  for (const uid of ids) {
    await notifyUser(uid, {
      type: 'HOTEL_GST_INVOICE', title: 'GST invoice from the hotel', message: `${b.bookingRef}: invoice ${invoiceNumber} in the name of ${b.guestCompanyName} (GSTIN ${b.guestCompanyGstin}) is ready to download.`, link: '/my-bookings',
      email: uid === b.userId ? { subject: `GST invoice for booking ${b.bookingRef}`, html: `<p>The property has issued the GST invoice for booking <b>${b.bookingRef}</b>: invoice ${invoiceNumber} in the name of ${b.guestCompanyName} (GSTIN ${b.guestCompanyGstin}).</p><p>Download it from My Bookings on ZivoPlus. Input tax credit is claimed against this invoice; ZivoPlus acts only as a facilitator.</p>` } : null,
    }).catch(() => {});
  }
  return view(b, inv);
};

/** May this person read the property's invoice for the booking? */
const canRead = async (user, b) => {
  if (!user) return false;
  if (user.role === 'ADMIN') return true;
  if (b.userId === user.id) return true;
  if (b.organisationId) {
    const m = await prisma.orgMember.findFirst({ where: { organisationId: b.organisationId, userId: user.id, status: 'ACTIVE', role: { in: ['ADMIN', 'BOOKER', 'APPROVER', 'FINANCE'] } } });
    if (m) return true;
  }
  return false;
};

/** The file: { buffer, mimeType, fileName }. hotelAccess: the caller already checked the property. */
export const readFile = async (bookingId, user, { hotelAccess = false } = {}) => {
  const b = await prisma.booking.findUnique({ where: { id: String(bookingId) }, include: { hotelGstInvoice: true } });
  if (!b?.hotelGstInvoice) throw fail('The property hasn\'t uploaded the GST invoice yet.', 404);
  if (!hotelAccess && !(await canRead(user, b))) throw fail('Not found', 404);
  const inv = b.hotelGstInvoice;
  return { buffer: await readKycFile(inv.fileKey), mimeType: inv.mimeType, fileName: inv.fileName, invoiceNumber: inv.invoiceNumber };
};

/** Once a day after check-out while missing, up to 7 times: remind the property. */
export const remindMissing = async ({ now = new Date() } = {}) => {
  const settings = await getDocumentSettings();
  const due = await prisma.booking.findMany({
    where: { guestCompanyGstin: { not: null }, status: { in: INVOICED }, checkOut: { lte: now, gte: new Date(now.getTime() - 30 * DAY) }, hotelGstInvoice: null },
    select: { id: true, bookingRef: true, hotelId: true, guestCompanyName: true, guestCompanyGstin: true, businessPricing: true, metadata: true },
    take: 200,
  });
  let sent = 0;
  for (const b of due) {
    if (!hotelIssuesInvoice(b, settings)) continue;
    const r = b.metadata?.gstInvoiceReminders || { count: 0, last: null };
    if (r.count >= 7 || (r.last && now - new Date(r.last) < DAY - 600000)) continue;
    await notifyHotel(b.hotelId, { type: 'GST_INVOICE_MISSING', title: 'GST invoice to upload', message: `${b.bookingRef}: upload the GST invoice in the name of ${b.guestCompanyName} (GSTIN ${b.guestCompanyGstin}) in GST invoices. The business needs it to claim input tax credit.`, metadata: { bookingId: b.id, link: '/extranet/gst-invoices' } }).catch(() => {});
    await prisma.booking.update({ where: { id: b.id }, data: { metadata: { ...(b.metadata || {}), gstInvoiceReminders: { count: r.count + 1, last: now.toISOString() } } } });
    sent += 1;
  }
  return sent;
};

/**
 * ZivoPlus admins (Admin → Finance → Hotel GST invoices): business bookings whose GST invoice the
 * property issues, across properties: what is uploaded and what is waiting after check-out.
 */
export const adminList = async ({ status = '', hotelId = '', q = '' } = {}) => {
  const settings = await getDocumentSettings();
  const where = { guestCompanyGstin: { not: null }, status: { in: INVOICED } };
  if (hotelId) where.hotelId = String(hotelId);
  const s = clean(q, 60);
  if (s) where.OR = [{ bookingRef: { contains: s, mode: 'insensitive' } }, { guestCompanyName: { contains: s, mode: 'insensitive' } }, { guestCompanyGstin: { contains: s.toUpperCase() } }];
  const rows = await prisma.booking.findMany({ where, include: { hotelGstInvoice: true, hotel: { select: { id: true, name: true, city: true } } }, orderBy: { checkOut: 'desc' }, take: 500 });
  const all = rows.filter((b) => hotelIssuesInvoice(b, settings)).map((b) => ({ ...view(b, b.hotelGstInvoice), hotel: b.hotel, reminders: b.metadata?.gstInvoiceReminders?.count || 0 }));
  const list = status === 'WAITING' ? all.filter((x) => x.due) : status === 'UPLOADED' ? all.filter((x) => x.invoice) : status === 'UPCOMING' ? all.filter((x) => !x.invoice && !x.due) : all;
  list.sort((a, b) => (Number(b.due) - Number(a.due)) || new Date(a.checkOut) - new Date(b.checkOut));
  return { bookings: list, counts: { waiting: all.filter((x) => x.due).length, uploaded: all.filter((x) => x.invoice).length, upcoming: all.filter((x) => !x.invoice && !x.due).length } };
};

/** An admin nudges the property now (outside the daily reminders). */
export const adminRemind = async (bookingId, user) => {
  const b = await prisma.booking.findUnique({ where: { id: String(bookingId) }, include: { hotelGstInvoice: true } });
  if (!b || !hotelIssuesInvoice(b, await getDocumentSettings())) throw fail('Booking not found', 404);
  if (b.hotelGstInvoice) throw fail('The property has already uploaded it.', 409);
  await notifyHotel(b.hotelId, {
    type: 'GST_INVOICE_MISSING', title: 'GST invoice to upload (ZivoPlus asked)', message: `${b.bookingRef}: please upload the GST invoice in the name of ${b.guestCompanyName} (GSTIN ${b.guestCompanyGstin}) in GST invoices.`, metadata: { bookingId: b.id, link: '/extranet/gst-invoices' },
    email: { subject: `GST invoice needed: booking ${b.bookingRef}`, html: `<p>Please issue the GST invoice for booking <b>${b.bookingRef}</b> in the name of ${b.guestCompanyName} (GSTIN ${b.guestCompanyGstin}) and upload it in the ZivoPlus extranet → GST invoices. The business needs it to claim input tax credit.</p>` },
  });
  await prisma.auditLog.create({ data: { action: 'HOTEL_GST_INVOICE_REMINDED', entityType: 'BOOKING', entityId: b.id, userId: user.id, details: { by: 'ADMIN' } } }).catch(() => {});
  return { reminded: true };
};

export default { listForHotel, upload, readFile, remindMissing, hotelIssuesInvoice, adminList, adminRemind };
