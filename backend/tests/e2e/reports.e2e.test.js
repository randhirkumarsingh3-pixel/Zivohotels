/**
 * Admin reports and finance screens end to end against a running API (sample data plus whatever
 * the other end-to-end tests booked): figures match the database, money reports need the finance
 * permission, hotel accounts can't open them, and downloads are real CSV and Excel files.
 */
import axios from 'axios';
import { expect } from 'chai';
import minimist from 'minimist';
import prisma from '../../config/db.js';

const argv = minimist(process.argv.slice(2));
const BASE = argv.url || process.env.E2E_URL || 'http://localhost:5000';
const api = axios.create({ baseURL: `${BASE}/api/v1`, validateStatus: () => true });
const IST = 330 * 60000;
const istDay = (d) => new Date(new Date(d).getTime() + IST).toISOString().slice(0, 10);
const close = (a, b) => expect(Number(a)).to.be.closeTo(Number(b), 0.011);

describe('Admin reports end to end', function () {
  this.timeout(60000);
  let admin; let owner;

  before(async () => {
    const a = await api.post('/auth/login', { email: 'admin@zivoplus.com', password: process.env.SEED_ADMIN_PASSWORD || 'admin123' });
    admin = { headers: { Authorization: `Bearer ${a.data.data.token}` } };
    const o = await api.post('/auth/login', { email: 'extranet@zivotechretreat.com', password: process.env.SEED_OWNER_PASSWORD || 'ZivoExtranet@2026' });
    owner = { headers: { Authorization: `Bearer ${o.data.data.token}` } };
  });

  it('lists the reports, and hotel accounts cannot open them', async () => {
    const r = await api.get('/admin/reports', admin);
    expect(r.status).to.equal(200);
    expect(r.data.data.reports.map((x) => x.key)).to.include.members(['bookings', 'revenue', 'payments', 'refunds', 'cancellations', 'occupancy', 'settlements', 'tax', 'offers']);
    expect((await api.get('/admin/reports', owner)).status).to.equal(403);
    expect((await api.get('/admin/reports/revenue', owner)).status).to.equal(403);
    expect((await api.get('/admin/finance/payouts', owner)).status).to.equal(403);
  });

  it('shows a booking exactly as it is stored', async () => {
    const b = await prisma.booking.findFirst({ orderBy: { createdAt: 'desc' }, select: { bookingRef: true, createdAt: true, hotelId: true, totalAmount: true, paidAmount: true, refundAmount: true, baseAmount: true, taxAmount: true } });
    const day = istDay(b.createdAt);
    const r = await api.get('/admin/reports/bookings', { ...admin, params: { from: day, to: day, hotelId: b.hotelId } });
    expect(r.status, JSON.stringify(r.data)).to.equal(200);
    const row = r.data.data.rows.find((x) => x.ref === b.bookingRef);
    expect(row, 'booking in the report').to.exist;
    close(row.total, b.totalAmount); close(row.paid, b.paidAmount || 0); close(row.refunded, b.refundAmount || 0);
    close(row.roomValue, b.baseAmount || 0); close(row.gst, b.taxAmount || 0);
    const count = await prisma.booking.count({ where: { hotelId: b.hotelId, createdAt: { gte: new Date(new Date(`${day}T00:00:00Z`).getTime() - IST), lt: new Date(new Date(`${day}T00:00:00Z`).getTime() + 86400000 - IST) } } });
    expect(r.data.data.rows.length).to.equal(count);
  });

  it('adds up commission, GST, TCS, TDS and net payable like the settlements', async () => {
    const from = '2020-01-01'; const to = istDay(Date.now());
    const r = await api.get('/admin/reports/revenue', { ...admin, params: { from, to, groupBy: 'property' } });
    expect(r.status).to.equal(200);
    const sums = await prisma.settlement.aggregate({ _sum: { commissionAmount: true, commissionGstAmount: true, tcsAmount: true, tdsAmount: true, netPayable: true }, _count: true, where: { createdAt: { lt: new Date(new Date(`${to}T00:00:00Z`).getTime() + 86400000 - IST) } } });
    const t = r.data.data.totals;
    expect(t.count).to.equal(sums._count);
    close(t.commission, sums._sum.commissionAmount || 0); close(t.commissionGst, sums._sum.commissionGstAmount || 0);
    close(t.tcs, sums._sum.tcsAmount || 0); close(t.tds, sums._sum.tdsAmount || 0); close(t.net, sums._sum.netPayable || 0);
    // Grouped by property: the groups add up to the same total
    close(r.data.data.rows.reduce((s, x) => s + x.commission, 0), t.commission);
  });

  it('downloads real CSV and Excel files', async () => {
    const csv = await api.get('/admin/reports/bookings', { ...admin, params: { format: 'csv' }, responseType: 'arraybuffer' });
    expect(csv.status).to.equal(200);
    expect(csv.headers['content-type']).to.match(/text\/csv/);
    expect(Buffer.from(csv.data).toString('utf8')).to.match(/^\uFEFFBooked on,Booking,Property/);
    const xlsx = await api.get('/admin/reports/tax', { ...admin, params: { format: 'xlsx' }, responseType: 'arraybuffer' });
    expect(xlsx.status).to.equal(200);
    expect(xlsx.headers['content-disposition']).to.match(/\.xlsx"$/);
    expect(Buffer.from(xlsx.data).subarray(0, 2).toString()).to.equal('PK'); // a zip, as .xlsx files are
  });

  it('shows each hotel what it is owed, matching its open settlements', async () => {
    const r = await api.get('/admin/finance/payouts', admin);
    expect(r.status).to.equal(200);
    for (const h of r.data.data.hotels) {
      const open = await prisma.settlement.findMany({ where: { hotelId: h.hotelId, status: { in: ['PENDING', 'READY'] } }, select: { netPayable: true } });
      close(h.due + h.onHold, open.reduce((s, x) => s + Number(x.netPayable), 0));
    }
    const l = await api.get('/admin/finance/ledger', { ...admin, params: { from: '2020-01-01', to: istDay(Date.now()) } });
    expect(l.status).to.equal(200);
    const credits = await prisma.ledgerEntry.aggregate({ _sum: { amount: true }, where: { type: 'CREDIT' } });
    close(l.data.data.totals.credit, credits._sum.amount || 0);
  });
});
