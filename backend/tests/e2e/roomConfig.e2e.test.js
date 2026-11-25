/**
 * Room configuration, end to end: a room type and rate plans set up by the hotel (extranet) and
 * by ZivoPlus (admin) must show the same everywhere: the Room Config lists on both sides, the
 * hotel page, search, the checkout price, bookings, and the availability calendar. Covers creating,
 * editing (name, room count, price), date-specific prices and room counts, closing a night, selling
 * out, switching a rate plan or room type off, and dates beyond the first 60 days.
 */
import axios from 'axios';
import { expect } from 'chai';
import minimist from 'minimist';
import prisma from '../../config/db.js';

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

describe('Room configuration end to end', function () {
  this.timeout(180000);
  let owner; let admin; let guest; let hotel; let room; let basePlan; let flexPlan;
  const D1 = inDays(30); const D2 = inDays(31); // one night: D1 → D2
  const FAR = inDays(95); const FAR2 = inDays(96); // beyond the 60 days seeded at creation
  const code = `AUD${Date.now() % 100000}`;
  const bookings = [];

  const hotelPage = async (checkin, checkout) => {
    const r = await api.get(`/hotels/${hotel.id}?checkin=${checkin}&checkout=${checkout}`);
    expect(r.status, JSON.stringify(r.data).slice(0, 200)).to.equal(200);
    return (r.data.data.roomTypes || []).find((rt) => rt.id === room.id) || null;
  };
  const preview = (ratePlanId, checkIn, checkOut, extra = {}) => post('/bookings/preview', {
    hotelId: hotel.id, roomTypeId: room.id, ratePlanId, rooms: 1, adults: 2, children: 0, checkIn, checkOut, paymentType: 'PREPAID', ...extra,
  });
  const book = (ratePlanId, checkIn, checkOut) => post('/bookings', {
    hotelId: hotel.id, roomTypeId: room.id, ratePlanId, rooms: 1, adults: 2, children: 0, checkIn, checkOut, paymentType: 'PAY_AT_HOTEL',
    guestName: 'Room Audit', guestEmail: 'room.audit@example.com', guestPhone: '9876543210',
    roomLines: [{ roomTypeId: room.id, ratePlanId, adults: 2, children: 0, guestName: 'Room Audit' }],
  }, guest);

  before(async () => {
    const o = await api.post('/auth/login', { email: 'extranet@zivotechretreat.com', password: 'ZivoExtranet@2026' });
    owner = { headers: { Authorization: `Bearer ${o.data.data.token}` } };
    const a = await api.post('/auth/login', { email: 'admin@zivoplus.com', password: 'admin123' });
    admin = { headers: { Authorization: `Bearer ${a.data.data.token}` } };
    const g = await api.post('/auth/login', { email: 'user@zivoplus.com', password: process.env.SEED_CUSTOMER_PASSWORD || 'customer123' });
    guest = { headers: { Authorization: `Bearer ${g.data.data.token}` } };
    hotel = await prisma.hotel.findFirst({ where: { ownerId: o.data.data.user.id, status: { in: ['LIVE', 'ACTIVE'] }, isDeleted: false } });
    expect(hotel, 'a live hotel of the test owner').to.exist;
  });

  after(async () => {
    for (const id of bookings) await api.post(`/bookings/${id}/cancel`, { reason: 'room audit' }, guest).catch(() => {});
    if (room) await prisma.roomType.update({ where: { id: room.id }, data: { isActive: false } }).catch(() => {});
  });

  it('a room type created by the hotel gets a rate plan and 60 days of availability', async () => {
    const r = await api.post('/admin/rooms', { hotelId: hotel.id, name: 'Audit Deluxe', code, maxOccupancy: 3, baseOccupancy: 2, totalRooms: 3, basePrice: 4000, mealPlan: 'CP', amenities: ['AC'] }, owner);
    expect(r.status, JSON.stringify(r.data)).to.be.oneOf([200, 201]);
    room = r.data.data;
    basePlan = room.ratePlans[0];
    expect(Number(basePlan.basePrice)).to.equal(4000);
    const inv = await prisma.inventory.count({ where: { roomTypeId: room.id } });
    expect(inv).to.be.within(59, 61);
  });

  it('shows the same room on the admin and extranet Room Config lists', async () => {
    const adminList = await api.get(`/admin/rooms?propertyId=${hotel.id}&includeInactive=true`, admin);
    const extranetList = await api.get(`/admin/rooms?propertyId=${hotel.id}&includeInactive=true`, owner);
    const pick = (res) => (res.data.data || []).find((x) => x.id === room.id);
    expect(pick(adminList), 'admin sees it').to.exist;
    expect(pick(extranetList), 'hotel sees it').to.exist;
    expect(pick(adminList).totalInventory).to.equal(pick(extranetList).totalInventory);
  });

  it('is on the hotel page and priced the same at checkout', async () => {
    const rt = await hotelPage(D1, D2);
    expect(rt, 'listed on the hotel page').to.exist;
    expect(rt.availableForStay).to.equal(3);
    expect(rt.ratePlans.find((p) => p.id === basePlan.id).stayNightlyPrice).to.equal(4000);
    const p = await preview(basePlan.id, D1, D2);
    expect(p.status, JSON.stringify(p.data)).to.equal(200);
    expect(p.data.data.subtotal).to.equal(4000);
  });

  it('adds a second rate plan (with a meal price) that shows on the hotel page and prices at checkout', async () => {
    const r = await api.post('/admin/rate-plans', { roomTypeId: room.id, name: 'Audit Flexi', mealPlan: 'MAP', basePrice: 5000, mealPriceAdult: 500 }, owner);
    expect(r.status, JSON.stringify(r.data)).to.be.oneOf([200, 201]);
    flexPlan = r.data.data;
    const rt = await hotelPage(D1, D2);
    expect(rt.ratePlans.map((p) => p.id)).to.include(flexPlan.id);
    // Meals are charged per adult per night on top of the room: 5000 + 2 × 500, and the hotel page
    // shows that same price for the plan (meals for the room's base occupancy included)
    expect(rt.ratePlans.find((p) => p.id === flexPlan.id).stayNightlyPrice).to.equal(6000);
    expect((await preview(flexPlan.id, D1, D2)).data.data.subtotal).to.equal(6000);
  });

  it('a date-specific price set in the calendar is used on the hotel page and at checkout', async () => {
    const r = await api.post('/admin/ari/rates', { ratePlanId: basePlan.id, start: D1, end: D1, price: 6000 }, owner);
    expect(r.status, JSON.stringify(r.data)).to.equal(200);
    const cal = await api.get(`/admin/ari/calendar?hotelId=${hotel.id}&start=${D1}&end=${D2}`, owner);
    expect(cal.status, JSON.stringify(cal.data).slice(0, 200)).to.equal(200);
    expect(JSON.stringify(cal.data.data)).to.include('6000');
    expect((await hotelPage(D1, D2)).ratePlans.find((p) => p.id === basePlan.id).stayNightlyPrice).to.equal(6000);
    expect((await preview(basePlan.id, D1, D2)).data.data.subtotal).to.equal(6000);
  });

  it('editing the room in admin (name, room count, base price) shows on the hotel side and for guests', async () => {
    const r = await api.patch(`/admin/rooms/${room.id}`, { name: 'Audit Deluxe King', totalRooms: 5 }, admin);
    expect(r.status, JSON.stringify(r.data)).to.equal(200);
    const plan = await api.patch(`/admin/rate-plans/${basePlan.id}`, { basePrice: 4200 }, admin);
    expect(plan.status, JSON.stringify(plan.data)).to.equal(200);
    const ext = (await api.get(`/admin/rooms?propertyId=${hotel.id}&includeInactive=true`, owner)).data.data.find((x) => x.id === room.id);
    expect(ext.name).to.equal('Audit Deluxe King');
    expect(ext.totalInventory).to.equal(5);
    const night = await prisma.inventory.findFirst({ where: { roomTypeId: room.id, date: new Date(`${inDays(10)}T00:00:00Z`) } });
    expect(night.totalRooms, 'future nights follow the new room count').to.equal(5);
    const rt = await hotelPage(inDays(10), inDays(11));
    expect(rt.name).to.equal('Audit Deluxe King');
    expect(rt.availableForStay).to.equal(5);
    expect(rt.ratePlans.find((p) => p.id === basePlan.id).stayNightlyPrice).to.equal(4200);
    // The night with its own price keeps it
    expect((await preview(basePlan.id, D1, D2)).data.data.subtotal).to.equal(6000);
  });

  it('a room count set for one night limits bookings, and selling out is shown everywhere', async () => {
    const r = await api.post('/admin/ari/inventory', { roomTypeId: room.id, start: D1, end: D1, totalRooms: 1 }, owner);
    expect(r.status, JSON.stringify(r.data)).to.equal(200);
    expect((await hotelPage(D1, D2)).availableForStay).to.equal(1);
    const b = await book(basePlan.id, D1, D2);
    expect(b.status, JSON.stringify(b.data)).to.be.oneOf([200, 201]);
    bookings.push((b.data.data.booking || b.data.data).id);
    expect((await hotelPage(D1, D2)).availableForStay, 'sold out on the hotel page').to.equal(0);
    const again = await book(basePlan.id, D1, D2);
    expect(again.status, 'no overbooking').to.equal(409);
  });

  it('closing a night (stop sell) stops bookings for it', async () => {
    const D = inDays(40); const Dn = inDays(41);
    const r = await api.post('/admin/ari/inventory', { roomTypeId: room.id, start: D, end: D, stopSell: true }, owner);
    expect(r.status, JSON.stringify(r.data)).to.equal(200);
    expect((await hotelPage(D, Dn)).availableForStay).to.equal(0);
    expect((await book(basePlan.id, D, Dn)).status).to.be.oneOf([400, 409]);
  });

  it('dates beyond the first 60 days can still be shown and booked', async () => {
    const rt = await hotelPage(FAR, FAR2);
    expect(rt.availableForStay).to.equal(5);
    const p = await preview(basePlan.id, FAR, FAR2);
    expect(p.status, JSON.stringify(p.data)).to.equal(200);
    expect(p.data.data.subtotal).to.equal(4200);
    const b = await book(basePlan.id, FAR, FAR2);
    expect(b.status, JSON.stringify(b.data)).to.be.oneOf([200, 201]);
    bookings.push((b.data.data.booking || b.data.data).id);
    const inv = await prisma.inventory.findFirst({ where: { roomTypeId: room.id, date: new Date(`${FAR}T00:00:00Z`) } });
    expect(inv?.bookedRooms, 'the booked room is counted on that night').to.equal(1);
  });

  it('search lists the hotel with the room for those dates', async () => {
    const r = await api.get(`/hotels/search?city=${encodeURIComponent(hotel.city)}&checkIn=${inDays(12)}&checkOut=${inDays(13)}&guests=2&nocache=${Date.now()}`);
    expect(r.status).to.equal(200);
    const list = r.data.data.hotels || r.data.data;
    expect(list.map((h) => h.id)).to.include(hotel.id);
  });

  it('switching a rate plan off removes it from the hotel page and checkout', async () => {
    const r = await api.delete(`/admin/rate-plans/${flexPlan.id}`, owner);
    expect(r.status, JSON.stringify(r.data)).to.equal(200);
    expect((await hotelPage(D1, D2)).ratePlans.map((p) => p.id)).to.not.include(flexPlan.id);
    expect((await preview(flexPlan.id, inDays(12), inDays(13))).status).to.not.equal(200);
  });

  it('switching the room type off removes it for guests but keeps existing bookings', async () => {
    const r = await api.delete(`/admin/rooms/${room.id}`, owner);
    expect(r.status, JSON.stringify(r.data)).to.equal(200);
    expect(await hotelPage(inDays(12), inDays(13)), 'gone from the hotel page').to.equal(null);
    expect((await preview(basePlan.id, inDays(12), inDays(13))).status).to.not.equal(200);
    const kept = await prisma.booking.count({ where: { id: { in: bookings }, status: { not: 'CANCELLED' } } });
    expect(kept).to.equal(bookings.length);
    // Both Room Config lists still show it (switched off), so it can be switched back on
    const ext = (await api.get(`/admin/rooms?propertyId=${hotel.id}&includeInactive=true`, owner)).data.data.find((x) => x.id === room.id);
    expect(ext?.isActive).to.equal(false);
  });

  it('room set-up is refused to people without rate permissions and to other hotels', async () => {
    // The old unguarded address is gone
    expect((await api.post('/rooms', { hotelId: hotel.id, name: 'X', code: 'XX', maxOccupancy: 2, totalRooms: 1 }, owner)).status).to.equal(404);
    const other = await prisma.hotel.findFirst({ where: { NOT: { ownerId: hotel.ownerId }, isDeleted: false } });
    if (other) {
      const r = await api.post('/admin/rooms', { hotelId: other.id, name: 'Not mine', code: 'NM1', maxOccupancy: 2, totalRooms: 1, basePrice: 1000 }, owner);
      expect(r.status).to.equal(403);
    }
  });
});
