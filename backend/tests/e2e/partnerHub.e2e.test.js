/**
 * Partner Hub: a travel agent books at business rates, end to end.
 *  - only hotels that opted in to agent rates; the quote uses the website's exact price for the
 *    same stay, then the agent rate (net + markup, or public price + commission)
 *  - booking spends the agency's account (never more than is available); a hold is paid later
 *  - cancelling refunds the agency's account; the confirmation goes to the agent, not the customer
 *  - on commission, check-out credits the agency (less TDS 194H) and the hotel's settlement
 *    carries the hotel-funded part
 *  - the white-label voucher carries the agency's name, not ZivoPlus'
 */
import axios from 'axios';
import { expect } from 'chai';
import minimist from 'minimist';
import crypto from 'crypto';
import prisma from '../../config/db.js';
import bcrypt from '../../utils/bcrypt.js';
import { transitionBookingStatus } from '../../services/bookingStateMachine.js';
import { agencyVoucherHtml, loadVoucherData } from '../../services/voucherService.js';

const argv = minimist(process.argv.slice(2));
const API = `${argv.url || process.env.E2E_URL || 'http://localhost:5000'}/api/v1`;
const api = axios.create({ baseURL: API, validateStatus: () => true });
const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });
const retry = async (fn) => { for (let i = 0; i < 12; i += 1) { const r = await fn(); if (r.status !== 429) return r; await sleep(5000); } return fn(); };
const login = async (email, password) => ({ headers: { Authorization: `Bearer ${(await retry(() => api.post('/auth/login', { email, password }))).data.data.token}` } });
const ymd = (d) => d.toISOString().slice(0, 10);
const inDays = (n) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + n); return ymd(d); };

describe('Partner Hub: agents booking at business rates', function () {
  this.timeout(180000);
  const tag = Date.now().toString().slice(-6);
  const password = `Agt!${crypto.randomUUID().slice(0, 10)}x9`;
  let admin; let agent; let agentUser; let org; let hotel; let room; let savedSettings; let savedRate;
  const stay = (extra = {}) => ({
    hotelId: hotel.id, checkIn: inDays(50), checkOut: inDays(52),
    roomLines: [{ roomTypeId: room.id, ratePlanId: room.ratePlans[0].id, adults: 2, children: 0 }], ...extra,
  });

  before(async () => {
    admin = await login('admin@zivoplus.com', 'admin123');
    savedSettings = await prisma.systemConfig.findUnique({ where: { key: 'business_settings' } });
    await api.put('/admin/business-settings', { agency: { enabled: true, pricingModel: 'BOTH', defaultMarkupPct: 10, maxMarkupPct: 40, extraCommissionPct: 2, tdsPct: 2, holdHours: 24 } }, admin);
    agentUser = await prisma.user.create({ data: { name: 'Kiran Agent', email: `kiran.${tag}@example.com`, password: await bcrypt.hash(password, 10), role: 'CUSTOMER', status: 'ACTIVE', emailVerifiedAt: new Date() } });
    agent = await login(agentUser.email, password);
    org = await prisma.organisation.create({ data: {
      kind: 'AGENCY', code: `ZP-T${tag}`, name: `Sunrise Holidays ${tag}`, legalName: `Sunrise Holidays ${tag}`, incorporationType: 'INDIVIDUAL', pan: `ABCPS${tag.slice(2)}Z`,
      address: '12 Park Street', city: 'Kolkata', state: 'West Bengal', pincode: '700016', billingEmail: `acc.${tag}@example.com`, phone: '9830012345',
      status: 'ACTIVE', createdById: agentUser.id, members: { create: { userId: agentUser.id, role: 'ADMIN' } },
    } });
    const hotels = await prisma.hotel.findMany({
      where: { status: { in: ['LIVE', 'ACTIVE'] }, isDeleted: false },
      include: { roomTypes: { where: { isActive: { not: false }, maxOccupancy: { gte: 2 } }, include: { ratePlans: { where: { isActive: true, basePrice: { gt: 0 } } } } } },
    });
    hotel = hotels.find((h) => h.roomTypes.some((rt) => rt.ratePlans.length));
    room = hotel.roomTypes.find((rt) => rt.ratePlans.length);
    savedRate = await prisma.hotelBusinessRate.findUnique({ where: { hotelId: hotel.id } });
    await prisma.hotelBusinessRate.upsert({ where: { hotelId: hotel.id }, update: { agentEnabled: true, agentDiscountPct: 10 }, create: { hotelId: hotel.id, agentEnabled: true, agentDiscountPct: 10 } });
  });

  after(async () => {
    if (savedSettings) await prisma.systemConfig.update({ where: { key: 'business_settings' }, data: { value: savedSettings.value } }).catch(() => {});
    else await prisma.systemConfig.deleteMany({ where: { key: 'business_settings' } }).catch(() => {});
    if (savedRate) await prisma.hotelBusinessRate.update({ where: { hotelId: hotel.id }, data: { agentEnabled: savedRate.agentEnabled, agentDiscountPct: savedRate.agentDiscountPct } }).catch(() => {});
    else await prisma.hotelBusinessRate.deleteMany({ where: { hotelId: hotel.id } }).catch(() => {});
  });

  it('lists only hotels that offer agent rates', async () => {
    const r = await api.get(`/business/${org.id}/rates`, { ...agent, params: { hotelIds: hotel.id } });
    expect(r.status, JSON.stringify(r.data)).to.equal(200);
    expect(r.data.data).to.have.length(1);
    expect(r.data.data[0].offer).to.include({ kind: 'AGENCY', tradeDiscountPct: 10, extraCommissionPct: 2 });
    expect(r.data.data[0].offer.models).to.deep.equal(['NET', 'COMMISSION']);
  });

  it('net rate: the website\'s exact price for the stay, less the trade discount, GST on the net tariff', async () => {
    const pv = await api.post('/bookings/preview', { ...stay(), roomTypeId: room.id, ratePlanId: room.ratePlans[0].id, rooms: 1, paymentType: 'PAY_AT_HOTEL' }, agent);
    expect(pv.status, JSON.stringify(pv.data)).to.equal(200);
    const pub = pv.data.data;
    const r = await api.post(`/business/${org.id}/quote`, { ...stay(), model: 'NET', markupPct: 15 }, agent);
    expect(r.status, JSON.stringify(r.data)).to.equal(200);
    const q = r.data.data;
    expect(q.price.roomCharges).to.equal(pub.subtotal);
    // (no public offer applies to business rates)
    if (!(pub.discountAmount > 0)) expect(q.business.publicAmount).to.equal(pub.finalAmount);
    expect(q.price.discount).to.equal(Math.round(pub.subtotal * 0.10));
    expect(q.price.total).to.equal(q.price.beforeTax + q.price.tax);
    expect(q.price.total).to.be.below(q.business.publicAmount);
    expect(q.business).to.include({ model: 'NET', markupPct: 15, payAmount: q.price.total, markupAmount: Math.round(q.price.beforeTax * 0.15) });
    expect(q.business.sellAmount).to.equal(q.price.total + q.business.markupAmount);
    expect(q.canPayNow).to.equal(false);
    expect((await api.post(`/business/${org.id}/quote`, { ...stay(), model: 'NET', markupPct: 60 }, agent)).status).to.equal(400);
  });

  let netBooking;
  it('books only what the account can pay; the agent gets the confirmation', async () => {
    const empty = await api.post(`/business/${org.id}/bookings`, { ...stay(), model: 'NET', guestName: 'Rahul Bose', guestPhone: '9811122233' }, agent);
    expect(empty.status, JSON.stringify(empty.data)).to.equal(402);
    expect((await api.post(`/admin/organisations/${org.id}/ledger`, { type: 'PAYMENT', amount: 200000, note: 'NEFT UTR 5566778899', reference: `UTR-${tag}` }, admin)).status).to.equal(200);
    expect((await api.post(`/business/${org.id}/bookings`, { ...stay(), model: 'NET', guestName: 'R', guestPhone: '9811122233' }, agent)).status).to.equal(400);
    const r = await api.post(`/business/${org.id}/bookings`, { ...stay(), model: 'NET', markupPct: 12, guestName: 'Rahul Bose', guestPhone: '9811122233', customerEmail: 'rahul@example.com', clientReference: 'SH-1001' }, agent);
    expect(r.status, JSON.stringify(r.data)).to.equal(201);
    netBooking = r.data.data;
    expect(netBooking).to.include({ status: 'CONFIRMED', paymentStatus: 'PAID', guestName: 'Rahul Bose' });
    expect(netBooking.business).to.include({ model: 'NET', markupPct: 12, clientReference: 'SH-1001', customerEmail: 'rahul@example.com' });
    const b = await prisma.booking.findUnique({ where: { id: netBooking.id } });
    expect(b).to.include({ channel: 'AGENCY', organisationId: org.id, guestEmail: agentUser.email, guestCompanyName: org.legalName });
    const acc = (await api.get(`/business/${org.id}/account`, agent)).data.data;
    expect(acc.entries.find((e) => e.type === 'BOOKING' && e.bookingId === netBooking.id).amount).to.equal(-netBooking.total);
    expect(acc.summary.balance).to.equal(200000 - netBooking.total);
  });

  it('the voucher carries the agency\'s name and the agent\'s reference', async () => {
    await api.put(`/business/${org.id}/branding`, { name: 'Sunrise Holidays', phone: '+91 98300 12345' }, agent);
    const pdf = await api.get(`/business/${org.id}/bookings/${netBooking.id}/voucher?price=SELL`, { ...agent, responseType: 'arraybuffer' });
    expect(pdf.status).to.equal(200);
    expect(Buffer.from(pdf.data).subarray(0, 4).toString()).to.equal('%PDF');
    const html = agencyVoucherHtml(await loadVoucherData(netBooking.id), { agency: { name: 'Sunrise Holidays', phone: '+91 98300 12345' }, price: 'SELL' });
    expect(html).to.include('Sunrise Holidays').and.include('SH-1001').and.include(netBooking.business.sellAmount.toLocaleString('en-IN'));
    expect(html).not.to.include('Zivo<span>Plus</span>');
    expect(html, 'no ZivoPlus anywhere on the white-label voucher').not.to.match(/ZivoPlus/);
  });

  it('a held booking is paid later from the account; cancelling refunds the account', async () => {
    const h = await api.post(`/business/${org.id}/bookings`, { ...stay({ checkIn: inDays(60), checkOut: inDays(61) }), model: 'NET', guestName: 'Meena Das', guestPhone: '9811100000', hold: true }, agent);
    expect(h.status, JSON.stringify(h.data)).to.equal(201);
    expect(h.data.data.status).to.equal('PENDING');
    expect(new Date(h.data.data.heldUntil) > new Date()).to.equal(true);
    const before = (await api.get(`/business/${org.id}/account`, agent)).data.data.summary.balance;
    const p = await api.post(`/business/${org.id}/bookings/${h.data.data.id}/pay`, {}, agent);
    expect(p.status, JSON.stringify(p.data)).to.equal(200);
    expect(p.data.data.status).to.equal('CONFIRMED');
    expect((await api.post(`/business/${org.id}/bookings/${h.data.data.id}/pay`, {}, agent)).status).to.equal(409);
    const c = await api.post(`/business/${org.id}/bookings/${h.data.data.id}/cancel`, {}, agent);
    expect(c.status, JSON.stringify(c.data)).to.equal(200);
    expect(c.data.data.status).to.equal('CANCELLED');
    const acc = (await api.get(`/business/${org.id}/account`, agent)).data.data;
    const refund = acc.entries.find((e) => e.type === 'REFUND' && e.bookingId === h.data.data.id);
    expect(refund, 'refund to the account').to.exist;
    expect(refund.amount).to.equal(c.data.data.refund);
    expect(acc.summary.balance).to.equal(before - p.data.data.total + c.data.data.refund);
  });

  it('commission: public price; at check-out the agency is credited less TDS and the hotel funds its part', async () => {
    const r = await api.post(`/business/${org.id}/bookings`, { ...stay({ checkIn: inDays(70), checkOut: inDays(72) }), model: 'COMMISSION', guestName: 'Anil Sen', guestPhone: '9811133344' }, agent);
    expect(r.status, JSON.stringify(r.data)).to.equal(201);
    const bp = r.data.data.business;
    expect(bp).to.include({ model: 'COMMISSION', commissionPct: 12, tdsPct: 2 });
    expect(r.data.data.total).to.equal(bp.publicAmount);
    expect(bp.hotelFundedCommission + bp.zivoFundedCommission).to.equal(bp.commissionAmount);
    await transitionBookingStatus(r.data.data.id, 'CHECKED_IN', (await prisma.user.findUnique({ where: { email: 'admin@zivoplus.com' } })).id);
    await transitionBookingStatus(r.data.data.id, 'COMPLETED', (await prisma.user.findUnique({ where: { email: 'admin@zivoplus.com' } })).id);
    const s = await prisma.settlement.findUnique({ where: { bookingId: r.data.data.id } });
    expect(Number(s.agentCommissionAmount)).to.equal(bp.hotelFundedCommission);
    const entries = (await api.get(`/business/${org.id}/account`, agent)).data.data.entries.filter((e) => e.bookingId === r.data.data.id);
    expect(entries.find((e) => e.type === 'COMMISSION').amount).to.equal(bp.commissionAmount);
    expect(entries.find((e) => e.type === 'TDS').amount).to.equal(-bp.tdsAmount);
    const st = (await api.get(`/business/${org.id}/commission`, agent)).data.data;
    expect(st.totals).to.include({ commission: bp.commissionAmount, tds: bp.tdsAmount, net: bp.commissionAmount - bp.tdsAmount });
  });

  it('other accounts can\'t see or book for this agency', async () => {
    const outsider = await login('user@zivoplus.com', process.env.SEED_CUSTOMER_PASSWORD || 'customer123');
    expect((await api.get(`/business/${org.id}/bookings`, outsider)).status).to.equal(404);
    expect((await api.post(`/business/${org.id}/quote`, stay(), outsider)).status).to.equal(404);
    expect((await api.get(`/business/${org.id}/bookings/${netBooking.id}/voucher`, outsider)).status).to.equal(404);
  });
});
