/**
 * Commission invoices, credit notes and statements end to end against a running API: a month is
 * invoiced once per hotel with the settlements' figures, never twice; a credit note gives the
 * commission back into the next payout; owners download only their own documents and statements;
 * settings check what they accept. Everything created is removed and settings put back afterwards.
 */
import axios from 'axios';
import { expect } from 'chai';
import minimist from 'minimist';
import prisma from '../../config/db.js';
import { settlementTermsForHotel } from '../../services/finance/settlementService.js';

const argv = minimist(process.argv.slice(2));
const BASE = argv.url || process.env.E2E_URL || 'http://localhost:5000';
const api = axios.create({ baseURL: `${BASE}/api/v1`, validateStatus: () => true });
const PERIOD = '2025-05';
const close = (a, b) => expect(Number(a)).to.be.closeTo(Number(b), 0.011);

describe('Commission invoices and statements end to end', function () {
  this.timeout(90000);
  let admin; let owner; let hotel; let settlement; let original; let createdSettlement = false; let savedSettings; let invoice; let creditNote;

  before(async () => {
    const a = await api.post('/auth/login', { email: 'admin@zivoplus.com', password: process.env.SEED_ADMIN_PASSWORD || 'admin123' });
    admin = { headers: { Authorization: `Bearer ${a.data.data.token}` } };
    const o = await api.post('/auth/login', { email: 'extranet@zivotechretreat.com', password: process.env.SEED_OWNER_PASSWORD || 'ZivoExtranet@2026' });
    owner = { headers: { Authorization: `Bearer ${o.data.data.token}` } };
    savedSettings = await prisma.systemConfig.findUnique({ where: { key: 'finance_settings' } });
    // A stay settled in a past month at one of the owner's hotels: an open one moved there for the
    // test, or one made for a booking that has none (whichever of the owner's hotels has it)
    const ownHotels = (await prisma.hotel.findMany({ where: { owner: { email: 'extranet@zivotechretreat.com' }, isDeleted: false }, select: { id: true } })).map((h) => h.id);
    settlement = await prisma.settlement.findFirst({ where: { hotelId: { in: ownHotels }, invoiceId: null, commissionAmount: { gt: 0 } } });
    if (settlement) {
      original = { createdAt: settlement.createdAt };
    } else {
      const settled = (await prisma.settlement.findMany({ select: { bookingId: true } })).map((x) => x.bookingId);
      const booking = await prisma.booking.findFirst({ where: { hotelId: { in: ownHotels }, id: { notIn: settled } }, select: { id: true, hotelId: true } });
      if (!booking) throw new Error('No booking at the owner\'s hotels to settle for the test');
      settlement = await prisma.settlement.create({ data: { bookingId: booking.id, hotelId: booking.hotelId, kind: 'STAY', grossAmount: 5985, taxAmount: 285, commissionAmount: 855, commissionGstAmount: 153.9, igstAmount: 153.9, tdsAmount: 5.7, netPayable: -1014.6, status: 'PENDING' } });
      createdSettlement = true;
    }
    hotel = { id: settlement.hotelId };
    await prisma.settlement.update({ where: { id: settlement.id }, data: { createdAt: new Date('2025-05-15T08:00:00Z') } });
    settlement = await prisma.settlement.findUnique({ where: { id: settlement.id } });
  });

  after(async () => {
    if (!settlement) return;
    const docs = await prisma.financeDocument.findMany({ where: { OR: [{ id: invoice?.id || '-' }, { originalId: invoice?.id || '-' }] }, select: { id: true } });
    const ids = docs.map((d) => d.id);
    // The ledger is append-only in the database; test clean-up uses the same one-transaction exception as the retention job
    await prisma.$transaction([
      prisma.$executeRaw`SELECT set_config('zivo.allow_audit_change', 'on', true)`,
      prisma.ledgerEntry.deleteMany({ where: { referenceId: { in: ids } } }),
    ]);
    await prisma.hotelAdjustment.deleteMany({ where: { documentId: { in: ids } } });
    await prisma.financeDocument.deleteMany({ where: { id: { in: ids } } });
    if (createdSettlement) await prisma.settlement.delete({ where: { id: settlement.id } });
    else await prisma.settlement.update({ where: { id: settlement.id }, data: { createdAt: original.createdAt, invoiceId: null } });
    if (savedSettings) await prisma.systemConfig.update({ where: { key: 'finance_settings' }, data: { value: savedSettings.value } });
    else await prisma.systemConfig.deleteMany({ where: { key: 'finance_settings' } });
  });

  it('checks the settings it is given (and stays in test mode)', async () => {
    const s = await api.get('/admin/finance/settings', admin);
    expect(s.status).to.equal(200);
    expect(s.data.data.settings.invoice).to.include({ prefix: 'ZPC', creditPrefix: 'ZPCN' });
    expect((await api.put('/admin/finance/settings', { company: { tan: 'NOTATAN' } }, admin)).status).to.equal(400);
    expect((await api.put('/admin/finance/settings', { tcsRegistrations: { '07': '29AADCZ1700C1C2' } }, admin)).status).to.equal(400);
    expect((await api.put('/admin/finance/settings', { tcsRegistrations: { '07': '07AADCZ1700C1C2' } }, admin)).status).to.equal(200);
    expect((await api.get('/admin/finance/settings', owner)).status).to.equal(403);
  });

  it('changes the TCS, TDS and commission GST rates within limits, for later stays', async () => {
    expect((await api.put('/admin/finance/settings', { rates: { tcsPercent: 10 } }, admin)).status).to.equal(400);
    expect((await api.put('/admin/finance/settings', { rates: { tdsPercent: -1 } }, admin)).status).to.equal(400);
    const r = await api.put('/admin/finance/settings', { rates: { tcsPercent: 1, tdsPercent: 0.2, commissionGstPercent: 18 } }, admin);
    expect(r.status, JSON.stringify(r.data)).to.equal(200);
    expect(r.data.data.settings.rates).to.include({ tcsPercent: 1, tdsPercent: 0.2, commissionGstPercent: 18 });
    // A stay settled now would use them
    const terms = await settlementTermsForHotel(prisma, hotel.id);
    expect(terms).to.include({ tcsPercent: 1, tdsPercent: 0.2, commissionGstPercent: 18 });
    // Owners see the current rates in the Finance Hub
    const hub = await api.get('/extranet/finance/hub', { ...owner, params: { hotelId: hotel.id } });
    expect(hub.data.data.rates).to.include({ tcsPercent: 1, tdsPercent: 0.2 });
    await api.put('/admin/finance/settings', { rates: { tcsPercent: 0.5, tdsPercent: 0.1 } }, admin);
  });

  it('invoices a finished month once per hotel with the settlement figures', async () => {
    expect((await api.post(`/admin/finance/months/${new Date().toISOString().slice(0, 7)}/issue`, {}, admin)).status).to.equal(400);
    const r = await api.post(`/admin/finance/months/${PERIOD}/issue`, { hotelId: hotel.id }, admin);
    expect(r.status, JSON.stringify(r.data)).to.equal(201);
    expect(r.data.data.issued).to.have.length(1);
    invoice = r.data.data.issued[0];
    expect(invoice.number).to.match(/^(TEST-)?ZPC\/\d{4}-\d{2}\/\d{6}$/);
    const d = (await api.get(`/admin/finance/documents/${invoice.id}`, admin)).data.data;
    close(d.taxable, settlement.commissionAmount);
    close(d.cgst + d.sgst + d.igst, settlement.commissionGstAmount);
    close(d.total, Number(settlement.commissionAmount) + Number(settlement.commissionGstAmount));
    expect(d.lines.map((l) => l.settlementId)).to.include(settlement.id);
    // CGST + SGST only for hotels in ZivoPlus' state; otherwise IGST
    expect(d.igst > 0 ? d.cgst + d.sgst : d.igst).to.equal(0);
    const again = await api.post(`/admin/finance/months/${PERIOD}/issue`, { hotelId: hotel.id }, admin);
    expect(again.data.data.issued).to.have.length(0);
    expect((await prisma.settlement.findUnique({ where: { id: settlement.id } })).invoiceId).to.equal(invoice.id);
  });

  it('gives commission back with a credit note, once, into the next payout', async () => {
    const before = (await api.get('/admin/finance/payouts', admin)).data.data.hotels.find((h) => h.hotelId === hotel.id);
    const cn = await api.post(`/admin/finance/documents/${invoice.id}/credit-note`, { settlementIds: [settlement.id], reason: 'Guest refunded after the stay' }, admin);
    expect(cn.status, JSON.stringify(cn.data)).to.equal(201);
    creditNote = cn.data.data;
    expect(creditNote.number).to.match(/ZPCN\//);
    close(creditNote.total, invoice.total);
    expect((await api.post(`/admin/finance/documents/${invoice.id}/credit-note`, { settlementIds: [settlement.id], reason: 'Twice by mistake' }, admin)).status).to.equal(400);
    const after = (await api.get('/admin/finance/payouts', admin)).data.data.hotels.find((h) => h.hotelId === hotel.id);
    close(after.due - before.due, creditNote.total);
  });

  it('makes real PDFs and Excel files', async () => {
    const pdf = await api.get(`/admin/finance/documents/${invoice.id}`, { ...admin, params: { format: 'pdf' }, responseType: 'arraybuffer' });
    expect(pdf.status).to.equal(200);
    expect(Buffer.from(pdf.data).subarray(0, 4).toString()).to.equal('%PDF');
    const xlsx = await api.get('/admin/finance/statement', { ...admin, params: { hotelId: hotel.id, period: PERIOD, format: 'xlsx' }, responseType: 'arraybuffer' });
    expect(Buffer.from(xlsx.data).subarray(0, 2).toString()).to.equal('PK');
    const st = (await api.get('/admin/finance/statement', { ...admin, params: { hotelId: hotel.id, period: PERIOD } })).data.data;
    expect(st.stays.map((x) => x.settlementId)).to.include(settlement.id);
    close(st.totals.closing, st.totals.opening + st.totals.earned + st.totals.credits - st.totals.paid);
  });

  it('shows a property month by month for its financial year, with every invoice in a ZIP', async () => {
    const r = await api.get(`/admin/finance/properties/${hotel.id}`, { ...admin, params: { fy: '2025-26' } });
    expect(r.status, JSON.stringify(r.data)).to.equal(200);
    expect(r.data.data.months.map((m) => m.period)).to.deep.equal(['2025-04', '2025-05', '2025-06', '2025-07', '2025-08', '2025-09', '2025-10', '2025-11', '2025-12', '2026-01', '2026-02', '2026-03']);
    const may = r.data.data.months.find((m) => m.period === PERIOD);
    expect(may.documents.map((d) => d.id)).to.include(invoice.id);
    close(may.commission, settlement.commissionAmount);
    close(r.data.data.totals.commission, r.data.data.months.reduce((a, m) => a + m.commission, 0));
    const zip = await api.get('/admin/finance/documents/zip', { ...admin, params: { hotelId: hotel.id, fy: '2025-26' }, responseType: 'arraybuffer' });
    expect(zip.status).to.equal(200);
    expect(zip.headers['content-type']).to.match(/zip/);
    expect(Buffer.from(zip.data).subarray(0, 2).toString()).to.equal('PK');
    const month = await api.get('/admin/finance/documents/zip', { ...admin, params: { period: PERIOD }, responseType: 'arraybuffer' });
    expect(month.status).to.equal(200);
    expect((await api.get('/admin/finance/documents/zip', admin)).status).to.equal(400);
    // The owner gets their own year's invoices, and not the admin view
    const own = await api.get('/extranet/finance/documents/zip', { ...owner, params: { hotelId: hotel.id, fy: '2025-26' }, responseType: 'arraybuffer' });
    expect(own.status).to.equal(200);
    expect(Buffer.from(own.data).subarray(0, 2).toString()).to.equal('PK');
    expect((await api.get(`/admin/finance/properties/${hotel.id}`, owner)).status).to.equal(403);
  });

  it('shows owners their own documents and statements only', async () => {
    const hub = await api.get('/extranet/finance/hub', { ...owner, params: { period: PERIOD, hotelId: hotel.id } });
    expect(hub.status, JSON.stringify(hub.data)).to.equal(200);
    expect(hub.data.data.documents.map((d) => d.id)).to.include.members([invoice.id, creditNote.id]);
    expect(hub.data.data.earnings).to.have.length(12);
    expect(hub.data.data.zivo).to.not.have.property('address');
    const mine = await api.get(`/extranet/finance/documents/${invoice.id}/pdf`, { ...owner, params: { hotelId: hotel.id }, responseType: 'arraybuffer' });
    expect(mine.status).to.equal(200);
    // Someone else's document: another hotel's owner can't see it
    const other = await prisma.hotel.findFirst({ where: { id: { not: hotel.id }, owner: { NOT: { email: 'extranet@zivotechretreat.com' } } }, select: { id: true } });
    if (other) {
      const foreign = await prisma.financeDocument.create({ data: { kind: 'INVOICE', number: `TEST-E2E/${Date.now()}`, series: 'TEST-E2E', seq: 1, hotelId: other.id, period: PERIOD, supplier: {}, recipient: {}, lines: [] } });
      const r = await api.get(`/extranet/finance/documents/${foreign.id}/pdf`, { ...owner, params: { hotelId: hotel.id } });
      await prisma.financeDocument.delete({ where: { id: foreign.id } });
      expect(r.status).to.equal(404);
    }
    expect((await api.get('/admin/finance/documents', owner)).status).to.equal(403);
  });
});
