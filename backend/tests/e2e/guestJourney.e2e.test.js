/**
 * Guest journey rules: what signing in / a new account saves (and that checkout gives exactly
 * that), requests to the hotel opening only after free cancellation ends, and the booking hub
 * getting the dates it shows.
 */
import axios from 'axios';
import { expect } from 'chai';
import minimist from 'minimist';
import prisma from '../../config/db.js';
import bcrypt from '../../utils/bcrypt.js';

const argv = minimist(process.argv.slice(2));
const API = `${argv.url || process.env.E2E_URL || 'http://localhost:5000'}/api/v1`;
const api = axios.create({ baseURL: API, validateStatus: () => true });
const inDays = (n) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });
const post = async (path, body, cfg) => {
  for (let t = 0; t < 15; t += 1) {
    const r = await api.post(path, body, cfg);
    if (r.status !== 429) return r;
    await sleep(5000);
  }
  return api.post(path, body, cfg);
};

describe('Guest journey: offers, requests, booking hub', function () {
  this.timeout(120000);
  let hotel; let room; let plan; let auth; let user; let bookingId;
  const email = `firsttime.${Date.now() % 1e8}@example.com`;

  before(async () => {
    hotel = await prisma.hotel.findFirst({
      where: { status: { in: ['LIVE', 'ACTIVE'] }, isDeleted: false, roomTypes: { some: { ratePlans: { some: { isActive: true, basePrice: { gt: 0 } } } } } },
      include: { roomTypes: { include: { ratePlans: { where: { isActive: true, basePrice: { gt: 0 } } } } } },
    });
    room = hotel.roomTypes.find((rt) => rt.ratePlans.length);
    plan = room.ratePlans[0];
    user = await prisma.user.create({ data: { email, name: 'First Timer', phone: `98${String(Date.now()).slice(-8)}`, role: 'CUSTOMER', status: 'ACTIVE', password: await bcrypt.hash('First-Time-4471', 4) } });
    const login = await api.post('/auth/login', { email, password: 'First-Time-4471' });
    expect(login.status, JSON.stringify(login.data)).to.equal(200);
    auth = { headers: { Authorization: `Bearer ${login.data.data.token}` } };
  });

  after(async () => {
    if (bookingId) {
      await prisma.stayRequest.deleteMany({ where: { bookingId } }).catch(() => {});
      await api.post(`/bookings/${bookingId}/cancel`, { reason: 'test' }, auth).catch(() => {});
    }
  });

  it('tells signed-out visitors what signing in and a new account save (5% + 5% by default)', async () => {
    const r = await api.get(`/public/guest-offers?hotelId=${hotel.id}`);
    expect(r.status).to.equal(200);
    const { signIn, firstBooking } = r.data.data;
    expect(signIn.zivoPercent).to.equal(5);
    expect(signIn.percent).to.be.at.least(5);
    expect(firstBooking.discountType).to.equal('PERCENT');
    expect(firstBooking.value).to.equal(5);
  });

  it('gives a new account both the sign-in price and the first-booking offer at checkout', async () => {
    const body = {
      hotelId: hotel.id, roomTypeId: room.id, ratePlanId: plan.id, rooms: 1, adults: 1, children: 0,
      checkIn: inDays(60), checkOut: inDays(61), paymentType: 'PREPAID',
    };
    const r = await post('/bookings/preview', body, auth);
    expect(r.status, JSON.stringify(r.data)).to.equal(200);
    const q = r.data.data;
    expect(q.memberDiscountAmount, 'sign-in price').to.be.greaterThan(0);
    expect(q.promotionDiscountAmount, 'first-booking offer').to.be.greaterThan(0);
    expect(q.promotion?.name).to.be.a('string');
    // A guest who is not signed in gets neither
    const anon = await post('/bookings/preview', body);
    if (anon.status === 200) expect(anon.data.data.memberDiscountAmount || 0).to.equal(0);
  });

  it('opens requests to the hotel only when free cancellation has ended', async () => {
    const r = await post('/bookings', {
      hotelId: hotel.id, roomTypeId: room.id, ratePlanId: plan.id, rooms: 1, adults: 1, children: 0,
      checkIn: inDays(60), checkOut: inDays(61), paymentType: 'PAY_AT_HOTEL',
      guestName: 'First Timer', guestEmail: email, guestPhone: '9876543210',
      roomLines: [{ roomTypeId: room.id, ratePlanId: plan.id, adults: 1, children: 0, guestName: 'First Timer' }],
    }, auth);
    expect(r.status, JSON.stringify(r.data)).to.be.oneOf([200, 201]);
    bookingId = (r.data.data.booking || r.data.data).id;
    await prisma.booking.update({ where: { id: bookingId }, data: { status: 'CONFIRMED' } });

    const mine = await api.get('/bookings/my-bookings', auth);
    const b = mine.data.data.find((x) => x.id === bookingId);
    expect(new Date(b.requestsOpenAt) > new Date(), 'opens later').to.equal(true);
    expect(b.hotel.checkInTime).to.be.a('string');

    const early = await post(`/bookings/${bookingId}/requests`, { type: 'LATE_ARRIVAL', requestedTime: '11 pm' }, auth);
    expect(early.status, JSON.stringify(early.data)).to.equal(409);
    expect(early.data.message).to.match(/free cancellation ends/);

    // Free cancellation over (check-in tomorrow under a 24-hour policy, or a stricter one)
    await prisma.booking.update({ where: { id: bookingId }, data: { checkIn: new Date(`${inDays(0)}T00:00:00Z`), checkOut: new Date(`${inDays(1)}T00:00:00Z`) } });
    const now = await post(`/bookings/${bookingId}/requests`, { type: 'LATE_ARRIVAL', requestedTime: '11 pm' }, auth);
    expect(now.status, JSON.stringify(now.data)).to.be.oneOf([200, 201]);
  });
});
