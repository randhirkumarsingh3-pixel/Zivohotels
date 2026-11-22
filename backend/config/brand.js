/**
 * The brand: its name and main web address, in one place. Pages, emails, vouchers, invoices and
 * SEO read them from here. The site address the app actually runs at (staging or live) comes
 * from FRONTEND_URL; the brand domain is only the fallback.
 */
export const BRAND_NAME = 'ZivoPlus';
export const BRAND_DOMAIN = 'zivoplus.com';
export const siteUrl = () => String(process.env.FRONTEND_URL || `https://${BRAND_DOMAIN}`).replace(/\/$/, '');
