const titleCase = (t) => String(t).toLowerCase().split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

/** Builds the gallery list from hotel.media and room photos: primary first, labelled by tag / room. */
export const galleryPhotos = (hotel) => {
  const seen = new Set();
  const out = [];
  const add = (url, label) => { if (url && !seen.has(url)) { seen.add(url); out.push({ url, label }); } };
  [...(hotel.media || [])]
    .sort((a, b) => (b.isPrimary ? 1 : 0) - (a.isPrimary ? 1 : 0))
    .forEach((m) => add(m.url, m.tags?.[0] ? titleCase(m.tags[0]) : (m.category && m.category !== 'GENERAL' ? titleCase(m.category) : '')));
  (hotel.roomTypes || []).forEach((rt) => (rt.images || []).forEach((img) => add(img.url, rt.name)));
  return out;
};

export default galleryPhotos;
