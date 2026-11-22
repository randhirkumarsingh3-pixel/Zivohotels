/**
 * End-to-end hourly stay against a running API and its database (sample data from prisma/seed.js):
 * the hotel switches hourly stays on (one room for hourly use), ZivoPlus approves, a guest books
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
    admin = await login('admin@zivoplus.com', process.env.SEED_ADMIN_PASSWORD || 'admin123');
    guest = await login('user@zivoplus.com', process.env.SEED_CUSTOMER_PASSWORD || 'customer123');
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
    // Approval is ZivoPlus' decision, not the hotel's
    await prisma.hotel.update({ where: { id: hotelId }, data: { hourlySettings: { ...(await prisma.hotel.findUnique({ where: { id: hotelId } })).hourlySettings, approved: false } } });
    const offer = (await api.get(`/hotels/${hotelId}/hourly?date=${DATE}&hours=3`)).data.data;
    expect(offer.available).to.equal(false);
  });

  it('shows the hotel to guests once ZivoPlus approves', async () => {
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

  describe('offers', () => {
    const promoIds = [];
    const slot = () => ({ hotelId, roomTypeId: roomType.id, date: DATE, start: '17:00', hours: 3, adults: 2, children: 0 });
    after(async () => {
      await prisma.promotionRedemption.deleteMany({ where: { promotionId: { in: promoIds } } });
      await prisma.promotion.deleteMany({ where: { id: { in: promoIds } } });
    });

    it('gives an hourly stay only offers switched on for hourly stays', async () => {
      const p = await prisma.promotion.create({ data: { hotelId, name: 'E2E hourly 10%', discountType: 'PERCENT', value: 10, forHourly: false } });
      promoIds.push(p.id);
      const before = (await api.post('/bookings/hourly/preview', slot(), guest)).data.data;
      expect(before.promotionDiscountAmount).to.equal(0);

      await prisma.promotion.update({ where: { id: p.id }, data: { forHourly: true } });
      const q = (await api.post('/bookings/hourly/preview', slot(), guest)).data.data;
      expect(q.promotion?.name).to.equal('E2E hourly 10%');
      expect(q.promotionDiscountAmount).to.equal(130); // 10% of 1,299
      // Member price on what's left, then GST on the rest
      expect(q.baseAmount).to.equal(1299 - 130 - q.memberDiscountAmount);
      expect(q.totalAmount).to.equal(q.baseAmount + q.taxAmount);
      // The hotel page shows it on the room's price
      const offer = (await api.get(`/hotels/${hotelId}/hourly?date=${DATE}&hours=3`)).data.data;
      expect(offer.roomTypes[0].offer).to.include({ discount: 130, priceAfter: 1169 });
    });

    it('applies a code for hourly stays, records it on the booking, and refuses other codes', async () => {
      const nightOnly = await prisma.promotion.create({ data: { hotelId, name: 'E2E nights only', code: `E2ENIGHT${Date.now() % 100000}`, discountType: 'FLAT', value: 400 } });
      const hourly = await prisma.promotion.create({ data: { hotelId, name: 'E2E hourly flat', code: `E2EHOUR${Date.now() % 100000}`, discountType: 'FLAT', value: 300, forHourly: true } });
      promoIds.push(nightOnly.id, hourly.id);

      const bad = (await api.post('/bookings/hourly/preview', { ...slot(), couponCode: nightOnly.code }, guest)).data.data;
      expect(bad.promoCodeStatus).to.include({ ok: false });
      // As for nights: the code isn't used, the automatic offer still is
      const withBad = await api.post('/bookings/hourly', { ...slot(), couponCode: nightOnly.code, guestName: 'Code Guest', guestEmail: 'e2e@example.com', guestPhone: '9876543210' }, guest);
      expect(withBad.status, JSON.stringify(withBad.data)).to.equal(201);
      const wb = await prisma.booking.findUnique({ where: { id: withBad.data.data.booking.id } });
      expect(wb.couponCode).to.equal(null);
      expect(wb.metadata.promotion.name).to.equal('E2E hourly 10%');
      await prisma.booking.update({ where: { id: wb.id }, data: { status: 'CANCELLED', expiresAt: new Date() } });

      const q = (await api.post('/bookings/hourly/preview', { ...slot(), couponCode: hourly.code }, guest)).data.data;
      expect(q.promoCodeStatus).to.include({ ok: true });
      expect(q.promotionDiscountAmount).to.equal(300); // bigger than the automatic 10%
      const r = await api.post('/bookings/hourly', { ...slot(), couponCode: hourly.code, guestName: 'Code Guest', guestEmail: 'e2e@example.com', guestPhone: '9876543210' }, guest);
      expect(r.status, JSON.stringify(r.data)).to.equal(201);
      expect(r.data.data.booking.totalAmount).to.equal(q.totalAmount);
      const b = await prisma.booking.findUnique({ where: { id: r.data.data.booking.id } });
      expect(b.couponCode).to.equal(hourly.code);
      expect(b.metadata.promotion).to.include({ id: hourly.id, discountAmount: 300 });
      expect(await prisma.promotionRedemption.count({ where: { promotionId: hourly.id, bookingId: b.id } })).to.equal(1);
      await prisma.booking.update({ where: { id: b.id }, data: { status: 'CANCELLED', expiresAt: new Date() } });
    });
  });

  describe('extra hours', () => {
    let stay; let blocker;
    const base = () => ({ hotelId, roomTypeId: roomType.id, date: DATE, hours: 3, adults: 2, children: 0, guestName: 'Long Stay', guestEmail: 'e2e@example.com', guestPhone: '9876543210' });
    const pay = async (id, n) => {
      await prisma.booking.update({ where: { id }, data: { razorpayOrderId: `order_e2e_x${n}` } });
      const sig = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET).update(`order_e2e_x${n}|pay_e2e_x${n}`).digest('hex');
      return api.post('/payments/verify', { razorpay_order_id: `order_e2e_x${n}`, razorpay_payment_id: `pay_e2e_x${n}`, razorpay_signature: sig, bookingId: id }, guest);
    };
    after(async () => {
      for (const b of [stay, blocker]) if (b) await prisma.booking.update({ where: { id: b.id }, data: { status: 'CANCELLED' } });
    });

    it('offers only the extra hours the room is free for, at the hotel\'s extra-hour price', async () => {
      const h = await prisma.hotel.findUnique({ where: { id: hotelId }, select: { hourlySettings: true } });
      await prisma.hotel.update({ where: { id: hotelId }, data: { hourlySettings: { ...h.hourlySettings, extraHourPrice: 400 } } });
      const r = await api.post('/bookings/hourly', { ...base(), start: '08:00' }, guest);
      expect(r.status, JSON.stringify(r.data)).to.equal(201);
      stay = r.data.data.booking;
      expect((await pay(stay.id, Date.now() % 100000)).status).to.equal(200);

      // Someone else holds the room from 13:00: with 30 minutes' cleaning, only +1 hour (to 12:00) fits
      const other = await api.post('/bookings/hourly', { ...base(), start: '13:00', guestName: 'Next Guest' }, guest);
      expect(other.status, JSON.stringify(other.data)).to.equal(201);
      blocker = other.data.data.booking;

      const o = (await api.get(`/bookings/${stay.id}/hourly/extend`, guest)).data.data;
      expect(o.available).to.equal(true);
      expect(o.perHour).to.equal(400);
      expect(o.options.map((x) => x.hours)).to.deep.equal([1]);
      const b = await prisma.booking.findUnique({ where: { id: stay.id } });
      const newBase = Math.round(Number(b.baseAmount)) + 400;
      expect(o.options[0]).to.include({ totalHours: 4, newBase, newTotal: newBase + Math.round(newBase * 0.05), extraAmount: newBase + Math.round(newBase * 0.05) - Math.round(Number(b.totalAmount)) });
    });

    it('extends the stay once the payment is confirmed (and only once)', async () => {
      const before = await prisma.booking.findUnique({ where: { id: stay.id } });
      const o = (await api.get(`/bookings/${stay.id}/hourly/extend`, guest)).data.data.options[0];
      // What starting the payment does (the Razorpay order itself needs live keys)
      await prisma.booking.update({ where: { id: stay.id }, data: { metadata: { ...before.metadata, pendingExtension: { orderId: 'order_e2e_ext', hours: 1, extraAmount: o.extraAmount, expiresAt: new Date(Date.now() + 900000) } } } });
      const sig = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET).update('order_e2e_ext|pay_e2e_ext').digest('hex');
      const bad = await api.post(`/bookings/${stay.id}/hourly/extend/verify`, { razorpay_order_id: 'order_e2e_ext', razorpay_payment_id: 'pay_e2e_ext', razorpay_signature: 'f'.repeat(64) }, guest);
      expect(bad.status).to.equal(400);
      const v = await api.post(`/bookings/${stay.id}/hourly/extend/verify`, { razorpay_order_id: 'order_e2e_ext', razorpay_payment_id: 'pay_e2e_ext', razorpay_signature: sig }, guest);
      expect(v.status, JSON.stringify(v.data)).to.equal(200);
      const after = await prisma.booking.findUnique({ where: { id: stay.id } });
      expect(after.hours).to.equal(4);
      expect(after.slotEnd.getTime()).to.equal(before.slotEnd.getTime() + 3600000);
      expect(Math.round(Number(after.totalAmount))).to.equal(Math.round(Number(before.totalAmount)) + o.extraAmount);
      expect(Math.round(Number(after.paidAmount))).to.equal(Math.round(Number(before.paidAmount)) + o.extraAmount);
      expect(after.metadata.hourlyExtensions).to.have.length(1);
      expect(after.metadata.hourly.hours).to.equal(4);
      // The same payment again changes nothing
      const again = await api.post(`/bookings/${stay.id}/hourly/extend/verify`, { razorpay_order_id: 'order_e2e_ext', razorpay_payment_id: 'pay_e2e_ext', razorpay_signature: sig }, guest);
      expect(again.status).to.equal(200);
      expect((await prisma.booking.findUnique({ where: { id: stay.id } })).hours).to.equal(4);
      // Now the room is needed for cleaning before 13:00: no more hours
      const o2 = (await api.get(`/bookings/${stay.id}/hourly/extend`, guest)).data.data;
      expect(o2.available).to.equal(false);
    });

    it('lets only the guest who booked see or buy extra hours', async () => {
      const r = await api.get(`/bookings/${stay.id}/hourly/extend`, owner);
      expect(r.status).to.equal(404);
    });
  });
});
