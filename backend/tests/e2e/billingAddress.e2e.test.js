/**
 * GST rule 46: an individual's tax invoice of ₹50,000 or more carries their address and state.
 * Website checkout asks for them above that amount when ZivoPlus issues the tax invoice; the
 * invoice prints them. When the hotel issues it, checkout doesn't ask (the hotel collects them).
 */
import axios from 'axios';
import { expect } from 'chai';
import minimist from 'minimist';
import prisma from '../../config/db.js';
import { guestInvoiceHtml } from '../../services/documents/guestInvoiceHtml.js';
import { brandContext } from '../../services/documents/documentSettings.js';
import { BOOKING_ROOMS_INCLUDE } from '../../services/bookingRoomsView.js';

const argv = minimist(process.argv.slice(2));
const API = `${argv.url || process.env.E2E_URL || 'http://localhost:5000'}/api/v1`;
const api = axios.create({ baseURL: API, validateStatus: () => true });
const istToday = () => new Date(Date.now() + 5.5 * 3600000).toISOString().slice(0, 10);
const inDays = (n) => { const d = new Date(`${istToday()}T00:00:00.000Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

describe('Billing address on large invoices for individuals', function () {
  this.timeout(60000);
  let auth; let admin; let savedDocs; let hotel; let room; const made = [];
  const body = (rooms, extra = {}) => ({
    hotelId: hotel.id, roomTypeId: room.id, ratePlanId: room.ratePlans[0].id, rooms, adults: rooms, children: 0,
    checkIn: inDays(120), checkOut: inDays(122), paymentType: 'PREPAID', guestName: 'Kiran Desai', guestEmail: 'kiran@example.com', guestPhone: '9876501234',
    roomLines: Array.from({ length: rooms }, () => ({ roomTypeId: room.id, ratePlanId: room.ratePlans[0].id, adults: 1, guestName: 'Kiran Desai' })), ...extra,
  });

  before(async () => {
    const login = await api.post('/auth/login', { email: 'user@zivoplus.com', password: process.env.SEED_CUSTOMER_PASSWORD || 'customer123' });
    auth = { headers: { Authorization: `Bearer ${login.data.data.token}` } };
    admin = { headers: { Authorization: `Bearer ${(await api.post('/auth/login', { email: 'admin@zivoplus.com', password: 'admin123' })).data.data.token}` } };
    savedDocs = (await api.get('/admin/documents', admin)).data.data.settings;
    await api.put('/admin/documents', { guestInvoice: { mode: 'ON_BEHALF' } }, admin);
    const hotels = await prisma.hotel.findMany({ where: { status: { in: ['LIVE', 'ACTIVE'] }, isDeleted: false }, include: { roomTypes: { where: { isActive: true }, include: { ratePlans: { where: { isActive: true, basePrice: { gt: 0 } } } } } } });
    // A room type where a few rooms for two nights come to more than ₹50,000
    for (const h of hotels) for (const rt of h.roomTypes) if (!room && rt.ratePlans.length && rt.totalInventory >= 4 && Number(rt.ratePlans[0].basePrice) * 2 * Math.min(8, rt.totalInventory) > 60000) { hotel = h; room = rt; }
  });

  after(async () => {
    if (savedDocs) await api.put('/admin/documents', { guestInvoice: { mode: savedDocs.guestInvoice.mode } }, admin);
    for (const id of made) await api.post(`/bookings/${id}/cancel`, {}, auth).catch(() => {});
  });

  it('a small stay needs no billing address', async () => {
    const r = await api.post('/bookings', body(1), auth);
    expect(r.status, JSON.stringify(r.data)).to.be.oneOf([200, 201]);
    made.push(r.data.data.id);
    expect(Number(r.data.data.totalAmount)).to.be.below(50000);
  });

  it('a stay of ₹50,000 or more needs the billing address and a real state, then prints them', async () => {
    const rooms = Math.min(8, room.totalInventory);
    const p = await api.post('/bookings/preview', body(rooms), auth);
    expect(p.data.data.totalAmount).to.be.at.least(50000);
    expect(p.data.data.billingAddressFrom).to.equal(50000);
    const without = await api.post('/bookings', body(rooms), auth);
    expect(without.status).to.equal(400);
    expect(without.data.message).to.match(/billing address/i);
    const badState = await api.post('/bookings', body(rooms, { billingAddress: '12 Hill Road, Bandra West, Mumbai 400050', billingStateCode: '99' }), auth);
    expect(badState.status).to.equal(400);
    const ok = await api.post('/bookings', body(rooms, { billingAddress: '12 Hill Road, Bandra West, Mumbai 400050', billingStateCode: '27' }), auth);
    expect(ok.status, JSON.stringify(ok.data)).to.be.oneOf([200, 201]);
    made.push(ok.data.data.id);
    const b = await prisma.booking.findUnique({ where: { id: ok.data.data.id }, include: { hotel: true, roomType: { select: { name: true } }, ratePlan: { select: { name: true, mealPlan: true } }, ...BOOKING_ROOMS_INCLUDE } });
    expect(b).to.include({ billingAddress: '12 Hill Road, Bandra West, Mumbai 400050', billingStateCode: '27' });
    const html = guestInvoiceHtml({ booking: b, hotel: b.hotel, rooms: b.bookingRooms, invoiceRef: 'ZIV/26-27/000001', brand: await brandContext() });
    expect(html).to.include('12 Hill Road, Bandra West, Mumbai 400050').and.include('State: Maharashtra (27)');
  });

  it('when the hotel issues the tax invoice, checkout does not ask for the address', async () => {
    await api.put('/admin/documents', { guestInvoice: { mode: 'HOTEL_ISSUES' } }, admin);
    const rooms = Math.min(8, room.totalInventory);
    const p = await api.post('/bookings/preview', body(rooms, { checkIn: inDays(130), checkOut: inDays(132) }), auth);
    expect(p.data.data.totalAmount).to.be.at.least(50000);
    expect(p.data.data.billingAddressFrom).to.equal(null);
    const r = await api.post('/bookings', body(rooms, { checkIn: inDays(130), checkOut: inDays(132) }), auth);
    expect(r.status, JSON.stringify(r.data)).to.be.oneOf([200, 201]);
    made.push(r.data.data.id);
  });
});
