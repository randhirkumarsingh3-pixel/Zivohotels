/**
 * Printable pages (A4, made into PDFs) for commission tax invoices, credit notes and statements.
 * Everything comes from the stored document (or the statement data); nothing is looked up again,
 * so a document always prints the way it was issued.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
let MARK = '';
try { MARK = fs.readFileSync(path.join(HERE, '../../assets/zivo-mark-112.png')).toString('base64'); } catch { /* the logo is optional */ }

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const n = (v) => Number(v || 0);
const money = (v) => n(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const inr = (v) => `${n(v) < 0 ? '−' : ''}₹${money(Math.abs(n(v)))}`;
const day = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }) : '');
const dateOnly = (d) => (d ? new Date(`${d}T00:00:00Z`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', timeZone: 'UTC' }) : '');
const monthLabel = (p) => new Date(`${p}-01T00:00:00Z`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });

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
  const v = Math.abs(Math.round(n(amount) * 100));
  const rupees = Math.floor(v / 100); const paise = v % 100;
  return `Rupees ${w(rupees)}${paise ? ` and ${w(paise)} Paise` : ''} Only`;
};

const CSS = `
* { box-sizing: border-box } body { font-family: Inter, "Segoe UI", Arial, sans-serif; color:#0f172a; font-size:10.5px; margin:0 }
.page { page-break-after: always } .page:last-child { page-break-after: auto }
.top { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:3px solid #e11d48; padding-bottom:10px }
.brand { display:flex; gap:10px; align-items:center } .brand img { width:40px; height:40px }
.brand b { font-size:22px; letter-spacing:-.5px; color:#13294b } .brand b span { color:#e11d48 } .muted { color:#64748b }
.doc { text-align:right } .doc h1 { margin:0; font-size:18px; color:#13294b } .pill { display:inline-block; padding:2px 8px; border-radius:99px; background:#ecfdf5; color:#047857; font-weight:700; font-size:9.5px; margin-top:6px }
.pill.test { background:#fef3c7; color:#92400e }
.grid { display:grid; grid-template-columns:repeat(4,1fr); border:1px solid #e2e8f0; border-radius:8px; margin-top:12px; overflow:hidden }
.grid div { padding:7px 9px; border-right:1px solid #e2e8f0 } .grid div:last-child { border-right:0 }
.k { color:#64748b; font-size:9px; text-transform:uppercase; letter-spacing:.06em } .v { font-weight:700; margin-top:2px }
.parties { display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-top:12px }
.box { border:1px solid #e2e8f0; border-radius:8px; padding:9px 11px } .box h3 { margin:0 0 4px; font-size:9.5px; color:#e11d48; text-transform:uppercase; letter-spacing:.08em } .box .n { font-weight:800; font-size:11.5px }
table { width:100%; border-collapse:collapse; margin-top:12px } th { background:#13294b; color:#fff; text-align:left; padding:6px 7px; font-size:9.5px }
td { padding:5px 7px; border-bottom:1px solid #e2e8f0; vertical-align:top } .r { text-align:right; font-variant-numeric:tabular-nums; white-space:nowrap }
tr.t td { font-weight:800; background:#f8fafc; border-top:2px solid #13294b }
.cards { display:grid; grid-template-columns:repeat(4,1fr); gap:8px; margin-top:12px } .card { background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:8px 10px } .card .v { font-size:13px }
.words { margin-top:8px; padding:7px 10px; background:#fff1f2; border-radius:6px; font-weight:600 }
.notes { margin-top:10px; color:#475569; font-size:9.5px; line-height:1.5 } h2 { font-size:13px; color:#13294b; margin:14px 0 0 }
.sig { text-align:right; margin-top:16px } .sig .line { margin-top:26px; border-top:1px solid #94a3b8; padding-top:3px; display:inline-block; min-width:200px }
.minus { color:#be123c } .plus { color:#047857 }
.wm { position:fixed; top:38%; left:6%; font-size:64px; color:rgba(217,119,6,.10); transform:rotate(-24deg); font-weight:900; white-space:nowrap }
`;

const shell = (title, body, test) => `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>${CSS}</style></head><body>${test ? '<div class="wm">TEST · NOT A TAX INVOICE</div>' : ''}${body}</body></html>`;

const head = (s, title, sub, pill, test) => `<div class="top"><div class="brand">${MARK ? `<img src="data:image/png;base64,${MARK}" alt="">` : ''}<div><b>Zivo<span>Plus</span></b><div class="muted">${esc(s.legalName)}</div></div></div>
<div class="doc"><h1>${esc(title)}</h1><div class="muted">${esc(sub)}</div><div class="pill${test ? ' test' : ''}">${esc(pill)}</div></div></div>`;

const parties = (s, r) => `<div class="parties"><div class="box"><h3>From (supplier)</h3><div class="n">${esc(s.legalName)}</div><div class="muted">${esc(s.address)}</div>
<div>GSTIN <b>${esc(s.gstin || '—')}</b> · PAN ${esc(s.pan || '—')}${s.cin ? ` · CIN ${esc(s.cin)}` : ''}</div><div class="muted">State: ${esc(s.stateName)} (${esc(s.stateCode)})${s.email ? ` · ${esc(s.email)}` : ''}</div></div>
<div class="box"><h3>To (recipient)</h3><div class="n">${esc(r.legalName)}</div><div class="muted">for ${esc(r.property)} · Property ID ${esc(r.propertyId)}</div><div class="muted">${esc(r.address)}</div>
<div>${r.gstin ? `GSTIN <b>${esc(r.gstin)}</b>` : 'Not registered for GST'}${r.pan ? ` · PAN ${esc(r.pan)}` : ''}</div><div class="muted">State: ${esc(r.stateName || '—')}${r.stateCode ? ` (${esc(r.stateCode)})` : ''} · ${r.registered ? 'Registered (B2B)' : 'Unregistered (B2C)'}</div></div></div>`;

const taxCols = (d) => (n(d.cgst) || n(d.sgst) ? ['cgst', 'sgst'] : ['igst']);
// GST rate on the document, from its own figures (rates can change between documents)
const taxLabels = (d) => {
  const rate = n(d.taxable) ? Math.round(((n(d.cgst) + n(d.sgst) + n(d.igst)) / n(d.taxable)) * 1000) / 10 : 18;
  const fmt = (v) => `${Number.isInteger(v) ? v : v.toFixed(1)}%`;
  return { cgst: `CGST ${fmt(rate / 2)}`, sgst: `SGST ${fmt(rate / 2)}`, igst: `IGST ${fmt(rate)}` };
};

/** Tax invoice (with booking-wise annexure) or credit note. */
export const documentHtml = async (d, { original } = {}) => {
  const s = d.supplier; const r = d.recipient; const test = !d.live;
  const isCN = d.kind === 'CREDIT_NOTE';
  const cols = taxCols(d);
  const TAX_LABEL = taxLabels(d);
  const lines = d.lines || [];
  const nights = lines.reduce((a, l) => a + n(l.nights), 0);
  const hourly = lines.filter((l) => /^Hourly/.test(l.stay)).length;
  const rate = n(d.bookingValue) ? (n(d.taxable) / n(d.bookingValue)) * 100 : 0;
  const title = isCN ? 'Credit Note' : 'Tax Invoice';
  const sub = isCN ? `Commission given back · against ${original?.number || ''}` : `Commission for ${monthLabel(d.period)}`;
  const page1 = `<div class="page">${head(s, title, sub, d.number, test)}
<div class="grid"><div><div class="k">${isCN ? 'Credit note date' : 'Invoice date'}</div><div class="v">${day(d.issueDate)}</div></div>
<div><div class="k">${isCN ? 'Original invoice' : 'Period'}</div><div class="v">${isCN ? `${esc(original?.number || '')}<br><span class="muted">${day(original?.issueDate)}</span>` : `01–${new Date(Date.UTC(+d.period.slice(0, 4), +d.period.slice(5, 7), 0)).getUTCDate()} ${monthLabel(d.period)}`}</div></div>
<div><div class="k">Place of supply</div><div class="v">${esc(r.stateName || '—')} (${esc(d.placeOfSupply || '—')})</div></div><div><div class="k">Reverse charge</div><div class="v">No</div></div></div>
${parties(s, r)}
<table><tr><th>#</th><th>Description</th><th>SAC</th><th class="r">Taxable value (₹)</th>${cols.map((c) => `<th class="r">${TAX_LABEL[c]} (₹)</th>`).join('')}<th class="r">Total (₹)</th></tr>
<tr><td>1</td><td><b>${esc(s.description)}</b>${isCN ? ' — commission given back' : ''}<br><span class="muted">${isCN ? `${lines.length} stay${lines.length === 1 ? '' : 's'} from invoice ${esc(original?.number || '')}. Reason: ${esc(d.reason || '')}.` : `Commission on ${lines.length} stay${lines.length === 1 ? '' : 's'} settled in ${monthLabel(d.period)}${nights ? ` (${nights} room-night${nights === 1 ? '' : 's'}${hourly ? ` + ${hourly} hourly` : ''})` : hourly ? ` (${hourly} hourly)` : ''}, booking value ₹${money(d.bookingValue)} before GST, effective rate ${rate.toFixed(1)}%.`} Booking-wise details: Annexure A.</span></td>
<td>${esc(s.sac)}</td><td class="r">${money(d.taxable)}</td>${cols.map((c) => `<td class="r">${money(d[c])}</td>`).join('')}<td class="r">${money(d.total)}</td></tr>
<tr class="t"><td></td><td>Total</td><td></td><td class="r">${money(d.taxable)}</td>${cols.map((c) => `<td class="r">${money(d[c])}</td>`).join('')}<td class="r">${money(d.total)}</td></tr></table>
<div class="words">Amount in words: ${amountInWords(d.total)}</div>
<div class="cards"><div class="card"><div class="k">Stays</div><div class="v">${lines.length}</div></div><div class="card"><div class="k">Booking value (pre-GST)</div><div class="v">${inr(d.bookingValue)}</div></div>
<div class="card"><div class="k">Commission rate</div><div class="v">${rate.toFixed(1)}%</div></div><div class="card"><div class="k">${isCN ? 'Added to your next payout' : 'Already deducted from payouts'}</div><div class="v">${inr(d.total)}</div></div></div>
<div class="notes">${isCN
    ? '<b>How this is settled:</b> the commission and its GST above are given back to you and added to your next payout.<br><b>GST:</b> reported in ZivoPlus\'s GSTR-1 as a credit note against the original invoice; reverse the matching input tax credit for the month it appears in your GSTR-2B.'
    : `<b>How this is settled:</b> the commission and its GST were deducted from your payouts for these stays (see the ${monthLabel(d.period)} Statement of Account); for stays paid at the hotel the commission is taken from your next payouts.<br><b>Input tax credit:</b> ${r.gstin ? 'this invoice is reported in ZivoPlus\'s GSTR-1 under your GSTIN, so the GST appears in your GSTR-2B.' : 'add your GSTIN in the Extranet to receive B2B invoices and claim input tax credit.'}`}
${s.tcsGstin ? `<br>ZivoPlus TCS registration in ${esc(r.stateName)}: ${esc(s.tcsGstin)}.` : ''} ${s.tan ? `ZivoPlus TAN (TDS 194-O): ${esc(s.tan)}.` : ''}<br>This is a computer-generated document.</div>
<div class="sig">For ${esc(s.legalName)}<br><span class="line">${esc(s.signatory || 'Authorised signatory')}</span></div></div>`;
  const rows = lines.map((l, i) => `<tr><td>${i + 1}</td><td><b>${esc(l.ref)}</b><br><span class="muted">${esc(l.stay)} · ${esc(l.kind)}</span></td><td>${esc(l.guest)}</td><td>${dateOnly(l.checkIn)} – ${dateOnly(l.checkOut)}</td><td class="r">${l.nights || '–'}</td><td>${esc(l.payment)}</td>
<td class="r">${money(l.value)}</td><td class="r">${n(l.rate).toFixed(1)}%</td><td class="r">${money(l.commission)}</td>${cols.map((c) => `<td class="r">${money(l[c])}</td>`).join('')}<td class="r">${money(l.total)}</td></tr>`).join('');
  const page2 = `<div class="page">${head(s, 'Annexure A', `Booking-wise ${isCN ? 'credit' : 'commission'} · ${d.number}`, d.number, test)}
<table><tr><th>#</th><th>Booking</th><th>Guest</th><th>Stay</th><th class="r">Nights</th><th>Payment</th><th class="r">Room value*</th><th class="r">Rate</th><th class="r">Commission</th>${cols.map((c) => `<th class="r">${TAX_LABEL[c]}</th>`).join('')}<th class="r">Total</th></tr>${rows}
<tr class="t"><td></td><td>Total</td><td></td><td></td><td class="r">${nights || '–'}</td><td></td><td class="r">${money(d.bookingValue)}</td><td class="r">${rate.toFixed(1)}%</td><td class="r">${money(d.taxable)}</td>${cols.map((c) => `<td class="r">${money(d[c])}</td>`).join('')}<td class="r">${money(d.total)}</td></tr></table>
<div class="notes">* Room price before GST, after offers. Commission is charged when a stay is settled: at check-out, or when a cancellation or no-show charge is kept.</div></div>`;
  return shell(`${title} ${d.number}`, page1 + page2, test);
};

/** Statement of account for a hotel and month. */
export const statementHtml = async (st) => {
  const s = st.supplier; const r = st.recipient; const t = st.totals;
  const flow = [
    ['Opening balance', t.opening, ''],
    [`Paid online by guests (and offers paid by ZivoPlus), ${t.stays} stay${t.stays === 1 ? '' : 's'}`, t.online, 'plus'],
    ['Commission', -t.commission, 'minus'],
    [`GST on commission (${t.igst ? 'IGST' : 'CGST + SGST'})`, -t.commissionGst, 'minus'],
    ['TCS (GST section 52)', -t.tcs, 'minus'],
    ['TDS (Income Tax section 194-O)', -t.tds, 'minus'],
    ...(t.credits ? [['Credit notes (commission given back)', t.credits, 'plus']] : []),
    ['Paid out to your bank', -t.paid, 'minus'],
  ].filter(([, v], i) => i === 0 || Math.abs(v) > 0.004);
  const stays = st.stays.map((x) => `<tr><td><b>${esc(x.ref)}</b><br><span class="muted">${esc(x.kind)} · ${esc(x.payment)}</span></td><td>${dateOnly(x.checkIn)} – ${dateOnly(x.checkOut)}</td><td class="r">${money(x.gross)}</td><td class="r">${money(x.online)}</td><td class="r">${money(x.atHotel)}</td><td class="r">${money(x.commission)}</td><td class="r">${money(n(x.cgst) + n(x.sgst) + n(x.igst))}</td><td class="r">${money(n(x.tcs) + n(x.tds))}</td><td class="r"><b>${money(x.net)}</b></td></tr>`).join('');
  const payouts = st.payouts.map((p) => `<tr><td>${day(p.at)}</td><td>${esc(p.reference || '')}</td><td>${esc(p.account)}</td><td class="r">${inr(p.amount)}</td><td><b class="plus">Paid</b></td></tr>`).join('');
  const docs = st.documents.map((d) => `<tr><td>${d.kind === 'INVOICE' ? 'Commission tax invoice' : 'Credit note'}</td><td>${esc(d.number)}</td><td>${day(d.issueDate)}</td><td class="r">${inr(d.total)}</td></tr>`).join('');
  const body = `<div class="page">${head(s, 'Statement of Account', `${st.label} · ${r.property}`, `Closing balance ${inr(t.closing)}`, !st.live)}
${parties(s, r)}
<div class="cards"><div class="card"><div class="k">Opening balance</div><div class="v">${inr(t.opening)}</div></div><div class="card"><div class="k">Earned this month</div><div class="v">${inr(t.earned + t.credits)}</div></div><div class="card"><div class="k">Paid out</div><div class="v">${inr(t.paid)}</div></div><div class="card"><div class="k">Closing balance</div><div class="v">${inr(t.closing)}</div></div></div>
<h2>How your balance moved</h2><table><tr><th>Item</th><th class="r">Amount</th></tr>${flow.map(([a, v, c]) => `<tr><td>${esc(a)}</td><td class="r ${c}">${inr(v)}</td></tr>`).join('')}<tr class="t"><td>Closing balance${t.closing < 0 ? ' (you owe ZivoPlus; taken from your next payouts)' : ' (owed to you)'}</td><td class="r">${inr(t.closing)}</td></tr></table>
<div class="notes">Booking value of these stays: ${inr(t.gross)} including GST on rooms of ${inr(t.roomGst)}. Paid at the hotel: ${inr(t.atHotel)} (you collected this directly; its commission is part of the figures above).</div>
${st.payouts.length ? `<h2>Payouts</h2><table><tr><th>Date</th><th>Bank reference (UTR)</th><th>To account</th><th class="r">Amount</th><th>Status</th></tr>${payouts}</table>` : ''}
<h2>Taxes deducted for you to claim</h2><table><tr><th>Tax</th><th>Section</th><th class="r">This month</th><th>Where it shows</th></tr>
<tr><td>TCS</td><td>GST Act section 52${s.tcsGstin ? `<br><span class="muted">ZivoPlus TCS GSTIN ${esc(s.tcsGstin)}</span>` : ''}</td><td class="r">${inr(t.tcs)}</td><td>GST portal (TCS credit received); claim it in your electronic cash ledger</td></tr>
<tr><td>TDS</td><td>Income Tax Act section 194-O${s.tan ? `<br><span class="muted">ZivoPlus TAN ${esc(s.tan)}</span>` : ''}</td><td class="r">${inr(t.tds)}</td><td>Form 26AS / AIS; Form 16A issued every quarter</td></tr></table>
${docs ? `<h2>Documents for ${esc(st.label)}</h2><table><tr><th>Document</th><th>Number</th><th>Date</th><th class="r">Total incl. GST</th></tr>${docs}</table>` : ''}
</div>
${st.stays.length ? `<div class="page">${head(s, 'Stays settled', `${st.label} · ${r.property}`, `${st.stays.length} stay${st.stays.length === 1 ? '' : 's'}`, !st.live)}
<table><tr><th>Booking</th><th>Stay</th><th class="r">Value incl. GST</th><th class="r">Paid online</th><th class="r">Paid at hotel</th><th class="r">Commission</th><th class="r">GST on it</th><th class="r">TCS + TDS</th><th class="r">Net to you</th></tr>${stays}
<tr class="t"><td>Total</td><td></td><td class="r">${money(t.gross)}</td><td class="r">${money(t.online)}</td><td class="r">${money(t.atHotel)}</td><td class="r">${money(t.commission)}</td><td class="r">${money(t.commissionGst)}</td><td class="r">${money(t.tcs + t.tds)}</td><td class="r">${money(t.earned)}</td></tr></table>
<div class="notes">A negative "net to you" means the guest paid at the hotel: you hold the money and owe the commission, which is taken from your next payouts.</div></div>` : ''}`;
  return shell(`Statement ${st.label}`, body, !st.live);
};

export default { documentHtml, statementHtml, amountInWords };
