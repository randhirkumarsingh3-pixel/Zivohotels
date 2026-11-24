/**
 * Fixes from the load test: invoices for payments that arrive together, the invoice catch-up job,
 * the admin report sending only the rows the page shows, and native password hashing.
 * Run with BOOKING_RATE_LIMIT_PER_MINUTE raised (PR Validation sets 30).
 */
import crypto from 'crypto';
import axios from 'axios';
import { expect } from 'chai';
import minimist from 'minimist';
import prisma from '../../config/db.js';
import { invoiceService } from '../../services/invoiceService.js';

const argv = minimist(process.argv.slice(2));
const API = `${argv.url || process.env.E2E_URL || 'http://localhost:5000'}/api/v1`;
const api = axios.create({ baseURL: API, validateStatus: () => true });
const SECRET = process.env.RAZORPAY_KEY_SECRET || 'ci_secret';
const inDays = (n) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });
// The booking limit counts per address per minute; earlier tests may have used it up, so wait
const post = async (path, body, cfg) => {
  for (let t = 0; t < 15; t += 1) {
    const r = await api.post(path, body, cfg);
    if (r.status !== 429) return r;
    await sleep(5000);
  }
  return api.post(path, body, cfg);
};

describe('Capacity fixes (load test)', function () {
  this.timeout(120000);
  let auth; let hotel; let room; let plan;
  const paidIds = [];

  before(async () => {
    const login = await api.post('/auth/login', { email: 'user@zivoplus.com', password: process.env.SEED_CUSTOMER_PASSWORD || 'customer123' });
    expect(login.status, JSON.stringify(login.data)).to.equal(200);
    auth = { headers: { Authorization: `Bearer ${login.data.data.token}` } };
    hotel = await prisma.hotel.findFirst({
      where: { status: { in: ['LIVE', 'ACTIVE'] }, isDeleted: false, roomTypes: { some: { ratePlans: { some: { isActive: true, basePrice: { gt: 0 } } } } } },
      include: { roomTypes: { include: { ratePlans: { where: { isActive: true, basePrice: { gt: 0 } } } } } },
    });
    room = hotel.roomTypes.find((rt) => rt.ratePlans.length);
    plan = room.ratePlans[0];
  });

  after(async () => {
    if (paidIds.length) {
      await api.post(`/bookings/${paidIds[0]}/cancel`, { reason: 'test' }, auth).catch(() => {});
    }
  });

  it('issues each invoice on the departure date, not at payment, even when many are drawn together', async () => {
    // Six bookings on different nights, then all six paid at the same moment
    const made = [];
    for (let i = 0; i < 6; i += 1) {
      const r = await post('/bookings', {
        hotelId: hotel.id, roomTypeId: room.id, ratePlanId: plan.id, rooms: 1, adults: 1, children: 0,
        checkIn: inDays(80 + i * 2), checkOut: inDays(81 + i * 2), paymentType: 'PREPAID',
        guestName: 'Load Test', guestEmail: 'capacity@example.com', guestPhone: '9876543210',
        roomLines: [{ roomTypeId: room.id, ratePlanId: plan.id, adults: 1, children: 0, guestName: 'Load Test' }],
      }, auth);
      expect(r.status, JSON.stringify(r.data)).to.be.oneOf([200, 201]);
      made.push(r.data.data.booking || r.data.data);
    }
    await Promise.all(made.map((b, i) => prisma.booking.update({ where: { id: b.id }, data: { razorpayOrderId: `order_cap_${i}_${b.id.slice(0, 6)}` } })));
    const pays = await Promise.all(made.map((b, i) => {
      const order = `order_cap_${i}_${b.id.slice(0, 6)}`; const pay = `pay_cap_${i}_${b.id.slice(0, 6)}`;
      const sig = crypto.createHmac('sha256', SECRET).update(`${order}|${pay}`).digest('hex');
      return post('/payments/verify', { razorpay_order_id: order, razorpay_payment_id: pay, razorpay_signature: sig, bookingId: b.id }, auth);
    }));
    pays.forEach((p) => expect(p.status, JSON.stringify(p.data)).to.equal(200));
    paidIds.push(...made.map((b) => b.id));

    // Paying does not issue the invoice: it comes on the departure date
    await sleep(1500);
    expect(await prisma.invoice.count({ where: { bookingId: { in: paidIds } } }), 'no invoice before departure').to.equal(0);
    const early = await invoiceService.generateInvoice(paidIds[0]).catch((e) => e);
    expect(early.code).to.equal('NOT_YET');

    // Departure day arrives for all six: their invoices are drawn at the same moment
    const ago = new Date(Date.now() - 2 * 86400000);
    await prisma.booking.updateMany({ where: { id: { in: paidIds } }, data: { checkIn: ago, checkOut: new Date(ago.getTime() + 86400000) } });
    await Promise.all(paidIds.map((id) => invoiceService.generateInvoice(id)));
    const invoices = await prisma.invoice.findMany({ where: { bookingId: { in: paidIds } } });
    expect(invoices.length, 'one invoice per paid booking').to.equal(6);
    expect(invoices.every((x) => x.status === 'GENERATED' && x.pdfUrl), JSON.stringify(invoices.map((x) => x.status))).to.equal(true);
    expect(new Set(invoices.map((x) => x.invoiceRef)).size, 'invoice numbers are unique').to.equal(6);
    let told = 0;
    for (let t = 0; t < 20 && !told; t += 1) {
      told = await prisma.userNotification.count({ where: { type: 'INVOICE_READY', metadata: { path: ['bookingId'], equals: paidIds[0] } } });
      if (!told) await sleep(250);
    }
    expect(told, 'the guest is told the invoice is ready').to.equal(1);
  });

  it('draws invoices whose PDF failed earlier, keeping their number', async () => {
    const inv = await prisma.invoice.findFirst({ where: { bookingId: paidIds[1] } });
    await prisma.invoice.update({ where: { id: inv.id }, data: { status: 'PDF_FAILED', pdfUrl: null, createdAt: new Date(Date.now() - 10 * 60000) } });
    const done = await invoiceService.catchUp();
    expect(done.redrawn).to.be.at.least(1);
    const after = await prisma.invoice.findUnique({ where: { id: inv.id } });
    expect(after.status).to.equal('GENERATED');
    expect(after.pdfUrl).to.be.a('string');
    expect(after.invoiceRef).to.equal(inv.invoiceRef);
  });

  it('issues the invoice of a stay whose departure date has come (hotel did not check out)', async () => {
    const inv = await prisma.invoice.findFirst({ where: { bookingId: paidIds[2] } });
    await prisma.invoice.delete({ where: { id: inv.id } });
    const done = await invoiceService.catchUp();
    expect(done.issued).to.be.at.least(1);
    const again = await prisma.invoice.findUnique({ where: { bookingId: paidIds[2] } });
    expect(again?.status).to.equal('GENERATED');
  });

  it('sends the admin report page only the rows it shows, with the full count and totals', async () => {
    const a = await api.post('/auth/login', { email: 'admin@zivoplus.com', password: 'admin123' });
    const admin = { headers: { Authorization: `Bearer ${a.data.data.token}` } };
    const r = await api.get(`/admin/reports/bookings?from=${inDays(-30)}&to=${inDays(1)}`, admin);
    expect(r.status, JSON.stringify(r.data)).to.equal(200);
    const d = r.data.data;
    expect(d.rowCount).to.be.at.least(6);
    expect(d.rows.length).to.equal(Math.min(500, d.rowCount));
    expect(d.totals.total).to.be.a('number');
    const csv = await api.get(`/admin/reports/bookings?from=${inDays(-30)}&to=${inDays(1)}&format=csv`, admin);
    expect(csv.status).to.equal(200);
    expect(csv.data.trim().split('\n').length).to.be.at.least(d.rowCount + 1);
  });

  it('still signs in accounts whose password was saved before the switch to native hashing', async () => {
    const bcryptjs = (await import('bcryptjs')).default;
    const email = `oldhash.${Date.now() % 1e8}@example.com`;
    const u = await prisma.user.create({ data: { email, name: 'Old Hash', role: 'CUSTOMER', status: 'ACTIVE', password: bcryptjs.hashSync('Older-Pass-4471', 10) } });
    try {
      const r = await api.post('/auth/login', { email, password: 'Older-Pass-4471' });
      expect(r.status, JSON.stringify(r.data)).to.equal(200);
      expect((await api.post('/auth/login', { email, password: 'Wrong-Pass-4471' })).status).to.equal(401);
    } finally {
      await prisma.user.delete({ where: { id: u.id } }).catch(() => {});
    }
  });
});
