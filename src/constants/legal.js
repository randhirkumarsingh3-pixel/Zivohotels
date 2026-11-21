/**
 * Company details used by the Privacy Policy and Terms pages.
 *
 * Fill in every `null` and have a lawyer review both pages, then set `reviewed: true`. Until then
 * the pages show a "Draft" notice and list what's missing. Indian law (IT Rules 2021 and the DPDP
 * Act 2023) requires the grievance officer's name and contact details to be published.
 */
export const LEGAL = {
  reviewed: false,
  lastUpdated: '2026-11-21',
  brand: 'ZivoHotels',
  legalEntity: 'ZIVO TECHNOLOGIES SOLUTIONS PRIVATE LIMITED',
  registeredAddress: 'Makundpur Karpuri Gram, Karpoorigram, Samastipur 848129, Bihar, India',
  cin: 'U62099BR2026PTC087845',
  gstin: '10AADCZ1700C1Z8',
  // The name is required by the IT Rules 2021 / DPDP Act 2023: add it before launch
  grievanceOfficer: { name: null, email: 'grievance@zivohotels.com', phone: null },
  jurisdictionCity: null,     // courts with jurisdiction, e.g. "Mumbai"
  contacts: {
    bookings: 'support@zivohotels.com',
    partners: 'partners@zivohotels.com',
    finance: 'finance@zivohotels.com',
  },
};

/** Human labels for the fields still missing (shown in the draft notice). */
export const missingLegalFields = () => [
  !LEGAL.legalEntity && 'legal entity name',
  !LEGAL.registeredAddress && 'registered address',
  !LEGAL.grievanceOfficer.name && "grievance officer's name",
  !LEGAL.grievanceOfficer.email && "grievance officer's email",
  !LEGAL.jurisdictionCity && 'city for jurisdiction',
].filter(Boolean);
