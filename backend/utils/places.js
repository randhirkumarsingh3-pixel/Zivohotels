/**
 * Place-name helpers for hotel search.
 *
 * Indian cities often have two names in use (Bangalore / Bengaluru). Hotels are saved with
 * whatever name the owner's map lookup gave, and guests type either one, so search treats
 * the names in a group as the same city.
 */
const CITY_NAME_GROUPS = [
  ['Bengaluru', 'Bangalore'],
  ['Mumbai', 'Bombay'],
  ['Delhi', 'New Delhi'],
  ['Gurugram', 'Gurgaon'],
  ['Kolkata', 'Calcutta'],
  ['Chennai', 'Madras'],
  ['Pune', 'Poona'],
  ['Mysuru', 'Mysore'],
  ['Mangaluru', 'Mangalore'],
  ['Hubballi', 'Hubli'],
  ['Belagavi', 'Belgaum'],
  ['Kalaburagi', 'Gulbarga'],
  ['Puducherry', 'Pondicherry'],
  ['Thiruvananthapuram', 'Trivandrum'],
  ['Kochi', 'Cochin'],
  ['Kozhikode', 'Calicut'],
  ['Thrissur', 'Trichur'],
  ['Tiruchirappalli', 'Trichy'],
  ['Visakhapatnam', 'Vizag'],
  ['Vadodara', 'Baroda'],
  ['Varanasi', 'Benares', 'Banaras'],
  ['Prayagraj', 'Allahabad'],
  ['Shimla', 'Simla'],
  ['Panaji', 'Panjim'],
];

const norm = (s) => String(s || '').trim().replace(/\s+/g, ' ').toLowerCase();

/** All names of a city: "bangalore" -> ["Bengaluru", "Bangalore"]. Unknown names come back as given. */
export const cityNames = (name) => {
  const n = norm(name);
  if (!n) return [];
  const group = CITY_NAME_GROUPS.find((g) => g.some((c) => c.toLowerCase() === n));
  return group ? [...group] : [String(name).trim().replace(/\s+/g, ' ')];
};

/**
 * Names to look for while someone is still typing: "banga" also finds "Bengaluru".
 * Only used for suggestions, from 3 letters on.
 */
export const cityNamesForTyping = (text) => {
  const n = norm(text);
  if (n.length < 3) return [String(text || '').trim()];
  const out = new Set([String(text).trim()]);
  for (const g of CITY_NAME_GROUPS) {
    if (g.some((c) => c.toLowerCase().startsWith(n))) g.forEach((c) => out.add(c));
  }
  return [...out];
};

/** True when two city names are the same city (case and old/new names ignored). */
export const sameCity = (a, b) => {
  const names = cityNames(a).map(norm);
  return names.includes(norm(b));
};

/** Straight-line distance in km between two map points. */
export const distanceKm = (lat1, lng1, lat2, lng2) => {
  const r = (d) => (d * Math.PI) / 180;
  const a = Math.sin(r(lat2 - lat1) / 2) ** 2 + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(r(lng2 - lng1) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(a));
};

/** Valid latitude / longitude pair from query strings, or null. */
export const parseLatLng = (lat, lng) => {
  const la = Number(lat);
  const ln = Number(lng);
  if (lat === undefined || lng === undefined || lat === '' || lng === '') return null;
  if (!Number.isFinite(la) || !Number.isFinite(ln) || Math.abs(la) > 90 || Math.abs(ln) > 180) return null;
  return { lat: la, lng: ln };
};

/** How far "near me" looks, in km. */
export const NEAR_ME_RADIUS_KM = 50;
