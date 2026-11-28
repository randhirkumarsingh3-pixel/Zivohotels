/**
 * Change dates: a guest asks to move a confirmed stay (priced at today's rates), the hotel declines
 * or approves it in the extranet, the booking moves (old nights released, new nights taken), and a
 * prepaid stay that costs more pays the difference online first. Not once free cancellation ends.
 */
import axios from 'axios';
import crypto from 'crypto';
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
const sign = (order, pay) => crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET).update(`${order}|${pay}`).digest('hex');
const free = async (roomTypeId, day) => (await prisma.inventory.findFirst({ where: { roomTypeId, date: new Date(`${day}T00:00:00Z`) } }))?.availableRooms;

describe('Change dates: request, hotel answer, booking moved', function () {
  this.timeout(180000);
  const tag = Date.now() % 1e8;
  const password = 'Dates-Move-8812';
  let hotel; let room; let plan; let guest; let owner; let other; let prevOwnerId; let prevPolicy;
  const bookings = [];

  const book = async (checkIn, checkOut, paymentType) => {
    const r = await post('/bookings', {
      hotelId: hotel.id, roomTypeId: room.id, ratePlanId: plan.id, rooms: 1, adults: 1, children: 0, checkIn, checkOut, paymentType,
      guestName: 'Meera Rao', guestEmail: `meera.d${tag}@example.com`, guestPhone: '9876501234',
      roomLines: [{ roomTypeId: room.id, ratePlanId: plan.id, adults: 1, children: 0, guestName: 'Meera Rao' }],
    }, guest);
    expect(r.status, JSON.stringify(r.data)).to.be.oneOf([200, 201]);
    const b = r.data.data.booking || r.data.data;
    bookings.push(b.id);
    if (paymentType === 'PREPAID') {
      const order = `order_dc_${b.id.slice(0, 8)}`; const pay = `pay_dc_${b.id.slice(0, 8)}`;
      await prisma.booking.update({ where: { id: b.id }, data: { razorpayOrderId: order } });
      const v = await api.post('/payments/verify', { razorpay_order_id: order, razorpay_payment_id: pay, razorpay_signature: sign(order, pay), bookingId: b.id }, guest);
      expect(v.status, JSON.stringify(v.data)).to.equal(200);
    } else {
      await prisma.booking.update({ where: { id: b.id }, data: { status: 'CONFIRMED' } });
    }
    return prisma.booking.findUnique({ where: { id: b.id } });
  };

  before(async () => {
    const hash = await bcrypt.hash(password, 4);
    const hotels = await prisma.hotel.findMany({ where: { status: { in: ['LIVE', 'ACTIVE'] }, isDeleted: false }, include: { roomTypes: { where: { isActive: true }, include: { ratePlans: { where: { isActive: true, basePrice: { gt: 0 } } } } } } });
    hotel = hotels.find((h) => h.roomTypes.some((rt) => rt.ratePlans.length && rt.totalInventory >= 3));
    room = hotel.roomTypes.find((rt) => rt.ratePlans.length && rt.totalInventory >= 3);
    plan = room.ratePlans[0];
    prevOwnerId = hotel.ownerId;
    prevPolicy = await prisma.cancellationPolicy.findUnique({ where: { hotelId: hotel.id } });
    await prisma.cancellationPolicy.upsert({ where: { hotelId: hotel.id }, update: { policyCode: 'FREE_CANCEL_24H', freeCancellationHours: 24 }, create: { hotelId: hotel.id, policyCode: 'FREE_CANCEL_24H', freeCancellationHours: 24 } });
    const g = await prisma.user.create({ data: { name: 'Meera Rao', email: `meera.d${tag}@example.com`, password: hash, role: 'CUSTOMER', status: 'ACTIVE', emailVerifiedAt: new Date() } });
    guest = { headers: { Authorization: `Bearer ${(await api.post('/auth/login', { email: g.email, password })).data.data.token}` } };
    const x = await prisma.user.create({ data: { name: 'Someone Else', email: `else.d${tag}@example.com`, password: hash, role: 'CUSTOMER', status: 'ACTIVE', emailVerifiedAt: new Date() } });
    other = { headers: { Authorization: `Bearer ${(await api.post('/auth/login', { email: x.email, password })).data.data.token}` } };
    const o = await prisma.user.create({ data: { name: 'Front Office', email: `owner.d${tag}@example.com`, password: hash, role: 'OWNER', status: 'ACTIVE', emailVerifiedAt: new Date() } });
    await prisma.hotel.update({ where: { id: hotel.id }, data: { ownerId: o.id } });
    owner = { headers: { Authorization: `Bearer ${(await api.post('/auth/login', { email: o.email, password })).data.data.token}` } };
  });

  after(async () => {
    for (const id of bookings) await api.post(`/bookings/${id}/cancel`, { reason: 'test' }, guest).catch(() => {});
    await prisma.dateChangeRequest.deleteMany({ where: { bookingId: { in: bookings } } }).catch(() => {});
    await prisma.hotel.update({ where: { id: hotel.id }, data: { ownerId: prevOwnerId } }).catch(() => {});
    if (prevPolicy) await prisma.cancellationPolicy.update({ where: { hotelId: hotel.id }, data: { policyCode: prevPolicy.policyCode, freeCancellationHours: prevPolicy.freeCancellationHours } }).catch(() => {});
  });

  it('quotes new dates at today\'s rates, the hotel declines with a reason, then approves; the booking moves', async () => {
    const b = await book(inDays(40), inDays(42), 'PAY_AT_HOTEL');
    const state = (await api.get(`/bookings/${b.id}/date-change`, guest)).data.data;
    expect(state.canRequest).to.equal(true);
    expect((await api.get(`/bookings/${b.id}/date-change`, other)).status).to.equal(404);

    const q = await post(`/bookings/${b.id}/date-change/quote`, { checkIn: inDays(50), checkOut: inDays(53) }, guest);
    expect(q.status, JSON.stringify(q.data)).to.equal(200);
    expect(q.data.data.nights).to.equal(3);
    expect(q.data.data.available).to.equal(true);
    expect(q.data.data.newTotal).to.be.greaterThan(0);
    expect((await post(`/bookings/${b.id}/date-change/quote`, { checkIn: inDays(40), checkOut: inDays(42) }, guest)).status).to.equal(400);

    const r1 = await post(`/bookings/${b.id}/date-change`, { checkIn: inDays(50), checkOut: inDays(53), note: 'Flight moved' }, guest);
    expect(r1.status, JSON.stringify(r1.data)).to.equal(201);
    expect(r1.data.data.status).to.equal('PENDING');
    expect((await post(`/bookings/${b.id}/date-change`, { checkIn: inDays(55), checkOut: inDays(56) }, guest)).status, 'one at a time').to.equal(409);

    const list = (await api.get(`/extranet/date-changes?hotelId=${hotel.id}`, owner)).data.data;
    expect(list.find((x) => x.id === r1.data.data.id)?.booking.bookingRef).to.equal(b.bookingRef);
    expect((await api.patch(`/extranet/date-changes/${r1.data.data.id}?hotelId=${hotel.id}`, { decision: 'APPROVE' }, guest)).status).to.be.oneOf([401, 403]);
    expect((await api.patch(`/extranet/date-changes/${r1.data.data.id}?hotelId=${hotel.id}`, { decision: 'DECLINE' }, owner)).status, 'reason needed').to.equal(400);
    const dec = await api.patch(`/extranet/date-changes/${r1.data.data.id}?hotelId=${hotel.id}`, { decision: 'DECLINE', reply: 'Fully booked for a wedding then' }, owner);
    expect(dec.status, JSON.stringify(dec.data)).to.equal(200);
    expect(dec.data.data.status).to.equal('DECLINED');
    expect((await prisma.booking.findUnique({ where: { id: b.id } })).checkIn.toISOString().slice(0, 10)).to.equal(inDays(40));

    // Ask again; approved: the booking moves, nights swap in the inventory
    const before = { old: await free(room.id, inDays(40)), new: await free(room.id, inDays(60)) };
    const r2 = await post(`/bookings/${b.id}/date-change`, { checkIn: inDays(60), checkOut: inDays(61) }, guest);
    expect(r2.status, JSON.stringify(r2.data)).to.equal(201);
    const ok = await api.patch(`/extranet/date-changes/${r2.data.data.id}?hotelId=${hotel.id}`, { decision: 'APPROVE' }, owner);
    expect(ok.status, JSON.stringify(ok.data)).to.equal(200);
    expect(ok.data.data.status).to.equal('APPLIED');
    const moved = await prisma.booking.findUnique({ where: { id: b.id }, include: { timelineEvents: true } });
    expect(moved.checkIn.toISOString().slice(0, 10)).to.equal(inDays(60));
    expect(moved.checkOut.toISOString().slice(0, 10)).to.equal(inDays(61));
    expect(Number(moved.totalAmount)).to.equal(r2.data.data.newTotal);
    expect(Number(moved.remainingAmount)).to.equal(r2.data.data.newTotal);
    expect(moved.timelineEvents.some((e) => e.status === 'DATE_CHANGED')).to.equal(true);
    expect(await free(room.id, inDays(40))).to.equal(before.old + 1);
    expect(await free(room.id, inDays(60))).to.equal((before.new ?? room.totalInventory) - 1);
    expect((await prisma.dateChangeRequest.findUnique({ where: { id: r2.data.data.id } })).status).to.equal('APPLIED');
  });

  it('a prepaid stay that costs more is approved, then moves only once the difference is paid', async () => {
    const b = await book(inDays(70), inDays(71), 'PREPAID');
    const r = await post(`/bookings/${b.id}/date-change`, { checkIn: inDays(70), checkOut: inDays(73) }, guest);
    expect(r.status, JSON.stringify(r.data)).to.equal(201);
    expect(r.data.data.difference).to.be.greaterThan(0);
    const ok = await api.patch(`/extranet/date-changes/${r.data.data.id}?hotelId=${hotel.id}`, { decision: 'APPROVE', reply: 'See you then' }, owner);
    expect(ok.data.data.status, JSON.stringify(ok.data)).to.equal('AWAITING_PAYMENT');
    expect((await prisma.booking.findUnique({ where: { id: b.id } })).checkOut.toISOString().slice(0, 10), 'not yet').to.equal(inDays(71));
    const state = (await api.get(`/bookings/${b.id}/date-change`, guest)).data.data;
    expect(state.open.toPay).to.equal(r.data.data.difference);

    // The payment page confirms the payment (the order is made by Razorpay in real use)
    const order = `order_dcx_${b.id.slice(0, 8)}`; const pay = `pay_dcx_${b.id.slice(0, 8)}`;
    await prisma.dateChangeRequest.update({ where: { id: r.data.data.id }, data: { orderId: order } });
    expect((await post(`/bookings/${b.id}/date-change/${r.data.data.id}/verify`, { razorpay_order_id: order, razorpay_payment_id: pay, razorpay_signature: 'f'.repeat(64) }, guest)).status).to.equal(400);
    const v = await post(`/bookings/${b.id}/date-change/${r.data.data.id}/verify`, { razorpay_order_id: order, razorpay_payment_id: pay, razorpay_signature: sign(order, pay) }, guest);
    expect(v.status, JSON.stringify(v.data)).to.equal(200);
    expect(v.data.data.applied).to.equal(true);
    const moved = await prisma.booking.findUnique({ where: { id: b.id } });
    expect(moved.checkOut.toISOString().slice(0, 10)).to.equal(inDays(73));
    expect(Number(moved.paidAmount)).to.equal(Number(b.paidAmount) + r.data.data.difference);
    expect(moved.metadata.extraPayments[0].paymentId).to.equal(pay);
    // Paying twice does nothing more
    const again = await post(`/bookings/${b.id}/date-change/${r.data.data.id}/verify`, { razorpay_order_id: order, razorpay_payment_id: pay, razorpay_signature: sign(order, pay) }, guest);
    expect(again.data.data.already).to.equal(true);
  });

  it('can\'t change dates once free cancellation has ended, or for someone else\'s booking', async () => {
    const b = await book(inDays(80), inDays(81), 'PAY_AT_HOTEL');
    expect((await post(`/bookings/${b.id}/date-change/quote`, { checkIn: inDays(82), checkOut: inDays(83) }, other)).status).to.equal(404);
    await prisma.booking.update({ where: { id: b.id }, data: { checkIn: new Date(`${inDays(0)}T00:00:00Z`), checkOut: new Date(`${inDays(1)}T00:00:00Z`) } });
    const state = (await api.get(`/bookings/${b.id}/date-change`, guest)).data.data;
    expect(state.canRequest).to.equal(false);
    expect(state.reason).to.match(/Free cancellation has ended/);
    expect((await post(`/bookings/${b.id}/date-change/quote`, { checkIn: inDays(5), checkOut: inDays(6) }, guest)).status).to.equal(409);
  });
});
