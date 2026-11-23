/**
 * Encryption at rest for sensitive values (bank account numbers, UPI ids) and files (KYC
 * documents). AES-256-GCM: each value gets its own random IV and an authentication tag, so a
 * changed byte is detected instead of silently decrypting to garbage.
 *
 * Key: DATA_ENCRYPTION_KEY (32 random bytes, base64 or hex; deploy.sh creates it once and keeps
 * it in deploy/vps/.env). Keep a copy of it off the server: without it, encrypted values and
 * documents cannot be read, also not from backups. Outside production a key is derived from
 * JWT_SECRET so local runs and tests need no extra setup.
 *
 * Formats (old plain values keep working and are encrypted on their next save or by the
 * one-time sweep in services/encryptionSweep.js):
 *   text  enc:v1:<iv b64>:<tag b64>:<ciphertext b64>
 *   file  "ZENC1" + iv(12) + tag(16) + ciphertext
 */
import crypto from 'crypto';

const TEXT_PREFIX = 'enc:v1:';
const FILE_MAGIC = Buffer.from('ZENC1');
let cachedKey = null;

const parseKey = (raw) => {
  const s = String(raw || '').trim();
  if (/^[0-9a-f]{64}$/i.test(s)) return Buffer.from(s, 'hex');
  const b = Buffer.from(s, 'base64');
  if (b.length === 32) return b;
  return null;
};

export const encryptionKey = () => {
  if (cachedKey) return cachedKey;
  const fromEnv = parseKey(process.env.DATA_ENCRYPTION_KEY);
  if (fromEnv) return (cachedKey = fromEnv);
  if (process.env.NODE_ENV === 'production') {
    throw new Error('DATA_ENCRYPTION_KEY is missing or not 32 bytes (base64 or hex). Run deploy.sh, which creates it.');
  }
  // Local runs and tests: a stable key derived from JWT_SECRET
  cachedKey = Buffer.from(crypto.hkdfSync('sha256', String(process.env.JWT_SECRET || 'zivoplus-dev'), 'zivoplus', 'data-encryption-v1', 32));
  return cachedKey;
};

/** For tests: forget the cached key after changing the environment. */
export const resetKeyCache = () => { cachedKey = null; };

export const isEncrypted = (v) => typeof v === 'string' && v.startsWith(TEXT_PREFIX);

export const encryptText = (value) => {
  if (value === null || value === undefined || value === '' || isEncrypted(value)) return value;
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const out = Buffer.concat([c.update(String(value), 'utf8'), c.final()]);
  return `${TEXT_PREFIX}${iv.toString('base64')}:${c.getAuthTag().toString('base64')}:${out.toString('base64')}`;
};

export const decryptText = (value) => {
  if (!isEncrypted(value)) return value; // plain (from before encryption) or empty
  const [ivB, tagB, dataB] = value.slice(TEXT_PREFIX.length).split(':');
  const d = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(ivB, 'base64'));
  d.setAuthTag(Buffer.from(tagB, 'base64'));
  return Buffer.concat([d.update(Buffer.from(dataB, 'base64')), d.final()]).toString('utf8');
};

export const isEncryptedFile = (buf) => Buffer.isBuffer(buf) && buf.length > 33 && buf.subarray(0, 5).equals(FILE_MAGIC);

export const encryptFile = (buf) => {
  if (isEncryptedFile(buf)) return buf;
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const data = Buffer.concat([c.update(buf), c.final()]);
  return Buffer.concat([FILE_MAGIC, iv, c.getAuthTag(), data]);
};

export const decryptFile = (buf) => {
  if (!isEncryptedFile(buf)) return buf; // stored before encryption
  const iv = buf.subarray(5, 17);
  const tag = buf.subarray(17, 33);
  const d = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(buf.subarray(33)), d.final()]);
};

export default { encryptText, decryptText, encryptFile, decryptFile, isEncrypted, isEncryptedFile };
