/**
 * One-time (and harmless to repeat) encryption of data stored before encryption at rest:
 * bank account numbers / UPI ids still in plain text, and KYC files on the local disk that are
 * not encrypted yet. Runs at start-up in the process that runs the timed jobs.
 */
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import prisma from '../config/db.js';
import { encryptFile, isEncryptedFile } from '../utils/dataCrypto.js';
import { CODE_EMAIL_TYPES, CODE_EMAIL_MAX_AGE_MS, scrubbedPayload } from '../utils/sensitiveEmail.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const KYC_DIR = path.join(__dirname, '../private_uploads');

const walk = async (dir) => {
  const out = [];
  for (const e of await fs.readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...await walk(p));
    else if (e.isFile()) out.push(p);
  }
  return out;
};

export const sweepBankDetails = async () => {
  // Rows whose account number or UPI id isn't encrypted yet; rewriting them encrypts them (config/db.js)
  const rows = await prisma.$queryRaw`SELECT "id", "accountNumber", "upiId" FROM "BankDetail"
    WHERE "accountNumber" NOT LIKE 'enc:v1:%' OR ("upiId" IS NOT NULL AND "upiId" <> '' AND "upiId" NOT LIKE 'enc:v1:%')`;
  for (const r of rows) {
    await prisma.bankDetail.update({ where: { id: r.id }, data: { accountNumber: r.accountNumber, ...(r.upiId ? { upiId: r.upiId } : {}) } });
  }
  return rows.length;
};

export const sweepKycFiles = async () => {
  let n = 0;
  for (const file of await walk(path.join(KYC_DIR, 'kyc'))) {
    const buf = await fs.readFile(file);
    if (isEncryptedFile(buf)) continue;
    const tmp = `${file}.enc-tmp`;
    await fs.writeFile(tmp, encryptFile(buf));
    await fs.rename(tmp, file); // replace in one step, so a crash never leaves half a file
    n += 1;
  }
  return n;
};

/**
 * Sign-in code emails stored before codes were scrubbed: sent or failed ones lose the code and
 * body; ones still waiting after their code expired are given up (and scrubbed).
 */
export const scrubCodeEmails = async () => {
  const jobs = await prisma.backgroundJob.findMany({
    where: { queue: 'email', jobType: { in: CODE_EMAIL_TYPES } },
    select: { id: true, status: true, payload: true, createdAt: true },
  });
  let n = 0;
  for (const j of jobs) {
    if (j.payload?.scrubbed) continue;
    const expired = Date.now() - new Date(j.createdAt).getTime() > CODE_EMAIL_MAX_AGE_MS;
    if (['COMPLETED', 'FAILED'].includes(j.status)) {
      await prisma.backgroundJob.update({ where: { id: j.id }, data: { payload: scrubbedPayload(j.payload) } });
      n += 1;
    } else if (expired && j.status !== 'PROCESSING') {
      await prisma.backgroundJob.update({ where: { id: j.id }, data: { status: 'FAILED', failedAt: new Date(), lastError: j.status === 'PENDING' ? 'Code expired before it was sent' : undefined, payload: scrubbedPayload(j.payload) } });
      n += 1;
    }
  }
  return n;
};

export const runEncryptionSweep = async () => {
  try {
    const rows = await sweepBankDetails();
    const files = await sweepKycFiles();
    const codes = await scrubCodeEmails();
    if (rows || files) console.log(`🔐 Encrypted at rest: ${rows} bank detail record(s), ${files} KYC file(s)`);
    if (codes) console.log(`🔐 Sign-in codes removed from ${codes} stored email(s)`);
    return { rows, files, codes };
  } catch (err) {
    console.error('❌ Encryption sweep failed:', err.message);
    return { rows: 0, files: 0, error: err.message };
  }
};

export default { runEncryptionSweep, sweepBankDetails, sweepKycFiles };
