/**
 * storage.js — where uploaded files (hotel photos, KYC documents) are stored.
 *
 * STORAGE_DRIVER=local  -> this server's disk (backend/public/uploads, backend/private_uploads)
 * STORAGE_DRIVER=gcs    -> Google Cloud Storage
 * Unset: local in development without Google credentials, otherwise GCS (the previous behaviour).
 * Self-hosted servers (e.g. a VPS) running NODE_ENV=production set STORAGE_DRIVER=local.
 */
export const isLocalStorageDriver = () => {
  const driver = (process.env.STORAGE_DRIVER || '').trim().toLowerCase();
  if (driver === 'local') return true;
  if (driver === 'gcs') return false;
  return process.env.NODE_ENV !== 'production' && !process.env.GOOGLE_APPLICATION_CREDENTIALS;
};
