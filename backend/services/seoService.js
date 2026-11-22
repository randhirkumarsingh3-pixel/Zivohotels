/**
 * SEO: what search engines (and link previews) see for each public page.
 *
 * The website draws itself in the browser, so on its own a search engine first gets an empty page.
 * For public pages, the website's Nginx asks this service for the page instead (GET /seo/page):
 * the built index.html with the page's own title, description, official address (canonical),
 * link-preview tags, structured data (schema.org JSON-LD) and its main content as plain HTML.
 * The website then starts as usual and replaces that content with the full page; guests and
 * search engines get the same information.
 *
 * Settings (Admin → SEO, SystemConfig "seo_settings"): title and description templates per page
 * type, verification codes, redirects. Per hotel (Hotel.integrationSettings.seo): own title,
 * description, hide from search. Indexing stays off unless ALLOW_INDEXING=true (staging).
 */
import prisma from '../config/db.js';
import { PUBLIC_HOTEL_STATUSES } from '../constants/hotelStatus.js';
import { cityNames } from '../utils/places.js';
import { hotelSlug, slugify, isUuid, slugIdPrefix } from '../utils/hotelSlug.js';
import { getShared, setShared, delShared } from '../utils/sharedCache.js';
import crypto from 'crypto';

export const site = () => String(process.env.FRONTEND_URL || '').replace(/\/$/, '');
export const indexingAllowed = () => String(process.env.ALLOW_INDEXING || '').toLowerCase() === 'true';
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const inr = (n) => `₹${Math.round(Number(n) || 0).toLocaleString('en-IN')}`;
const titleCase = (s) => String(s || '').trim().toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
// Shortened to n characters: at the end of a sentence when one fits, else at a word with "…"
const clip = (s, n) => {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  if (t.length <= n) return t;
  const cut = t.slice(0, n);
  const sentence = cut.lastIndexOf('. ');
  return sentence > n * 0.5 ? cut.slice(0, sentence + 1) : `${cut.slice(0, n - 1).replace(/\s+\S*$/, '')}…`;
};

// ─── Settings ──────────────────────────────────────────────────────────────────────────────────

export const DEFAULT_SEO = {
  siteName: 'ZivoHotels',
  home: {
    title: 'ZivoHotels: hotel bookings at the best prices',
    description: 'Book hotels across India with ZivoHotels. Member prices, free cancellation on many stays, reserve now and pay later, and Zivo Rewards on every booking.',
  },
  hotel: {
    title: '{name}, {place}[: rooms from {price}] | {site}',
    description: '{name} in {place}. {stars}{type} with {amenities}.[ Rooms from {price} a night.] {cancellation} Book on {site}.',
  },
  city: {
    title: 'Hotels in {city}: {count} stays[ from {price}] | {site}',
    description: 'Compare {count} hotels in {city} on {site}{areasText}.[ Rooms from {price} a night,] member prices and free cancellation on many stays.',
  },
  area: {
    title: 'Hotels in {area}, {city}[: stays from {price}] | {site}',
    description: '{count} hotels in and near {area}, {city} on {site}.[ Rooms from {price} a night,] member prices and free cancellation on many stays.',
  },
  googleVerification: '',
  bingVerification: '',
  indexNowEnabled: false, // tell Bing / Yandex / Seznam (IndexNow) when hotel pages change
  indexNowKey: '',
  redirects: [], // [{ from: '/old-path', to: '/new-path' }]
};

export const getSeoSettings = async () => {
  const row = await prisma.systemConfig.findUnique({ where: { key: 'seo_settings' } }).catch(() => null);
  const v = row?.value && typeof row.value === 'object' ? row.value : {};
  return {
    ...DEFAULT_SEO, ...v,
    home: { ...DEFAULT_SEO.home, ...(v.home || {}) },
    hotel: { ...DEFAULT_SEO.hotel, ...(v.hotel || {}) },
    city: { ...DEFAULT_SEO.city, ...(v.city || {}) },
    area: { ...DEFAULT_SEO.area, ...(v.area || {}) },
    redirects: Array.isArray(v.redirects) ? v.redirects : [],
  };
};

/**
 * Fills "{name}"-style placeholders. A part in [square brackets] is left out when any placeholder
 * inside it is empty: "{name}[: rooms from {price}] | {site}".
 */
export const fill = (template, values) => {
  const val = (k) => (values[k] == null ? '' : String(values[k]));
  return String(template || '')
    .replace(/\[([^\]]*)\]/g, (_, part) => (/\{(\w+)\}/.test(part) && [...part.matchAll(/\{(\w+)\}/g)].some(([, k]) => !val(k)) ? '' : part))
    .replace(/\{(\w+)\}/g, (_, k) => val(k))
    .replace(/\s+([.,:])/g, '$1').replace(/([.,])\1+/g, '$1').replace(/\(\s*\)/g, '')
    .replace(/\s{2,}/g, ' ').replace(/^[\s,.:|]+|[\s,:|]+$/g, '').trim();
};

// ─── Data ──────────────────────────────────────────────────────────────────────────────────────

const imageUrl = (url, width = 1600) => {
  if (!url) return null;
  if (/^https?:\/\//.test(url)) return url;
  const m = /^\/uploads\/(.+\.(jpe?g|png|webp))$/i.exec(url);
  return `${site()}${m ? `/img/w${width}/uploads/${m[1]}` : url}`;
};
const areaOf = (h) => h.integrationSettings?.addressDetails?.area || h.landmark || '';
const cityOf = (h) => { const names = cityNames(h.city); return titleCase(names[0] || h.city || ''); };
const amenityNames = (list) => (Array.isArray(list) ? list : []).map((a) => String(a).split(':')[0].trim()).filter(Boolean);
const startingPrice = (h) => {
  const prices = (h.roomTypes || []).flatMap((rt) => (rt.ratePlans || []).map((rp) => Number(rp.basePrice))).filter((p) => p > 0);
  return prices.length ? Math.min(...prices) : null;
};

const LIST_SELECT = {
  id: true, name: true, city: true, state: true, landmark: true, type: true, rating: true, reviewScore: true, reviewCount: true,
  integrationSettings: true, updatedAt: true,
  media: { orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }], take: 1, select: { url: true } },
  roomTypes: { where: { isActive: true }, select: { ratePlans: { where: { isActive: true }, select: { basePrice: true } } } },
};

/** Every live hotel with what lists need (cached for 10 minutes, shared by server processes). */
export const liveHotels = async () => {
  const cached = await getShared('seo:live-hotels');
  if (cached) return cached;
  const rows = await prisma.hotel.findMany({ where: { status: { in: PUBLIC_HOTEL_STATUSES }, isDeleted: false }, select: LIST_SELECT, orderBy: { name: 'asc' }, take: 5000 });
  const list = rows
    .filter((h) => !h.integrationSettings?.seo?.noindex)
    .map((h) => ({
      id: h.id, slug: hotelSlug(h), name: h.name, city: cityOf(h), area: titleCase(areaOf(h)), state: h.state || '',
      type: h.type || 'hotel', stars: Number.isInteger(h.rating) ? h.rating : null,
      reviewScore: h.reviewScore || null, reviewCount: h.reviewCount || 0,
      price: startingPrice(h), image: h.media?.[0]?.url || null, updatedAt: h.updatedAt,
    }))
    .filter((h) => h.city && !/^default/i.test(h.city));
  setShared('seo:live-hotels', list, 10 * 60 * 1000);
  return list;
};

/** City and area pages: { slug: { city, area?, hotels } } from the live hotels. */
export const places = async () => {
  const hotels = await liveHotels();
  const out = {};
  for (const h of hotels) {
    const c = slugify(h.city);
    (out[c] ||= { city: h.city, area: null, hotels: [] }).hotels.push(h);
    if (h.area && slugify(h.area) !== c) {
      const a = `${slugify(h.area)}-${c}`;
      (out[a] ||= { city: h.city, area: h.area, hotels: [] }).hotels.push(h);
    }
  }
  return out;
};

export const placePath = (city, area) => `/hotels-in-${[area, city].filter(Boolean).map(slugify).join('-')}`;

// ─── Pages ─────────────────────────────────────────────────────────────────────────────────────

const breadcrumbs = (items) => ({
  '@context': 'https://schema.org', '@type': 'BreadcrumbList',
  itemListElement: items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.name, item: `${site()}${it.path}` })),
});

const hotelCardHtml = (h) => `
      <li class="py-3 border-b border-gray-100"><a href="/hotel/${esc(h.slug)}" class="font-semibold text-navy-800">${esc(h.name)}</a>
        <span class="text-sm text-gray-600"> · ${esc([h.area, h.city].filter(Boolean).join(', '))}${h.stars ? ` · ${h.stars}-star` : ''}${h.reviewCount ? ` · rated ${h.reviewScore}/10 (${h.reviewCount} reviews)` : ''}${h.price ? ` · from ${inr(h.price)} a night` : ''}</span></li>`;

const homePage = async (settings) => {
  const hotels = await liveHotels();
  const all = await places();
  const cities = Object.entries(all).filter(([, p]) => !p.area).sort((a, b) => b[1].hotels.length - a[1].hotels.length).slice(0, 20);
  return {
    title: settings.home.title,
    description: settings.home.description,
    canonical: '/',
    jsonLd: [{
      '@context': 'https://schema.org', '@type': 'Organization', name: settings.siteName, url: `${site()}/`, logo: `${site()}/brand/zivo-mark.png`,
    }],
    body: `
    <main class="max-w-6xl mx-auto px-4 py-10">
      <h1 class="text-3xl font-bold text-navy-900">Find your perfect stay</h1>
      <p class="mt-2 text-gray-700">${esc(settings.home.description)}</p>
      ${cities.length ? `<h2 class="mt-8 text-xl font-bold">Popular destinations</h2>
      <ul class="mt-2">${cities.map(([slug, p]) => `<li><a href="/hotels-in-${slug}" class="text-navy-800">Hotels in ${esc(p.city)}</a> (${p.hotels.length})</li>`).join('')}</ul>` : ''}
      ${hotels.length ? `<h2 class="mt-8 text-xl font-bold">Hotels on ${esc(settings.siteName)}</h2>
      <ul class="mt-2">${hotels.slice(0, 24).map(hotelCardHtml).join('')}</ul>` : ''}
    </main>`,
  };
};

const placePage = async (slug, settings) => {
  const p = (await places())[slug];
  if (!p) return null;
  const hotels = [...p.hotels].sort((a, b) => (b.reviewCount - a.reviewCount) || ((a.price || 1e9) - (b.price || 1e9)));
  const prices = hotels.map((h) => h.price).filter(Boolean);
  const minPrice = prices.length ? inr(Math.min(...prices)) : '';
  const areas = [...new Set(p.hotels.map((h) => h.area).filter(Boolean))];
  const values = {
    site: settings.siteName, city: p.city, area: p.area || '', count: hotels.length, price: minPrice,
    areasText: !p.area && areas.length ? `, in ${areas.slice(0, 3).join(', ')}${areas.length > 3 ? ' and more' : ''}` : '',
  };
  const t = p.area ? settings.area : settings.city;
  const name = p.area ? `${p.area}, ${p.city}` : p.city;
  const faqs = [
    { q: `How many hotels are there in ${name} on ${settings.siteName}?`, a: `${hotels.length} hotel${hotels.length === 1 ? '' : 's'} in ${name} can be booked on ${settings.siteName}.` },
    ...(minPrice ? [{ q: `What is the cheapest hotel price in ${name}?`, a: `Rooms in ${name} start from ${minPrice} a night before taxes, depending on dates.` }] : []),
    ...(!p.area && areas.length ? [{ q: `Which areas of ${p.city} have hotels?`, a: `${areas.slice(0, 8).join(', ')}.` }] : []),
    { q: `Can I cancel for free?`, a: `Many hotels on ${settings.siteName} offer free cancellation until shortly before check-in. Each rate shows its cancellation policy before you book.` },
  ];
  const path = placePath(p.city, p.area);
  return {
    title: fill(t.title, values),
    description: clip(fill(t.description, values), 160),
    canonical: path,
    image: imageUrl(hotels.find((h) => h.image)?.image, 1600),
    jsonLd: [
      breadcrumbs([{ name: 'Home', path: '/' }, ...(p.area ? [{ name: `Hotels in ${p.city}`, path: placePath(p.city) }] : []), { name: `Hotels in ${name}`, path }]),
      { '@context': 'https://schema.org', '@type': 'ItemList', itemListElement: hotels.slice(0, 50).map((h, i) => ({ '@type': 'ListItem', position: i + 1, url: `${site()}/hotel/${h.slug}`, name: h.name })) },
      { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faqs.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) },
    ],
    body: `
    <main class="max-w-6xl mx-auto px-4 py-10">
      <nav class="text-sm text-gray-500"><a href="/">Home</a>${p.area ? ` › <a href="${placePath(p.city)}">Hotels in ${esc(p.city)}</a>` : ''} › Hotels in ${esc(name)}</nav>
      <h1 class="mt-2 text-3xl font-bold text-navy-900">Hotels in ${esc(name)}</h1>
      <p class="mt-2 text-gray-700">${esc(fill(t.description, values))}</p>
      <ul class="mt-6">${hotels.map(hotelCardHtml).join('')}</ul>
      <h2 class="mt-8 text-xl font-bold">Questions about hotels in ${esc(name)}</h2>
      ${faqs.map((f) => `<h3 class="mt-4 font-semibold">${esc(f.q)}</h3><p class="text-gray-700">${esc(f.a)}</p>`).join('')}
    </main>`,
    place: { city: p.city, area: p.area, count: hotels.length, intro: fill(t.description, values), faqs },
  };
};

const CANCEL_TEXT = { FREE_CANCEL_24H: 'Free cancellation until 24 hours before check-in.', FREE_CANCEL_48H: 'Free cancellation until 48 hours before check-in.', FREE_CANCEL_7D: 'Free cancellation until 7 days before check-in.', NON_REFUNDABLE: '' };

/** A hotel page, or { redirect } to its readable address, or null (not found / not public). */
const hotelPage = async (param, settings) => {
  let where;
  if (isUuid(param)) where = { id: param };
  else { const prefix = slugIdPrefix(param); if (!prefix) return null; where = { id: { startsWith: prefix } }; }
  const h = await prisma.hotel.findFirst({
    where: { ...where, isDeleted: false, status: { in: PUBLIC_HOTEL_STATUSES } },
    select: {
      id: true, name: true, city: true, state: true, pincode: true, country: true, location: true, landmark: true, latitude: true, longitude: true,
      type: true, rating: true, reviewScore: true, reviewCount: true, description: true, amenities: true, checkInTime: true, checkOutTime: true,
      integrationSettings: true, updatedAt: true,
      cancellationPolicy: { select: { policyCode: true } },
      media: { orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }], take: 10, select: { url: true, category: true } },
      roomTypes: { where: { isActive: true }, select: { name: true, maxOccupancy: true, bedType: true, ratePlans: { where: { isActive: true }, select: { basePrice: true } } } },
    },
  });
  if (!h) return null;
  const slug = hotelSlug(h);
  if (param !== slug) return { redirect: `/hotel/${slug}` };

  const seo = h.integrationSettings?.seo || {};
  const city = cityOf(h);
  const area = titleCase(areaOf(h));
  const place = [area, city].filter(Boolean).join(', ');
  const price = startingPrice(h);
  const amenities = amenityNames(h.amenities);
  const stars = Number.isInteger(h.rating) && h.rating > 0 ? h.rating : null;
  const values = {
    site: settings.siteName, name: h.name, place, city, area, price: price ? inr(price) : '',
    stars: stars ? `${stars}-star ` : '', type: titleCase(h.type || 'hotel'),
    amenities: amenities.length ? amenities.slice(0, 4).join(', ').toLowerCase() : 'comfortable rooms',
    cancellation: CANCEL_TEXT[h.cancellationPolicy?.policyCode || 'FREE_CANCEL_24H'] || '',
  };
  const title = seo.title || fill(settings.hotel.title, values);
  const description = clip(seo.description || fill(settings.hotel.description, values), 160);
  const images = h.media.map((m) => imageUrl(m.url, 1600)).filter(Boolean);
  const cityPath = placePath(city);
  const areaPath = area ? placePath(city, area) : null;
  const path = `/hotel/${slug}`;

  const hotelLd = {
    '@context': 'https://schema.org', '@type': (h.type || '').toLowerCase().includes('resort') ? 'Resort' : 'Hotel',
    name: h.name, url: `${site()}${path}`, description: clip(h.description || description, 500),
    ...(images.length ? { image: images } : {}),
    address: {
      '@type': 'PostalAddress', streetAddress: h.location || undefined, addressLocality: city || undefined,
      addressRegion: h.state || undefined, postalCode: h.pincode || undefined, addressCountry: 'IN',
    },
    ...(h.latitude != null && h.longitude != null ? { geo: { '@type': 'GeoCoordinates', latitude: h.latitude, longitude: h.longitude } } : {}),
    ...(stars ? { starRating: { '@type': 'Rating', ratingValue: stars } } : {}),
    // Only real guest reviews from bookings on ZivoHotels
    ...(h.reviewCount > 0 && h.reviewScore ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: Number(h.reviewScore), bestRating: 10, worstRating: 1, reviewCount: h.reviewCount } } : {}),
    ...(price ? { priceRange: `From ${inr(price)} per night` } : {}),
    ...(amenities.length ? { amenityFeature: amenities.map((a) => ({ '@type': 'LocationFeatureSpecification', name: a, value: true })) } : {}),
    ...(h.checkInTime ? { checkinTime: h.checkInTime } : {}),
    ...(h.checkOutTime ? { checkoutTime: h.checkOutTime } : {}),
  };
  return {
    title, description, canonical: path, image: images[0] || null, ogType: 'website', noindex: Boolean(seo.noindex),
    jsonLd: [hotelLd, breadcrumbs([{ name: 'Home', path: '/' }, { name: `Hotels in ${city}`, path: cityPath }, ...(areaPath ? [{ name: `Hotels in ${area}`, path: areaPath }] : []), { name: h.name, path }])],
    body: `
    <main class="max-w-6xl mx-auto px-4 py-10">
      <nav class="text-sm text-gray-500"><a href="/">Home</a> › <a href="${cityPath}">Hotels in ${esc(city)}</a>${areaPath ? ` › <a href="${areaPath}">${esc(area)}</a>` : ''} › ${esc(h.name)}</nav>
      <h1 class="mt-2 text-3xl font-bold text-navy-900">${esc(h.name)}</h1>
      <p class="text-gray-600">${esc([h.location, place].filter(Boolean).join(' · '))}${stars ? ` · ${stars}-star` : ''}${h.reviewCount ? ` · rated ${h.reviewScore}/10 from ${h.reviewCount} reviews` : ''}</p>
      ${images[0] ? `<img src="${esc(images[0])}" alt="${esc(`${h.name}${h.media[0]?.category ? ` – ${h.media[0].category.toLowerCase()}` : ''}`)}" width="1200" height="675" class="mt-4 rounded-xl w-full max-w-3xl object-cover" />` : ''}
      ${price ? `<p class="mt-4 text-lg font-semibold">Rooms from ${inr(price)} a night</p>` : ''}
      ${h.description ? `<h2 class="mt-6 text-xl font-bold">About ${esc(h.name)}</h2><p class="mt-2 text-gray-700 whitespace-pre-line">${esc(h.description)}</p>` : ''}
      ${h.roomTypes.length ? `<h2 class="mt-6 text-xl font-bold">Rooms</h2><ul class="mt-2">${h.roomTypes.map((r) => { const p = startingPrice({ roomTypes: [r] }); return `<li>${esc(r.name)}${r.bedType ? ` · ${esc(r.bedType)}` : ''} · up to ${r.maxOccupancy || 2} guests${p ? ` · from ${inr(p)} a night` : ''}</li>`; }).join('')}</ul>` : ''}
      ${amenities.length ? `<h2 class="mt-6 text-xl font-bold">Amenities</h2><ul class="mt-2">${amenities.map((a) => `<li>${esc(a)}</li>`).join('')}</ul>` : ''}
      ${h.checkInTime || h.checkOutTime ? `<h2 class="mt-6 text-xl font-bold">Check-in and check-out</h2><p>${h.checkInTime ? `Check-in from ${esc(h.checkInTime)}. ` : ''}${h.checkOutTime ? `Check-out until ${esc(h.checkOutTime)}.` : ''}</p>` : ''}
      ${values.cancellation ? `<p class="mt-2">${esc(values.cancellation)}</p>` : ''}
    </main>`,
  };
};

const STATIC_PAGES = {
  '/help': { title: 'Help centre | ZivoHotels', description: 'Answers about bookings, payments, cancellations and refunds, Zivo Rewards and your account.' },
  '/privacy': { title: 'Privacy policy | ZivoHotels', description: 'How ZivoHotels collects, uses and protects your personal information.' },
  '/terms': { title: 'Terms of service | ZivoHotels', description: 'The terms for using ZivoHotels and booking stays.' },
  '/refund-policy': { title: 'Cancellation and refund policy | ZivoHotels', description: 'How cancellations and refunds work for bookings on ZivoHotels.' },
  '/list-your-property': { title: 'List your property on ZivoHotels', description: 'Reach guests across India: list your hotel on ZivoHotels in a few steps.' },
  '/rewards': { title: 'Zivo Rewards | ZivoHotels', description: 'Earn points on every stay and use them on your next booking.' },
  '/membership': { title: 'Membership | ZivoHotels', description: 'Member prices and extra benefits on ZivoHotels stays.' },
};

/**
 * What a public path shows: { status, title, description, canonical, image, jsonLd, body, noindex }
 * or { status: 301, redirect } or { status: 404 }.
 */
export const pageFor = async (rawPath, query = {}) => {
  const settings = await getSeoSettings();
  const path = (`/${String(rawPath || '/').replace(/^\/+/, '')}`).replace(/\/+$/, '') || '/';

  const redirect = settings.redirects.find((r) => r?.from && String(r.from).replace(/\/+$/, '') === path);
  if (redirect?.to) return { status: 301, redirect: redirect.to };

  if (path === '/') return { status: 200, ...(await homePage(settings)) };

  let m = /^\/hotel\/([^/]+)$/.exec(path);
  if (m) {
    const page = await hotelPage(decodeURIComponent(m[1]), settings);
    if (!page) return { status: 404, title: `Hotel not found | ${settings.siteName}`, description: '', noindex: true };
    if (page.redirect) return { status: 301, redirect: page.redirect };
    return { status: 200, ...page };
  }

  m = /^\/hotels-in-([a-z0-9-]+)$/.exec(path);
  if (m) {
    const page = await placePage(m[1], settings);
    return page ? { status: 200, ...page } : { status: 404, title: `Page not found | ${settings.siteName}`, description: '', noindex: true };
  }

  // Search results: not indexed themselves; a plain city search points to its city page
  if (path === '/hotels') {
    const city = query.city || query.destination;
    const canonical = city && !query.lat ? placePath(titleCase(cityNames(city)[0] || city)) : null;
    return { status: 200, title: city ? `Hotels in ${titleCase(city)} | ${settings.siteName}` : `Hotels | ${settings.siteName}`, description: settings.home.description, canonical, noindex: true };
  }

  if (STATIC_PAGES[path]) return { status: 200, ...STATIC_PAGES[path], canonical: path };
  return { status: 200, title: settings.home.title, description: settings.home.description, noindex: true };
};

// ─── HTML ──────────────────────────────────────────────────────────────────────────────────────

let template = { html: null, at: 0 };
/** The built index.html (from the website container, or a file for local runs), cached for a minute. */
const loadTemplate = async () => {
  if (template.html && Date.now() - template.at < 60000) return template.html;
  let html = null;
  if (process.env.SEO_TEMPLATE_FILE) html = await (await import('fs')).promises.readFile(process.env.SEO_TEMPLATE_FILE, 'utf8');
  else if (process.env.SEO_TEMPLATE_URL) {
    const r = await fetch(process.env.SEO_TEMPLATE_URL, { signal: AbortSignal.timeout(3000) });
    if (!r.ok) throw new Error(`template ${r.status}`);
    html = await r.text();
  }
  // No template configured (tests, a bare API): a minimal page with the same placeholders
  if (!html) html = '<!DOCTYPE html>\n<html lang="en">\n  <head>\n    <meta charset="UTF-8" />\n    <title>ZivoHotels</title>\n    <meta name="description" content="" />\n  </head>\n  <body>\n    <div id="root"></div>\n  </body>\n</html>\n';
  template = { html, at: Date.now() };
  return html;
};

/** The page's HTML: the website with this page's head tags and content filled in. */
export const renderPage = async (page) => {
  const settings = await getSeoSettings();
  const html = await loadTemplate();
  const robots = !indexingAllowed() || page.noindex ? 'noindex, follow' : 'index, follow, max-image-preview:large';
  const canonical = page.canonical ? `${site()}${page.canonical}` : null;
  const image = page.image || `${site()}/brand/zivo-mark.png`;
  const head = [
    `<meta name="robots" content="${robots}" />`,
    canonical ? `<link rel="canonical" href="${esc(canonical)}" />` : '',
    `<meta property="og:title" content="${esc(page.title)}" />`,
    `<meta property="og:description" content="${esc(page.description)}" />`,
    `<meta property="og:type" content="${esc(page.ogType || 'website')}" />`,
    canonical ? `<meta property="og:url" content="${esc(canonical)}" />` : '',
    `<meta property="og:image" content="${esc(image)}" />`,
    '<meta property="og:locale" content="en_IN" />',
    `<meta name="twitter:card" content="${page.image ? 'summary_large_image' : 'summary'}" />`,
    settings.googleVerification ? `<meta name="google-site-verification" content="${esc(settings.googleVerification)}" />` : '',
    settings.bingVerification ? `<meta name="msvalidate.01" content="${esc(settings.bingVerification)}" />` : '',
    ...(page.jsonLd || []).map((d) => `<script type="application/ld+json">${JSON.stringify(d).replace(/</g, '\\u003c')}</script>`),
  ].filter(Boolean).join('\n    ');
  return html
    .replace(/<title>[\s\S]*?<\/title>/i, `<title>${esc(page.title)}</title>`)
    .replace(/<meta\s+name="description"[^>]*>/i, `<meta name="description" content="${esc(page.description)}" />`)
    .replace(/<meta\s+property="og:image"[^>]*>/i, '')
    .replace('</head>', `    ${head}\n  </head>`)
    .replace(/<div id="root"><\/div>/, `<div id="root">${page.body || ''}</div>`);
};

/** Saves Admin → SEO settings (only known fields; templates trimmed). */
export const saveSeoSettings = async (input = {}, userId = null) => {
  const cur = await getSeoSettings();
  const text = (v, max) => String(v ?? '').trim().slice(0, max);
  const tpl = (k) => ({ title: text(input[k]?.title ?? cur[k].title, 200), description: text(input[k]?.description ?? cur[k].description, 400) });
  const redirects = (Array.isArray(input.redirects) ? input.redirects : cur.redirects)
    .map((r) => ({ from: text(r?.from, 300), to: text(r?.to, 500) }))
    .filter((r) => /^\/[^\s]*$/.test(r.from) && /^(\/|https?:\/\/)[^\s]*$/.test(r.to) && r.from !== r.to)
    .slice(0, 500);
  const enabled = input.indexNowEnabled ?? cur.indexNowEnabled;
  const value = {
    siteName: text(input.siteName ?? cur.siteName, 60) || DEFAULT_SEO.siteName,
    home: tpl('home'), hotel: tpl('hotel'), city: tpl('city'), area: tpl('area'),
    googleVerification: text(input.googleVerification ?? cur.googleVerification, 200).replace(/^.*content="([^"]+)".*$/, '$1'),
    bingVerification: text(input.bingVerification ?? cur.bingVerification, 200).replace(/^.*content="([^"]+)".*$/, '$1'),
    indexNowEnabled: Boolean(enabled),
    indexNowKey: cur.indexNowKey || (enabled ? crypto.randomBytes(16).toString('hex') : ''),
    redirects,
  };
  await prisma.systemConfig.upsert({ where: { key: 'seo_settings' }, update: { value }, create: { key: 'seo_settings', value, description: `Admin → SEO${userId ? ` (last change by ${userId})` : ''}` } });
  return getSeoSettings();
};

/**
 * A hotel's pages changed (went live, edited, unlisted): lists are worked out again, and with
 * IndexNow on (and indexing allowed) search engines are told about the hotel and its city page.
 */
export const seoChanged = async (hotelId) => {
  delShared('seo:live-hotels');
  try {
    const settings = await getSeoSettings();
    if (!settings.indexNowEnabled || !settings.indexNowKey || !indexingAllowed() || !site()) return;
    const h = hotelId ? await prisma.hotel.findUnique({ where: { id: hotelId }, select: { id: true, name: true, city: true } }) : null;
    const urls = h ? [`${site()}/hotel/${hotelSlug(h)}`, `${site()}${placePath(cityOf(h))}`] : [`${site()}/`];
    const r = await fetch('https://api.indexnow.org/indexnow', {
      method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' }, signal: AbortSignal.timeout(8000),
      body: JSON.stringify({ host: new URL(site()).host, key: settings.indexNowKey, keyLocation: `${site()}/indexnow-${settings.indexNowKey}.txt`, urlList: urls }),
    });
    if (r.status >= 400) console.warn('[SEO] IndexNow answered', r.status);
  } catch (err) {
    console.warn('[SEO] IndexNow not sent:', err.message);
  }
};

/** City / area page facts for the website (heading, intro, questions), or null. */
export const placeInfo = async (slug) => {
  const page = await placePage(String(slug || '').toLowerCase(), await getSeoSettings());
  return page ? page.place : null;
};

export default { saveSeoSettings, seoChanged, placeInfo, pageFor, renderPage, getSeoSettings, liveHotels, places, placePath, site, indexingAllowed, fill };
