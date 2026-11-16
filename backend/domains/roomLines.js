/**
 * The rooms of a booking: [{ roomTypeId, ratePlanId, adults, children, extraBeds, guestName }].
 * Rooms of one booking can be different room types and rate plans.
 *
 * Older clients send one room type and plan, a number of rooms and total guests: those become
 * that many rooms of the type with the guests split as evenly as possible (3 adults in 2 rooms
 * -> 2 + 1).
 */
export const MAX_ROOMS_PER_BOOKING = 8;

/** total split into n whole parts, the bigger parts first: (5, 2) -> [3, 2] */
export const splitEvenly = (total, n) =>
  Array.from({ length: n }, (_, i) => Math.floor(total / n) + (i < total % n ? 1 : 0));

const bad = (message) => Object.assign(new Error(message), { statusCode: 400 });

export const roomLinesFrom = ({ roomLines, roomTypeId, ratePlanId, rooms = 1, adults = 2, children = 0, extraBeds = 0, guestName = '' } = {}) => {
  let lines;
  if (Array.isArray(roomLines) && roomLines.length) {
    lines = roomLines.map((r) => ({
      roomTypeId: r.roomTypeId,
      ratePlanId: r.ratePlanId,
      adults: Number(r.adults ?? 1),
      children: Number(r.children ?? 0),
      extraBeds: Number(r.extraBeds ?? 0),
      guestName: String(r.guestName || '').trim(),
    }));
  } else {
    const n = Math.max(1, Number(rooms) || 1);
    const a = splitEvenly(Number(adults) || 0, n);
    const c = splitEvenly(Number(children) || 0, n);
    const e = splitEvenly(Number(extraBeds) || 0, n);
    lines = a.map((ad, i) => ({ roomTypeId, ratePlanId, adults: ad, children: c[i], extraBeds: e[i], guestName: '' }));
  }
  if (lines.length > MAX_ROOMS_PER_BOOKING) throw bad(`At most ${MAX_ROOMS_PER_BOOKING} rooms can be booked together`);
  lines.forEach((l, i) => {
    if (!l.roomTypeId || !l.ratePlanId) throw bad(`Choose a room and plan for room ${i + 1}`);
    if (!Number.isInteger(l.adults) || l.adults < 1) throw bad(`Room ${i + 1} needs at least one adult`);
    if (!Number.isInteger(l.children) || l.children < 0) throw bad(`Room ${i + 1}: the number of children is not valid`);
    if (!Number.isInteger(l.extraBeds) || l.extraBeds < 0) throw bad(`Room ${i + 1}: the number of extra beds is not valid`);
  });
  // The booker's name for a room without one (the first room is usually theirs)
  const fallback = String(guestName || '').trim();
  return lines.map((l) => ({ ...l, guestName: l.guestName || fallback }));
};

/** Rooms needed per room type: [{ roomTypeId, rooms }], in a fixed order (locks in the same order). */
export const roomsPerType = (lines) => {
  const counts = new Map();
  for (const l of lines) counts.set(l.roomTypeId, (counts.get(l.roomTypeId) || 0) + 1);
  return [...counts.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([roomTypeId, rooms]) => ({ roomTypeId, rooms }));
};
