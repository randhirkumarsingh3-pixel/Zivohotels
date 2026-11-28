/**
 * Documents & emails settings (Admin → Settings → Documents & emails), stored in SystemConfig
 * "document_settings". Company legal details come from Finance settings (company), support
 * contacts from Platform settings; this holds what is specific to guest and hotel documents:
 *
 *  - guestInvoice.mode: who the guest's GST invoice for the stay comes from
 *      ON_BEHALF      tax invoice with the hotel as supplier, issued by ZivoPlus on its behalf
 *      ZIVO_SUPPLIER  tax invoice with ZivoPlus as supplier (ZivoPlus's GSTIN)
 *      HOTEL_ISSUES   the hotel issues the GST invoice for the stay; ZivoPlus issues its own tax
 *                     invoice as the facilitator (SAC 998552, accommodation charges collected on
 *                     behalf of the hotel). B2C: the hotel gives its invoice at the property
 *  - guestInvoice.b2bMode: who invoices a stay booked with a business GSTIN (B2B). Default
 *      HOTEL_ISSUES: the property issues the GST invoice in the business's name and uploads it in
 *      the extranet (Extranet → GST invoices); ZivoPlus issues its facilitator tax invoice,
 *      so input tax credit is claimed only against the property's invoice
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

const FACILITATOR_TERMS = () => [
  'Report any dispute about this invoice to ZivoPlus support within 48 hours of receiving it.',
  'The GST invoice for the stay is issued by the property; ZivoPlus acts only as a facilitator.',
  'Refunds for cancellations are made by ZivoPlus; the property adjusts its GST invoice for them.',
  'This is a system-generated invoice and does not need a signature.',
];
// Lines of the earlier payment-receipt wording, replaced where an admin saved them unchanged
const OLD_RECEIPT_TERMS = {
  'This receipt is not a tax invoice; the GST invoice is issued by the property.': 'The GST invoice for the stay is issued by the property; ZivoPlus acts only as a facilitator.',
  'Report any error in this receipt to ZivoPlus support within 7 days of receiving it.': 'Report any dispute about this invoice to ZivoPlus support within 48 hours of receiving it.',
};

export const DEFAULTS = () => ({
  guestInvoice: {
    mode: 'HOTEL_ISSUES', b2bMode: 'HOTEL_ISSUES', prefix: 'ZIV', creditPrefix: 'ZCN', debitPrefix: 'ZDN', note: '',
    terms: [
      'Input tax credit is available only to the business whose GSTIN is shown as the recipient.',
      'Report any error in this document to ZivoPlus support within 7 days of receiving it.',
      'Changes to the booking after this invoice (cancellations, refunds, extra hours) are issued as credit or debit notes against it.',
    ],
    // Printed on ZivoPlus' facilitator tax invoices (when the property issues the GST invoice
    // for the stay); the setting keeps its earlier name
    receiptTerms: FACILITATOR_TERMS(),
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
    guestInvoice: (() => {
      const g = { ...d.guestInvoice, ...(v.guestInvoice || {}) };
      if (Array.isArray(g.receiptTerms)) g.receiptTerms = g.receiptTerms.map((t) => OLD_RECEIPT_TERMS[t] || t);
      return g;
    })(),
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
    if (g.b2bMode !== undefined) {
      if (!INVOICE_MODES.includes(g.b2bMode)) throw new DocumentSettingsError('Choose who issues the invoice for business (GSTIN) bookings');
      next.guestInvoice.b2bMode = g.b2bMode;
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
    if (g.receiptTerms !== undefined) next.guestInvoice.receiptTerms = lines(g.receiptTerms, 8);
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

/**
 * Who issues the GST invoice for this booking: a business booking with a GSTIN (B2B) follows
 * guestInvoice.b2bMode (by default the hotel issues it and uploads it); otherwise a business
 * account's own terms, else guestInvoice.mode.
 */
export const invoiceModeFor = (booking, settings) => {
  const gi = settings?.guestInvoice || {};
  if (booking?.guestCompanyGstin) return gi.b2bMode || 'HOTEL_ISSUES';
  return booking?.businessPricing?.invoiceMode || gi.mode || 'HOTEL_ISSUES';
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

export default { getDocumentSettings, saveDocumentSettings, brandContext, invoiceModeFor, INVOICE_MODES, DEFAULTS };
