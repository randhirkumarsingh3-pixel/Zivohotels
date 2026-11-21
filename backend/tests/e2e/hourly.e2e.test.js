/**
 * End-to-end hourly stay against a running API and its database (sample data from prisma/seed.js):
 * the hotel switches hourly stays on (one room for hourly use), ZivoHotels approves, a guest books
 * and pays a 3-hour slot, an overlapping slot is refused (cleaning time included), a slot after
 * the cleaning time is accepted, night inventory is untouched, and the guest cancels in time for
 * a full refund to Zivo Cash. The hotel's hourly setup is put back afterwards.
 */
import crypto from 'crypto';
import axios from 'axios';
import { expect } from 'chai';
import minimist from 'minimist';
import prisma from '../../config/db.js';

const argv = minimist(process.argv.slice(2));
const API = `${argv.url || process.env.E2E_URL || 'http://localhost:5000'}/api/v1`;
const api = axios.create({ baseURL: API, validateStatus: () => true });
const ymd = (d) => d.toISOString().slice(0, 10);
const DATE = ymd(new Date(Date.now() + 50 * 86400000));

const login = async (email, password) => {
  const r = await api.post('/auth/login', { email, password });
  expect(r.status, `${email}: ${JSON.stringify(r.data)}`).to.equal(200);
  return { headers: { Authorization: `Bearer ${r.data.data.token}` } };
};

describe('Hourly stay end to end', function () {
  this.timeout(30000);
  let owner; let admin; let guest; let hotelId; let roomType; let saved; let booking;

  before(async () => {
    owner = await login('extranet@zivotechretreat.com', process.env.SEED_OWNER_PASSWORD || 'ZivoExtranet@2026');
    admin = await login('admin@zivohotels.com', process.env.SEED_ADMIN_PASSWORD || 'admin123');
    guest = await login('user@zivohotels.com', process.env.SEED_CUSTOMER_PASSWORD || 'customer123');
    hotelId = (await api.get('/extranet/property', owner)).data.data.id;
    const h = await prisma.hotel.findUnique({ where: { id: hotelId }, select: { hourlySettings: true, roomTypes: { select: { id: true, hourlyEnabled: true, hourlyRooms: true, hourlyPrices: true } } } });
    saved = h; // put back afterwards
  });

  after(async () => {
    if (saved) {
      await prisma.hotel.update({ where: { id: hotelId }, data: { hourlySettings: saved.hourlySettings ?? undefined } });
      for (const rt of saved.roomTypes) await prisma.roomType.update({ where: { id: rt.id }, data: { hourlyEnabled: rt.hourlyEnabled, hourlyRooms: rt.hourlyRooms, hourlyPrices: rt.hourlyPrices ?? undefined } });
    }
  });

  it('lets the hotel switch hourly stays on, waiting for approval', async () => {
    const setup = (await api.get('/extranet/hourly', owner)).data.data;
    roomType = setup.roomTypes[0];
    const r = await api.put('/extranet/hourly', {
      settings: { enabled: true, openFrom: '08:00', openTo: '21:00', durations: [3, 6], cleaningMinutes: 30, leadMinutes: 60, freeCancelHours: 2 },
      roomTypes: setup.roomTypes.map((t) => ({ id: t.id, hourlyEnabled: t.id === roomType.id, hourlyRooms: 1, hourlyPrices: { 3: 1299, 6: 1999 } })),
    }, owner);
    expect(r.status, JSON.stringify(r.data)).to.equal(200);
    // Approval is ZivoHotels' decision, not the hotel's
    await prisma.hotel.update({ where: { id: hotelId }, data: { hourlySettings: { ...(await prisma.hotel.findUnique({ where: { id: hotelId } })).hourlySettings, approved: false } } });
    const offer = (await api.get(`/hotels/${hotelId}/hourly?date=${DATE}&hours=3`)).data.data;
    expect(offer.available).to.equal(false);
  });

  it('shows the hotel to guests once ZivoHotels approves', async () => {
    const r = await api.put(`/admin/hourly/hotels/${hotelId}`, { approved: true }, admin);
    expect(r.status, JSON.stringify(r.data)).to.equal(200);
    const offer = (await api.get(`/hotels/${hotelId}/hourly?date=${DATE}&hours=3`)).data.data;
    expect(offer.available).to.equal(true);
    expect(offer.roomTypes[0]).to.include({ id: roomType.id, price: 1299 });
    expect(offer.startTimes).to.include('11:00');
  });

  it('books and pays a 3-hour slot without touching night inventory', async () => {
    const nightBefore = await prisma.inventory.findFirst({ where: { roomTypeId: roomType.id, date: new Date(DATE) } });
    const slot = { hotelId, roomTypeId: roomType.id, date: DATE, start: '11:00', hours: 3, adults: 2, children: 0 };
    const q = (await api.post('/bookings/hourly/preview', slot, guest)).data.data;
    expect(q.available).to.equal(true);
    expect(q.roomPrice).to.equal(1299);
    const r = await api.post('/bookings/hourly', { ...slot, guestName: 'Asha Rao', guestEmail: 'e2e@example.com', guestPhone: '9876543210' }, guest);
    expect(r.status, JSON.stringify(r.data)).to.equal(201);
    booking = r.data.data.booking;
    expect(booking.totalAmount).to.equal(q.totalAmount);

    await prisma.booking.update({ where: { id: booking.id }, data: { razorpayOrderId: 'order_e2e_h1' } });
    const signature = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET).update('order_e2e_h1|pay_e2e_h1').digest('hex');
    const v = await api.post('/payments/verify', { razorpay_order_id: 'order_e2e_h1', razorpay_payment_id: 'pay_e2e_h1', razorpay_signature: signature, bookingId: booking.id }, guest);
    expect(v.status, JSON.stringify(v.data)).to.equal(200);
    const b = await prisma.booking.findUnique({ where: { id: booking.id } });
    expect(b).to.include({ status: 'CONFIRMED', paymentStatus: 'PAID', stayType: 'HOURLY', hours: 3 });

    const nightAfter = await prisma.inventory.findFirst({ where: { roomTypeId: roomType.id, date: new Date(DATE) } });
    expect(nightAfter?.availableRooms ?? null).to.equal(nightBefore?.availableRooms ?? null);
  });

  it('refuses a slot overlapping the stay or its cleaning time, and accepts one after', async () => {
    const base = { hotelId, roomTypeId: roomType.id, date: DATE, hours: 3, adults: 2, children: 0, guestName: 'Second Guest', guestEmail: 'e2e@example.com', guestPhone: '9876543210' };
    const clash = await api.post('/bookings/hourly', { ...base, start: '13:30' }, guest); // cleaning until 14:30
    expect(clash.status).to.equal(409);
    const later = await api.post('/bookings/hourly', { ...base, start: '14:30' }, guest);
    expect(later.status, JSON.stringify(later.data)).to.equal(201);
    // Not paid: release it (as if the 30 minutes to pay had passed)
    await prisma.booking.update({ where: { id: later.data.data.booking.id }, data: { status: 'CANCELLED', expiresAt: new Date() } });
  });

  it('shows the booking on the hotel timeline', async () => {
    const t = (await api.get(`/extranet/hourly/timeline?date=${DATE}`, owner)).data.data;
    const refs = t.roomTypes.flatMap((r) => r.bookings.map((b) => b.bookingRef));
    expect(refs).to.include(booking.bookingRef);
  });

  it('refunds in full when the guest cancels in time', async () => {
    const p = (await api.get(`/bookings/${booking.id}/cancel-preview`, guest)).data.data;
    expect(p.policyCode).to.equal('HOURLY');
    expect(p.refundAmount).to.equal(booking.totalAmount);
    const c = await api.post(`/bookings/${booking.id}/cancel`, { refundTo: 'WALLET' }, guest);
    expect(c.status, JSON.stringify(c.data)).to.equal(200);
    const b = await prisma.booking.findUnique({ where: { id: booking.id } });
    expect(b.status).to.equal('CANCELLED');
    // The slot is free again
    const offer = (await api.get(`/hotels/${hotelId}/hourly?date=${DATE}&hours=3`)).data.data;
    expect(offer.roomTypes[0].startTimes).to.include('11:00');
  });
});
