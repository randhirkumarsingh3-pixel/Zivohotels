/**
 * Documents & emails settings (Admin → Settings → Documents & emails), stored in SystemConfig
 * "document_settings". Company legal details come from Finance settings (company), support
 * contacts from Platform settings; this holds what is specific to guest and hotel documents:
 *
 *  - guestInvoice.mode: who the guest's GST invoice for the stay comes from
 *      ON_BEHALF      tax invoice with the hotel as supplier, issued by ZivoPlus on its behalf
 *      ZIVO_SUPPLIER  tax invoice with ZivoPlus as supplier (ZivoPlus's GSTIN)
 *      HOTEL_ISSUES   the hotel issues the tax invoice; ZivoPlus gives the guest a payment receipt
 *  - guestInvoice.prefix / note: the number series (ZIV/2026/000001) and a note printed on it
 *  - voucher.guestNotes / hotelNotes: the "Good to know" and "Notes for the property" lines
 *  - email: attach the voucher PDFs to the booking emails, and an optional footer line
 */
import prisma from '../../config/db.js';
import { getFinanceSettings, STATE_NAMES } from '../finance/financeSettings.js';
import { getSupportContacts } from '../../config/supportContacts.js';

const KEY = 'document_settings';
export const INVOICE_MODES = ['ON_BEHALF', 'ZIVO_SUPPLIER', 'HOTEL_ISSUES'];

export const DEFAULTS = () => ({
  guestInvoice: { mode: 'ON_BEHALF', prefix: 'ZIV', note: '' },
  voucher: {
    guestNotes: [
      'Carry a government photo ID (Aadhaar, passport, driving licence or voter ID) for every adult guest.',
      'The property may ask for a refundable security deposit and charges extras (minibar, laundry, etc.) separately.',
    ],
    hotelNotes: [
      'TCS and TDS are subject to reconciliation and are reported against the property\'s PAN / GSTIN.',
      'ZivoPlus deducts TDS under section 194-O on this booking; the property should not deduct TDS on ZivoPlus\' commission.',
      'If the guest cancels or changes this booking, you will be notified and this voucher will no longer be valid.',
    ],
  },
  email: { attachGuestVoucher: true, attachHotelVoucher: true, footerNote: '' },
});

const clean = (v, max = 300) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const lines = (v, max = 8) => (Array.isArray(v) ? v : String(v || '').split('\n')).map((l) => clean(l, 240)).filter(Boolean).slice(0, max);

export const getDocumentSettings = async () => {
  const row = await prisma.systemConfig.findUnique({ where: { key: KEY } }).catch(() => null);
  const d = DEFAULTS();
  const v = row?.value || {};
  return {
    guestInvoice: { ...d.guestInvoice, ...(v.guestInvoice || {}) },
    voucher: { ...d.voucher, ...(v.voucher || {}) },
    email: { ...d.email, ...(v.email || {}) },
  };
};

export class DocumentSettingsError extends Error { constructor(m) { super(m); this.statusCode = 400; } }

export const saveDocumentSettings = async (input = {}, userId = null) => {
  const cur = await getDocumentSettings();
  const next = structuredClone(cur);
  if (input.guestInvoice) {
    const g = input.guestInvoice;
    if (g.mode !== undefined) {
      if (!INVOICE_MODES.includes(g.mode)) throw new DocumentSettingsError('Choose who issues the guest invoice');
      next.guestInvoice.mode = g.mode;
    }
    if (g.prefix !== undefined) {
      const p = clean(g.prefix, 8).toUpperCase();
      if (!/^[A-Z]{2,8}$/.test(p)) throw new DocumentSettingsError('The invoice prefix is 2 to 8 letters (for example ZIV)');
      next.guestInvoice.prefix = p;
    }
    if (g.note !== undefined) next.guestInvoice.note = clean(g.note, 400);
  }
  if (input.voucher) {
    if (input.voucher.guestNotes !== undefined) next.voucher.guestNotes = lines(input.voucher.guestNotes);
    if (input.voucher.hotelNotes !== undefined) next.voucher.hotelNotes = lines(input.voucher.hotelNotes);
  }
  if (input.email) {
    for (const k of ['attachGuestVoucher', 'attachHotelVoucher']) if (input.email[k] !== undefined) next.email[k] = Boolean(input.email[k]);
    if (input.email.footerNote !== undefined) next.email.footerNote = clean(input.email.footerNote, 300);
  }
  await prisma.systemConfig.upsert({ where: { key: KEY }, create: { key: KEY, value: next }, update: { value: next } });
  await prisma.auditLog.create({ data: { action: 'DOCUMENT_SETTINGS_UPDATED', entityType: 'SYSTEM', entityId: KEY, userId: userId || 'SYSTEM', details: { before: cur, after: next } } }).catch(() => {});
  return next;
};

/** Everything a document needs about ZivoPlus: legal details, support contacts, settings. */
export const brandContext = async () => {
  const [fin, support, docs] = await Promise.all([getFinanceSettings(), getSupportContacts().catch(() => ({})), getDocumentSettings()]);
  const c = fin.company || {};
  const company = {
    legalName: c.legalName || 'ZivoPlus',
    tradeName: c.tradeName || 'ZivoPlus',
    gstin: c.gstin || '', pan: c.pan || '', cin: c.cin || '', address: c.address || '',
    stateCode: c.stateCode || '', stateName: STATE_NAMES[c.stateCode] || '',
    email: support.email || c.email || '', phone: support.phone || c.phone || '',
  };
  return { company, support, settings: docs, signatory: fin.invoice?.signatory || 'Authorised signatory' };
};

export default { getDocumentSettings, saveDocumentSettings, brandContext, INVOICE_MODES, DEFAULTS };
