/**
 * Reviews after check-out (request, one reminder, hotel reply, admin decision), saved hotels with
 * price-drop alerts, and the extranet monthly report (by room type, against last month, pace).
 */
import axios from 'axios';
import { expect } from 'chai';
import minimist from 'minimist';
import crypto from 'crypto';
import prisma from '../../config/db.js';
import bcrypt from '../../utils/bcrypt.js';
import { sendStayMessages } from '../../services/bookingNotices.js';
import { checkPriceDrops } from '../../services/savedHotels.js';

const argv = minimist(process.argv.slice(2));
const API = `${argv.url || process.env.E2E_URL || 'http://localhost:5000'}/api/v1`;
const api = axios.create({ baseURL: API, validateStatus: () => true });
const istToday = () => new Date(Date.now() + 5.5 * 3600000).toISOString().slice(0, 10);
const inDays = (n) => { const d = new Date(`${istToday()}T00:00:00.000Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const HOUR = 3600000;

describe('Guest engagement: reviews, saved hotels and price alerts, monthly report', function () {
  this.timeout(120000);
  const tag = Date.now().toString().slice(-6);
  const password = `Eng!${crypto.randomUUID().slice(0, 10)}x9`;
  let admin; let guest; let guestUser; let owner; let hotel; let room;
  const month = inDays(70).slice(0, 7);
  const body = (checkIn, checkOut) => ({
      hotelId: hotel.id, roomTypeId: room.id, ratePlanId: room.ratePlans[0].id, rooms: 1, adults: 1, children: 0, checkIn, checkOut, paymentType: 'PREPAID',
      guestName: 'Kavya Iyer', guestEmail: guestUser.email, guestPhone: '9876598765', roomLines: [{ roomTypeId: room.id, ratePlanId: room.ratePlans[0].id, adults: 1, guestName: 'Kavya Iyer' }],
    });
  const sleep = (ms) => new Promise((ok) => { setTimeout(ok, ms); });
  const book = async (checkIn, checkOut) => {
    // Earlier test files book a lot: wait out the per-minute booking limit if it is reached
    const post = async (tries = 0) => {
      const res = await api.post('/bookings', body(checkIn, checkOut), guest);
      if (res.status === 429 && tries < 14) { await sleep(5000); return post(tries + 1); }
      return res;
    };
    const r = await post();
    expect(r.status, JSON.stringify(r.data)).to.be.oneOf([200, 201]);
    const b = r.data.data;
    const order = `order_eng_${b.id.slice(0, 8)}`; const pay = `pay_eng_${b.id.slice(0, 8)}`;
    await prisma.booking.update({ where: { id: b.id }, data: { razorpayOrderId: order } });
    const v = await api.post('/payments/verify', { razorpay_order_id: order, razorpay_payment_id: pay, razorpay_signature: crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET).update(`${order}|${pay}`).digest('hex'), bookingId: b.id }, guest);
    expect(v.status, JSON.stringify(v.data)).to.equal(200);
    return prisma.booking.findUnique({ where: { id: b.id } });
  };

  before(async () => {
    admin = { headers: { Authorization: `Bearer ${(await api.post('/auth/login', { email: 'admin@zivoplus.com', password: 'admin123' })).data.data.token}` } };
    const hash = await bcrypt.hash(password, 10);
    guestUser = await prisma.user.create({ data: { name: 'Kavya Iyer', email: `kavya.e${tag}@example.com`, password: hash, role: 'CUSTOMER', status: 'ACTIVE', emailVerifiedAt: new Date() } });
    guest = { headers: { Authorization: `Bearer ${(await api.post('/auth/login', { email: guestUser.email, password })).data.data.token}` } };
    const hotels = await prisma.hotel.findMany({ where: { status: { in: ['LIVE', 'ACTIVE'] }, isDeleted: false }, include: { roomTypes: { where: { isActive: true }, include: { ratePlans: { where: { isActive: true, basePrice: { gt: 0 } } } } } } });
    hotel = hotels.find((h) => h.roomTypes.some((rt) => rt.ratePlans.length && rt.totalInventory >= 3));
    room = hotel.roomTypes.find((rt) => rt.ratePlans.length && rt.totalInventory >= 3);
    // The property's own team member (a fresh account, linked to the hotel as its owner)
    const o = await prisma.user.create({ data: { name: 'Hotel Owner', email: `owner.e${tag}@example.com`, password: hash, role: 'OWNER', status: 'ACTIVE', emailVerifiedAt: new Date() } });
    await prisma.hotel.update({ where: { id: hotel.id }, data: { ownerId: o.id } });
    owner = { headers: { Authorization: `Bearer ${(await api.post('/auth/login', { email: o.email, password })).data.data.token}` } };
  });

  describe('Extranet monthly report', () => {
    let before; let b;
    it('shows the month by room type, with last month and pace', async () => {
      const r = await api.get(`/extranet/performance/monthly?month=${month}&hotelId=${hotel.id}`, owner);
      expect(r.status, JSON.stringify(r.data)).to.equal(200);
      before = r.data.data;
      expect(before.month).to.equal(month);
      expect(before.status).to.equal('FUTURE');
      expect(before.byRoomType.map((x) => x.roomTypeId)).to.include(room.id);
      expect(before.total).to.have.keys('roomTypeId', 'name', 'sold', 'supply', 'revenue', 'cancellations', 'cancelledNights', 'occupancy', 'adr', 'revpar', 'cancellationRate', 'previous', 'change');
      expect(before.daily).to.have.length(new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0)).getUTCDate());
      expect((await api.get(`/extranet/performance/monthly?month=${month}&hotelId=${hotel.id}`, guest)).status).to.be.oneOf([401, 403]);
    });

    it('a stay in the month adds its room nights and revenue; cancelling it counts as a cancellation', async () => {
      b = await book(`${month}-10`, `${month}-12`);
      const after = (await api.get(`/extranet/performance/monthly?month=${month}&hotelId=${hotel.id}`, owner)).data.data;
      const row = (rep) => rep.byRoomType.find((x) => x.roomTypeId === room.id);
      expect(row(after).sold).to.equal(row(before).sold + 2);
      expect(after.total.revenue - before.total.revenue).to.be.closeTo(Number(b.baseAmount), 1);
      expect(after.pace.onTheBooks).to.equal(before.pace.onTheBooks + 2);
      const c = await api.post(`/bookings/${b.id}/cancel`, { refundTo: 'WALLET' }, guest);
      expect(c.status, JSON.stringify(c.data)).to.equal(200);
      const cancelled = (await api.get(`/extranet/performance/monthly?month=${month}&hotelId=${hotel.id}`, owner)).data.data;
      expect(row(cancelled).sold).to.equal(row(before).sold);
      expect(row(cancelled).cancellations).to.equal(row(before).cancellations + 1);
      const csv = await api.get(`/extranet/performance/monthly.csv?month=${month}&hotelId=${hotel.id}`, owner);
      expect(csv.status).to.equal(200);
      expect(csv.headers['content-type']).to.include('text/csv');
      expect(csv.data).to.include(room.name).and.include('All room types');
    });
  });

  describe('Saved hotels and price-drop alerts', () => {
    it('saves a hotel with the dates, lists it with today\'s price, and only for signed-in guests', async () => {
      expect((await api.get('/saved-hotels')).status).to.equal(401);
      const s = await api.post('/saved-hotels', { hotelId: hotel.id, checkIn: inDays(40), checkOut: inDays(42), adults: 1, rooms: 1 }, guest);
      expect(s.status, JSON.stringify(s.data)).to.equal(201);
      expect(s.data.data.savedPrice).to.be.greaterThan(0);
      expect((await api.get('/saved-hotels/ids', guest)).data.data).to.include(hotel.id);
      const list = (await api.get('/saved-hotels', guest)).data.data;
      expect(list[0]).to.include({ hotelId: hotel.id, checkIn: inDays(40), alerts: true });
      expect(list[0].priceNow).to.equal(s.data.data.savedPrice);
      expect(list[0].hotel.slug).to.match(/-[0-9a-f]{8}$/);
    });

    it('emails once when the price for the dates drops at least 5% and ₹100', async () => {
      const saved = await prisma.savedHotel.findUnique({ where: { userId_hotelId: { userId: guestUser.id, hotelId: hotel.id } } });
      // As if it had been ₹1,000 dearer when saved, and last checked long ago
      await prisma.savedHotel.update({ where: { id: saved.id }, data: { savedPrice: Number(saved.savedPrice) + 1000, lastCheckedAt: new Date(Date.now() - 7 * HOUR) } });
      const r = await checkPriceDrops();
      expect(r.alerts).to.be.at.least(1);
      const after = await prisma.savedHotel.findUnique({ where: { id: saved.id } });
      expect(after.lastAlertAt).to.not.equal(null);
      const n = await prisma.userNotification.findFirst({ where: { userId: guestUser.id, type: 'PRICE_DROP' } });
      expect(n.title).to.include(hotel.name);
      // Not again within a day
      await prisma.savedHotel.update({ where: { id: saved.id }, data: { lastAlertPrice: Number(after.lastAlertPrice) + 1000, lastCheckedAt: new Date(Date.now() - 7 * HOUR) } });
      await checkPriceDrops();
      expect(await prisma.userNotification.count({ where: { userId: guestUser.id, type: 'PRICE_DROP' } })).to.equal(1);
    });

    it('alerts can be turned off, and a hotel removed', async () => {
      expect((await api.patch(`/saved-hotels/${hotel.id}`, { alerts: false }, guest)).data.data.alerts).to.equal(false);
      expect((await api.delete(`/saved-hotels/${hotel.id}`, guest)).status).to.equal(200);
      expect((await api.get('/saved-hotels/ids', guest)).data.data).to.not.include(hotel.id);
    });
  });

  describe('Reviews after check-out', () => {
    let stay; let review;
    it('asks for a review after check-out, with a link to that stay, and reminds once', async () => {
      stay = await book(inDays(80), inDays(81));
      // The stay is over: checked out 10 hours ago
      await prisma.booking.update({ where: { id: stay.id }, data: { status: 'COMPLETED', checkIn: new Date(Date.now() - 34 * HOUR), checkOut: new Date(Date.now() - 10 * HOUR) } });
      await sendStayMessages();
      const ask = await prisma.userNotification.findFirst({ where: { userId: guestUser.id, type: 'REVIEW_REQUEST' } });
      expect(ask.link).to.equal(`/my-bookings?review=${stay.id}`);
      // Five and a half days later, still not reviewed: one reminder
      await prisma.booking.update({ where: { id: stay.id }, data: { checkOut: new Date(Date.now() - 5.5 * 24 * HOUR), checkIn: new Date(Date.now() - 6.5 * 24 * HOUR) } });
      await sendStayMessages();
      await sendStayMessages();
      const asks = await prisma.userNotification.findMany({ where: { userId: guestUser.id, type: 'REVIEW_REQUEST' } });
      expect(asks).to.have.length(2);
      expect(asks.some((x) => x.metadata?.reminder)).to.equal(true);
    });

    it('the guest reviews; the hotel replies and the guest is told', async () => {
      const r = await api.post('/reviews', { bookingId: stay.id, rating: 5, title: 'Lovely stay', comment: 'Clean rooms and friendly staff at the front desk.', aspectRatings: { cleanliness: 5, staff: 5 } }, guest);
      expect(r.status, JSON.stringify(r.data)).to.be.oneOf([200, 201]);
      review = r.data.data;
      expect(review.status).to.equal('APPROVED');
      const rep = await api.post(`/extranet/reviews/${review.id}/reply?hotelId=${hotel.id}`, { replyText: 'Thank you, Kavya. We hope to welcome you again soon.' }, owner);
      expect(rep.status, JSON.stringify(rep.data)).to.equal(200);
      const told = await prisma.userNotification.findFirst({ where: { userId: guestUser.id, type: 'REVIEW_REPLY' } });
      expect(told, 'the guest is told about the reply').to.not.equal(null);
      expect(told.link).to.equal(`/my-bookings?review=${stay.id}`);
    });

    it('ZivoPlus can take a review down, with a note', async () => {
      const m = await api.patch(`/admin/reviews/${review.id}`, { action: 'REJECT', note: 'Removed in a test.' }, admin);
      expect(m.status, JSON.stringify(m.data)).to.equal(200);
      expect((await prisma.review.findUnique({ where: { id: review.id } })).status).to.equal('REJECTED');
    });
  });
});
