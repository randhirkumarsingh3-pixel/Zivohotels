/**
 * Security protections end to end against a running API:
 * - 5 wrong passwords pause password sign-in for that account (even with the right password),
 *   the person is told, and a password reset lifts it; weak passwords are refused on reset/invite
 * - staff sessions last 12 hours
 * - uploads: SVG and fake images are refused; stored photos are served as files that can't run code
 * - a hotel team can't see or change another hotel's photos
 * - the browser report address for blocked content accepts reports
 * Accounts and the hotel created here are removed afterwards.
 */
import crypto from 'crypto';
import axios from 'axios';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import sharp from 'sharp';
import { expect } from 'chai';
import minimist from 'minimist';
import prisma from '../../config/db.js';

const argv = minimist(process.argv.slice(2));
const BASE = argv.url || process.env.E2E_URL || 'http://localhost:5000';
const api = axios.create({ baseURL: `${BASE}/api/v1`, validateStatus: () => true });
const n = Date.now() % 1e8;
const sha = (t) => crypto.createHash('sha256').update(t).digest('hex');
const auth = (token) => ({ headers: { Authorization: `Bearer ${token}` } });
const login = (email, password) => api.post('/auth/login', { email, password });

describe('Security protections', function () {
  this.timeout(60000);
  const made = { users: [], hotels: [], images: [] };
  const guestEmail = `lock.${n}@example.com`;
  const guestPassword = 'Lantern-Orbit-77';

  before(async () => {
    const u = await prisma.user.create({ data: { email: guestEmail, name: 'Lock Test', role: 'CUSTOMER', status: 'ACTIVE', password: await bcrypt.hash(guestPassword, 12) } });
    made.users.push(u.id);
  });

  after(async () => {
    if (made.images.length) await prisma.hotelImage.deleteMany({ where: { id: { in: made.images } } }).catch(() => {});
    if (made.hotels.length) await prisma.hotel.deleteMany({ where: { id: { in: made.hotels } } }).catch(() => {});
    for (const id of made.users) {
      await prisma.userNotification.deleteMany({ where: { userId: id } }).catch(() => {});
      // Audit and security log rows are append-only: they stay (they record what the test did)
      await prisma.user.delete({ where: { id } }).catch(() => {});
    }
  });

  it('pauses password sign-in after 5 wrong passwords, even with the right one', async () => {
    for (let i = 1; i <= 5; i++) {
      const r = await login(guestEmail, `wrong-password-${i}`);
      expect(r.status, `attempt ${i}`).to.equal(401);
    }
    const r = await login(guestEmail, guestPassword);
    expect(r.status).to.equal(429);
    expect(r.data.code).to.equal('ACCOUNT_LOCKED');
    const log = await prisma.securityLog.findFirst({ where: { userId: made.users[0], type: 'ACCOUNT_LOCKED' } });
    expect(log, 'security log entry').to.exist;
    const bell = await prisma.userNotification.findFirst({ where: { userId: made.users[0], title: { contains: 'Sign-in paused' } } });
    expect(bell, 'the person is told').to.exist;
  });

  it('refuses a weak new password on reset, and a reset lifts the pause', async () => {
    const token = crypto.randomBytes(24).toString('hex');
    await prisma.user.update({ where: { email: guestEmail }, data: { passwordResetToken: sha(token), passwordResetExpiry: new Date(Date.now() + 3600000) } });
    const weak = await api.post('/auth/reset-password', { token, password: 'password123' });
    expect(weak.status).to.equal(422);
    const mine = await api.post('/auth/reset-password', { token, password: `lock.${n}-secret` });
    expect(mine.status, 'password built from the email').to.equal(422);
    const ok = await api.post('/auth/reset-password', { token, password: 'Copper-Harbour-58' });
    expect(ok.status, JSON.stringify(ok.data)).to.equal(200);
    expect((await login(guestEmail, 'Copper-Harbour-58')).status).to.equal(200);
  });

  it('refuses a weak password when accepting an invite (10 characters for teams)', async () => {
    const email = `invite.${n}@example.com`;
    const token = crypto.randomBytes(16).toString('hex');
    const u = await prisma.user.create({ data: { email, name: 'Invite Test', role: 'OWNER', status: 'INVITED', password: await bcrypt.hash(crypto.randomBytes(12).toString('hex'), 4), inviteToken: sha(token), inviteExpiry: new Date(Date.now() + 3600000) } });
    made.users.push(u.id);
    expect((await api.post('/users/accept-invite', { token, password: 'Short#9x' })).status).to.equal(422);
    expect((await api.post('/users/accept-invite', { token, password: 'qwerty2026' })).status).to.equal(422);
    const ok = await api.post('/users/accept-invite', { token, password: 'Saffron-Window-31' });
    expect(ok.status, JSON.stringify(ok.data)).to.equal(200);
  });

  it('gives staff sessions 12 hours', async () => {
    const r = await login('admin@zivoplus.com', 'admin123');
    expect(r.status).to.equal(200);
    const { iat, exp } = jwt.decode(r.data.data.token);
    expect(exp - iat).to.equal(12 * 3600);
  });

  describe('photos', () => {
    let owner; let hotelId; let otherOwner; let otherHotelId;
    before(async () => {
      const o = await login('extranet@zivotechretreat.com', 'ZivoExtranet@2026');
      owner = o.data.data.token;
      const ownerId = o.data.data.user.id;
      hotelId = (await prisma.hotel.findFirst({ where: { ownerId, isDeleted: false }, select: { id: true } })).id;
      // A second hotel company with its own property
      const email = `owner2.${n}@example.com`;
      const u = await prisma.user.create({ data: { email, name: 'Other Owner', role: 'OWNER', status: 'ACTIVE', password: await bcrypt.hash('Granite-Meadow-64', 12) } });
      made.users.push(u.id);
      const src = await prisma.hotel.findUnique({ where: { id: hotelId } });
      const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = src;
      const copy = Object.fromEntries(Object.entries(rest).filter(([k, v]) => v !== null && !/slug/i.test(k)));
      const h = await prisma.hotel.create({ data: { ...copy, name: `Other Hotel ${n}`, ownerId: u.id } });
      made.hotels.push(h.id);
      otherHotelId = h.id;
      otherOwner = (await login(email, 'Granite-Meadow-64')).data.data.token;
    });

    it('refuses SVG and files that only claim to be images', async () => {
      const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(document.cookie)"/>').toString('base64');
      const r1 = await api.post('/admin/images', { hotelId, image: `data:image/svg+xml;base64,${svg}` }, auth(owner));
      expect(r1.status).to.equal(400);
      const html = Buffer.from('<script>alert(1)</script>').toString('base64');
      const r2 = await api.post('/admin/images', { hotelId, image: `data:image/png;base64,${html}` }, auth(owner));
      expect(r2.status).to.equal(400);
      const r3 = await api.post('/admin/images', { hotelId, url: 'javascript:alert(1)' }, auth(owner));
      expect(r3.status).to.equal(422);
    });

    it('stores real photos re-encoded and serves them as inert files', async () => {
      const png = await sharp({ create: { width: 30, height: 20, channels: 3, background: '#2a6' } }).png().toBuffer();
      const r = await api.post('/admin/images', { hotelId, image: `data:image/png;base64,${png.toString('base64')}` }, auth(owner));
      expect(r.status, JSON.stringify(r.data)).to.equal(201);
      made.images.push(r.data.data.id);
      const url = r.data.data.url;
      if (url.startsWith('/uploads/')) {
        const f = await axios.get(`${BASE}${url}`, { validateStatus: () => true, responseType: 'arraybuffer' });
        expect(f.status).to.equal(200);
        expect(f.headers['content-security-policy']).to.include('sandbox');
        expect(f.headers['x-content-type-options']).to.equal('nosniff');
      }
    });

    it("keeps one hotel team out of another hotel's photos", async () => {
      const add = await api.post('/admin/images', { hotelId, url: 'https://example.com/photo.jpg' }, auth(otherOwner));
      expect(add.status).to.equal(404);
      const list = await api.get(`/admin/images?hotelId=${hotelId}`, auth(otherOwner));
      expect(list.status).to.equal(404);
      const edit = await api.patch(`/admin/images/${made.images[0]}`, { isPrimary: true }, auth(otherOwner));
      expect(edit.status).to.equal(404);
      const del = await api.delete(`/admin/images/${made.images[0]}`, auth(otherOwner));
      expect(del.status).to.equal(404);
      expect(await prisma.hotelImage.findUnique({ where: { id: made.images[0] } })).to.exist;
      // Their own hotel still works
      const own = await api.get(`/admin/images?hotelId=${otherHotelId}`, auth(otherOwner));
      expect(own.status).to.equal(200);
    });
  });

  it('accepts browser reports of blocked content', async () => {
    const r = await axios.post(`${BASE}/api/v1/security/csp-report`,
      JSON.stringify({ 'csp-report': { 'document-uri': `https://zivoplus.com/e2e-${n}`, 'blocked-uri': 'https://evil.example/x.js', 'effective-directive': 'script-src-elem' } }),
      { headers: { 'Content-Type': 'application/csp-report' }, validateStatus: () => true });
    expect(r.status).to.equal(204);
  });
});
