/**
 * kycStorage.js — private storage for KYC documents (PAN, GST, cancelled cheques, licences).
 *
 * Unlike hotel photos these files must never be publicly reachable:
 *  - Local development: written to backend/private_uploads/ (NOT under public/, which
 *    express serves without authentication).
 *  - Cloud: written to Google Cloud Storage under an unguessable random name. Use a bucket
 *    without public read access via GCS_KYC_BUCKET; the default media bucket is configured
 *    for public read, so it is only a fallback.
 *
 * The stored key is never sent to browsers. Files are read back only through the
 * authenticated GET /api/v1/kyc/documents/:id/file endpoint.
 */
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOCAL_DIR = path.join(__dirname, '../private_uploads');

export const KYC_MAX_BYTES = 10 * 1024 * 1024; // 10 MB

// Accepted formats, identified by the file's leading bytes (never trust the client's MIME type).
const SIGNATURES = [
  { mimeType: 'application/pdf', ext: 'pdf', magic: [0x25, 0x50, 0x44, 0x46] }, // %PDF
  { mimeType: 'image/jpeg', ext: 'jpg', magic: [0xff, 0xd8, 0xff] },
  { mimeType: 'image/png', ext: 'png', magic: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
];

/** Returns { mimeType, ext } for a supported file, or null. */
export const detectFileType = (buffer) =>
  SIGNATURES.find(({ magic }) => buffer.length >= magic.length && magic.every((b, i) => buffer[i] === b)) || null;

const storeOnLocalDisk = () =>
  process.env.NODE_ENV !== 'production' && !process.env.GOOGLE_APPLICATION_CREDENTIALS;

let gcsBucket = null;
const getBucket = async () => {
  if (!gcsBucket) {
    const { Storage } = await import('@google-cloud/storage');
    const env = process.env.NODE_ENV === 'production' ? 'prod' : (process.env.NODE_ENV === 'staging' ? 'staging' : 'dev');
    const bucketName = process.env.GCS_KYC_BUCKET || `zivohotels-media-${env}`;
    if (!process.env.GCS_KYC_BUCKET && process.env.NODE_ENV === 'production') {
      console.warn('⚠️  GCS_KYC_BUCKET is not set: KYC documents are stored in the public-read media bucket (unguessable names only).');
    }
    gcsBucket = new Storage().bucket(bucketName);
  }
  return gcsBucket;
};

/**
 * Stores a validated KYC file and returns its private storage key
 * ("local:kyc/<hotelId>/<uuid>.<ext>" or "gs://<bucket>/kyc/<hotelId>/<uuid>.<ext>").
 */
export const saveKycFile = async (buffer, { ext, mimeType }, hotelId) => {
  const objectPath = `kyc/${hotelId}/${crypto.randomUUID()}.${ext}`;

  if (storeOnLocalDisk()) {
    const fullPath = path.join(LOCAL_DIR, objectPath);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, buffer);
    return `local:${objectPath}`;
  }

  const bucket = await getBucket();
  await bucket.file(objectPath).save(buffer, {
    resumable: false,
    metadata: { contentType: mimeType, cacheControl: 'private, no-store' },
  });
  return `gs://${bucket.name}/${objectPath}`;
};

/** Reads a stored KYC file back. Returns a Buffer, or null if the key isn't one of ours. */
export const readKycFile = async (key) => {
  if (typeof key !== 'string') return null;

  if (key.startsWith('local:')) {
    const fullPath = path.resolve(LOCAL_DIR, key.slice('local:'.length));
    // Refuse anything that would escape the private directory
    if (!fullPath.startsWith(LOCAL_DIR + path.sep)) return null;
    return fs.readFile(fullPath);
  }

  const match = key.match(/^gs:\/\/([^/]+)\/(kyc\/.+)$/);
  if (match) {
    const { Storage } = await import('@google-cloud/storage');
    const [contents] = await new Storage().bucket(match[1]).file(match[2]).download();
    return contents;
  }

  // Legacy rows held arbitrary URLs supplied by the browser; those are not served.
  return null;
};
