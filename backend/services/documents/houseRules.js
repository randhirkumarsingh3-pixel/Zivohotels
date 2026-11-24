/**
 * A property's house rules in plain sentences, from its onboarding answers (hotel.policyRules)
 * and extra policies (hotel.policies). The same wording as the hotel page (HotelSections.jsx),
 * so guests read the same rules on the website, in emails and on vouchers. Only what the hotel
 * actually answered is listed.
 */
const yes = (v) => v === 'Yes' || v === true;
const no = (v) => v === 'No' || v === false;

export const houseRules = (hotel) => {
  const r = hotel?.policyRules || hotel?.integrationSettings?.policyRules || {};
  const out = [];
  const yn = (k, okText, noText) => { if (yes(r[k])) out.push({ text: okText, allowed: true }); else if (no(r[k])) out.push({ text: noText, allowed: false }); };
  const ids = Array.isArray(r.identityProofs) ? r.identityProofs.filter(Boolean) : [];
  if (ids.length) out.push({ text: `ID accepted at check-in: ${ids.join(', ')}`, allowed: null });
  if (yes(r.sameCityId)) out.push({ text: 'Local IDs (same city) are accepted', allowed: true });
  if (no(r.sameCityId)) out.push({ text: 'Local IDs (same city) are not accepted', allowed: false });
  yn('unmarriedCouples', 'Unmarried couples are welcome', 'Unmarried couples are not allowed');
  yn('guestsBelow18', 'Guests below 18 can check in', 'Guests below 18 years are not allowed to check in');
  yn('maleGroupsAllowed', 'Groups of only male guests are allowed', 'Groups of only male guests are not allowed');
  yn('outsideVisitors', 'Outside visitors are allowed in rooms', 'Outside visitors are not allowed in rooms');
  yn('smokingAllowed', 'Smoking is allowed in designated areas', 'Smoking is not allowed anywhere on the property');
  yn('alcoholAllowed', 'Alcohol is allowed on the property', 'Alcohol is not allowed on the property');
  yn('partiesAllowed', 'Private parties and events are allowed', 'Private parties and events are not allowed');
  yn('petsAllowed', 'Pets are allowed', 'Pets are not allowed');
  if (yes(r.has24HrCheckin)) out.push({ text: '24-hour check-in', allowed: true });
  const custom = typeof r.customPolicy === 'string' ? r.customPolicy.trim() : '';
  if (custom) out.push({ text: custom.slice(0, 300), allowed: null });
  for (const p of (Array.isArray(hotel?.policies) ? hotel.policies : []).filter((x) => typeof x === 'string' && x.trim()).slice(0, 5)) out.push({ text: p.trim().slice(0, 200), allowed: null });
  return out;
};

export default { houseRules };
