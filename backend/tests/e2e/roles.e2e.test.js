/**
 * Staff roles end to end against a running API (sample data from prisma/seed.js):
 * a Super Admin invites a Support Agent who can see bookings but not settings, staff or finance;
 * the hotel owner invites Front Desk staff who can see bookings but not change rates, property
 * details, the team or finance, and promotes them; the rules against self-changes and guest emails.
 * People and roles created here are removed afterwards.
 */
import crypto from 'crypto';
import axios from 'axios';
import { expect } from 'chai';
import minimist from 'minimist';
import prisma from '../../config/db.js';

const argv = minimist(process.argv.slice(2));
const API = `${argv.url || process.env.E2E_URL || 'http://localhost:5000'}/api/v1`;
const api = axios.create({ baseURL: API, validateStatus: () => true });
const n = Date.now() % 1e8;

const login = async (email, password) => {
  const r = await api.post('/auth/login', { email, password });
  expect(r.status, `${email}: ${JSON.stringify(r.data)}`).to.equal(200);
  return { headers: { Authorization: `Bearer ${r.data.data.token}` } };
};
// Accept an invite with a token we set (the real one is only in the email)
const acceptAs = async (email, password) => {
  const token = crypto.randomBytes(16).toString('hex');
  await prisma.user.update({ where: { email }, data: { inviteToken: crypto.createHash('sha256').update(token).digest('hex'), inviteExpiry: new Date(Date.now() + 3600000) } });
  const r = await api.post('/users/accept-invite', { token, password });
  expect(r.status, JSON.stringify(r.data)).to.equal(200);
  return login(email, password);
};

describe('Staff roles end to end', function () {
  this.timeout(30000);
  const emails = [`agent${n}@zivo.test`, `desk${n}@hotel.test`];
  let admin; let owner; let team; let hotelTeam;

  before(async () => {
    admin = await login('admin@zivoplus.com', process.env.SEED_ADMIN_PASSWORD || 'admin123');
    owner = await login('extranet@zivotechretreat.com', process.env.SEED_OWNER_PASSWORD || 'ZivoExtranet@2026');
  });
  after(async () => {
    await prisma.user.deleteMany({ where: { email: { in: emails } } });
  });

  it('gives existing admins the Super Admin role and lists the ready-made roles', async () => {
    team = (await api.get('/admin/staff', admin)).data.data;
    expect(team.roles.map((r) => r.key)).to.include.members(['admin.super', 'admin.operations', 'admin.finance', 'admin.support', 'admin.content', 'admin.viewer']);
    const me = (await api.get('/auth/me', admin)).data.data.user.access;
    expect(me.isSuperAdmin).to.equal(true);
  });

  it('lets a Support Agent see bookings but not settings, staff or finance', async () => {
    const support = team.roles.find((r) => r.key === 'admin.support');
    const r = await api.post('/admin/staff/invite', { email: emails[0], name: 'Asha Agent', roleId: support.id }, admin);
    expect(r.status, JSON.stringify(r.data)).to.equal(200);
    const agent = await acceptAs(emails[0], 'Agent@2026pass');
    expect((await api.get('/admin/bookings?page=1&limit=5', agent)).status).to.not.equal(403);
    expect((await api.put('/admin/system/config', { x: 1 }, agent)).status).to.equal(403);
    expect((await api.get('/admin/staff', agent)).status).to.equal(403);
    expect((await api.get('/finance/dashboard', agent)).status).to.equal(403);
    expect((await api.post('/admin/staff/invite', { email: `x${n}@zivo.test`, name: 'X', roleId: support.id }, agent)).status).to.equal(403);
  });

  it('refuses guest emails as staff and changes to one\'s own access', async () => {
    const support = team.roles.find((r) => r.key === 'admin.support');
    expect((await api.post('/admin/staff/invite', { email: 'user@zivoplus.com', name: 'U', roleId: support.id }, admin)).status).to.equal(400);
    const meRow = team.members.find((m) => m.user.email === 'admin@zivoplus.com');
    expect((await api.patch(`/admin/staff/${meRow.id}`, { roleId: support.id }, admin)).status).to.equal(403);
  });

  it('lets a hotel owner give Front Desk staff bookings only, then promote them', async () => {
    hotelTeam = (await api.get('/extranet/team', owner)).data.data;
    const fd = hotelTeam.roles.find((x) => x.key === 'extranet.frontdesk');
    const r = await api.post('/extranet/team/invite', { email: emails[1], name: 'Ravi Desk', roleId: fd.id }, owner);
    expect(r.status, JSON.stringify(r.data)).to.equal(200);
    const desk = await acceptAs(emails[1], 'Desk@2026pass');
    expect((await api.get('/extranet/bookings', desk)).status).to.equal(200);
    expect((await api.get('/extranet/rooms', desk)).status).to.equal(200);
    expect((await api.put('/extranet/property', { name: 'X' }, desk)).status).to.equal(403);
    expect((await api.post('/admin/rate-plans', { roomTypeId: 'x', name: 'X', basePrice: 100 }, desk)).status).to.equal(403);
    expect((await api.get('/extranet/team', desk)).status).to.equal(403);
    expect((await api.get('/extranet/finance/overview', desk)).status).to.equal(403);
    expect((await api.get('/admin/users', desk)).status).to.equal(403);

    const member = (await api.get('/extranet/team', owner)).data.data.members.find((m) => m.user.email === emails[1]);
    const manager = hotelTeam.roles.find((x) => x.key === 'extranet.manager');
    expect((await api.patch(`/extranet/team/${member.id}`, { roleId: manager.id }, owner)).status).to.equal(200);
    expect((await api.get('/extranet/finance/overview', desk)).status).to.equal(200);
    // Paused: nothing works any more
    expect((await api.patch(`/extranet/team/${member.id}`, { status: 'PAUSED' }, owner)).status).to.equal(200);
    expect((await api.get('/extranet/bookings', desk)).status).to.equal(403);
  });
});
