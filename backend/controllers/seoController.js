/**
 * robots.txt and sitemap.xml for search engines.
 *
 * Indexing is off unless ALLOW_INDEXING=true (staging and test servers must not appear in Google
 * with test data). The sitemap lists the home page, help pages, each city with live hotels and
 * each live hotel, with the site address from FRONTEND_URL.
 */
import prisma from '../config/db.js';
import seo from '../services/seoService.js';

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
    'Disallow: /account', 'Disallow: /wallet', 'Disallow: /api/', 'Disallow: /login', 'Disallow: /signup',
    'Disallow: /accept-invite', 'Disallow: /reset-password', 'Disallow: /set-password',
    `Sitemap: ${site()}/sitemap.xml`, '',
  ].join('\n'));
};

/**
 * Public pages for search engines and link previews (Nginx sends page requests here, see
 * services/seoService.js): the page with its own head tags and content, a permanent redirect to
 * the readable address, or a 404 page. Any error: the plain website page, so nobody is blocked.
 */
export const seoPage = async (req, res) => {
  const path = String(req.query.path || '/');
  const { path: _p, ...query } = req.query;
  try {
    const page = await seo.pageFor(path, query);
    if (page.status === 301) {
      const qs = new URLSearchParams(query).toString();
      return res.redirect(301, `${page.redirect}${qs && !page.redirect.includes('?') ? `?${qs}` : ''}`);
    }
    const html = await seo.renderPage(page);
    res.status(page.status || 200).type('html')
      .set('Cache-Control', 'no-cache')
      .set('X-Robots-Tag', !seo.indexingAllowed() || page.noindex ? 'noindex, follow' : 'all')
      .send(html);
  } catch (err) {
    console.error('[SEO] page failed:', path, err.message);
    res.status(503).set('Retry-After', '5').type('text').send('SEO page unavailable');
  }
};

const urlset = (urls, images = false) => `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"${images ? ' xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"' : ''}>
${urls.map((u) => `  <url><loc>${xml(u.loc)}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}${(u.images || []).map((img) => `<image:image><image:loc>${xml(img)}</image:loc></image:image>`).join('')}</url>`).join('\n')}
</urlset>
`;
const day = (d) => new Date(d).toISOString().slice(0, 10);
const sendXml = (res, body) => res.type('application/xml').set('Cache-Control', 'public, max-age=3600').send(body);

/** Sitemap index: pages, city and area pages, hotels (with photos). */
export const sitemapXml = async (req, res) => {
  const now = day(new Date());
  sendXml(res, `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${['pages', 'places', 'hotels'].map((n) => `  <sitemap><loc>${xml(`${site()}/sitemaps/${n}.xml`)}</loc><lastmod>${now}</lastmod></sitemap>`).join('\n')}
</sitemapindex>
`);
};

export const sitemapPart = async (req, res, next) => {
  try {
    const part = req.params.part;
    if (part === 'pages') {
      return sendXml(res, urlset(['/', '/help', '/list-your-property', '/rewards', '/membership', '/terms', '/privacy', '/refund-policy'].map((p) => ({ loc: `${site()}${p}` }))));
    }
    if (part === 'places') {
      const all = await seo.places();
      return sendXml(res, urlset(Object.keys(all).map((slug) => ({ loc: `${site()}/hotels-in-${slug}` }))));
    }
    if (part === 'hotels') {
      const hotels = await seo.liveHotels();
      const photos = await prisma.hotelImage.findMany({
        where: { hotelId: { in: hotels.map((h) => h.id) } }, select: { hotelId: true, url: true }, orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
      });
      const byHotel = {};
      for (const p of photos) if ((byHotel[p.hotelId] ||= []).length < 10) byHotel[p.hotelId].push(/^https?:/.test(p.url) ? p.url : `${site()}${/^\/uploads\/.+\.(jpe?g|png|webp)$/i.test(p.url) ? `/img/w1600${p.url}` : p.url}`);
      return sendXml(res, urlset(hotels.map((h) => ({ loc: `${site()}/hotel/${h.slug}`, lastmod: day(h.updatedAt), images: byHotel[h.id] || [] })), true));
    }
    return res.status(404).end();
  } catch (err) {
    return next(err);
  }
};
