/**
 * The property listing agreement's wording, set in Admin → Agreement template. Saved in
 * SystemConfig "agreement_template" with a version number that goes up on every save; each
 * agreement records the version it was prepared from, and keeps its own copy of the text.
 *
 * Sections are plain text with {{fields}} filled from the property's onboarding details (see
 * FIELDS). Blank lines start a new paragraph; lines starting "- " become a list.
 * The default wording below is a starting point for your lawyer to review, not legal advice.
 */
import prisma from '../../config/db.js';

const KEY = 'agreement_template';

export const FIELDS = [
  ['agreementRef', 'Agreement number, e.g. ZIV-AGR-2026-000012'],
  ['effectiveDate', 'Date the owner signs (until then: the date it was prepared)'],
  ['zivoLegalName', 'ZivoPlus legal name (Finance settings)'],
  ['zivoAddress', 'ZivoPlus registered address'],
  ['zivoGstin', 'ZivoPlus GSTIN'],
  ['zivoCin', 'ZivoPlus CIN'],
  ['ownerLegalName', 'Owner\'s legal entity name (Finance & Legal step)'],
  ['ownerType', 'Business type, e.g. Private limited company'],
  ['ownerPan', 'Owner PAN'],
  ['ownerGstin', 'Owner GSTIN, or "Not registered"'],
  ['ownerAddress', 'Property address'],
  ['ownerContactName', 'Owner contact name'],
  ['ownerEmail', 'Owner email'],
  ['ownerPhone', 'Owner phone'],
  ['propertyName', 'Property name'],
  ['propertyId', 'ZivoPlus property ID'],
  ['propertyCity', 'City'],
  ['propertyState', 'State'],
  ['roomCount', 'Number of rooms listed'],
  ['commissionRate', 'Commission % agreed (no default)'],
  ['payoutCycle', 'How often payouts are made'],
  ['bankName', 'Payout bank'],
  ['bankAccountEnding', 'Payout account, last 4 digits'],
  ['bankIfsc', 'Payout IFSC'],
  ['termMonths', 'Term in months'],
  ['noticeDays', 'Notice period in days'],
  ['jurisdiction', 'Courts with jurisdiction'],
];

export const DEFAULT_TEMPLATE = {
  version: 1,
  title: 'Property Listing Agreement',
  termMonths: 12,
  noticeDays: 30,
  jurisdiction: 'Bengaluru, Karnataka',
  sections: [
    { heading: 'Parties', body: 'This Property Listing Agreement ("Agreement") is made on {{effectiveDate}} between:\n\n- {{zivoLegalName}}, {{zivoAddress}} (GSTIN {{zivoGstin}}) ("ZivoPlus"); and\n- {{ownerLegalName}}, a {{ownerType}} with PAN {{ownerPan}} and GSTIN {{ownerGstin}}, owner or operator of {{propertyName}}, {{ownerAddress}} (the "Partner").' },
    { heading: '1. Listing', body: 'The Partner lists {{propertyName}} (ZivoPlus property ID {{propertyId}}, {{roomCount}} rooms) on the ZivoPlus website and apps. The Partner keeps its room types, rates, availability, photos and policies on ZivoPlus accurate and up to date, and honours every confirmed booking at the rate and terms shown to the guest.' },
    { heading: '2. Commission', body: 'For each completed stay booked through ZivoPlus, the Partner pays ZivoPlus a commission of {{commissionRate}}% of the room price before GST, plus GST on the commission. No commission is charged on bookings cancelled free of charge or not completed.' },
    { heading: '3. Payments and payouts', body: 'For bookings paid online, ZivoPlus collects the payment from the guest and pays the Partner the amount due, less commission, GST on commission and any tax collected at source (TCS) or deducted (TDS) as the law requires. Payouts are made {{payoutCycle}} to the Partner\'s account at {{bankName}} ending {{bankAccountEnding}} (IFSC {{bankIfsc}}). For bookings paid at the hotel, the Partner collects payment and ZivoPlus invoices the commission monthly.' },
    { heading: '4. Guest invoices and taxes', body: 'Each party is responsible for its own taxes. ZivoPlus issues monthly commission tax invoices and statements to the Partner. The Partner provides correct GST and PAN details and tells ZivoPlus promptly about any change.' },
    { heading: '5. Partner obligations', body: '- Hold every licence and registration needed to run the property.\n- Treat ZivoPlus guests the same as other guests and not charge them more than the price shown.\n- Keep guest information confidential and use it only to provide the stay.\n- Handle guest complaints about the stay promptly.' },
    { heading: '6. Term and ending the agreement', body: 'This Agreement starts on {{effectiveDate}} and runs for {{termMonths}} months, then continues until either party ends it with {{noticeDays}} days\' written notice. Bookings confirmed before the end date are honoured.' },
    { heading: '7. Governing law', body: 'This Agreement is governed by the laws of India. The courts at {{jurisdiction}} have exclusive jurisdiction.' },
    { heading: '8. Electronic signature', body: 'The Partner signs this Agreement electronically on the ZivoPlus Extranet by typing their name and entering a one-time code sent to their registered email. The parties agree that this signature is valid and binding under the Information Technology Act, 2000. ZivoPlus keeps a record of the signature (name, email, time, IP address and a fingerprint of this document).' },
  ],
};

// ─── Business accounts (Partner Hub agents, ZivoPlus for Business companies) ──
const PARTY_FIELDS = [
  ['agreementRef', 'Agreement number, e.g. ZIV-BAG-2026-000012'],
  ['effectiveDate', 'Date it is signed (until then: the date it was prepared)'],
  ['zivoLegalName', 'ZivoPlus legal name (Finance settings)'],
  ['zivoAddress', 'ZivoPlus registered address'],
  ['zivoGstin', 'ZivoPlus GSTIN'],
  ['zivoCin', 'ZivoPlus CIN'],
  ['partnerLegalName', 'Their legal name'],
  ['partnerType', 'Business type, e.g. Private limited company'],
  ['partnerPan', 'Their PAN'],
  ['partnerGstin', 'Their GSTIN, or "Not registered"'],
  ['partnerAddress', 'Their registered address'],
  ['partnerEmail', 'Email for invoices and statements'],
  ['partnerPhone', 'Phone'],
  ['accountCode', 'ZivoPlus account number, e.g. ZP-000012'],
  ['paymentTerms', 'How they pay: prepaid wallet, credit line or both (from their terms)'],
  ['creditLimit', 'Credit limit (₹), or "None"'],
  ['creditDays', 'Days to pay a credit booking'],
  ['invoiceIssuer', 'Who issues the GST invoice for stays'],
  ['termMonths', 'Term in months'],
  ['noticeDays', 'Notice period in days'],
  ['jurisdiction', 'Courts with jurisdiction'],
];
export const AGENCY_FIELDS = [...PARTY_FIELDS,
  ['pricingModel', 'Agent pricing: net rates + markup, commission, or both'],
  ['defaultMarkup', 'Default markup %'],
  ['extraCommission', 'Extra commission ZivoPlus pays %'],
  ['tdsRate', 'TDS % on commission (194H)'],
];
export const CORPORATE_FIELDS = [...PARTY_FIELDS];

const SIGN = { heading: 'Electronic signature', body: 'This Agreement is signed electronically on ZivoPlus by an authorised admin of {{partnerLegalName}}, with a one-time code sent to their email or with Aadhaar eSign. The parties agree that this signature is valid and binding under the Information Technology Act, 2000. ZivoPlus keeps a record of the signature (name, email, time, IP address and a fingerprint of this document).' };
const PARTIES = (role) => ({ heading: 'Parties', body: `This Agreement is made on {{effectiveDate}} between:\n\n- {{zivoLegalName}}, {{zivoAddress}} (GSTIN {{zivoGstin}}) ("ZivoPlus"); and\n- {{partnerLegalName}}, a {{partnerType}} with PAN {{partnerPan}} and GSTIN {{partnerGstin}}, of {{partnerAddress}}, ZivoPlus account {{accountCode}} (the "${role}").` });
const TERM_LAW = [
  { heading: 'Term and ending the agreement', body: 'This Agreement starts on {{effectiveDate}} and runs for {{termMonths}} months, then continues until either party ends it with {{noticeDays}} days\' written notice. Bookings confirmed before the end date are honoured, and amounts owed remain payable.' },
  { heading: 'Governing law', body: 'This Agreement is governed by the laws of India. The courts at {{jurisdiction}} have exclusive jurisdiction.' },
];

export const DEFAULT_AGENCY_TEMPLATE = {
  version: 1, title: 'Travel Agent Agreement', termMonths: 12, noticeDays: 30, jurisdiction: 'Bengaluru, Karnataka',
  sections: [
    PARTIES('Agent'),
    { heading: '1. Appointment', body: 'ZivoPlus appoints the Agent, on a non-exclusive basis, to book hotel stays listed on ZivoPlus Partner Hub for the Agent\'s customers. The Agent acts for its customers in its own name and is responsible to them for the service it sells.' },
    { heading: '2. Rates and pricing', body: 'The Agent books at agent rates set by each hotel ({{pricingModel}}). On net rates the Agent may add its own markup (default {{defaultMarkup}}%). On commission, ZivoPlus pays the Agent the commission shown at booking (including any extra {{extraCommission}}% from ZivoPlus), credited to its account after the stay, less TDS at {{tdsRate}}% under section 194H.\n\nAgent rates are confidential: the Agent must not publish them, or advertise any stay below the price on the ZivoPlus website, on any public website, app or channel.' },
    { heading: '3. Payment', body: 'The Agent pays for bookings from its ZivoPlus account: {{paymentTerms}}. Credit limit: {{creditLimit}}; credit bookings are paid within {{creditDays}} days. ZivoPlus may put credit on hold while a payment is overdue and may suspend the account for repeated late payment.' },
    { heading: '4. Cancellations and refunds', body: 'Each booking follows the hotel\'s cancellation policy shown at booking. Refunds are made to the Agent\'s ZivoPlus account. The Agent handles refunds to its own customers.' },
    { heading: '5. Invoices and taxes', body: 'GST invoices for stays are issued in the Agent\'s name and GSTIN ({{invoiceIssuer}}). Each party is responsible for its own taxes. ZivoPlus issues commission statements with the TDS deducted, which ZivoPlus deposits against the Agent\'s PAN.' },
    { heading: '6. Conduct and customer data', body: '- Give hotels correct traveller details and make sure travellers follow hotel rules.\n- Collect, use and protect customer personal data as the Digital Personal Data Protection Act, 2023 requires, and use it only to provide the booked service.\n- Keep login details secure; the Agent is responsible for bookings made from its account.\n- Not misrepresent ZivoPlus or any hotel.' },
    ...TERM_LAW.map((x, i) => ({ ...x, heading: `${7 + i}. ${x.heading}` })),
    { ...SIGN, heading: `9. ${SIGN.heading}` },
  ],
};

export const DEFAULT_CORPORATE_TEMPLATE = {
  version: 1, title: 'Corporate Travel Agreement', termMonths: 12, noticeDays: 30, jurisdiction: 'Bengaluru, Karnataka',
  sections: [
    PARTIES('Company'),
    { heading: '1. Services', body: 'ZivoPlus provides the Company with ZivoPlus for Business: booking hotel stays for its employees and guests at company rates offered by hotels, travel policies and approvals, its account with ZivoPlus, and reports.' },
    { heading: '2. Company rates', body: 'Company rates are offered by each hotel and are confidential to the Company and its travellers. They are shown only to the Company\'s signed-in members.' },
    { heading: '3. Payment', body: 'The Company pays for bookings from its ZivoPlus account: {{paymentTerms}}. Credit limit: {{creditLimit}}; credit bookings are paid within {{creditDays}} days. ZivoPlus may put credit on hold while a payment is overdue.' },
    { heading: '4. Invoices and input tax credit', body: 'GST invoices for stays are issued in the Company\'s name and GSTIN ({{invoiceIssuer}}), so the Company can claim input tax credit where the law allows. ZivoPlus provides a monthly list of stays with invoice and GST details. Statements and invoices are sent to {{partnerEmail}}.' },
    { heading: '5. Users, policy and approvals', body: '- The Company decides who may book, its travel policy and its approvers, and is responsible for bookings made by its members.\n- Members keep their login details secure.\n- Cancellations follow the hotel\'s policy shown at booking; refunds go to the Company\'s account.' },
    { heading: '6. Personal data', body: 'Each party processes travellers\' personal data as the Digital Personal Data Protection Act, 2023 requires, only to provide and manage the bookings.' },
    ...TERM_LAW.map((x, i) => ({ ...x, heading: `${7 + i}. ${x.heading}` })),
    { ...SIGN, heading: `9. ${SIGN.heading}` },
  ],
};

export const TEMPLATE_KINDS = {
  HOTEL: { key: KEY, fields: FIELDS, defaults: DEFAULT_TEMPLATE, label: 'Property listing agreement' },
  AGENCY: { key: 'agent_agreement_template', fields: AGENCY_FIELDS, defaults: DEFAULT_AGENCY_TEMPLATE, label: 'Travel agent agreement (Partner Hub)' },
  CORPORATE: { key: 'company_agreement_template', fields: CORPORATE_FIELDS, defaults: DEFAULT_CORPORATE_TEMPLATE, label: 'Company agreement (ZivoPlus for Business)' },
};
const kindOf = (kind) => TEMPLATE_KINDS[kind] || TEMPLATE_KINDS.HOTEL;

const clean = (t, fields = FIELDS, fallbackTitle = 'Property Listing Agreement') => {
  const sections = (Array.isArray(t.sections) ? t.sections : []).map((s) => ({ heading: String(s?.heading || '').trim().slice(0, 150), body: String(s?.body || '').trim().slice(0, 6000) })).filter((s) => s.heading || s.body);
  if (!sections.length) throw Object.assign(new Error('Add at least one section.'), { statusCode: 400 });
  if (sections.length > 40) throw Object.assign(new Error('At most 40 sections.'), { statusCode: 400 });
  const known = new Set(fields.map(([k]) => k));
  const unknown = [...new Set(sections.flatMap((s) => [...`${s.heading}\n${s.body}`.matchAll(/\{\{\s*([a-zA-Z]+)\s*\}\}/g)].map((m) => m[1])))].filter((k) => !known.has(k));
  if (unknown.length) throw Object.assign(new Error(`Unknown field${unknown.length > 1 ? 's' : ''}: ${unknown.map((k) => `{{${k}}}`).join(', ')}. Use the fields listed beside the editor.`), { statusCode: 400 });
  const termMonths = Math.round(Number(t.termMonths));
  const noticeDays = Math.round(Number(t.noticeDays));
  if (!(termMonths >= 1 && termMonths <= 120)) throw Object.assign(new Error('Term: 1 to 120 months.'), { statusCode: 400 });
  if (!(noticeDays >= 0 && noticeDays <= 365)) throw Object.assign(new Error('Notice period: 0 to 365 days.'), { statusCode: 400 });
  return { title: String(t.title || fallbackTitle).trim().slice(0, 120), termMonths, noticeDays, jurisdiction: String(t.jurisdiction || '').trim().slice(0, 120) || DEFAULT_TEMPLATE.jurisdiction, sections };
};

/** The template for a kind of agreement: HOTEL (default), AGENCY or CORPORATE. */
export const getTemplate = async (kind = 'HOTEL') => {
  const k = kindOf(kind);
  const row = await prisma.systemConfig.findUnique({ where: { key: k.key } });
  return row?.value?.sections?.length ? { ...k.defaults, ...row.value } : { ...k.defaults, isDefault: true };
};

export const saveTemplate = async (input, user, kind = 'HOTEL') => {
  const k = kindOf(kind);
  const cur = await getTemplate(kind);
  const next = { ...clean(input || {}, k.fields, k.defaults.title), version: (cur.isDefault ? 1 : cur.version) + 1, updatedAt: new Date().toISOString(), updatedBy: user?.email || user?.id || null };
  next.history = [{ version: cur.version, updatedAt: cur.updatedAt || null, updatedBy: cur.updatedBy || null }, ...(cur.history || [])].slice(0, 30);
  await prisma.systemConfig.upsert({ where: { key: k.key }, update: { value: next }, create: { key: k.key, value: next, description: `${k.label} template` } });
  return next;
};

export const fieldsFor = (kind) => kindOf(kind).fields;
export const defaultFor = (kind) => kindOf(kind).defaults;

export default { FIELDS, DEFAULT_TEMPLATE, getTemplate, saveTemplate, TEMPLATE_KINDS, fieldsFor, defaultFor };
