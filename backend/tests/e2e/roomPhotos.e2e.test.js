/**
 * Room photos on the hotel page, against a running API: photos linked to a room, and photos only
 * tagged with the room's name in the photo library (never linked), reach guests and staff in the
 * same { url } shape the room card reads. The room's links and the photo's tags are put back.
 */
import axios from 'axios';
import { expect } from 'chai';
import minimist from 'minimist';
import prisma from '../../config/db.js';

const argv = minimist(process.argv.slice(2));
const BASE = argv.url || process.env.E2E_URL || 'http://localhost:5000';
const api = axios.create({ baseURL: `${BASE}/api/v1`, validateStatus: () => true });

describe('Room photos on the hotel page', function () {
  this.timeout(30000);
  let hotel; let room; let photo; let savedLinks; let savedTags; let admin; let tag; let tagged = [];
  const photosOf = async (opts) => {
    const r = await api.get(`/hotels/${hotel.id}`, opts);
    expect(r.status).to.equal(200);
    return r.data.data.roomTypes.find((x) => x.id === room.id).images;
  };

  before(async () => {
    hotel = await prisma.hotel.findFirst({ where: { status: { in: ['LIVE', 'ACTIVE'] }, isDeleted: false, roomTypes: { some: { isActive: true, ratePlans: { some: { isActive: true } } } } }, include: { media: true } });
    room = await prisma.roomType.findFirst({ where: { hotelId: hotel.id, isActive: true, ratePlans: { some: { isActive: true, basePrice: { gt: 0 } } } } });
    photo = hotel.media[0] || await prisma.hotelImage.create({ data: { hotelId: hotel.id, url: '/uploads/room-photo-test.jpg', category: 'ROOM', tags: [] } });
    savedTags = photo.tags || [];
    savedLinks = await prisma.roomTypeImage.findMany({ where: { roomTypeId: room.id } });
    tag = room.name.toUpperCase().trim().replace(/[^A-Z0-9_]+/g, '_');
    // Photos of this hotel already tagged with the room's name, put back afterwards
    tagged = hotel.media.filter((m) => (m.tags || []).includes(tag)).map((m) => ({ id: m.id, tags: m.tags }));
    const r = await api.post('/auth/login', { email: 'admin@zivoplus.com', password: process.env.SEED_ADMIN_PASSWORD || 'admin123' });
    admin = { headers: { Authorization: `Bearer ${r.data.data.token}` } };
  });

  after(async () => {
    await prisma.roomTypeImage.deleteMany({ where: { roomTypeId: room.id } });
    if (savedLinks.length) await prisma.roomTypeImage.createMany({ data: savedLinks.map(({ roomTypeId, imageId, isPrimary }) => ({ roomTypeId, imageId, isPrimary })) });
    await prisma.hotelImage.update({ where: { id: photo.id }, data: { tags: savedTags } });
    for (const m of tagged) await prisma.hotelImage.update({ where: { id: m.id }, data: { tags: m.tags } });
  });

  it('shows photos tagged with the room name when none are linked, to guests and staff', async () => {
    await prisma.roomTypeImage.deleteMany({ where: { roomTypeId: room.id } });
    await prisma.hotelImage.update({ where: { id: photo.id }, data: { tags: [...new Set([...savedTags, tag])] } });
    for (const opts of [{}, admin]) {
      const pics = await photosOf(opts);
      expect(pics.map((p) => p.id)).to.include(photo.id);
      expect(pics[0].url).to.be.a('string').and.not.equal('');
      expect(pics[0].isPrimary).to.equal(true);
    }
  });

  it('shows linked photos to staff in the same shape as to guests', async () => {
    await prisma.hotelImage.update({ where: { id: photo.id }, data: { tags: savedTags } });
    await prisma.roomTypeImage.create({ data: { roomTypeId: room.id, imageId: photo.id, isPrimary: true } });
    const guest = await photosOf({});
    const staff = await photosOf(admin);
    expect(guest).to.have.length(1);
    expect(staff).to.deep.equal(guest);
    expect(staff[0]).to.not.have.property('image');
  });

  it('shows no photos when none are linked or tagged', async () => {
    await prisma.roomTypeImage.deleteMany({ where: { roomTypeId: room.id } });
    for (const m of [...tagged, { id: photo.id, tags: savedTags }]) await prisma.hotelImage.update({ where: { id: m.id }, data: { tags: (m.tags || []).filter((t) => t !== tag) } });
    expect(await photosOf({})).to.deep.equal([]);
  });
});
