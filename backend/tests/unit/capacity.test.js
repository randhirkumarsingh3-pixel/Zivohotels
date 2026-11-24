/** Busy-server answers: a database that is busy or unreachable is a 503, never "signed out". */
import { expect } from 'chai';
import jwt from 'jsonwebtoken';
import { errorHandler } from '../../middleware/errorHandler.js';
import prisma from '../../config/db.js';
import { protect } from '../../middleware/authMiddleware.js';
import bcrypt, { usingNativeBcrypt } from '../../utils/bcrypt.js';

const fakeRes = () => {
  const res = { statusCode: 200, headers: {}, body: null };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  res.set = (k, v) => { res.headers[k] = v; return res; };
  return res;
};

describe('Busy server answers', () => {
  it('turns database pool and connection errors into 503 "try again"', () => {
    for (const code of ['P2024', 'P1001', 'P2028']) {
      const res = fakeRes();
      errorHandler(Object.assign(new Error('x'), { code }), { method: 'GET', originalUrl: '/' }, res, () => {});
      expect(res.statusCode, code).to.equal(503);
      expect(res.body.code).to.equal('SERVICE_BUSY');
      expect(res.headers['Retry-After']).to.equal('5');
    }
  });

  it('answers 503, not "invalid or expired token", when the user lookup fails', async () => {
    process.env.JWT_SECRET ||= 'unit-test-secret';
    const token = jwt.sign({ id: 'u1', tokenVersion: 1 }, process.env.JWT_SECRET, { algorithm: 'HS256' });
    const original = prisma.user.findUnique;
    prisma.user.findUnique = async () => { throw Object.assign(new Error('Timed out fetching a new connection from the connection pool'), { code: 'P2024', name: 'PrismaClientKnownRequestError' }); };
    try {
      const res = fakeRes();
      let nextCalled = false;
      await protect({ headers: { authorization: `Bearer ${token}` }, method: 'GET', originalUrl: '/api/v1/bookings/my-bookings', cookies: {} }, res, () => { nextCalled = true; });
      expect(nextCalled).to.equal(false);
      expect(res.statusCode).to.equal(503);
    } finally {
      prisma.user.findUnique = original;
    }
  });

  it('still answers 401 for a bad token', async () => {
    const res = fakeRes();
    await protect({ headers: { authorization: 'Bearer not-a-token' }, method: 'GET', originalUrl: '/api/v1/auth/me', cookies: {} }, res, () => {});
    expect(res.statusCode).to.equal(401);
  });
});

describe('Password hashing', () => {
  it('uses native bcrypt and reads existing hashes', async () => {
    expect(usingNativeBcrypt).to.equal(true);
    const bcryptjs = (await import('bcryptjs')).default;
    expect(await bcrypt.compare('Pass-1', bcryptjs.hashSync('Pass-1', 4))).to.equal(true);
    expect(await bcrypt.compare('Pass-1', await bcrypt.hash('Pass-2', 4))).to.equal(false);
  });

  it('treats an account with no password as not matching (instead of an error)', async () => {
    expect(await bcrypt.compare('anything', null)).to.equal(false);
    expect(await bcrypt.compare('', '$2b$04$abc')).to.equal(false);
  });
});
