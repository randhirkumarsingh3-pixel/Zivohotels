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

const clean = (t) => {
  const sections = (Array.isArray(t.sections) ? t.sections : []).map((s) => ({ heading: String(s?.heading || '').trim().slice(0, 150), body: String(s?.body || '').trim().slice(0, 6000) })).filter((s) => s.heading || s.body);
  if (!sections.length) throw Object.assign(new Error('Add at least one section.'), { statusCode: 400 });
  if (sections.length > 40) throw Object.assign(new Error('At most 40 sections.'), { statusCode: 400 });
  const known = new Set(FIELDS.map(([k]) => k));
  const unknown = [...new Set(sections.flatMap((s) => [...`${s.heading}\n${s.body}`.matchAll(/\{\{\s*([a-zA-Z]+)\s*\}\}/g)].map((m) => m[1])))].filter((k) => !known.has(k));
  if (unknown.length) throw Object.assign(new Error(`Unknown field${unknown.length > 1 ? 's' : ''}: ${unknown.map((k) => `{{${k}}}`).join(', ')}. Use the fields listed beside the editor.`), { statusCode: 400 });
  const termMonths = Math.round(Number(t.termMonths));
  const noticeDays = Math.round(Number(t.noticeDays));
  if (!(termMonths >= 1 && termMonths <= 120)) throw Object.assign(new Error('Term: 1 to 120 months.'), { statusCode: 400 });
  if (!(noticeDays >= 0 && noticeDays <= 365)) throw Object.assign(new Error('Notice period: 0 to 365 days.'), { statusCode: 400 });
  return { title: String(t.title || 'Property Listing Agreement').trim().slice(0, 120), termMonths, noticeDays, jurisdiction: String(t.jurisdiction || '').trim().slice(0, 120) || DEFAULT_TEMPLATE.jurisdiction, sections };
};

export const getTemplate = async () => {
  const row = await prisma.systemConfig.findUnique({ where: { key: KEY } });
  return row?.value?.sections?.length ? { ...DEFAULT_TEMPLATE, ...row.value } : { ...DEFAULT_TEMPLATE, isDefault: true };
};

export const saveTemplate = async (input, user) => {
  const cur = await getTemplate();
  const next = { ...clean(input || {}), version: (cur.isDefault ? 1 : cur.version) + 1, updatedAt: new Date().toISOString(), updatedBy: user?.email || user?.id || null };
  next.history = [{ version: cur.version, updatedAt: cur.updatedAt || null, updatedBy: cur.updatedBy || null }, ...(cur.history || [])].slice(0, 30);
  await prisma.systemConfig.upsert({ where: { key: KEY }, update: { value: next }, create: { key: KEY, value: next, description: 'Property listing agreement template' } });
  return next;
};

export default { FIELDS, DEFAULT_TEMPLATE, getTemplate, saveTemplate };
