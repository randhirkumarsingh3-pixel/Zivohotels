/**
 * robots.txt and sitemap.xml for search engines.
 *
 * Indexing is off unless ALLOW_INDEXING=true (staging and test servers must not appear in Google
 * with test data). The sitemap lists the home page, help pages, each city with live hotels and
 * each live hotel, with the site address from FRONTEND_URL.
 */
import prisma from '../config/db.js';
import { PUBLIC_HOTEL_STATUSES } from '../constants/hotelStatus.js';
import { cityNames } from '../utils/places.js';

const site = () => String(process.env.FRONTEND_URL || '').replace(/\/$/, '');
const indexingAllowed = () => String(process.env.ALLOW_INDEXING || '').toLowerCase() === 'true';
const xml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const robotsTxt = (req, res) => {
  res.type('text/plain').set('Cache-Control', 'public, max-age=3600');
  if (!indexingAllowed()) return res.send('# Not for search engines (set ALLOW_INDEXING=true on the live site)\nUser-agent: *\nDisallow: /\n');
  res.send([
    'User-agent: *',
    'Allow: /',
    'Disallow: /admin', 'Disallow: /extranet', 'Disallow: /checkout', 'Disallow: /my-bookings',
    'Disallow: /account', 'Disallow: /wallet', 'Disallow: /api/',
    `Sitemap: ${site()}/sitemap.xml`, '',
  ].join('\n'));
};

export const sitemapXml = async (req, res, next) => {
  try {
    const hotels = await prisma.hotel.findMany({
      where: { status: { in: PUBLIC_HOTEL_STATUSES }, isDeleted: false },
      select: { id: true, city: true, updatedAt: true },
      take: 5000,
    });
    const day = (d) => new Date(d).toISOString().slice(0, 10);
    const cities = [...new Set(hotels.map((h) => cityNames(String(h.city || '').trim())[0]).filter((c) => c && !/^default/i.test(c)))];
    const urls = [
      { loc: `${site()}/`, priority: '1.0' },
      { loc: `${site()}/help`, priority: '0.3' },
      ...cities.map((c) => ({ loc: `${site()}/hotels?city=${encodeURIComponent(c)}`, priority: '0.8' })),
      ...hotels.map((h) => ({ loc: `${site()}/hotel/${h.id}`, lastmod: day(h.updatedAt), priority: '0.7' })),
    ];
    res.type('application/xml').set('Cache-Control', 'public, max-age=3600').send(
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) =>
        `  <url><loc>${xml(u.loc)}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}<priority>${u.priority}</priority></url>`).join('\n')}\n</urlset>\n`);
  } catch (err) {
    next(err);
  }
};
