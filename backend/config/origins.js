/**
 * origins.js — browser origins allowed to call the API and open the Socket.io connection.
 *
 * Built-in production domains and local development origins, plus any extra origins from
 * CORS_ORIGINS (comma-separated, e.g. "https://staging.zivoplus.com"), so a staging or
 * self-hosted deployment works without code changes.
 */
const BUILT_IN = [
  'https://zivoplus.com',
  'https://www.zivoplus.com',
  'https://admin.zivoplus.com',
  'https://partner.zivoplus.com',
  /^https:\/\/zivohotels.*\.vercel\.app$/,
  'http://localhost:5173',
  'http://localhost:3000',
  'http://127.0.0.1:5173',
];

const fromEnv = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((o) => o.trim().replace(/\/+$/, ''))
  .filter(Boolean);

export const allowedOrigins = [...BUILT_IN, ...fromEnv];

export const isAllowedOrigin = (origin) =>
  allowedOrigins.some((o) => (typeof o === 'string' ? o === origin : o.test(origin)));
