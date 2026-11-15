/**
 * Company details used by the Privacy Policy and Terms pages.
 *
 * Fill in every `null` and have a lawyer review both pages, then set `reviewed: true`. Until then
 * the pages show a "Draft" notice and list what's missing. Indian law (IT Rules 2021 and the DPDP
 * Act 2023) requires the grievance officer's name and contact details to be published.
 */
export const LEGAL = {
  reviewed: false,
  lastUpdated: '2026-11-15',
  brand: 'ZivoHotels',
  legalEntity: null,          // e.g. "Zivo Hospitality Private Limited"
  registeredAddress: null,    // full registered office address
  cin: null,                  // company identification number, if a company
  grievanceOfficer: { name: null, email: null, phone: null },
  jurisdictionCity: null,     // courts with jurisdiction, e.g. "Mumbai"
  contacts: {
    bookings: 'bookings@zivohotels.com',
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
