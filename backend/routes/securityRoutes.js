/**
 * POST /api/v1/security/csp-report — browsers report here when the website's Content Security
 * Policy blocks something (an injected script, a tampered library, a page framed by another site).
 * Public and unauthenticated by design, so it is small, rate limited and de-duplicated: each
 * distinct violation is logged at most once an hour as CSP_VIOLATION in the security log.
 */
import express from 'express';
import prisma from '../config/db.js';
import { redis } from '../config/redis.js';

const router = express.Router();
const parse = express.json({ limit: '16kb', type: ['application/csp-report', 'application/reports+json', 'application/json'] });
const seen = new Map(); // memory fallback for de-duplication
const clip = (v, n = 300) => (v == null ? null : String(v).slice(0, n));

const firstTime = async (key) => {
  if (redis?.isReady) {
    const ok = await redis.set(`zivo:csp:${key}`, '1', { EX: 3600, NX: true }).catch(() => 'OK');
    return ok === 'OK';
  }
  const now = Date.now();
  if ((seen.get(key) || 0) > now) return false;
  if (seen.size > 5000) seen.clear();
  seen.set(key, now + 3600_000);
  return true;
};

/** Accepts both the old ({ "csp-report": {...} }) and the new (Reporting API array) formats. */
export const normaliseReports = (body) => {
  const list = Array.isArray(body) ? body.map((r) => r?.body || {}) : [body?.['csp-report'] || {}];
  return list.slice(0, 10).map((r) => ({
    page: clip(r['document-uri'] || r.documentURL),
    blocked: clip(r['blocked-uri'] || r.blockedURL),
    directive: clip(r['effective-directive'] || r['violated-directive'] || r.effectiveDirective, 80),
    source: clip(r['source-file'] || r.sourceFile),
    line: Number(r['line-number'] || r.lineNumber) || null,
    sample: clip(r['script-sample'] || r.sample, 120),
  })).filter((r) => r.directive);
};

router.post('/csp-report', parse, async (req, res) => {
  res.status(204).end(); // answer at once; the browser doesn't wait for anything
  try {
    for (const r of normaliseReports(req.body)) {
      // Pages are grouped by path only (no query strings: they can carry personal details)
      const page = r.page ? r.page.replace(/[?#].*$/, '') : null;
      if (!(await firstTime(`${r.directive}|${r.blocked}|${page}`))) continue;
      await prisma.securityLog.create({ data: { type: 'CSP_VIOLATION', ip: req.ip || 'unknown', userAgent: clip(req.get('user-agent'), 200), details: { ...r, page } } }).catch(() => {});
    }
  } catch { /* a bad report is ignored */ }
});

export default router;
