/**
 * Finance settings (Admin → Finance → Settings), stored in SystemConfig "finance_settings":
 *  - company: ZivoPlus' legal details printed on commission invoices and statements (defaults
 *    from the server's ZIVO_* settings; TAN for TDS under section 194-O)
 *  - tcsRegistrations: ZivoPlus' GSTIN for TCS (GST section 52) in each state, by state code;
 *    an e-commerce operator registers for TCS in every state where its hotels are
 *  - invoice: number series (ZPC/2026-27/000001, credit notes ZPCN/…), SAC, description, and the
 *    live switch: until invoicing goes live, documents are numbered TEST-… and marked as tests,
 *    so live numbering starts at 000001
 *  - automation: issue last month's invoices on the 1st, and email owners their documents
 */
import prisma from '../../config/db.js';
import { GST_STATE_CODES } from '../../constants/finance.js';

const KEY = 'finance_settings';

export const STATE_NAMES = Object.fromEntries(Object.entries(GST_STATE_CODES).map(([name, code]) => [code, name.replace(/\b\w/g, (c) => c.toUpperCase()).replace(/\bAnd\b/g, 'and')]));

const fromEnv = () => {
  const gstin = (process.env.ZIVO_GSTIN || '').trim();
  const stateCode = (process.env.ZIVO_GST_STATE_CODE || gstin).slice(0, 2);
  return {
    legalName: process.env.ZIVO_LEGAL_NAME || '',
    tradeName: 'ZivoPlus',
    gstin,
    pan: process.env.ZIVO_PAN || '',
    cin: process.env.ZIVO_CIN || '',
    tan: process.env.ZIVO_TAN || 'JBPZ00294A',
    address: process.env.ZIVO_ADDRESS || '',
    stateCode: /^\d{2}$/.test(stateCode) ? stateCode : '10',
    email: 'partners@zivoplus.com',
    phone: process.env.ZIVO_SUPPORT_PHONE || '',
  };
};

export const DEFAULTS = () => ({
  company: fromEnv(),
  tcsRegistrations: {},
  invoice: {
    prefix: 'ZPC',
    creditPrefix: 'ZPCN',
    sac: '998552',
    description: 'Reservation service for accommodation',
    signatory: 'Authorised signatory',
    live: false,
    liveSince: null,
  },
  automation: { issueMonthly: true, emailOwners: true },
});

const clean = (v, max = 200) => String(v ?? '').trim().slice(0, max);
const GSTIN = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z][Z][0-9A-Z]$/;
// TCS registrations look like a GSTIN but have "C" as the 14th character
const TCS_GSTIN = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z][CZ][0-9A-Z]$/;

export const getFinanceSettings = async () => {
  const row = await prisma.systemConfig.findUnique({ where: { key: KEY } }).catch(() => null);
  const d = DEFAULTS();
  const v = row?.value || {};
  return {
    company: { ...d.company, ...(v.company || {}) },
    tcsRegistrations: { ...(v.tcsRegistrations || {}) },
    invoice: { ...d.invoice, ...(v.invoice || {}) },
    automation: { ...d.automation, ...(v.automation || {}) },
  };
};

const bad = (message) => Object.assign(new Error(message), { status: 400, statusCode: 400 });

/** Saves settings; returns them. Turning invoicing live is one-way (numbers must not restart). */
export const saveFinanceSettings = async (input = {}, { userId } = {}) => {
  const cur = await getFinanceSettings();
  const company = { ...cur.company };
  for (const k of ['legalName', 'tradeName', 'address', 'email', 'phone']) if (input.company?.[k] !== undefined) company[k] = clean(input.company[k], 400);
  for (const k of ['gstin', 'pan', 'cin', 'tan', 'stateCode']) if (input.company?.[k] !== undefined) company[k] = clean(input.company[k], 30).toUpperCase();
  if (company.gstin && !GSTIN.test(company.gstin)) throw bad('ZivoPlus GSTIN doesn\'t look right (15 characters, e.g. 10AADCZ1700C1Z8)');
  if (company.pan && !/^[A-Z]{5}\d{4}[A-Z]$/.test(company.pan)) throw bad('PAN doesn\'t look right (e.g. AADCZ1700C)');
  if (company.tan && !/^[A-Z]{4}\d{5}[A-Z]$/.test(company.tan)) throw bad('TAN doesn\'t look right (e.g. JBPZ00294A)');
  if (!STATE_NAMES[company.stateCode]) throw bad('Choose ZivoPlus\' GST state');
  if (company.gstin && company.gstin.slice(0, 2) !== company.stateCode) throw bad('The GSTIN starts with a different state code than the state chosen');

  let tcsRegistrations = cur.tcsRegistrations;
  if (input.tcsRegistrations && typeof input.tcsRegistrations === 'object') {
    tcsRegistrations = {};
    for (const [code, raw] of Object.entries(input.tcsRegistrations)) {
      const g = clean(raw, 20).toUpperCase();
      if (!g) continue;
      if (!STATE_NAMES[code]) throw bad(`Unknown state code ${code}`);
      if (!TCS_GSTIN.test(g)) throw bad(`TCS registration for ${STATE_NAMES[code]} doesn't look right (15 characters, e.g. ${code}AADCZ1700C1C2)`);
      if (g.slice(0, 2) !== code) throw bad(`The TCS registration for ${STATE_NAMES[code]} must start with ${code}`);
      tcsRegistrations[code] = g;
    }
  }

  const invoice = { ...cur.invoice };
  for (const k of ['description', 'signatory']) if (input.invoice?.[k] !== undefined) invoice[k] = clean(input.invoice[k], 200);
  if (input.invoice?.sac !== undefined) invoice.sac = clean(input.invoice.sac, 8);
  // The series can change only before going live (numbers already issued keep theirs)
  for (const k of ['prefix', 'creditPrefix']) {
    if (input.invoice?.[k] === undefined) continue;
    const p = clean(input.invoice[k], 6).toUpperCase();
    if (!/^[A-Z]{2,6}$/.test(p)) throw bad('A series prefix is 2 to 6 letters, e.g. ZPC');
    if (cur.invoice.live && p !== cur.invoice[k]) throw bad('The series can\'t change after invoicing went live');
    invoice[k] = p;
  }
  if (invoice.prefix === invoice.creditPrefix) throw bad('Invoices and credit notes need different prefixes');
  if (input.invoice?.live === true && !cur.invoice.live) {
    if (!company.legalName || !company.gstin || !company.pan || !company.address) throw bad('Fill in the legal name, GSTIN, PAN and address before invoicing goes live');
    invoice.live = true;
    invoice.liveSince = new Date().toISOString();
    invoice.liveBy = userId || null;
  }
  if (input.invoice?.live === false && cur.invoice.live) throw bad('Live invoicing can\'t be switched off (numbers must continue)');

  const automation = { ...cur.automation };
  for (const k of ['issueMonthly', 'emailOwners']) if (typeof input.automation?.[k] === 'boolean') automation[k] = input.automation[k];

  const value = { company, tcsRegistrations, invoice, automation };
  await prisma.systemConfig.upsert({ where: { key: KEY }, update: { value }, create: { key: KEY, value, description: 'Admin → Finance → Settings' } });
  return value;
};

/** What still needs filling in before documents can go to hotels. */
export const readiness = (s, hotelStates = []) => {
  const missing = [];
  for (const [k, label] of [['legalName', 'legal name'], ['gstin', 'GSTIN'], ['pan', 'PAN'], ['tan', 'TAN'], ['address', 'registered address']]) if (!s.company[k]) missing.push(`ZivoPlus ${label}`);
  const tcsMissing = [...new Set(hotelStates)].filter((c) => c && !s.tcsRegistrations[c]).map((c) => STATE_NAMES[c] || c);
  return { missing, tcsMissing, live: Boolean(s.invoice.live) };
};

export default { getFinanceSettings, saveFinanceSettings, readiness, STATE_NAMES };
