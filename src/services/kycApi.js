/**
 * KYC document API helpers, shared by the admin property wizard, the owner onboarding
 * wizard and the admin review screen.
 *
 * Files are sent as a base64 data URL inside JSON and are only ever read back through the
 * authenticated GET /kyc/documents/:id/file endpoint (never via a public URL).
 */
const API_URL = import.meta.env.VITE_API_URL || '/api/v1';

const authHeader = () => {
  const token = localStorage.getItem('jwt_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export const KYC_DOCUMENT_TYPES = [
  // `required` mirrors backend/services/propertyReadiness.js (needed before submitting for review).
  { type: 'PAN', label: 'PAN Card', required: 'Required' },
  { type: 'GST', label: 'GST Certificate', required: 'Required if the property has a GSTIN' },
  { type: 'BANK_PROOF', label: 'Cancelled Cheque / Bank Proof', required: 'Required' },
  { type: 'OWNERSHIP_PROOF', label: 'Ownership / Lease Proof' },
  { type: 'TRADE_LICENSE', label: 'Trade License' },
  { type: 'FIRE_SAFETY', label: 'Fire NOC / Safety Certificate' },
];

export const kycDocumentLabel = (type) =>
  KYC_DOCUMENT_TYPES.find((d) => d.type === type)?.label || type;

export const KYC_MAX_BYTES = 10 * 1024 * 1024;
export const KYC_ACCEPT = '.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png';
const ACCEPTED_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];

const readJson = async (res) => {
  try { return await res.json(); } catch { return {}; }
};

export const fetchKycDocuments = async (hotelId) => {
  const res = await fetch(`${API_URL}/kyc/${hotelId}`, { headers: authHeader() });
  const data = await readJson(res);
  if (!res.ok || !data.success) throw new Error(data.message || 'Could not load documents');
  return data.data || [];
};

/** Checks the file in the browser first, so users get an instant, clear message. */
export const checkKycFile = (file) => {
  if (!file) return 'Choose a file to upload.';
  if (file.type && !ACCEPTED_TYPES.includes(file.type)) return 'Only PDF, JPG and PNG files are accepted.';
  if (file.size > KYC_MAX_BYTES) return 'The file is larger than 10 MB.';
  if (file.size === 0) return 'The file is empty.';
  return null;
};

const readAsDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Could not read the file.'));
    reader.readAsDataURL(file);
  });

export const uploadKycDocument = async (hotelId, documentType, file) => {
  const problem = checkKycFile(file);
  if (problem) throw new Error(problem);

  const res = await fetch(`${API_URL}/kyc/${hotelId}/upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader() },
    body: JSON.stringify({ documentType, fileName: file.name, file: await readAsDataUrl(file) }),
  });
  const data = await readJson(res);
  if (!res.ok || !data.success) throw new Error(data.message || 'Upload failed');
  return data.data;
};

/**
 * Opens a document in a new tab. The tab is opened synchronously (inside the click) so
 * popup blockers allow it, then pointed at the downloaded file.
 */
export const openKycDocument = async (documentId) => {
  const tab = window.open('', '_blank');
  try {
    const res = await fetch(`${API_URL}/kyc/documents/${documentId}/file`, { headers: authHeader() });
    if (!res.ok) {
      const data = await readJson(res);
      throw new Error(data.message || 'Could not open the document');
    }
    const url = URL.createObjectURL(await res.blob());
    if (tab) tab.location.href = url;
    else window.location.assign(url);
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (err) {
    if (tab) tab.close();
    throw err;
  }
};

export const reviewKycDocument = async (documentId, status, reason) => {
  const res = await fetch(`${API_URL}/kyc/${documentId}/verify`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeader() },
    body: JSON.stringify({ status, reason }),
  });
  const data = await readJson(res);
  if (!res.ok || !data.success) throw new Error(data.message || 'Could not update the document');
  return data.data;
};
