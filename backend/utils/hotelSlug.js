/**
 * Readable hotel addresses: /hotel/z-stays-marathahalli-bengaluru-5a320d64
 *
 * The name and city in words, then the first 8 characters of the hotel's id. Only the ending is
 * needed to find the hotel, so an address still works after the name changes (the website then
 * moves to the new address with a permanent redirect), and two hotels with the same name never
 * clash. The website builds the same address (src/utils/hotelPath.js).
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const slugify = (text) => String(text || '')
  .normalize('NFKD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

/** "z-stays-marathahalli-bengaluru-5a320d64" (the city is left out when the name already has it). */
export const hotelSlug = (hotel) => {
  if (!hotel?.id) return '';
  const name = slugify(hotel.name);
  const city = slugify(hotel.city);
  const words = name && city && !`-${name}-`.includes(`-${city}-`) ? `${name}-${city}` : (name || city);
  return `${(words || 'hotel').slice(0, 80).replace(/-+$/, '')}-${String(hotel.id).slice(0, 8).toLowerCase()}`;
};

export const isUuid = (s) => UUID.test(String(s || ''));

/** The id prefix at the end of a readable address, or null. */
export const slugIdPrefix = (s) => {
  const m = /-([0-9a-f]{8})$/i.exec(String(s || ''));
  return m ? m[1].toLowerCase() : null;
};

export default { slugify, hotelSlug, isUuid, slugIdPrefix };
