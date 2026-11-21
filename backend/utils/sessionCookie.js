/**
 * The login session as an HTTP-only cookie ("zivo_session"), so scripts on the page can't read
 * it (the token used to sit in localStorage, readable by any script that got onto the page).
 *
 * - Set at login and password change; cleared at logout.
 * - SameSite=Lax: other sites can't make the browser send it with their requests (a cross-site
 *   form post or fetch arrives without it). Secure on HTTPS (production).
 * - The API still accepts "Authorization: Bearer <token>" (API clients, tests, older pages);
 *   a header without a real token ("Bearer null", left by pages that used to read localStorage)
 *   falls back to the cookie.
 */
const COOKIE = 'zivo_session';

const maxAgeMs = () => {
  const v = String(process.env.JWT_EXPIRES_IN || '7d').trim();
  const m = v.match(/^(\d+)\s*([smhd])?$/);
  if (!m) return 7 * 86400000;
  return Number(m[1]) * ({ s: 1000, m: 60000, h: 3600000, d: 86400000 }[m[2] || 's']);
};

const secure = () => process.env.NODE_ENV === 'production';

export const setSessionCookie = (res, token) => {
  if (!token) return;
  res.cookie(COOKIE, token, { httpOnly: true, secure: secure(), sameSite: 'lax', path: '/', maxAge: maxAgeMs() });
};

export const clearSessionCookie = (res) => {
  res.clearCookie(COOKIE, { httpOnly: true, secure: secure(), sameSite: 'lax', path: '/' });
};

/** The session cookie's value from a raw Cookie header (no cookie-parser needed). */
export const cookieToken = (cookieHeader) => {
  for (const part of String(cookieHeader || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === COOKIE) {
      try { return decodeURIComponent(part.slice(i + 1).trim()); } catch { return null; }
    }
  }
  return null;
};

const realBearer = (header) => {
  if (!header || !header.startsWith('Bearer')) return null;
  const t = header.split(' ')[1];
  return t && !['null', 'undefined', ''].includes(t) ? t : null;
};

/** The request's token and where it came from: { token, viaCookie } */
export const requestToken = (req) => {
  const bearer = realBearer(req.headers.authorization);
  if (bearer) return { token: bearer, viaCookie: false };
  const c = cookieToken(req.headers.cookie);
  return c ? { token: c, viaCookie: true } : { token: null, viaCookie: false };
};
