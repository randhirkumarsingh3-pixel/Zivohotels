/**
 * Data protection end to end: bank details and KYC documents are encrypted at rest but work as
 * before; audit trails can't be changed or deleted; booking QR codes come from our own API; deleted
 * accounts lose their personal details after 30 days.
 */
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import bcrypt from 'bcryptjs';
import { expect } from 'chai';
import minimist from 'minimist';
import prisma from '../../config/db.js';
import { scrubDeletedAccounts } from '../../services/retentionService.js';
import { queueService } from '../../services/queueService.js';

const argv = minimist(process.argv.slice(2));
const BASE = argv.url || process.env.E2E_URL || 'http://localhost:5000';
const api = axios.create({ baseURL: `${BASE}/api/v1`, validateStatus: () => true });
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const n = Date.now() % 1e8;

describe('Data protection', function () {
  this.timeout(30000);
  let auth; let hotelId; let savedBank; let kycId; let scrubUserId;

  before(async () => {
    const r = await api.post('/auth/login', { email: 'extranet@zivotechretreat.com', password: 'ZivoExtranet@2026' });
    expect(r.status).to.equal(200);
    auth = { headers: { Authorization: `Bearer ${r.data.data.token}` } };
    hotelId = (await prisma.hotel.findFirst({ where: { ownerId: r.data.data.user.id, isDeleted: false }, select: { id: true } })).id;
    savedBank = await prisma.bankDetail.findUnique({ where: { hotelId } });
  });

  after(async () => {
    if (savedBank) {
      const { id, createdAt, updatedAt, ...rest } = savedBank; // eslint-disable-line no-unused-vars
      await prisma.bankDetail.update({ where: { hotelId }, data: rest });
    } else await prisma.bankDetail.deleteMany({ where: { hotelId } });
    if (kycId) await prisma.kYCRecord.delete({ where: { id: kycId } }).catch(() => {});
    if (scrubUserId) await prisma.user.delete({ where: { id: scrubUserId } }).catch(() => {});
  });

  it('stores bank account numbers encrypted and still shows the last 4 digits', async () => {
    await prisma.bankDetail.upsert({
      where: { hotelId },
      create: { hotelId, accountName: 'Test Hotels', bankName: 'HDFC Bank', accountNumber: '50100987654321', ifscCode: 'HDFC0001234' },
      update: { accountNumber: '50100987654321' },
    });
    const [raw] = await prisma.$queryRaw`SELECT "accountNumber" FROM "BankDetail" WHERE "hotelId" = ${hotelId}`;
    expect(raw.accountNumber.startsWith('enc:v1:')).to.equal(true);
    expect(raw.accountNumber).to.not.include('50100987654321');
    const r = await api.get(`/extranet/property?hotelId=${hotelId}`, auth);
    expect(r.status).to.equal(200);
    expect(r.data.data.bankAccount.last4).to.equal('4321');
  });

  it('stores KYC documents encrypted on disk and returns the original file', async () => {
    const pdf = Buffer.from(`%PDF-1.4\n% trade licence ${n}\n%%EOF`);
    const up = await api.post(`/kyc/${hotelId}/upload`, { documentType: 'TRADE_LICENSE', fileName: 'licence.pdf', file: `data:application/pdf;base64,${pdf.toString('base64')}` }, auth);
    expect(up.status, JSON.stringify(up.data)).to.be.oneOf([200, 201]);
    const rec = await prisma.kYCRecord.findFirst({ where: { hotelId, documentType: 'TRADE_LICENSE' }, orderBy: { createdAt: 'desc' } });
    kycId = rec.id;
    if (rec.documentUrl.startsWith('local:')) {
      const onDisk = await fs.readFile(path.join(__dirname, '../../private_uploads', rec.documentUrl.slice('local:'.length)));
      expect(onDisk.subarray(0, 5).toString()).to.equal('ZENC1');
      expect(onDisk.includes(Buffer.from(`trade licence ${n}`))).to.equal(false);
    }
    const file = await api.get(`/kyc/documents/${rec.id}/file`, { ...auth, responseType: 'arraybuffer' });
    expect(file.status).to.equal(200);
    expect(Buffer.from(file.data).equals(pdf)).to.equal(true);
  });

  it('refuses to change or delete audit, security and ledger records', async () => {
    const row = await prisma.auditLog.create({ data: { action: 'E2E_APPEND_ONLY_CHECK', entityType: 'TEST', entityId: String(n), userId: 'SYSTEM' } });
    let err = null;
    try { await prisma.auditLog.update({ where: { id: row.id }, data: { action: 'CHANGED' } }); } catch (e) { err = e; }
    expect(err, 'update refused').to.exist;
    err = null;
    try { await prisma.auditLog.delete({ where: { id: row.id } }); } catch (e) { err = e; }
    expect(err, 'delete refused').to.exist;
    for (const table of ['SecurityLog', 'LedgerEntry', 'AdminActionLog']) {
      err = null;
      try { await prisma.$executeRawUnsafe(`DELETE FROM "${table}" WHERE false OR "id" = (SELECT "id" FROM "${table}" LIMIT 1)`); } catch (e) { err = e; }
      const has = await prisma.$queryRawUnsafe(`SELECT count(*)::int AS c FROM "${table}"`);
      if (has[0].c > 0) expect(err, `${table} delete refused`).to.exist;
    }
    expect((await prisma.auditLog.findUnique({ where: { id: row.id } })).action).to.equal('E2E_APPEND_ONLY_CHECK');
  });

  it('draws booking QR codes on our own server', async () => {
    const r = await axios.get(`${BASE}/api/v1/security/qr/ZIVO-TEST123.png`, { responseType: 'arraybuffer', validateStatus: () => true });
    expect(r.status).to.equal(200);
    expect(r.headers['content-type']).to.equal('image/png');
    expect(Buffer.from(r.data).subarray(1, 4).toString()).to.equal('PNG');
    const bad = await axios.get(`${BASE}/api/v1/security/qr/${encodeURIComponent('<script>')}.png`, { validateStatus: () => true });
    expect(bad.status).to.equal(404);
  });

  it('removes personal details from accounts deleted more than 30 days ago', async () => {
    const u = await prisma.user.create({ data: { email: `gone.${n}@example.com`, name: 'Gone Guest', phone: `90000${String(n).slice(-5)}`, role: 'CUSTOMER', status: 'DELETED', password: await bcrypt.hash('Unused-Pass-99', 4) } });
    scrubUserId = u.id;
    await prisma.$executeRaw`UPDATE "User" SET "updatedAt" = now() - interval '40 days' WHERE "id" = ${u.id}`;
    expect(await scrubDeletedAccounts()).to.be.at.least(1);
    const after = await prisma.user.findUnique({ where: { id: u.id } });
    expect(after.name).to.equal('Deleted user');
    expect(after.email).to.match(/@deleted\.zivoplus\.invalid$/);
    expect(after.phone).to.equal(null);
    expect((await api.post('/auth/login', { email: `gone.${n}@example.com`, password: 'Unused-Pass-99' })).status).to.not.equal(200);
  });

  it('never shows or keeps sign-in codes in the email log', async () => {
    const a = await api.post('/auth/login', { email: 'admin@zivoplus.com', password: 'admin123' });
    const admin = { headers: { Authorization: `Bearer ${a.data.data.token}` } };
    // Scheduled for later so the email worker doesn't pick it up during the test
    const job = await queueService.enqueue('email', 'SEND_OTP', { to: `code.${n}@example.com`, subject: '481516 is your ZivoPlus sign-in code', html: '<p>481516</p>' }, { runAt: new Date(Date.now() + 3600000) });
    try {
      const log = await api.get('/admin/delivery', admin);
      expect(log.status, JSON.stringify(log.data)).to.equal(200);
      const row = log.data.data.recent.find((r) => r.id === job.id);
      expect(row, 'the email is listed').to.exist;
      expect(row.subject).to.equal('•••••• is your ZivoPlus sign-in code');
      expect(JSON.stringify(log.data)).to.not.include('481516');
      await queueService.complete(job.id);
      const stored = await prisma.backgroundJob.findUnique({ where: { id: job.id } });
      expect(JSON.stringify(stored.payload)).to.not.include('481516');
      expect(stored.payload.scrubbed).to.equal(true);
    } finally {
      await prisma.backgroundJob.delete({ where: { id: job.id } }).catch(() => {});
    }
  });
});
