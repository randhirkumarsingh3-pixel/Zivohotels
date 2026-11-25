/**
 * Admin → Business settings (SystemConfig "business_settings"): whether ZivoPlus for Business
 * (companies) and ZivoPlus Partner Hub (travel agents) take applications, and the default terms an
 * organisation gets unless ZivoPlus sets its own on the organisation:
 *
 *  paymentMode   PREPAID (wallet only) | CREDIT (credit line) | BOTH (wallet first, then credit)
 *  creditDays    days to pay a booking made on credit
 *  invoiceMode   who issues the GST invoice for its stays: ON_BEHALF (the hotel is the supplier,
 *                ZivoPlus issues it on the hotel's behalf) | ZIVO_SUPPLIER | HOTEL_ISSUES
 *  pricingModel  agents only: NET (net rate; the agent adds their own markup) | COMMISSION
 *                (public price; ZivoPlus pays the agent a commission) | BOTH (the agent chooses)
 */
import prisma from '../../config/db.js';

const KEY = 'business_settings';
export const PAYMENT_MODES = ['PREPAID', 'CREDIT', 'BOTH'];
export const INVOICE_MODES = ['ON_BEHALF', 'ZIVO_SUPPLIER', 'HOTEL_ISSUES'];
export const PRICING_MODELS = ['NET', 'COMMISSION', 'BOTH'];
export const KINDS = ['CORPORATE', 'AGENCY'];

export const DEFAULTS = {
  corporate: { enabled: false, requireGstin: true, paymentMode: 'PREPAID', creditDays: 30, invoiceMode: 'ON_BEHALF', holdHours: 24, requireAgreement: false },
  agency: {
    enabled: false, requireGstin: false, paymentMode: 'PREPAID', creditDays: 15, invoiceMode: 'ON_BEHALF', holdHours: 24, requireAgreement: false,
    pricingModel: 'BOTH', defaultMarkupPct: 10, maxMarkupPct: 50, extraCommissionPct: 0,
    // TDS on commission (Income Tax Act section 194H)
    tdsPct: 2,
    // Monthly incentive slabs on completed room nights (services/business/agentIncentives.js)
    incentives: { enabled: false, slabs: [{ name: 'Silver', minRoomNights: 50, bonusPct: 1 }, { name: 'Gold', minRoomNights: 150, bonusPct: 2 }, { name: 'Platinum', minRoomNights: 400, bonusPct: 3 }] },
  },
  credit: { maxLimit: 500000, holdWhenOverdue: true },
  topup: { minAmount: 1000, maxAmount: 500000 },
};

const bad = (m) => Object.assign(new Error(m), { statusCode: 400 });
const num = (v, min, max, label) => {
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) throw bad(`${label} must be between ${min} and ${max}.`);
  return Math.round(n * 100) / 100;
};
const pick = (v, list, label) => { if (!list.includes(v)) throw bad(`Choose a valid ${label}.`); return v; };

const merge = (v = {}) => ({
  corporate: { ...DEFAULTS.corporate, ...(v.corporate || {}) },
  agency: { ...DEFAULTS.agency, ...(v.agency || {}) },
  credit: { ...DEFAULTS.credit, ...(v.credit || {}) },
  topup: { ...DEFAULTS.topup, ...(v.topup || {}) },
  updatedAt: v.updatedAt || null, updatedBy: v.updatedBy || null,
});

export const getBusinessSettings = async () => {
  const row = await prisma.systemConfig.findUnique({ where: { key: KEY } });
  return merge(row?.value || {});
};

export const saveBusinessSettings = async (input = {}, user) => {
  const cur = await getBusinessSettings();
  const c = { ...cur.corporate, ...(input.corporate || {}) };
  const a = { ...cur.agency, ...(input.agency || {}) };
  const cr = { ...cur.credit, ...(input.credit || {}) };
  const t = { ...cur.topup, ...(input.topup || {}) };
  const value = {
    corporate: {
      enabled: Boolean(c.enabled), requireGstin: Boolean(c.requireGstin),
      paymentMode: pick(c.paymentMode, PAYMENT_MODES, 'payment mode'), creditDays: num(c.creditDays, 1, 120, 'Credit days'),
      invoiceMode: pick(c.invoiceMode, INVOICE_MODES, 'invoice issuer'), holdHours: num(c.holdHours ?? 24, 0, 72, 'Hold hours'),
      requireAgreement: Boolean(c.requireAgreement),
    },
    agency: {
      enabled: Boolean(a.enabled), requireGstin: Boolean(a.requireGstin),
      paymentMode: pick(a.paymentMode, PAYMENT_MODES, 'payment mode'), creditDays: num(a.creditDays, 1, 120, 'Credit days'),
      invoiceMode: pick(a.invoiceMode, INVOICE_MODES, 'invoice issuer'), holdHours: num(a.holdHours ?? 24, 0, 72, 'Hold hours'),
      requireAgreement: Boolean(a.requireAgreement),
      pricingModel: pick(a.pricingModel, PRICING_MODELS, 'pricing model'),
      defaultMarkupPct: num(a.defaultMarkupPct, 0, 100, 'Default markup %'), maxMarkupPct: num(a.maxMarkupPct, 0, 200, 'Maximum markup %'),
      extraCommissionPct: num(a.extraCommissionPct, 0, 30, 'Extra commission %'), tdsPct: num(a.tdsPct, 0, 20, 'TDS %'),
      incentives: (await import('./agentIncentives.js')).cleanIncentives(input.agency?.incentives || {}, cur.agency.incentives),
    },
    credit: { maxLimit: num(cr.maxLimit, 0, 100000000, 'Maximum credit limit'), holdWhenOverdue: Boolean(cr.holdWhenOverdue) },
    topup: { minAmount: num(t.minAmount, 1, 1000000, 'Minimum top-up'), maxAmount: num(t.maxAmount, 1, 10000000, 'Maximum top-up') },
    updatedAt: new Date().toISOString(), updatedBy: user?.email || user?.id || null,
  };
  if (value.agency.defaultMarkupPct > value.agency.maxMarkupPct) throw bad('The default markup can\'t be more than the maximum markup.');
  if (value.topup.minAmount > value.topup.maxAmount) throw bad('The minimum top-up can\'t be more than the maximum.');
  await prisma.systemConfig.upsert({ where: { key: KEY }, update: { value }, create: { key: KEY, value, description: 'ZivoPlus for Business and Partner Hub: defaults' } });
  return merge(value);
};

const kindKey = (kind) => (kind === 'AGENCY' ? 'agency' : 'corporate');

/** The terms an organisation has: its own where ZivoPlus set them, else the defaults. */
export const termsFor = (org, settings) => {
  const d = settings[kindKey(org.kind)];
  const paymentMode = org.paymentMode || d.paymentMode;
  const t = {
    paymentMode,
    creditAllowed: paymentMode !== 'PREPAID',
    creditLimit: paymentMode === 'PREPAID' ? 0 : Number(org.creditLimit || 0),
    creditDays: org.creditDays || d.creditDays,
    invoiceMode: org.invoiceMode || d.invoiceMode,
    paymentModeIsDefault: !org.paymentMode, invoiceModeIsDefault: !org.invoiceMode,
  };
  if (org.kind === 'AGENCY') {
    Object.assign(t, {
      pricingModel: org.pricingModel || d.pricingModel, pricingModelIsDefault: !org.pricingModel,
      defaultMarkupPct: org.defaultMarkupPct != null ? Number(org.defaultMarkupPct) : d.defaultMarkupPct,
      maxMarkupPct: d.maxMarkupPct,
      extraCommissionPct: org.extraCommissionPct != null ? Number(org.extraCommissionPct) : d.extraCommissionPct,
      tdsPct: d.tdsPct,
    });
  }
  return t;
};

export default { DEFAULTS, getBusinessSettings, saveBusinessSettings, termsFor, PAYMENT_MODES, INVOICE_MODES, PRICING_MODELS, KINDS };
