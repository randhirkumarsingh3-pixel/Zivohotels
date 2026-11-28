/**
 * What a company (ZivoPlus for Business) or travel agent (Partner Hub) application needs, and the
 * extra details collected with it. Used by the applicant's form, the admin "Add" form and review.
 *
 * Checklist (each { key, label, required, done, note? }):
 *  - PAN card                                     always
 *  - GST registration certificate                 when there is a GSTIN
 *  - "Not registered under GST" declaration       agents without a GSTIN
 *  - Certificate of incorporation / deed / licence any business type except a sole proprietor
 *  - Address proof                                always
 *  - Authorisation letter                         when the applicant isn't an owner / director / partner
 *  - Accreditation certificate                    agents, optional
 *  - Bank account + cancelled cheque              agents (commission payouts); optional for companies
 * A document counts once uploaded, unless ZivoPlus marked it not acceptable.
 */
const clean = (v, max = 200) => String(v ?? '').trim().replace(/\s+/g, ' ').slice(0, max);
const fail = (m, code = 400) => Object.assign(new Error(m), { statusCode: code });

export const ACCREDITATION_BODIES = { IATA: 'IATA', TAAI: 'TAAI', TAFI: 'TAFI', MOT: 'Ministry of Tourism', OTHER: 'Other' };
export const PRICING_PREFERENCES = { NET: 'Net rates with my markup', COMMISSION: 'Public price with commission', NOT_SURE: 'Not sure yet' };
export const MONTHLY_BOOKINGS = ['1-10', '11-50', '51-200', '200+'];

/** The person applying, agent credentials and the GST declaration (normalised; throws on bad input). */
export const profileDetails = (input = {}, { kind, gstin, partial = false } = {}) => {
  const out = {};
  const has = (k) => input[k] !== undefined;
  if (!partial || has('contactName')) {
    out.contactName = clean(input.contactName, 120) || null;
    if (!partial && (!out.contactName || out.contactName.length < 2)) throw fail('Enter the name of the person applying.');
  }
  if (!partial || has('contactDesignation')) out.contactDesignation = clean(input.contactDesignation, 80) || null;
  if (!partial || has('isSignatory')) out.isSignatory = input.isSignatory === undefined ? true : Boolean(input.isSignatory);
  if (kind === 'AGENCY' && (!partial || has('accreditation'))) {
    const a = input.accreditation || {};
    const body = ACCREDITATION_BODIES[a.body] ? a.body : null;
    const number = clean(a.number, 40);
    if (body && !number) throw fail(`Enter your ${ACCREDITATION_BODIES[body]} number, or choose "None".`);
    out.accreditation = body ? { body, number } : null;
  }
  if (!partial || has('businessProfile')) {
    const p = input.businessProfile || {};
    const years = p.yearsInBusiness === '' || p.yearsInBusiness == null ? null : Math.max(0, Math.min(100, Math.round(Number(p.yearsInBusiness))));
    out.businessProfile = {
      yearsInBusiness: Number.isFinite(years) ? years : null,
      monthlyBookings: MONTHLY_BOOKINGS.includes(p.monthlyBookings) ? p.monthlyBookings : null,
      ...(kind === 'AGENCY' ? { pricingPreference: PRICING_PREFERENCES[p.pricingPreference] ? p.pricingPreference : null } : {}),
    };
  }
  if (!partial || has('gstDeclaration')) out.gstDeclaration = !gstin && Boolean(input.gstDeclaration);
  return out;
};

const docOk = (docs, type) => docs.some((d) => d.type === type && d.review?.status !== 'REJECTED');
const docRejected = (docs, type) => docs.some((d) => d.type === type && d.review?.status === 'REJECTED') && !docOk(docs, type);

/** The checklist for an organisation (as stored). */
export const checklist = (org) => {
  const docs = Array.isArray(org.documents) ? org.documents : [];
  const agent = org.kind === 'AGENCY';
  const doc = (key, label, required) => ({ key, label, required, done: docOk(docs, key), ...(docRejected(docs, key) ? { note: 'Not acceptable: upload it again' } : {}) });
  const items = [doc('PAN_CARD', 'PAN card', true)];
  if (org.gstin) items.push(doc('GST_CERTIFICATE', 'GST registration certificate', true));
  else if (agent) items.push({ key: 'GST_DECLARATION', label: 'Declaration: not registered under GST', required: true, done: Boolean(org.gstDeclaration) });
  if (org.incorporationType && org.incorporationType !== 'INDIVIDUAL') items.push(doc('INCORPORATION', 'Certificate of incorporation / partnership deed / registration', true));
  items.push(doc('ADDRESS_PROOF', 'Address proof (utility bill, rent agreement)', true));
  if (org.isSignatory === false) items.push(doc('AUTHORISATION', 'Authorisation letter for the person applying', true));
  if (agent) items.push(doc('ACCREDITATION', 'Accreditation certificate (IATA / TAAI / TAFI / Ministry of Tourism)', false));
  const bankRequired = agent;
  const hasBank = Boolean(org.bankDetails);
  items.push({ key: 'BANK', label: agent ? 'Bank account for commission payouts' : 'Bank account for refunds of unused balance', required: bankRequired, done: hasBank && org.bankStatus !== 'REJECTED', ...(org.bankStatus === 'REJECTED' ? { note: org.bankNote || 'Not acceptable: enter it again' } : {}) });
  if (hasBank || bankRequired) items.push(doc('CANCELLED_CHEQUE', 'Cancelled cheque or bank letter for that account', bankRequired || hasBank));
  return items;
};

/** Required items still missing (labels). */
export const missingItems = (org) => checklist(org).filter((i) => i.required && !i.done).map((i) => i.label);

export default { profileDetails, checklist, missingItems, ACCREDITATION_BODIES, PRICING_PREFERENCES, MONTHLY_BOOKINGS };
