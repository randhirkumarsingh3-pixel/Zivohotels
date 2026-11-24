/**
 * The ZivoPlus email look (the email twin of services/documents/theme.js): a navy header with the
 * logo, an optional reference and status, a rose accent line, a white card with the title, text,
 * detail rows, optional sections and buttons, and a footer with support contacts and the legal
 * line. Built from tables with inline styles so it renders the same in Gmail, Outlook and phones.
 *
 * Every account, booking and notification email uses it. Values in `rows`, `ref`, `status`,
 * `eyebrow` and `cta` are escaped here; `body`, `note` and section `html` are trusted HTML
 * (escape user text before putting it in). The email worker wraps any older email that doesn't
 * use this layout in the same frame (brandEmail), so every email reads as one brand.
 */
import { escapeHtml as h } from '../utils/html.js';
import { getSupportContacts } from '../config/supportContacts.js';

export const siteUrl = () => String(process.env.FRONTEND_URL || '').replace(/\/$/, '');

/** "Sat, 21 Nov 2026" in India time */
export const emailDay = (d) => new Date(d).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
export const inr = (n) => `₹${Math.round(Number(n) || 0).toLocaleString('en-IN')}`;

const C = { navy: '#0b1f3a', navy2: '#13294b', rose: '#e11d48', ink: '#0f172a', text: '#334155', muted: '#64748b', line: '#e2e8f0', soft: '#f8fafc', bg: '#eef2f7' };
const FONT = "font-family:Inter,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
export const MARKER = 'data-zivo-email="1"';

const TONES = { ok: ['#ecfdf5', '#047857'], warn: ['#fff7ed', '#c2410c'], off: ['#f1f5f9', '#475569'], info: ['#eff6ff', '#1d4ed8'] };

/** Two-column detail rows (label, value), values bold. */
export const detailRows = (rows) => {
  const list = rows.filter((r) => r && r[1] !== undefined && r[1] !== null && r[1] !== '');
  if (!list.length) return '';
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:14px 0 4px;font-size:14px">${list.map(([k, v], i) => `<tr><td style="padding:8px 12px 8px 0;color:${C.muted};vertical-align:top;width:38%;${i ? `border-top:1px solid ${C.line};` : ''}">${h(k)}</td><td style="padding:8px 0;color:${C.ink};font-weight:600;vertical-align:top;${i ? `border-top:1px solid ${C.line};` : ''}">${h(v)}</td></tr>`).join('')}</table>`;
};

/** A titled block inside the card (e.g. "Price", "House rules"). html is trusted. */
export const section = (title, html) => `<div style="margin:22px 0 0"><div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;font-weight:700;color:${C.rose};margin:0 0 6px">${h(title)}</div>${html}</div>`;

/** Amount lines with a navy total row: [[label, value, tone?]] tone: 'less' | 'plus' | 'total' | 'sub'. */
export const moneyTable = (rows) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px;border:1px solid ${C.line};border-radius:10px;overflow:hidden">${rows.filter(Boolean).map(([k, v, tone]) => {
  const total = tone === 'total';
  const color = tone === 'less' ? '#be123c' : tone === 'plus' ? '#047857' : total ? '#ffffff' : C.ink;
  return `<tr style="${total ? `background:${C.navy};` : ''}"><td style="padding:9px 12px;color:${total ? '#ffffff' : tone === 'sub' ? C.ink : C.text};${tone === 'sub' || total ? 'font-weight:700;' : ''}border-top:1px solid ${total ? C.navy : C.line}">${h(k)}</td><td style="padding:9px 12px;text-align:right;white-space:nowrap;color:${color};${total || tone === 'sub' ? 'font-weight:800;' : 'font-weight:600;'}${total ? 'font-size:16px;' : ''}border-top:1px solid ${total ? C.navy : C.line}">${h(v)}</td></tr>`;
}).join('')}</table>`;

/** A bullet list; items: strings or { text, allowed } (✓ / ✕ markers). */
export const bullets = (items) => `<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px;color:${C.text}">${items.filter(Boolean).map((it) => {
  const t = typeof it === 'string' ? { text: it, allowed: null } : it;
  const mark = t.allowed === true ? `<span style="color:#047857;font-weight:700">✓</span>` : t.allowed === false ? `<span style="color:#be123c;font-weight:700">✕</span>` : `<span style="color:${C.rose}">•</span>`;
  return `<tr><td style="padding:3px 8px 3px 0;vertical-align:top">${mark}</td><td style="padding:3px 0;line-height:1.5">${h(t.text)}</td></tr>`;
}).join('')}</table>`;

const button = (cta, primary, site) => {
  if (!cta?.href) return '';
  const href = cta.href.startsWith('http') ? cta.href : site ? `${site}${cta.href}` : '';
  if (!href) return '';
  return `<a href="${h(href)}" style="display:inline-block;${primary ? `background:${C.rose};color:#ffffff;border:1px solid ${C.rose}` : `background:#ffffff;color:${C.navy};border:1px solid #cbd5e1`};text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:700;font-size:14px;margin:0 8px 8px 0">${h(cta.label)}</a>`;
};

/** The outer frame: header band, accent, card (inner html), footer. */
const frame = async ({ inner, ref, status, eyebrow, preheader }) => {
  const support = await getSupportContacts().catch(() => ({}));
  const site = siteUrl();
  const logo = site ? `<img src="${h(site)}/brand/zivo-mark-112.png" width="34" height="34" alt="" style="display:block;border-radius:8px;background:#ffffff;padding:2px">` : '';
  const tone = status ? (TONES[status.tone] || TONES.ok) : null;
  let footerNote = '';
  try { footerNote = (await (await import('./documents/documentSettings.js')).getDocumentSettings()).email.footerNote || ''; } catch { /* settings are optional */ }
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"></head>
<body ${MARKER} style="margin:0;padding:0;background:${C.bg};${FONT};color:${C.ink}">
${preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0">${h(preheader)}</div>` : ''}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.bg}"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px">
  <tr><td style="background:${C.navy};background-image:linear-gradient(135deg,${C.navy},${C.navy2});border-radius:14px 14px 0 0;padding:18px 22px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td style="vertical-align:middle"><table role="presentation" cellpadding="0" cellspacing="0"><tr>${logo ? `<td style="padding-right:10px">${logo}</td>` : ''}<td style="font-size:21px;font-weight:800;color:#ffffff;letter-spacing:-.3px">Zivo<span style="color:#fb7185">Plus</span></td></tr></table></td>
      <td style="text-align:right;vertical-align:middle;font-size:12px;color:#cbd5e1">${eyebrow ? `<div style="text-transform:uppercase;letter-spacing:.08em;font-size:11px">${h(eyebrow)}</div>` : ''}${ref ? `<div style="margin-top:4px;display:inline-block;padding:3px 10px;border-radius:99px;border:1px solid rgba(255,255,255,.3);color:#ffffff;font-weight:700;font-size:12px">${h(ref)}</div>` : ''}${status ? ` <span style="display:inline-block;margin-top:4px;padding:3px 10px;border-radius:99px;background:${tone[0]};color:${tone[1]};font-weight:700;font-size:12px">${h(status.label)}</span>` : ''}</td>
    </tr></table>
  </td></tr>
  <tr><td style="height:4px;background:${C.rose};background-image:linear-gradient(90deg,${C.rose},#fb7185,#fda4af);font-size:0;line-height:0">&nbsp;</td></tr>
  <tr><td style="background:#ffffff;border:1px solid ${C.line};border-top:0;border-radius:0 0 14px 14px;padding:26px 24px">${inner}</td></tr>
  <tr><td style="padding:18px 12px 0;text-align:center;font-size:12px;line-height:1.6;color:${C.muted}">
    ${support.phone || support.email ? `Need help? ${[support.phone, support.email].filter(Boolean).map(h).join(' · ')}<br>` : ''}
    ${footerNote ? `${h(footerNote)}<br>` : ''}
    ZivoPlus${site ? ` · <a href="${h(site)}" style="color:${C.muted}">${h(site.replace(/^https?:\/\//, ''))}</a>` : ''}
  </td></tr>
</table></td></tr></table></body></html>`;
};

/**
 * The standard email. title, body (trusted HTML), rows ([label, value]), sections ([{ title,
 * html }]), cta / cta2 ({ label, href }), note (trusted HTML), and for the header: ref, status
 * ({ label, tone: ok|warn|off|info }), eyebrow; preheader is the inbox preview text.
 */
export const emailLayout = async ({ title, body = '', rows = [], cta, cta2, note, sections = [], ref, status, eyebrow, preheader }) => {
  const site = siteUrl();
  const buttons = [button(cta, true, site), button(cta2, false, site)].join('');
  const inner = `<h1 style="margin:0 0 10px;font-size:22px;line-height:1.3;color:${C.navy}">${h(title)}</h1>
<div style="font-size:15px;line-height:1.6;color:${C.text}">${body}</div>
${detailRows(rows)}
${sections.filter(Boolean).map((s) => section(s.title, s.html)).join('')}
${buttons ? `<div style="margin:24px 0 0">${buttons}</div>` : ''}
${note ? `<p style="font-size:13px;line-height:1.55;color:${C.muted};margin:18px 0 0;padding-top:14px;border-top:1px solid ${C.line}">${note}</p>` : ''}`;
  return frame({ inner, ref, status, eyebrow, preheader });
};

/**
 * Any older email built without the layout gets the same frame: its body content goes into the
 * white card. Emails already using the layout are returned as they are.
 */
export const brandEmail = async (html) => {
  if (!html || html.includes(MARKER)) return html;
  const m = /<body[^>]*>([\s\S]*?)<\/body>/i.exec(html);
  const inner = `<div style="font-size:15px;line-height:1.6;color:${C.text}">${m ? m[1] : html}</div>`;
  return frame({ inner });
};

export default { emailLayout, brandEmail, emailDay, inr, siteUrl, detailRows, section, moneyTable, bullets };
