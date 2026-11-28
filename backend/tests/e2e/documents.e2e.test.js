/**
 * Admin → Documents & emails and the Setup checklist: settings are validated and saved, the
 * guest invoice issuer changes what the invoice says, samples render as PDF / HTML in the
 * ZivoPlus look, and the checklist reports every setting. Hotel accounts are refused.
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

describe('Documents & emails settings', function () {
  this.timeout(60000);
  let admin; let saved;

  before(async () => {
    const a = await api.post('/auth/login', { email: 'admin@zivoplus.com', password: 'admin123' });
    admin = { headers: { Authorization: `Bearer ${a.data.data.token}` } };
    saved = (await api.get('/admin/documents', admin)).data.data.settings;
  });
  after(async () => { if (saved) await api.put('/admin/documents', saved, admin); });

  it('reads and validates the settings', async () => {
    const r = await api.get('/admin/documents', admin);
    expect(r.status).to.equal(200);
    expect(r.data.data.modes).to.deep.equal(['ON_BEHALF', 'ZIVO_SUPPLIER', 'HOTEL_ISSUES']);
    expect((await api.put('/admin/documents', { guestInvoice: { mode: 'NOPE' } }, admin)).status).to.equal(400);
    expect((await api.put('/admin/documents', { guestInvoice: { prefix: 'Z1' } }, admin)).status).to.equal(400);
    const ok = await api.put('/admin/documents', { guestInvoice: { mode: 'HOTEL_ISSUES', prefix: 'zvp' }, voucher: { guestNotes: 'Line one\n\nLine two' } }, admin);
    expect(ok.status, JSON.stringify(ok.data)).to.equal(200);
    expect(ok.data.data.settings.guestInvoice).to.include({ mode: 'HOTEL_ISSUES', prefix: 'ZVP' });
    expect(ok.data.data.settings.voucher.guestNotes).to.deep.equal(['Line one', 'Line two']);
  });

  it('changes what the guest invoice says by who issues it', async () => {
    const booking = await prisma.booking.findFirst({ where: { status: { in: ['CONFIRMED', 'COMPLETED'] } }, include: { hotel: true, roomType: { select: { name: true } }, ratePlan: { select: { name: true, mealPlan: true } }, ...BOOKING_ROOMS_INCLUDE } });
    const make = async (mode) => {
      await api.put('/admin/documents', { guestInvoice: { mode } }, admin);
      return guestInvoiceHtml({ booking, hotel: booking.hotel, rooms: booking.bookingRooms, invoiceRef: 'ZIV/2026/000001', brand: await brandContext() });
    };
    expect(await make('ON_BEHALF')).to.include('Tax Invoice').and.include('on behalf of the property').and.include('Supplier (the property)');
    expect(await make('ZIVO_SUPPLIER')).to.include('Tax Invoice').and.not.include('Supplier (the property)');
    const receipt = await make('HOTEL_ISSUES');
    // The hotel invoices the stay; ZivoPlus issues its own tax invoice as the facilitator
    expect(receipt).to.include('Tax Invoice').and.include('998552').and.include('Reservation service for accommodation').and.include('collected on behalf of the hotel').and.include('acts only as a facilitator').and.not.include('Payment Receipt').and.not.include('996311');
  });

  it('renders samples of every document and email', async () => {
    for (const kind of ['guest-invoice', 'guest-voucher', 'hotel-voucher']) {
      const r = await api.get(`/admin/documents/preview/${kind}`, { ...admin, responseType: 'arraybuffer' });
      expect(r.status, kind).to.equal(200);
      expect(r.headers['content-type']).to.equal('application/pdf');
      expect(Buffer.from(r.data).subarray(0, 4).toString()).to.equal('%PDF');
    }
    for (const kind of ['guest-email', 'hotel-email']) {
      const r = await api.get(`/admin/documents/preview/${kind}`, admin);
      expect(r.status, kind).to.equal(200);
      expect(r.data).to.include('data-zivo-email="1"');
      expect(r.data).to.not.include('Zivo AI Assistant');
      expect(r.data).to.not.include('85 Mbps');
    }
  });

  it('lists every setting a super admin configures, with its state', async () => {
    const r = await api.get('/admin/setup', admin);
    expect(r.status).to.equal(200);
    const keys = r.data.data.items.map((i) => i.key);
    for (const k of ['company', 'tcs', 'commissionLive', 'invoiceMode', 'email', 'razorpay', 'signIn', 'welcome', 'admins', 'encryption']) expect(keys, k).to.include(k);
    for (const i of r.data.data.items) expect(['done', 'todo', 'optional', 'info']).to.include(i.status);
    // No secret values are returned, only whether they are set
    expect(JSON.stringify(r.data)).to.not.include(process.env.RAZORPAY_KEY_SECRET || 'ci_secret');
  });

  it('refuses hotel accounts', async () => {
    const o = await api.post('/auth/login', { email: 'extranet@zivotechretreat.com', password: 'ZivoExtranet@2026' });
    const owner = { headers: { Authorization: `Bearer ${o.data.data.token}` } };
    expect((await api.get('/admin/documents', owner)).status).to.equal(403);
    expect((await api.get('/admin/setup', owner)).status).to.equal(403);
  });
});
