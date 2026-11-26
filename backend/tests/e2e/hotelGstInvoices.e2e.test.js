/**
 * Business (GSTIN) bookings: the property issues the GST invoice and uploads it in the extranet;
 * ZivoPlus gives a payment receipt as the facilitator. The business downloads the property's
 * invoice; the property is reminded after check-out while it is missing.
 */
import axios from 'axios';
import { expect } from 'chai';
import minimist from 'minimist';
import crypto from 'crypto';
import prisma from '../../config/db.js';
import bcrypt from '../../utils/bcrypt.js';
import { guestInvoiceHtml } from '../../services/documents/guestInvoiceHtml.js';
import { brandContext } from '../../services/documents/documentSettings.js';
import { BOOKING_ROOMS_INCLUDE } from '../../services/bookingRoomsView.js';
import { remindMissing } from '../../services/hotelGstInvoices.js';

const argv = minimist(process.argv.slice(2));
const API = `${argv.url || process.env.E2E_URL || 'http://localhost:5000'}/api/v1`;
const api = axios.create({ baseURL: API, validateStatus: () => true });
const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });
const login = async (email, password) => ({ headers: { Authorization: `Bearer ${(await api.post('/auth/login', { email, password })).data.data.token}` } });
const istToday = () => new Date(Date.now() + 5.5 * 3600000).toISOString().slice(0, 10);
const inDays = (n) => { const d = new Date(`${istToday()}T00:00:00.000Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const PDF = `data:application/pdf;base64,${Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF').toString('base64')}`;
const FACILITATOR = 'Input tax credit of GST charged by the original service provider is available only against the invoice issued by the respective service provider. ZivoPlus acts only as a facilitator for these services.';

describe('Business bookings: the property issues and uploads the GST invoice', function () {
  this.timeout(120000);
  const tag = Date.now().toString().slice(-6);
  const password = `Gst!${crypto.randomUUID().slice(0, 10)}x9`;
  let admin; let booker; let other; let hotelSide; let org; let hotel; let room; let booking; let saved = {};
  const book = async (n) => {
    const r = await api.post(`/business/${org.id}/bookings`, { hotelId: hotel.id, checkIn: inDays(n), checkOut: inDays(n + 1), roomLines: [{ roomTypeId: room.id, ratePlanId: room.ratePlans[0].id, adults: 1 }], guestPhone: '9810012345' }, booker);
    expect(r.status, JSON.stringify(r.data)).to.equal(201);
    return r.data.data;
  };

  before(async () => {
    admin = await login('admin@zivoplus.com', 'admin123');
    saved.settings = await prisma.systemConfig.findUnique({ where: { key: 'business_settings' } });
    saved.docs = (await api.get('/admin/documents', admin)).data.data.settings;
    await api.put('/admin/business-settings', { corporate: { enabled: true, holdHours: 24, requireAgreement: false } }, admin);
    await api.put('/admin/documents', { guestInvoice: { mode: 'ON_BEHALF', b2bMode: 'HOTEL_ISSUES' } }, admin);
    const u = await prisma.user.create({ data: { name: 'Rhea Sen', email: `rhea.g${tag}@example.com`, password: await bcrypt.hash(password, 10), role: 'CUSTOMER', status: 'ACTIVE', emailVerifiedAt: new Date() } });
    const o = await prisma.user.create({ data: { name: 'Not Related', email: `nr.g${tag}@example.com`, password: await bcrypt.hash(password, 10), role: 'CUSTOMER', status: 'ACTIVE', emailVerifiedAt: new Date() } });
    org = await prisma.organisation.create({ data: { kind: 'CORPORATE', code: `ZB-X${tag}`, name: `Quartz Analytics ${tag}`, legalName: `Quartz Analytics Private Limited ${tag}`, incorporationType: 'PVT_LTD', pan: `AABCQ${tag.slice(2)}K`, gstin: `27AABCQ${tag.slice(2)}K1Z5`, address: '3 Nariman Point', city: 'Mumbai', state: 'Maharashtra', pincode: '400021', billingEmail: `ap.x${tag}@example.com`, phone: '9845011166', status: 'ACTIVE', createdById: u.id } });
    await prisma.orgMember.create({ data: { organisationId: org.id, userId: u.id, role: 'ADMIN' } });
    booker = await login(u.email, password);
    other = await login(o.email, password);
    const hotels = await prisma.hotel.findMany({ where: { status: { in: ['LIVE', 'ACTIVE'] }, isDeleted: false }, include: { roomTypes: { where: { isActive: true }, include: { ratePlans: { where: { isActive: true, basePrice: { gt: 0 } } } } } } });
    hotel = hotels.find((h) => h.roomTypes.some((rt) => rt.ratePlans.length && rt.totalInventory >= 2));
    room = hotel.roomTypes.find((rt) => rt.ratePlans.length && rt.totalInventory >= 2);
    await prisma.hotelBusinessRate.upsert({ where: { hotelId: hotel.id }, update: { corporateEnabled: true }, create: { hotelId: hotel.id, corporateEnabled: true, corporateDiscountPct: 0 } });
    const owner = await prisma.user.findUnique({ where: { id: hotel.ownerId } });
    saved.owner = { id: owner.id, password: owner.password };
    await prisma.user.update({ where: { id: owner.id }, data: { password: await bcrypt.hash(password, 10) } });
    hotelSide = await login(owner.email, password);
    await api.post(`/admin/organisations/${org.id}/ledger`, { type: 'PAYMENT', amount: 300000, note: 'NEFT UTR 6655443322', reference: `UTR-X${tag}` }, admin);
  });

  after(async () => {
    await prisma.user.update({ where: { id: saved.owner.id }, data: { password: saved.owner.password } }).catch(() => {});
    if (saved.docs) await api.put('/admin/documents', { guestInvoice: { mode: saved.docs.guestInvoice.mode, b2bMode: saved.docs.guestInvoice.b2bMode || 'HOTEL_ISSUES' } }, admin);
    if (saved.settings) await prisma.systemConfig.update({ where: { key: 'business_settings' }, data: { value: saved.settings.value } }).catch(() => {});
  });

  it('ZivoPlus gives a payment receipt as the facilitator, not a tax invoice', async () => {
    booking = await book(45);
    const full = await prisma.booking.findUnique({ where: { id: booking.id }, include: { hotel: true, roomType: { select: { name: true } }, ratePlan: { select: { name: true, mealPlan: true } }, ...BOOKING_ROOMS_INCLUDE } });
    expect(full.guestCompanyGstin).to.equal(org.gstin);
    const html = guestInvoiceHtml({ booking: full, hotel: full.hotel, rooms: full.bookingRooms, invoiceRef: 'ZIV/26-27/000001', brand: await brandContext() });
    expect(html).to.include('Payment Receipt').and.include('This is not a tax invoice').and.include(FACILITATOR).and.include('inclusive of applicable taxes').and.include(org.gstin);
    expect(html).to.not.include('<h1>Tax Invoice</h1>');
    // The voucher tells the business where its invoice comes from
    const v = await api.get(`/bookings/${booking.id}/voucher?type=guest`, { ...booker, responseType: 'arraybuffer' });
    expect(v.status).to.equal(200);
  });

  it('the property sees the booking in GST invoices and uploads its invoice', async () => {
    const list = await api.get(`/extranet/gst-invoices/${hotel.id}`, hotelSide);
    expect(list.status, JSON.stringify(list.data)).to.equal(200);
    const row = list.data.data.bookings.find((x) => x.bookingId === booking.id);
    expect(row).to.include({ due: false, invoice: null });
    expect(row.company).to.include({ gstin: org.gstin });

    const base = { invoiceNumber: 'GH/26-27/0451', invoiceDate: istToday(), amount: booking.total, taxAmount: booking.tax, fileName: 'gh-0451.pdf' };
    const bad = [
      [{ ...base, file: undefined }, 400, /Attach/],
      [{ ...base, invoiceNumber: 'this number is far too long', file: PDF }, 400, /16/],
      [{ ...base, invoiceDate: inDays(3), file: PDF }, 400, /future/],
      [{ ...base, amount: 0, file: PDF }, 400, /total/],
      [{ ...base, file: `data:image/svg+xml;base64,${Buffer.from('<svg/>').toString('base64')}` }, 415, /PDF, JPG and PNG/],
    ];
    for (const [body, code, msg] of bad) {
      const r = await api.post(`/extranet/gst-invoices/${hotel.id}/${booking.id}`, body, hotelSide);
      expect(r.status, JSON.stringify(body).slice(0, 80)).to.equal(code);
      expect(r.data.message).to.match(msg);
    }
    const ok = await api.post(`/extranet/gst-invoices/${hotel.id}/${booking.id}`, { ...base, file: PDF }, hotelSide);
    expect(ok.status, JSON.stringify(ok.data)).to.equal(200);
    expect(ok.data.data.invoice).to.include({ invoiceNumber: 'GH/26-27/0451', amount: booking.total });
    const fromHotel = await api.get(`/extranet/gst-invoices/${hotel.id}/${booking.id}/file`, { ...hotelSide, responseType: 'arraybuffer' });
    expect(Buffer.from(fromHotel.data).subarray(0, 4).toString()).to.equal('%PDF');
    // A corrected invoice replaces it
    const again = await api.post(`/extranet/gst-invoices/${hotel.id}/${booking.id}`, { ...base, invoiceNumber: 'GH/26-27/0452', file: PDF }, hotelSide);
    expect(again.data.data.invoice.invoiceNumber).to.equal('GH/26-27/0452');
    expect(await prisma.auditLog.count({ where: { entityId: booking.id, action: 'HOTEL_GST_INVOICE_REPLACED' } })).to.equal(1);
  });

  it('the business downloads the property\'s invoice; others cannot', async () => {
    const mine = await api.get(`/invoices/hotel/${booking.id}/download`, { ...booker, responseType: 'arraybuffer' });
    expect(mine.status).to.equal(200);
    expect(mine.headers['content-type']).to.match(/application\/pdf/);
    expect((await api.get(`/invoices/hotel/${booking.id}/download`, other)).status).to.equal(404);
    const list = await api.get(`/business/${org.id}/bookings`, booker);
    const row = list.data.data.bookings.find((x) => x.id === booking.id);
    expect(row.hotelInvoice.invoiceNumber).to.equal('GH/26-27/0452');
    const my = (await api.get('/bookings/my-bookings', booker)).data.data.find((x) => x.id === booking.id);
    expect(my.hotelGstInvoice.invoiceNumber).to.equal('GH/26-27/0452');
    expect(await prisma.userNotification.count({ where: { type: 'HOTEL_GST_INVOICE', title: { contains: 'GST invoice' } } })).to.be.greaterThan(0);
  });

  it('after check-out the property is reminded once a day while it is missing; no credit notes from ZivoPlus', async () => {
    const b2 = await book(60);
    await prisma.booking.update({ where: { id: b2.id }, data: { checkIn: new Date(`${inDays(-2)}T00:00:00.000Z`), checkOut: new Date(`${inDays(-1)}T00:00:00.000Z`), status: 'COMPLETED' } });
    const before = await prisma.notification.count({ where: { hotelId: hotel.id, type: 'GST_INVOICE_MISSING' } });
    expect(await remindMissing()).to.be.greaterThan(0);
    const once = await prisma.notification.count({ where: { hotelId: hotel.id, type: 'GST_INVOICE_MISSING' } });
    expect(once).to.be.greaterThan(before);
    await remindMissing();
    expect(await prisma.notification.count({ where: { hotelId: hotel.id, type: 'GST_INVOICE_MISSING' } })).to.equal(once);
    const list = await api.get(`/extranet/gst-invoices/${hotel.id}?status=PENDING`, hotelSide);
    expect(list.data.data.bookings.find((x) => x.bookingId === b2.id).due).to.equal(true);

    const b3 = await book(70);
    const c = await api.post(`/business/${org.id}/bookings/${b3.id}/cancel`, {}, booker);
    expect(c.status).to.equal(200);
    await sleep(1500);
    expect(await prisma.guestNote.count({ where: { bookingId: b3.id } })).to.equal(0);
  });
});
