/**
 * The ZivoPlus document look, shared by every PDF (guest invoice and voucher, hotelier voucher,
 * commission invoice, credit note, statement): a navy header band with the logo, a rose accent
 * line, a meta strip, party boxes, navy-headed tables, totals, amount in words, signature, and a
 * footer on every page with the company line and page numbers.
 *
 * Pages are self-contained HTML (no network: fonts and logo are embedded or system fonts), so a
 * document always renders the same and can be made into a PDF offline.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getBrowser } from '../../utils/browser.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
let MARK = '';
try { MARK = fs.readFileSync(path.join(HERE, '../../assets/zivo-mark-112.png')).toString('base64'); } catch { /* the logo is optional */ }

// ── formatting ────────────────────────────────────────────────────────────────

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const num = (v) => Number(v || 0);
export const money = (v) => num(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const inr = (v) => `${num(v) < 0 ? '−' : ''}₹${money(Math.abs(num(v)))}`;
const IST = 'Asia/Kolkata';
export const day = (d, opts = {}) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: IST, ...opts }) : '');
export const dateTime = (d) => (d ? new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true, timeZone: IST }) : '');

/** Indian-style amount in words: "Rupees Seven Thousand Three Hundred Forty Five and Fifty Paise Only". */
export const amountInWords = (amount) => {
  const ones = 'Zero One Two Three Four Five Six Seven Eight Nine Ten Eleven Twelve Thirteen Fourteen Fifteen Sixteen Seventeen Eighteen Nineteen'.split(' ');
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const w = (x) => {
    if (x < 20) return ones[x];
    if (x < 100) return tens[Math.floor(x / 10)] + (x % 10 ? ` ${ones[x % 10]}` : '');
    if (x < 1000) return `${ones[Math.floor(x / 100)]} Hundred${x % 100 ? ` ${w(x % 100)}` : ''}`;
    for (const [d, name] of [[1e7, 'Crore'], [1e5, 'Lakh'], [1e3, 'Thousand']]) if (x >= d) return `${w(Math.floor(x / d))} ${name}${x % d ? ` ${w(x % d)}` : ''}`;
    return '';
  };
  const v = Math.abs(Math.round(num(amount) * 100));
  const rupees = Math.floor(v / 100); const paise = v % 100;
  return `Rupees ${w(rupees)}${paise ? ` and ${w(paise)} Paise` : ''} Only`;
};

// ── look ──────────────────────────────────────────────────────────────────────

export const COLORS = { navy: '#0b1f3a', navy2: '#13294b', rose: '#e11d48', ink: '#0f172a', muted: '#64748b', line: '#e2e8f0', soft: '#f8fafc', gold: '#b45309' };

export const CSS = `
@page { size: A4; margin: 12mm 12mm 16mm }
* { box-sizing: border-box }
body { font-family: Inter, "Noto Sans", "Segoe UI", "Liberation Sans", Arial, sans-serif; color: ${COLORS.ink}; font-size: 10.5px; line-height: 1.5; margin: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact }
.page { page-break-after: always } .page:last-child { page-break-after: auto }
.muted { color: ${COLORS.muted} } .b { font-weight: 700 } .r { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap }
.band { background: linear-gradient(135deg, ${COLORS.navy} 0%, ${COLORS.navy2} 100%); color: #fff; border-radius: 12px 12px 0 0; padding: 16px 20px; display: flex; justify-content: space-between; align-items: center; gap: 16px }
.accent { height: 4px; background: linear-gradient(90deg, ${COLORS.rose}, #fb7185 60%, #fda4af); border-radius: 0 0 4px 4px; margin-bottom: 12px }
.brand { display: flex; gap: 11px; align-items: center } .brand img { width: 38px; height: 38px; border-radius: 8px; background: #fff; padding: 3px }
.brand .name { font-size: 21px; font-weight: 800; letter-spacing: -.4px } .brand .name span { color: #fb7185 } .brand .sub { color: #cbd5e1; font-size: 9.5px }
.doc { text-align: right } .doc h1 { margin: 0; font-size: 17px; letter-spacing: .2px } .doc .sub { color: #cbd5e1; font-size: 9.5px; margin-top: 1px }
.ref { display: inline-block; margin-top: 6px; padding: 2px 10px; border-radius: 99px; background: rgba(255,255,255,.12); border: 1px solid rgba(255,255,255,.25); font-weight: 700; font-size: 9.5px; letter-spacing: .3px }
.status { display: inline-block; padding: 2px 9px; border-radius: 99px; font-weight: 700; font-size: 9.5px; background: #ecfdf5; color: #047857 }
.status.warn { background: #fff7ed; color: #c2410c } .status.off { background: #f1f5f9; color: #475569 } .status.test { background: #fef3c7; color: #92400e }
.meta { display: grid; grid-template-columns: repeat(4, 1fr); border: 1px solid ${COLORS.line}; border-radius: 10px; overflow: hidden; background: #fff }
.meta > div { padding: 8px 10px; border-right: 1px solid ${COLORS.line} } .meta > div:last-child { border-right: 0 }
.k { color: ${COLORS.muted}; font-size: 8.5px; text-transform: uppercase; letter-spacing: .08em; font-weight: 600 } .v { font-weight: 700; margin-top: 2px; font-size: 11px }
.parties { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 10px } .parties.three { grid-template-columns: 1fr 1fr 1fr }
.box { border: 1px solid ${COLORS.line}; border-radius: 10px; padding: 9px 11px; background: #fff; break-inside: avoid }
.box h3, .label { margin: 0 0 4px; font-size: 8.5px; color: ${COLORS.rose}; text-transform: uppercase; letter-spacing: .1em; font-weight: 700 }
.box .n { font-weight: 800; font-size: 12px; color: ${COLORS.navy} }
table { width: 100%; border-collapse: collapse; margin-top: 10px; break-inside: auto } tr { break-inside: avoid }
th { background: ${COLORS.navy2}; color: #fff; text-align: left; padding: 6px 7px; font-size: 9px; font-weight: 600; letter-spacing: .02em }
th:first-child { border-radius: 6px 0 0 0 } th:last-child { border-radius: 0 6px 0 0 }
td { padding: 6px 7px; border-bottom: 1px solid ${COLORS.line}; vertical-align: top }
tr.t td { font-weight: 800; background: ${COLORS.soft}; border-top: 2px solid ${COLORS.navy2}; border-bottom: 0 }
tr.group td { color: ${COLORS.rose}; font-weight: 700; background: #fff }
.cols { display: grid; grid-template-columns: 1.25fr 1fr; gap: 12px; margin-top: 10px; align-items: start }
.totals { border: 1px solid ${COLORS.line}; border-radius: 10px; overflow: hidden; break-inside: avoid }
.totals div { display: flex; justify-content: space-between; gap: 10px; padding: 5px 11px; border-bottom: 1px dashed ${COLORS.line} }
.totals div:last-child { border-bottom: 0 }
.totals .sub { font-weight: 700; border-bottom: 1px solid #cbd5e1 }
.totals .grand { background: ${COLORS.navy}; color: #fff; font-size: 13px; font-weight: 800; padding: 8px 11px }
.totals .less { color: #be123c } .totals .plus { color: #047857 }
.words { margin-top: 8px; padding: 7px 11px; background: #fff1f2; border-left: 3px solid ${COLORS.rose}; border-radius: 6px; font-weight: 600 }
.cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-top: 10px } .cards.two { grid-template-columns: 1fr 1fr } .cards.three { grid-template-columns: repeat(3, 1fr) }
.card { background: ${COLORS.soft}; border: 1px solid ${COLORS.line}; border-radius: 10px; padding: 8px 11px; break-inside: avoid } .card .v { font-size: 13.5px; color: ${COLORS.navy} }
.card.hero { background: ${COLORS.navy}; border-color: ${COLORS.navy}; color: #fff } .card.hero .k { color: #cbd5e1 } .card.hero .v { color: #fff }
h2 { font-size: 12.5px; color: ${COLORS.navy}; margin: 14px 0 0; display: flex; align-items: center; gap: 7px; break-after: avoid }
h2::before { content: ""; width: 4px; height: 13px; background: ${COLORS.rose}; border-radius: 2px }
.notes { margin-top: 8px; color: #475569; font-size: 9.5px; line-height: 1.55 } .notes ul { margin: 4px 0 0; padding-left: 15px } .notes li { margin: 2px 0 }
.sig { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 14px; break-inside: avoid }
.sig .stamp { color: ${COLORS.muted}; font-size: 9px; max-width: 60% }
.sig .who { text-align: right } .sig .line { margin-top: 26px; border-top: 1px solid #94a3b8; padding-top: 3px; display: inline-block; min-width: 190px; text-align: center }
.minus { color: #be123c } .plus { color: #047857 }
.room { display: flex; justify-content: space-between; gap: 10px; padding: 7px 11px; border: 1px solid ${COLORS.line}; border-radius: 10px; margin-top: 6px; break-inside: avoid } .room.off { opacity: .55 }
.wm { position: fixed; top: 38%; left: 4%; font-size: 60px; color: rgba(217,119,6,.10); transform: rotate(-24deg); font-weight: 900; white-space: nowrap; z-index: -1 }
`;

/** The full HTML page. `watermark`: e.g. "TEST · NOT A TAX INVOICE". */
export const shell = (title, body, { watermark = null, extraCss = '' } = {}) => `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>${CSS}${extraCss}</style></head><body>${watermark ? `<div class="wm">${esc(watermark)}</div>` : ''}${body}</body></html>`;

/**
 * The header band. brandSub: the legal name (or "Partner"); title / sub: the document; ref: its
 * number or booking reference; status: { label, tone: ''|'warn'|'off'|'test' }.
 */
export const header = ({ brandSub = '', title, sub = '', ref = '', status = null, brandName = null, brandLogo = null }) => `<div class="band">
<div class="brand">${brandName ? `${brandLogo && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(brandLogo) ? `<img src="${brandLogo}" alt="" style="max-height:44px;max-width:150px;width:auto;background:#fff;border-radius:6px;padding:3px">` : ''}<div><div class="name">${esc(brandName)}</div>${brandSub ? `<div class="sub">${esc(brandSub)}</div>` : ''}</div>` : `${MARK ? `<img src="data:image/png;base64,${MARK}" alt="">` : ''}<div><div class="name">Zivo<span>Plus</span></div>${brandSub && brandSub !== 'ZivoPlus' ? `<div class="sub">${esc(brandSub)}</div>` : ''}</div>`}</div>
<div class="doc"><h1>${esc(title)}</h1>${sub ? `<div class="sub">${esc(sub)}</div>` : ''}${ref ? `<div class="ref">${esc(ref)}</div>` : ''}${status ? ` <span class="status ${status.tone || ''}">${esc(status.label)}</span>` : ''}</div>
</div><div class="accent"></div>`;

/** Four-cell meta strip: [[label, valueHtml], ...] (values are trusted HTML; escape before). */
export const meta = (items) => `<div class="meta">${items.filter(Boolean).map(([k, v]) => `<div><div class="k">${esc(k)}</div><div class="v">${v}</div></div>`).join('')}</div>`;

/** A party box: { label, name, lines: [html...] } */
export const box = ({ label, name, lines = [] }) => `<div class="box"><h3>${esc(label)}</h3>${name ? `<div class="n">${esc(name)}</div>` : ''}${lines.filter(Boolean).map((l) => `<div>${l}</div>`).join('')}</div>`;

/** Totals panel: rows [label, amountText, cls?] with cls 'sub' | 'grand' | 'less' | 'plus'. */
export const totals = (rows) => `<div class="totals">${rows.filter(Boolean).map(([k, v, cls]) => `<div class="${cls || ''}"><span>${k}</span><span class="r">${v}</span></div>`).join('')}</div>`;

/** Signature block: "For <company>" and the signatory's line, with a computer-generated note. */
export const signature = (companyName, signatory = 'Authorised signatory') => `<div class="sig"><div class="stamp">This is a computer-generated document and does not need a physical signature.</div>
<div class="who">For ${esc(companyName || 'ZivoPlus')}<br><span class="line">${esc(signatory)}</span></div></div>`;

/** The line printed at the bottom of every page (company, registrations, support). */
export const footerLine = (company = {}, support = {}) => [
  company.legalName || company.name,
  company.gstin && `GSTIN ${company.gstin}`,
  company.cin && `CIN ${company.cin}`,
  support.email || company.email,
  support.phone || company.phone,
].filter(Boolean).join('  ·  ');

/**
 * Makes the PDF. Every page gets the footer line and "Page x of y". No network: anything that
 * isn't embedded in the page is blocked, so a document can't reach out while it renders.
 */
export const renderPdf = async (html, { footer = '' } = {}) => {
  const page = await (await getBrowser()).newPage();
  try {
    await page.setRequestInterception(true);
    page.on('request', (req) => (req.url().startsWith('data:') ? req.continue() : req.abort()));
    await page.setContent(html, { waitUntil: 'load', timeout: 20000 });
    return Buffer.from(await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate: `<div style="width:100%;font-family:Arial,sans-serif;font-size:7px;color:#64748b;padding:0 12mm;display:flex;justify-content:space-between;gap:10px">
        <span>${esc(footer)}</span><span style="white-space:nowrap">Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>`,
      timeout: 20000,
    }));
  } finally {
    await page.close().catch(() => {});
  }
};

export default { CSS, shell, header, meta, box, totals, signature, footerLine, renderPdf, esc, money, inr, day, dateTime, amountInWords, num, COLORS };
