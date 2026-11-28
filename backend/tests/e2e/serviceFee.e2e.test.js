/**
 * ZivoPlus's service fee (Admin → Finance → Service fee): off by default; when on, quoted with the
 * price, charged with the online payment (card or Zivo Cash), kept apart from the hotel's amount,
 * printed on the facilitator invoice, and refunded by the rules (with a credit note).
 */
import axios from 'axios';
import { expect } from 'chai';
import minimist from 'minimist';
import crypto from 'crypto';
import prisma from '../../config/db.js';
import bcrypt from '../../utils/bcrypt.js';
import { move } from '../../services/finance/walletService.js';
import { guestInvoiceHtml } from '../../services/documents/guestInvoiceHtml.js';
import { brandContext } from '../../services/documents/documentSettings.js';
import { BOOKING_ROOMS_INCLUDE } from '../../services/bookingRoomsView.js';
import { feeOn } from '../../services/serviceFee.js';

const argv = minimist(process.argv.slice(2));
const API = `${argv.url || process.env.E2E_URL || 'http://localhost:5000'}/api/v1`;
const api = axios.create({ baseURL: API, validateStatus: () => true });
const istToday = () => new Date(Date.now() + 5.5 * 3600000).toISOString().slice(0, 10);
const inDays = (n) => { const d = new Date(`${istToday()}T00:00:00.000Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });

describe('Service fee', function () {
  this.timeout(90000);
  const tag = Date.now().toString().slice(-6);
  const password = `Fee!${crypto.randomUUID().slice(0, 10)}x9`;
  let admin; let guest; let guestUser; let hotel; let room; let savedFee; let savedDocs;
  const body = (paymentType, day, extra = {}) => ({
    hotelId: hotel.id, roomTypeId: room.id, ratePlanId: room.ratePlans[0].id, rooms: 1, adults: 1, children: 0,
    checkIn: inDays(day), checkOut: inDays(day + 1), paymentType, guestName: 'Meena Das', guestEmail: guestUser.email, guestPhone: '9876512345',
    roomLines: [{ roomTypeId: room.id, ratePlanId: room.ratePlans[0].id, adults: 1, guestName: 'Meena Das' }], ...extra,
  });
  const pay = async (b) => {
    const order = `order_fee_${b.id.slice(0, 8)}`; const payment = `pay_fee_${b.id.slice(0, 8)}`;
    await prisma.booking.update({ where: { id: b.id }, data: { razorpayOrderId: order } });
    const signature = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET).update(`${order}|${payment}`).digest('hex');
    return api.post('/payments/verify', { razorpay_order_id: order, razorpay_payment_id: payment, razorpay_signature: signature, bookingId: b.id }, guest);
  };

  before(async () => {
    admin = { headers: { Authorization: `Bearer ${(await api.post('/auth/login', { email: 'admin@zivoplus.com', password: 'admin123' })).data.data.token}` } };
    guestUser = await prisma.user.create({ data: { name: 'Meena Das', email: `meena.f${tag}@example.com`, password: await bcrypt.hash(password, 10), role: 'CUSTOMER', status: 'ACTIVE', emailVerifiedAt: new Date() } });
    guest = { headers: { Authorization: `Bearer ${(await api.post('/auth/login', { email: guestUser.email, password })).data.data.token}` } };
    savedFee = (await api.get('/admin/finance/service-fee', admin)).data.data;
    savedDocs = (await api.get('/admin/documents', admin)).data.data.settings;
    await api.put('/admin/documents', { guestInvoice: { mode: 'HOTEL_ISSUES' } }, admin);
    const hotels = await prisma.hotel.findMany({ where: { status: { in: ['LIVE', 'ACTIVE'] }, isDeleted: false }, include: { roomTypes: { where: { isActive: true }, include: { ratePlans: { where: { isActive: true, basePrice: { gt: 1500 } } } } } } });
    hotel = hotels.find((h) => h.roomTypes.some((rt) => rt.ratePlans.length && rt.totalInventory >= 3));
    room = hotel.roomTypes.find((rt) => rt.ratePlans.length && rt.totalInventory >= 3);
  });

  after(async () => {
    if (savedFee) await api.put('/admin/finance/service-fee', { ...savedFee, enabled: false }, admin);
    if (savedDocs) await api.put('/admin/documents', { guestInvoice: { mode: savedDocs.guestInvoice.mode } }, admin);
  });

  it('works out the fee: percentage with a cap, or fixed, GST included', () => {
    expect(feeOn(5000, { enabled: true, type: 'PERCENT', value: 2, maxAmount: null, gstPct: 18 })).to.deep.equal({ amount: 100, tax: 15.25, gstPct: 18 });
    expect(feeOn(50000, { enabled: true, type: 'PERCENT', value: 2, maxAmount: 500, gstPct: 18 }).amount).to.equal(500);
    expect(feeOn(5000, { enabled: true, type: 'FLAT', value: 99, gstPct: 18 }).amount).to.equal(99);
    expect(feeOn(5000, { enabled: false, type: 'FLAT', value: 99, gstPct: 18 }).amount).to.equal(0);
  });

  it('is off by default: no fee anywhere', async () => {
    expect(savedFee.enabled).to.equal(false);
    expect((await api.get('/public/service-fee')).data.data).to.equal(null);
    const p = (await api.post('/bookings/preview', body('PREPAID', 150), guest)).data.data;
    expect(p.serviceFee.amount).to.equal(0);
    expect(p.payableTotal).to.equal(p.totalAmount);
  });

  it('an admin sets it up and turns it on; guests and hotels can\'t', async () => {
    expect((await api.put('/admin/finance/service-fee', { enabled: true, value: 0 }, admin)).status).to.equal(400);
    expect((await api.put('/admin/finance/service-fee', { type: 'PERCENT', value: 40 }, admin)).status).to.equal(400);
    expect((await api.put('/admin/finance/service-fee', { enabled: true, type: 'PERCENT', value: 2 }, guest)).status).to.be.oneOf([401, 403]);
    const on = await api.put('/admin/finance/service-fee', { enabled: true, type: 'PERCENT', value: 2, maxAmount: 500, gstPct: 18, refundOnGuestCancel: false }, admin);
    expect(on.status, JSON.stringify(on.data)).to.equal(200);
    expect((await api.get('/public/service-fee')).data.data).to.include({ type: 'PERCENT', value: 2, maxAmount: 500 });
  });

  let first; let fee;
  it('is quoted with the price and recorded on the booking, apart from the hotel\'s amount; not on pay at hotel', async () => {
    const p = (await api.post('/bookings/preview', body('PREPAID', 151), guest)).data.data;
    fee = Math.min(Math.round(p.totalAmount * 0.02), 500);
    expect(p.serviceFee.amount).to.equal(fee).and.be.greaterThan(0);
    expect(p.payableTotal).to.equal(p.totalAmount + fee);
    expect((await api.post('/bookings/preview', body('PAY_AT_HOTEL', 151), guest)).data.data.serviceFee.amount).to.equal(0);
    const r = await api.post('/bookings', body('PREPAID', 151), guest);
    expect(r.status, JSON.stringify(r.data)).to.be.oneOf([200, 201]);
    first = await prisma.booking.findUnique({ where: { id: r.data.data.id } });
    expect(Number(first.totalAmount)).to.equal(p.totalAmount);
    expect(first.metadata).to.include({ serviceFee: fee, serviceFeePaid: false, serviceFeeGstPct: 18, serviceFeeRefundOnGuestCancel: false });
  });

  it('is paid with the booking: the stay is paid in full and the fee is marked paid', async () => {
    const r = await pay(first);
    expect(r.status, JSON.stringify(r.data)).to.equal(200);
    const b = await prisma.booking.findUnique({ where: { id: first.id } });
    expect(b.paymentStatus).to.equal('PAID');
    expect(Number(b.paidAmount)).to.equal(Number(b.totalAmount));
    expect(b.metadata.serviceFeePaid).to.equal(true);
    // The facilitator tax invoice shows it with its GST
    const full = await prisma.booking.findUnique({ where: { id: b.id }, include: { hotel: true, roomType: { select: { name: true } }, ratePlan: { select: { name: true, mealPlan: true } }, ...BOOKING_ROOMS_INCLUDE } });
    const html = guestInvoiceHtml({ booking: full, hotel: full.hotel, rooms: full.bookingRooms, invoiceRef: 'ZIV/26-27/000009', brand: await brandContext() });
    expect(html).to.include('service fee').and.include('998552');
    expect(html).to.include(Number(b.totalAmount) + fee >= 1000 ? (Number(b.totalAmount) + fee).toLocaleString('en-IN') : String(Number(b.totalAmount) + fee));
  });

  it('the guest cancels: the stay is refunded by the policy, the fee is kept (not refundable)', async () => {
    const preview = (await api.get(`/bookings/${first.id}/cancel-preview`, guest)).data.data;
    expect(preview.serviceFeeKept).to.equal(fee);
    expect(preview.serviceFeeRefund).to.equal(0);
    const r = await api.post(`/bookings/${first.id}/cancel`, { refundTo: 'WALLET' }, guest);
    expect(r.status, JSON.stringify(r.data)).to.equal(200);
    const b = await prisma.booking.findUnique({ where: { id: first.id } });
    expect(b.metadata.serviceFeeRefunded || 0).to.equal(0);
    expect(Number((await prisma.refund.findUnique({ where: { bookingId: b.id } })).amount)).to.equal(Number(b.refundAmount));
  });

  it('paid with Zivo Cash: the fee is taken with the stay', async () => {
    await prisma.$transaction((tx) => move(tx, { userId: guestUser.id, type: 'CREDIT', amount: 50000, category: 'ADMIN_CREDIT', description: 'Test top-up' }));
    // Refundable this time
    const s = (await api.get('/admin/finance/service-fee', admin)).data.data;
    await api.put('/admin/finance/service-fee', { ...s, refundOnGuestCancel: true }, admin);
    const r = await api.post('/bookings', body('PREPAID', 153, { useWallet: true }), guest);
    expect(r.status, JSON.stringify(r.data)).to.be.oneOf([200, 201]);
    const b = await prisma.booking.findUnique({ where: { id: r.data.data.id } });
    const f = b.metadata.serviceFee;
    expect(b.status).to.equal('CONFIRMED');
    expect(Number(b.walletAmount)).to.equal(Number(b.totalAmount) + f);
    expect(Number(b.paidAmount)).to.equal(Number(b.totalAmount));
    expect(b.metadata.serviceFeePaid).to.equal(true);

    // Refundable fee: back with the refund when the guest cancels, with a credit note
    const preview = (await api.get(`/bookings/${b.id}/cancel-preview`, guest)).data.data;
    expect(preview.serviceFeeRefund).to.equal(f);
    const before = Number((await prisma.wallet.findUnique({ where: { userId: guestUser.id } })).balance);
    const c = await api.post(`/bookings/${b.id}/cancel`, { refundTo: 'WALLET' }, guest);
    expect(c.status, JSON.stringify(c.data)).to.equal(200);
    const after = await prisma.booking.findUnique({ where: { id: b.id } });
    expect(after.metadata.serviceFeeRefunded).to.equal(f);
    const back = Number((await prisma.wallet.findUnique({ where: { userId: guestUser.id } })).balance) - before;
    expect(back).to.be.closeTo(Number(after.refundAmount) + f, 0.01);
    // The hotel's figures never include the fee
    expect(Number(after.totalAmount)).to.equal(Number(b.totalAmount));
    // A credit note for the fee, once the booking has its invoice
    const inv = await prisma.invoice.findUnique({ where: { bookingId: b.id } });
    if (inv) {
      await sleep(1500);
      const note = await prisma.guestNote.findFirst({ where: { bookingId: b.id, key: 'service-fee' } });
      expect(note, 'credit note for the fee').to.not.equal(null);
      expect(Number(note.amount)).to.equal(f);
    }
  });
});
