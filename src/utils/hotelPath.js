/**
 * Readable hotel addresses, the same as the server builds them (backend/utils/hotelSlug.js):
 * /hotel/z-stays-marathahalli-bengaluru-5a320d64. Without a name, the plain id still works (the
 * hotel page then moves to the readable address).
 */
export const slugify = (text) => String(text || '')
  .normalize('NFKD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

export const hotelSlug = (hotel) => {
  if (!hotel?.id) return '';
  if (hotel.slug) return hotel.slug;
  if (!hotel.name) return hotel.id;
  const name = slugify(hotel.name);
  const city = slugify(hotel.city);
  const words = name && city && !`-${name}-`.includes(`-${city}-`) ? `${name}-${city}` : (name || city);
  return `${(words || 'hotel').slice(0, 80).replace(/-+$/, '')}-${String(hotel.id).slice(0, 8).toLowerCase()}`;
};

/** "/hotel/<readable address>" plus an optional query ("?checkin=…" or "checkin=…"). */
export const hotelPath = (hotel, query = '') => {
  const q = String(query || '');
  return `/hotel/${hotelSlug(hotel)}${q && !q.startsWith('?') ? `?${q}` : q}`;
};

/** City / area landing pages: /hotels-in-bengaluru, /hotels-in-marathahalli-bengaluru */
export const placePath = (city, area) => `/hotels-in-${[area, city].filter(Boolean).map(slugify).join('-')}`;
