/**
 * End-to-end sign-up and sign-in against a running API (PR Validation runs it after the
 * booking test). Needs codes in test mode, so the API shows them instead of sending:
 * EMAIL_TEST_MODE=true and SMS_PROVIDER unset/test. And AUTH_RATE_LIMIT_PER_15_MIN raised.
 *
 * Covers: sign-up with a code to the email and the phone, a wrong code, the session cookie,
 * the welcome notification, signing in with a code (phone) and with a password (phone or email),
 * duplicate email / phone, and "sign out of all devices".
 */
import axios from 'axios';
import { expect } from 'chai';
import minimist from 'minimist';
import prisma from '../../config/db.js';

const argv = minimist(process.argv.slice(2));
const API = `${argv.url || process.env.E2E_URL || 'http://localhost:5000'}/api/v1`;
const api = axios.create({ baseURL: API, validateStatus: () => true });
const cookieOf = (res) => (res.headers['set-cookie'] || []).map((c) => c.split(';')[0]).find((c) => c.startsWith('zivo_session=')) || '';

describe('Sign-up and sign-in end to end', function () {
  this.timeout(30000);
  const n = String(Date.now()).slice(-8);
  const person = { name: 'Test Guest', email: `e2e.${n}@example.com`, phone: `9${n.padStart(9, '7')}`.slice(0, 10), password: 'secret-pass-1' };
  let cookie;

  after(async () => {
    const u = await prisma.user.findUnique({ where: { email: person.email } });
    if (u) {
      await prisma.userNotification.deleteMany({ where: { userId: u.id } });
      await prisma.loyaltyWallet.deleteMany({ where: { userId: u.id } }).catch(() => {});
    }
  });

  it('refuses sign-up without the codes', async () => {
    const r = await api.post('/auth/signup', { name: person.name, email: person.email, password: person.password });
    expect(r.status).to.equal(422);
  });

  it('signs up with a code to the email and one to the phone', async () => {
    const start = await api.post('/auth/signup/start', person);
    expect(start.status, JSON.stringify(start.data)).to.equal(200);
    const emailCode = start.data.data.email.testCode;
    const phoneCode = start.data.data.sms.testCode;
    expect(emailCode, 'EMAIL_TEST_MODE=true is needed').to.match(/^\d{6}$/);
    expect(phoneCode).to.match(/^\d{6}$/);

    const wrong = await api.post('/auth/signup', { ...person, emailCode, phoneCode: phoneCode === '000000' ? '111111' : '000000' });
    expect(wrong.status).to.equal(400);
    expect(wrong.data.message).to.match(/^Mobile code:/);

    const ok = await api.post('/auth/signup', { ...person, emailCode, phoneCode });
    expect(ok.status, JSON.stringify(ok.data)).to.equal(201);
    const u = ok.data.data.user;
    expect(u.role).to.equal('CUSTOMER');
    expect(u.emailVerified).to.equal(true);
    expect(u.phoneVerified).to.equal(true);
    expect(u.phone).to.equal(`+91${person.phone}`);
    cookie = cookieOf(ok);
    expect(cookie, 'session cookie').to.not.equal('');
  });

  it('is signed in by the cookie and has the welcome notification', async () => {
    const me = await api.get('/auth/me', { headers: { Cookie: cookie } });
    expect(me.status).to.equal(200);
    expect(me.data.data.user.email).to.equal(person.email);
    const notes = await api.get('/notifications', { headers: { Cookie: cookie } });
    expect(notes.data.data.items.map((x) => x.type)).to.include('WELCOME');
    expect(notes.data.data.unread).to.be.greaterThan(0);
    const read = await api.put('/notifications/read', {}, { headers: { Cookie: cookie, Origin: 'http://localhost:5173' } });
    expect(read.status).to.equal(200);
    expect((await api.get('/notifications', { headers: { Cookie: cookie } })).data.data.unread).to.equal(0);
  });

  it('refuses a second account with the same email or phone', async () => {
    const sameEmail = await api.post('/auth/signup/start', { ...person, phone: '9123456780' });
    expect(sameEmail.status).to.equal(409);
    const samePhone = await api.post('/auth/signup/start', { ...person, email: `other.${n}@example.com` });
    expect(samePhone.status).to.equal(409);
  });

  it('signs in with a code sent to the phone', async () => {
    const send = await api.post('/auth/login/code', { identifier: person.phone });
    expect(send.status).to.equal(200);
    expect(send.data.data.channel).to.equal('SMS');
    const bad = await api.post('/auth/login/code/verify', { identifier: person.phone, code: '000000' === send.data.data.testCode ? '111111' : '000000' });
    expect(bad.status).to.equal(400);
    const ok = await api.post('/auth/login/code/verify', { identifier: person.phone, code: send.data.data.testCode });
    expect(ok.status).to.equal(200);
    expect(cookieOf(ok)).to.not.equal('');
    const again = await api.post('/auth/login/code/verify', { identifier: person.phone, code: send.data.data.testCode });
    expect(again.status, 'a code works once').to.equal(400);
  });

  it('signs in with a password, by phone or email', async () => {
    expect((await api.post('/auth/login', { email: person.phone, password: person.password })).status).to.equal(200);
    const byEmail = await api.post('/auth/login', { email: person.email.toUpperCase(), password: person.password });
    expect(byEmail.status).to.equal(200);
    const wrong = await api.post('/auth/login', { email: person.email, password: 'nope-nope' });
    expect(wrong.status).to.equal(401);
    expect(wrong.data.message).to.match(/Wrong email, mobile number or password/);
    cookie = cookieOf(byEmail);
  });

  it('signs out of every device', async () => {
    const out = await api.post('/auth/logout-all', {}, { headers: { Cookie: cookie, Origin: 'http://localhost:5173' } });
    expect(out.status).to.equal(200);
    expect((await api.get('/auth/me', { headers: { Cookie: cookie } })).status).to.equal(401);
  });
});
