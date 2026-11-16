/**
 * Who stays in each room of a search: [{ adults, children }]. In links as occ=2-0,1-1
 * (adults-children per room), next to the totals guests= and rooms= that older links use.
 */
export const MAX_ROOMS = 8;
export const MAX_ADULTS_PER_ROOM = 8;
export const MAX_CHILDREN_PER_ROOM = 6;

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

/** guests split over rooms, every room with at least one adult: (5, 2) -> [{3,0},{2,0}] */
export const defaultOccupancy = (guests = 2, rooms = 1) => {
  const r = clamp(parseInt(rooms) || 1, 1, MAX_ROOMS);
  const g = Math.max(parseInt(guests) || 2, r);
  return Array.from({ length: r }, (_, i) => ({ adults: Math.floor(g / r) + (i < g % r ? 1 : 0), children: 0 }));
};

/** "2-0,1-1" -> [{2,0},{1,1}], or null when missing or not valid */
export const parseOcc = (text) => {
  if (!text) return null;
  const rooms = String(text).split(',').slice(0, MAX_ROOMS).map((part) => {
    const [a, c] = part.split('-').map((n) => parseInt(n));
    return { adults: clamp(a || 1, 1, MAX_ADULTS_PER_ROOM), children: clamp(c || 0, 0, MAX_CHILDREN_PER_ROOM) };
  });
  return rooms.length ? rooms : null;
};

export const occToParam = (occ) => (occ || []).map((r) => `${r.adults}-${r.children || 0}`).join(',');

export const occTotals = (occ) => {
  const list = occ || [];
  const adults = list.reduce((t, r) => t + r.adults, 0);
  const children = list.reduce((t, r) => t + (r.children || 0), 0);
  return { rooms: list.length, adults, children, guests: adults + children };
};

/** The rooms of a search from its link or saved search: occ when present, else guests / rooms */
export const occupancyOf = ({ occ, occupancy, guests, rooms } = {}) => {
  if (Array.isArray(occupancy) && occupancy.length) return occupancy;
  return parseOcc(occ) || defaultOccupancy(guests, rooms);
};

/** guests, rooms and occ for a link */
export const occParams = (occ) => {
  const t = occTotals(occ);
  return { guests: String(t.guests), rooms: String(t.rooms), occ: occToParam(occ) };
};

/** "2 adults, 1 child" */
export const roomGuestsLabel = (r) => [
  `${r.adults} adult${r.adults === 1 ? '' : 's'}`,
  r.children ? `${r.children} child${r.children === 1 ? '' : 'ren'}` : null,
].filter(Boolean).join(', ');
