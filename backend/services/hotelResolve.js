/**
 * Finds a hotel from its address part: the id itself, or a readable address
 * (utils/hotelSlug.js) whose ending is the start of the id.
 */
import prisma from '../config/db.js';
import { isUuid, slugIdPrefix } from '../utils/hotelSlug.js';

/** The hotel id for "5a320d64-…" or "z-stays-…-5a320d64", or null. */
export const resolveHotelId = async (param) => {
  if (isUuid(param)) return String(param).toLowerCase();
  const prefix = slugIdPrefix(param);
  if (!prefix) return null;
  const rows = await prisma.hotel.findMany({ where: { id: { startsWith: prefix }, isDeleted: false }, select: { id: true }, take: 2 });
  return rows.length === 1 ? rows[0].id : null;
};

export default { resolveHotelId };
