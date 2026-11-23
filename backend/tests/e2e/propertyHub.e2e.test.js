/**
 * Extranet property hub: the header details, guest rating and content score of a property, and
 * that saving changes to an approved or live property never sends it back to review.
 */
import axios from 'axios';
import { expect } from 'chai';
import minimist from 'minimist';
import prisma from '../../config/db.js';

const argv = minimist(process.argv.slice(2));
const API = `${argv.url || process.env.E2E_URL || 'http://localhost:5000'}/api/v1`;
const api = axios.create({ baseURL: API, validateStatus: () => true });

describe('Extranet property hub', function () {
  this.timeout(30000);
  let auth; let hotelId; let savedStatus;

  before(async () => {
    const r = await api.post('/auth/login', { email: 'extranet@zivotechretreat.com', password: 'ZivoExtranet@2026' });
    expect(r.status).to.equal(200);
    auth = { headers: { Authorization: `Bearer ${r.data.data.token}` } };
    const h = await prisma.hotel.findFirst({ where: { ownerId: r.data.data.user.id, isDeleted: false }, select: { id: true, status: true } });
    hotelId = h.id; savedStatus = h.status;
  });
  after(async () => { if (hotelId) await prisma.hotel.update({ where: { id: hotelId }, data: { status: savedStatus } }); });

  it('gives the header details and a content score out of 100 by section', async () => {
    const r = await api.get(`/extranet/property/overview?hotelId=${hotelId}`, auth);
    expect(r.status, JSON.stringify(r.data)).to.equal(200);
    const { hotel, rating, content } = r.data.data;
    expect(hotel.id).to.equal(hotelId);
    expect(hotel.name).to.be.a('string');
    expect(rating).to.have.keys('score', 'count');
    expect(content.score).to.be.within(0, 100);
    expect(content.sections.map((s) => s.key)).to.deep.equal(['basics', 'location', 'amenities', 'rooms', 'photos', 'policies']);
    expect(content.sections.reduce((t, s) => t + s.max, 0)).to.equal(100);
    for (const n of content.nextSteps) expect(n.tip).to.be.a('string');
  });

  it("refuses another hotel company's property", async () => {
    const other = await prisma.hotel.findFirst({ where: { id: { not: hotelId }, owner: { email: { not: 'extranet@zivotechretreat.com' } } }, select: { id: true } });
    if (!other) return;
    const r = await api.get(`/extranet/property/overview?hotelId=${other.id}`, auth);
    expect(r.status).to.be.oneOf([403, 404]);
  });

  it('never sends a live property back to review when changes are saved', async () => {
    await prisma.hotel.update({ where: { id: hotelId }, data: { status: 'LIVE' } });
    const r = await api.post(`/extranet/onboarding/${hotelId}/submit`, {}, auth);
    expect(r.status).to.equal(409);
    expect(r.data.code).to.equal('ALREADY_APPROVED');
    expect((await prisma.hotel.findUnique({ where: { id: hotelId }, select: { status: true } })).status).to.equal('LIVE');
  });
});
