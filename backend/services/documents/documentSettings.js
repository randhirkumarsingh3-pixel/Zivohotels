/**
 * Documents & emails settings (Admin → Settings → Documents & emails), stored in SystemConfig
 * "document_settings". Company legal details come from Finance settings (company), support
 * contacts from Platform settings; this holds what is specific to guest and hotel documents:
 *
 *  - guestInvoice.mode: who the guest's GST invoice for the stay comes from
 *      ON_BEHALF      tax invoice with the hotel as supplier, issued by ZivoPlus on its behalf
 *      ZIVO_SUPPLIER  tax invoice with ZivoPlus as supplier (ZivoPlus's GSTIN)
 *      HOTEL_ISSUES   the hotel issues the tax invoice; ZivoPlus gives the guest a payment receipt
 *  - guestInvoice.prefix / note: the number series and a note printed on it. Numbers run per
 *    financial year (April to March) and stay within GST's 16 characters: ZIV/26-27/000001; credit
 *    and debit notes have their own series (creditPrefix ZCN, debitPrefix ZDN)
 *  - guestInvoice.terms: the terms printed at the foot of the invoice and notes
 *  - voucher.guestNotes / hotelNotes: the "Good to know" and "Notes for the property" lines
 *  - email: attach the voucher PDFs to the booking emails, and an optional footer line
 */
import prisma from '../../config/db.js';
import { getFinanceSettings, STATE_NAMES } from '../finance/financeSettings.js';
import { getSupportContacts } from '../../config/supportContacts.js';

const KEY = 'document_settings';
export const INVOICE_MODES = ['ON_BEHALF', 'ZIVO_SUPPLIER', 'HOTEL_ISSUES'];

export const DEFAULTS = () => ({
  guestInvoice: {
    mode: 'ON_BEHALF', prefix: 'ZIV', creditPrefix: 'ZCN', debitPrefix: 'ZDN', note: '',
    terms: [
      'Input tax credit is available only to the business whose GSTIN is shown as the recipient.',
      'Report any error in this document to ZivoPlus support within 7 days of receiving it.',
      'Changes to the booking after this invoice (cancellations, refunds, extra hours) are issued as credit or debit notes against it.',
    ],
  },
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
    // Three letters at most: with the year (26-27) and a 6-digit number that is GST's 16 characters
    for (const [k, label] of [['prefix', 'invoice'], ['creditPrefix', 'credit note'], ['debitPrefix', 'debit note']]) {
      if (g[k] === undefined) continue;
      const p = clean(g[k], 8).toUpperCase();
      if (!/^[A-Z]{2,3}$/.test(p)) throw new DocumentSettingsError(`The ${label} prefix is 2 or 3 letters (GST allows 16 characters for the whole number)`);
      next.guestInvoice[k] = p;
    }
    const prefixes = [next.guestInvoice.prefix, next.guestInvoice.creditPrefix, next.guestInvoice.debitPrefix];
    if (new Set(prefixes).size !== prefixes.length) throw new DocumentSettingsError('Invoices, credit notes and debit notes need different prefixes');
    if (g.terms !== undefined) next.guestInvoice.terms = lines(g.terms, 8);
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
