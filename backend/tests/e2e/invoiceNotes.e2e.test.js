/**
 * Guest tax invoices for GST: numbered per financial year within 16 characters, the fields GST
 * rule 46 asks for, and credit / debit notes (never a redrawn invoice) when the booking changes.
 */
import axios from 'axios';
import { expect } from 'chai';
import minimist from 'minimist';
import crypto from 'crypto';
import prisma from '../../config/db.js';
import bcrypt from '../../utils/bcrypt.js';
import { guestInvoiceHtml, guestNoteHtml } from '../../services/documents/guestInvoiceHtml.js';
import { brandContext } from '../../services/documents/documentSettings.js';
import { BOOKING_ROOMS_INCLUDE } from '../../services/bookingRoomsView.js';
import { issueNote, invoicedValue } from '../../services/guestNoteService.js';
import { fyStart, fyLabel } from '../../utils/financialYear.js';

const argv = minimist(process.argv.slice(2));
const API = `${argv.url || process.env.E2E_URL || 'http://localhost:5000'}/api/v1`;
const api = axios.create({ baseURL: API, validateStatus: () => true });
const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });
const login = async (email, password) => ({ headers: { Authorization: `Bearer ${(await api.post('/auth/login', { email, password })).data.data.token}` } });
const istToday = () => new Date(Date.now() + 5.5 * 3600000).toISOString().slice(0, 10);
const inDays = (n) => { const d = new Date(`${istToday()}T00:00:00.000Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const SERIES = /^[A-Z]{2,3}\/\d{2}-\d{2}\/\d{6}$/;

describe('Guest invoices: GST numbering, fields, credit and debit notes', function () {
  this.timeout(120000);
  const tag = Date.now().toString().slice(-6);
  const password = `Inv!${crypto.randomUUID().slice(0, 10)}x9`;
  let admin; let booker; let other; let org; let hotel; let room; let booking; let invoice; let saved; let savedDocs;

  const waitFor = async (fn, ms = 30000) => { const end = Date.now() + ms; for (;;) { const v = await fn(); if (v || Date.now() > end) return v; await sleep(500); } };

  before(async () => {
    admin = await login('admin@zivoplus.com', 'admin123');
    saved = await prisma.systemConfig.findUnique({ where: { key: 'business_settings' } });
    await api.put('/admin/business-settings', { corporate: { enabled: true, holdHours: 24, requireAgreement: false } }, admin);
    // ZivoPlus issues the invoice on the property's behalf, for business (GSTIN) bookings too
    savedDocs = (await api.get('/admin/documents', admin)).data.data.settings;
    await api.put('/admin/documents', { guestInvoice: { mode: 'ON_BEHALF', b2bMode: 'ON_BEHALF' } }, admin);
    const u = await prisma.user.create({ data: { name: 'Neha Kapoor', email: `neha.i${tag}@example.com`, password: await bcrypt.hash(password, 10), role: 'CUSTOMER', status: 'ACTIVE', emailVerifiedAt: new Date() } });
    const o = await prisma.user.create({ data: { name: 'Someone Else', email: `else.i${tag}@example.com`, password: await bcrypt.hash(password, 10), role: 'CUSTOMER', status: 'ACTIVE', emailVerifiedAt: new Date() } });
    org = await prisma.organisation.create({ data: { kind: 'CORPORATE', code: `ZB-I${tag}`, name: `Lumen Works ${tag}`, legalName: `Lumen Works Private Limited ${tag}`, incorporationType: 'PVT_LTD', pan: `AABCL${tag.slice(2)}K`, gstin: `29AABCL${tag.slice(2)}K1Z5`, address: '9 Brigade Road', city: 'Bengaluru', state: 'Karnataka', pincode: '560001', billingEmail: `ap.i${tag}@example.com`, phone: '9845011155', status: 'ACTIVE', createdById: u.id } });
    await prisma.orgMember.create({ data: { organisationId: org.id, userId: u.id, role: 'ADMIN' } });
    booker = await login(u.email, password);
    other = await login(o.email, password);
    const hotels = await prisma.hotel.findMany({ where: { status: { in: ['LIVE', 'ACTIVE'] }, isDeleted: false }, include: { roomTypes: { where: { isActive: true }, include: { ratePlans: { where: { isActive: true, basePrice: { gt: 0 } } } } } } });
    hotel = hotels.find((h) => h.roomTypes.some((rt) => rt.ratePlans.length && rt.totalInventory >= 2));
    room = hotel.roomTypes.find((rt) => rt.ratePlans.length && rt.totalInventory >= 2);
    await prisma.hotelBusinessRate.upsert({ where: { hotelId: hotel.id }, update: { corporateEnabled: true }, create: { hotelId: hotel.id, corporateEnabled: true, corporateDiscountPct: 0 } });
    await api.post(`/admin/organisations/${org.id}/ledger`, { type: 'PAYMENT', amount: 300000, note: 'NEFT UTR 7788990011', reference: `UTR-I${tag}` }, admin);
  });

  after(async () => {
    if (savedDocs) await api.put('/admin/documents', { guestInvoice: { mode: savedDocs.guestInvoice.mode, b2bMode: savedDocs.guestInvoice.b2bMode || 'HOTEL_ISSUES' } }, admin);
    if (saved) await prisma.systemConfig.update({ where: { key: 'business_settings' }, data: { value: saved.value } }).catch(() => {});
  });

  it('numbers the invoice per financial year within 16 characters and keeps what it was for', async () => {
    const line = { roomTypeId: room.id, ratePlanId: room.ratePlans[0].id, adults: 1 };
    const b = await api.post(`/business/${org.id}/bookings`, { hotelId: hotel.id, checkIn: inDays(40), checkOut: inDays(41), roomLines: [line, line], guestPhone: '9810012345' }, booker);
    expect(b.status, JSON.stringify(b.data)).to.equal(201);
    booking = b.data.data;
    invoice = await waitFor(() => prisma.invoice.findFirst({ where: { bookingId: booking.id, status: 'GENERATED' } }));
    expect(invoice, 'invoice issued').to.not.equal(null);
    expect(invoice.invoiceRef).to.match(SERIES);
    expect(invoice.invoiceRef.length).to.be.at.most(16);
    expect(invoice.invoiceRef).to.include(`/${fyLabel(fyStart())}/`);
    expect(Number(invoice.totalAmount)).to.equal(booking.total);
    expect(Number(invoice.taxAmount)).to.equal(booking.tax);
  });

  it('prints what GST asks for on a tax invoice', async () => {
    const full = await prisma.booking.findUnique({ where: { id: booking.id }, include: { hotel: true, roomType: { select: { name: true } }, ratePlan: { select: { name: true, mealPlan: true } }, ...BOOKING_ROOMS_INCLUDE } });
    const html = guestInvoiceHtml({ booking: full, hotel: full.hotel, rooms: full.bookingRooms, invoiceRef: invoice.invoiceRef, issueDate: invoice.createdAt, brand: await brandContext() });
    for (const s of ['Tax Invoice', '996311', 'Accommodation services', 'Tax payable under reverse charge', 'Place of supply', 'Taxable value', 'CGST', 'SGST', 'address of supply', 'Issued by', 'Terms', 'not a valid travel document']) expect(html, s).to.include(s);
    // A company booking: the business is the recipient, with its GSTIN and state
    expect(html).to.include('Recipient (registered business)').and.include(org.gstin).and.include('State: Karnataka (29)').and.include('B2B');
  });

  it('a cancelled booking gets a credit note; the invoice is not redrawn', async () => {
    const pdfBefore = invoice.pdfUrl;
    const c = await api.post(`/business/${org.id}/bookings/${booking.id}/cancel`, {}, booker);
    expect(c.status, JSON.stringify(c.data)).to.equal(200);
    const note = await waitFor(() => prisma.guestNote.findFirst({ where: { bookingId: booking.id, kind: 'CREDIT', status: 'GENERATED' } }));
    expect(note, 'credit note issued').to.not.equal(null);
    expect(note.noteRef).to.match(SERIES);
    expect(note.noteRef.length).to.be.at.most(16);
    const retained = booking.total - Number((await prisma.booking.findUnique({ where: { id: booking.id } })).refundAmount || 0);
    expect(Number(note.amount)).to.equal(Math.round((booking.total - retained) * 100) / 100);
    const inv = await prisma.invoice.findUnique({ where: { id: invoice.id } });
    expect(inv.pdfUrl).to.equal(pdfBefore);
    expect(Number(inv.totalAmount)).to.equal(booking.total);
    const value = await invoicedValue(inv);
    expect(value.total).to.equal(Math.round(retained * 100) / 100);

    // The guest who booked downloads it; nobody else can
    const mine = await api.get(`/invoices/notes/${note.id}/download`, { ...booker, responseType: 'arraybuffer' });
    expect(mine.status).to.equal(200);
    expect(Buffer.from(mine.data).subarray(0, 4).toString()).to.equal('%PDF');
    expect((await api.get(`/invoices/notes/${note.id}/download`, other)).status).to.equal(403);
    const list = await api.get('/bookings/my-bookings', booker);
    const row = list.data.data.find((x) => x.id === booking.id);
    expect(row, 'the booking is in My Bookings').to.not.equal(undefined);
    expect(row.guestNotes.map((x) => x.noteRef)).to.include(note.noteRef);
  });

  it('notes are once per event, and a debit note adds to the invoice', async () => {
    const again = await issueNote(booking.id, { kind: 'CREDIT', amount: 100, tax: 5, reason: 'again', key: 'cancel' });
    expect(again.noteRef).to.equal((await prisma.guestNote.findFirst({ where: { bookingId: booking.id, key: 'cancel' } })).noteRef);
    const debit = await issueNote(booking.id, { kind: 'DEBIT', amount: 1050, tax: 50, reason: '2 extra hours added', key: 'hours-test' });
    expect(debit.kind).to.equal('DEBIT');
    expect(debit.noteRef).to.match(SERIES);
    const inv = await prisma.invoice.findUnique({ where: { id: invoice.id } });
    const full = await prisma.booking.findUnique({ where: { id: booking.id }, include: { hotel: true } });
    const html = guestNoteHtml({ booking: full, hotel: full.hotel, note: debit, invoice: inv, brand: await brandContext() });
    expect(html).to.include('Debit Note').and.include(inv.invoiceRef).and.include('2 extra hours added').and.include('1,050.00');
  });
});
