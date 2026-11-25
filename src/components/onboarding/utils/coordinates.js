/**
 * Reads a map position from what an owner pastes: plain coordinates ("12.9716, 77.5946" or
 * "12.9716 77.5946", also with N/E), or a Google Maps link (…/@12.97,77.59,17z, ?q=12.97,77.59,
 * !3d12.97!4d77.59, ll=12.97,77.59). Returns { lat, lng } or null. Short maps.app.goo.gl links
 * don't contain the position: open them and copy the full link (or the coordinates) instead.
 */
const valid = (lat, lng) => Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0);
const pair = (a, b) => { const lat = parseFloat(a); const lng = parseFloat(b); return valid(lat, lng) ? { lat, lng } : null; };

export const parseCoordinates = (input) => {
  const text = String(input || '').trim();
  if (!text) return null;
  const patterns = [
    /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/,                // place link data
    /@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/,                   // /@lat,lng,zoom
    /[?&](?:q|query|ll|center|destination)=(-?\d+(?:\.\d+)?)(?:,|%2C)\s*(-?\d+(?:\.\d+)?)/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) { const p = pair(m[1], m[2]); if (p) return p; }
  }
  // Plain "lat, lng" / "lat lng" / "12.97° N, 77.59° E"
  const m = text.replace(/°/g, ' ').match(/^\s*(-?\d{1,2}(?:\.\d+)?)\s*([NS])?\s*[,\s]\s*(-?\d{1,3}(?:\.\d+)?)\s*([EW])?\s*$/i);
  if (m) {
    const lat = parseFloat(m[1]) * (/s/i.test(m[2] || '') ? -1 : 1);
    const lng = parseFloat(m[3]) * (/w/i.test(m[4] || '') ? -1 : 1);
    return valid(lat, lng) ? { lat, lng } : null;
  }
  return null;
};

export const isShortMapsLink = (input) => /maps\.app\.goo\.gl|goo\.gl\/maps/i.test(String(input || ''));

export default { parseCoordinates, isShortMapsLink };
