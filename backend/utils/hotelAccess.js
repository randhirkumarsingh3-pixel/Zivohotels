/**
 * "May this person work on this property?" for the hotel side: its owner, or a member of its team
 * whose role allows what the current request does (req.user.permission, set by permissionGate).
 * Admins pass here: their console permissions were already checked by permissionGate.
 */
import { canAtHotel, hotelsWith } from '../services/accessService.js';

/**
 * hotel: an id, or a record with id (and ownerId). permission: what the action needs there
 * (defaults to the current request's, from permissionGate; paths outside it pass their own).
 */
export const managesHotel = (user, hotel, permission = user?.permission) => {
  if (!user) return false;
  if (user.role === 'ADMIN') return true;
  const id = typeof hotel === 'string' ? hotel : hotel?.id;
  if (!id) return false;
  // Before roles existed only the owner could; keep that true even if access wasn't loaded
  if (typeof hotel === 'object' && hotel?.ownerId && hotel.ownerId === user.id) return true;
  return canAtHotel(user, id, permission || undefined);
};

/** Ids of the properties this person may work on for the current request. */
export const managedHotelIds = (user, permission = user?.permission) => hotelsWith(user, permission || undefined);

/** Prisma filter for those properties (on Hotel). */
export const managedHotelWhere = (user, permission) => ({ id: { in: managedHotelIds(user, permission) } });

export default { managesHotel, managedHotelIds, managedHotelWhere };
