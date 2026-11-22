/**
 * End-to-end booking test against a running API and its database (the sample data from
 * prisma/seed.js). Run in PR Validation after the smoke tests:
 *
 *   npm run test:e2e -- --url=http://localhost:5000
 *
 * Covers the money paths: a two-room booking with different room types and a lead guest per
 * room, its payment (Razorpay signature made with the test secret), cancellation with a refund to
 * Zivo Cash, and a "reserve now, pay later" booking. Rooms must be held and given back.
 * Run with BOOKING_RATE_LIMIT_PER_MINUTE raised (PR Validation sets 30): more than five booking
 * writes happen within a minute.
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
const inDays = (n) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + n); return ymd(d); };
const CHECK_IN = inDays(40);
const CHECK_OUT = inDays(42);

describe('Booking end to end', function () {
  this.timeout(30000);
  let auth;
  let hotel;
  let suite;
  let standard;

  const roomsLeft = async (roomTypeId) => {
    const inv = await prisma.inventory.findFirst({ where: { roomTypeId, date: new Date(CHECK_IN) } });
    if (inv) return inv.availableRooms;
    return (await prisma.roomType.findUnique({ where: { id: roomTypeId } })).totalInventory;
  };

  before(async () => {
    const login = await api.post('/auth/login', { email: 'user@zivoplus.com', password: process.env.SEED_CUSTOMER_PASSWORD || 'customer123' });
    expect(login.status, JSON.stringify(login.data)).to.equal(200);
    auth = { headers: { Authorization: `Bearer ${login.data.data.token}` } };

    // A live hotel with two room types that have a priced plan (the seed makes Standard + Suite)
    const hotels = await prisma.hotel.findMany({
      where: { status: { in: ['LIVE', 'ACTIVE'] }, isDeleted: false },
      include: { roomTypes: { where: { isActive: { not: false } }, include: { ratePlans: { where: { isActive: true, basePrice: { gt: 0 } } } } } },
    });
    hotel = hotels.find((h) => h.roomTypes.filter((rt) => rt.ratePlans.length).length >= 2);
    expect(hotel, 'a live hotel with two priced room types').to.exist;
    const types = hotel.roomTypes.filter((rt) => rt.ratePlans.length).sort((a, b) => (b.maxOccupancy || 2) - (a.maxOccupancy || 2));
    [suite, standard] = types;
  });

  after(() => prisma.$disconnect());

  const roomLines = () => [
    { roomTypeId: suite.id, ratePlanId: suite.ratePlans[0].id, adults: Math.min(2, suite.maxOccupancy || 2), children: 0, guestName: 'Asha Rao' },
    { roomTypeId: standard.id, ratePlanId: standard.ratePlans[0].id, adults: 1, children: 0, guestName: 'Vikram Rao' },
  ];
  const bookingBody = (paymentType) => ({
    hotelId: hotel.id, roomTypeId: suite.id, ratePlanId: suite.ratePlans[0].id, rooms: 2,
    adults: roomLines().reduce((t, r) => t + r.adults, 0), children: 0,
    checkIn: CHECK_IN, checkOut: CHECK_OUT, paymentType,
    guestName: 'Asha Rao', guestEmail: 'e2e@example.com', guestPhone: '9876543210', roomLines: roomLines(),
  });

  let paid;
  it('prices two different rooms, each for its own guests', async () => {
    const r = await api.post('/bookings/preview', { ...bookingBody('PREPAID'), roomLines: roomLines().map(({ guestName: _g, ...l }) => l) }, auth);
    expect(r.status, JSON.stringify(r.data)).to.equal(200);
    const q = r.data.data;
    expect(q.rooms).to.equal(2);
    expect(q.roomsBreakdown.map((x) => x.roomTypeId)).to.deep.equal([suite.id, standard.id]);
    expect(q.roomsBreakdown.reduce((t, x) => t + x.subtotal, 0)).to.equal(q.subtotal);
    expect(q.totalAmount).to.equal(q.baseAmount + q.taxAmount);
  });

  it('books both rooms, holds them and records each lead guest', async () => {
    const before = [await roomsLeft(suite.id), await roomsLeft(standard.id)];
    const r = await api.post('/bookings', bookingBody('PREPAID'), auth);
    expect(r.status, JSON.stringify(r.data)).to.be.oneOf([200, 201]);
    paid = r.data.data;
    expect(paid.status).to.equal('PENDING');
    expect(paid.bookingRef).to.match(/^ZIVO-[A-Z0-9]{8}$/);
    const rooms = await prisma.bookingRoom.findMany({ where: { bookingId: paid.id }, orderBy: { roomNumber: 'asc' } });
    expect(rooms.map((x) => x.guestName)).to.deep.equal(['Asha Rao', 'Vikram Rao']);
    expect([await roomsLeft(suite.id), await roomsLeft(standard.id)]).to.deep.equal([before[0] - 1, before[1] - 1]);
  });

  it('confirms the booking when the payment is verified', async () => {
    await prisma.booking.update({ where: { id: paid.id }, data: { razorpayOrderId: 'order_e2e_1' } });
    const signature = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET).update('order_e2e_1|pay_e2e_1').digest('hex');
    const r = await api.post('/payments/verify', { razorpay_order_id: 'order_e2e_1', razorpay_payment_id: 'pay_e2e_1', razorpay_signature: signature, bookingId: paid.id }, auth);
    expect(r.status, JSON.stringify(r.data)).to.equal(200);
    const b = await prisma.booking.findUnique({ where: { id: paid.id } });
    expect(b.status).to.equal('CONFIRMED');
    expect(b.paymentStatus).to.equal('PAID');
    expect(Number(b.paidAmount)).to.equal(Number(b.totalAmount));
  });

  it('cancels one room on its own: refund for it, room back on sale, the rest stays', async () => {
    const before = await roomsLeft(standard.id);
    const b0 = await prisma.booking.findUnique({ where: { id: paid.id } });
    const preview = await api.get(`/bookings/${paid.id}/rooms/2/cancel-preview`, auth);
    expect(preview.status, JSON.stringify(preview.data)).to.equal(200);
    const r = await api.post(`/bookings/${paid.id}/rooms/2/cancel`, { refundTo: 'WALLET' }, auth);
    expect(r.status, JSON.stringify(r.data)).to.equal(200);
    expect(r.data.data.refundAmount).to.equal(preview.data.data.refundAmount);
    const b = await prisma.booking.findUnique({ where: { id: paid.id } });
    expect(b.status).to.equal('CONFIRMED');
    expect(b.rooms).to.equal(1);
    expect(Number(b.totalAmount)).to.be.closeTo(Number(b0.totalAmount) - preview.data.data.roomShare, 0.01);
    expect(Number(b.paidAmount)).to.be.closeTo(Number(b0.paidAmount) - r.data.data.refundAmount, 0.01);
    expect(await roomsLeft(standard.id)).to.equal(before + 1);
    const last = await api.post(`/bookings/${paid.id}/rooms/1/cancel`, {}, auth);
    expect(last.status).to.equal(400); // the last room: cancel the whole booking instead
  });

  it('cancels with a refund to Zivo Cash and gives the remaining room back', async () => {
    const before = [await roomsLeft(suite.id), await roomsLeft(standard.id)];
    const r = await api.post(`/bookings/${paid.id}/cancel`, { refundTo: 'WALLET' }, auth);
    expect(r.status, JSON.stringify(r.data)).to.equal(200);
    const b = await prisma.booking.findUnique({ where: { id: paid.id } });
    expect(b.status).to.equal('CANCELLED');
    // 40 days ahead: inside every free-cancellation window, so a full refund
    expect(Number(b.refundAmount)).to.be.closeTo(Number(b.paidAmount), 0.01);
    // Only the suite was still booked: the standard room was given back when it was cancelled
    expect([await roomsLeft(suite.id), await roomsLeft(standard.id)]).to.deep.equal([before[0] + 1, before[1]]);
  });

  it('reserves a pay-later booking with a deadline, and cancels it for free', async () => {
    const r = await api.post('/bookings', bookingBody('PAY_AT_HOTEL'), auth);
    expect(r.status, JSON.stringify(r.data)).to.be.oneOf([200, 201]);
    const b = r.data.data;
    expect(b.status).to.equal('PENDING');
    const hoursToPay = (new Date(b.expiresAt) - Date.now()) / 3600000;
    expect(hoursToPay).to.be.within(1.9, 24.1);
    const c = await api.post(`/bookings/${b.id}/cancel`, {}, auth);
    expect(c.status, JSON.stringify(c.data)).to.equal(200);
    const after = await prisma.booking.findUnique({ where: { id: b.id } });
    expect(after.status).to.equal('CANCELLED');
    expect(Number(after.refundAmount || 0)).to.equal(0);
  });
});
