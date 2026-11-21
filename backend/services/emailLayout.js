/**
 * The common ZivoHotels email look: logo bar, title, text, optional detail rows and button,
 * support line. Every account and notification email uses it so they read as one brand.
 * Values passed in `rows` and `cta` are escaped here; `body` is trusted HTML (escape user text
 * before putting it in).
 */
import { escapeHtml as h } from '../utils/html.js';
import { getSupportContacts } from '../config/supportContacts.js';

export const siteUrl = () => String(process.env.FRONTEND_URL || '').replace(/\/$/, '');

/** "Sat, 21 Nov 2026" in India time */
export const emailDay = (d) => new Date(d).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
export const inr = (n) => `₹${Math.round(Number(n) || 0).toLocaleString('en-IN')}`;

export const emailLayout = async ({ title, body = '', rows = [], cta, note }) => {
  const support = await getSupportContacts().catch(() => ({}));
  const site = siteUrl();
  const link = cta?.href ? (cta.href.startsWith('http') ? cta.href : `${site}${cta.href}`) : null;
  return `<!DOCTYPE html><html><body style="margin:0;background:#f8fafc;font-family:Arial,Helvetica,sans-serif;color:#0f172a">
  <div style="max-width:560px;margin:0 auto;padding:24px 16px">
    <div style="font-size:20px;font-weight:bold;color:#e7194a;margin-bottom:16px">ZivoHotels</div>
    <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:24px">
      <h1 style="margin:0 0 12px;font-size:20px;line-height:1.3">${h(title)}</h1>
      <div style="font-size:15px;line-height:1.55;color:#334155">${body}</div>
      ${rows.length ? `<table style="font-size:14px;margin:16px 0 4px;border-collapse:collapse">${rows.filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => `<tr><td style="color:#64748b;padding:3px 16px 3px 0;vertical-align:top">${h(k)}</td><td style="padding:3px 0"><b>${h(v)}</b></td></tr>`).join('')}</table>` : ''}
      ${link && site ? `<p style="margin:20px 0 4px"><a href="${h(link)}" style="display:inline-block;background:#e7194a;color:#ffffff;text-decoration:none;padding:11px 20px;border-radius:8px;font-weight:bold">${h(cta.label)}</a></p>` : ''}
      ${note ? `<p style="font-size:13px;color:#64748b;margin:16px 0 0">${note}</p>` : ''}
    </div>
    <p style="font-size:12px;color:#64748b;text-align:center;margin:16px 0 0">
      ${support.phone || support.email ? `Need help? ${[support.phone, support.email].filter(Boolean).map(h).join(' · ')}<br>` : ''}
      ZivoHotels${site ? ` · <a href="${h(site)}" style="color:#64748b">${h(site.replace(/^https?:\/\//, ''))}</a>` : ''}
    </p>
  </div></body></html>`;
};
