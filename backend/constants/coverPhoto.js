/**
 * Picking a hotel's card photo: the photo marked as cover (HotelImage.isPrimary) first,
 * otherwise the earliest upload. Use for every single-photo query, e.g.
 *   media: { ...COVER_PHOTO_FIRST, select: { url: true } }
 * Without an orderBy, `media[0]` is whatever row the database returns first, which is how a
 * non-cover photo (or none) ended up on hotel cards.
 */
export const COVER_PHOTO_FIRST = {
  take: 1,
  orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
};
