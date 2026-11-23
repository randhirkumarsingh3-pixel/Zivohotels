import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, FileText, FileSpreadsheet, Send, AlertTriangle, CheckCircle2, Receipt, FileArchive } from 'lucide-react';
import { adminFinanceApi, adminReportsApi, saveBlob } from '../../services/api';
import usePageTitle from '../../hooks/usePageTitle';
import useAccess from '../../hooks/useAccess';

/**
 * Admin → Finance → Invoices & statements. For a month: what is still to be invoiced per hotel,
 * issuing the commission tax invoices (one per hotel), the documents issued (PDF, credit notes),
 * each hotel's statement of account (PDF / Excel) and emailing owners. The 1st-of-month job does
 * the same automatically (Finance settings).
 */
const IST = 330 * 60000;
const inr = (v) => `${Number(v) < 0 ? '−' : ''}₹${Math.abs(Number(v || 0)).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const day = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }) : '–');
const lastMonth = () => { const d = new Date(Date.now() + IST); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - 1); return d.toISOString().slice(0, 7); };
const btn = 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold';

const FinanceDocuments = () => {
  usePageTitle('Invoices & statements');
  const { can } = useAccess();
  const canManage = can('finance.manage');
  const [period, setPeriod] = useState(lastMonth());
  const [month, setMonth] = useState(null);
  const [docs, setDocs] = useState([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState('');
  const [credit, setCredit] = useState(null); // { doc, chosen: Set, reason }
  const [view, setView] = useState('month'); // month | property

  const load = useCallback(() => Promise.all([adminFinanceApi.month(period), adminFinanceApi.documents({ period })])
    .then(([m, d]) => { setMonth(m); setDocs(d); setError(''); }).catch((e) => setError(e.message)), [period]);
  useEffect(() => { load(); }, [load]);

  const act = async (key, fn, ok) => {
    setBusy(key); setError(''); setNotice('');
    try { const r = await fn(); setNotice(typeof ok === 'function' ? ok(r) : ok); await load(); } catch (e) { setError(e.message); } finally { setBusy(''); }
  };
  const download = async (key, url, name) => { setBusy(key); try { saveBlob(await adminFinanceApi.file(url), name); } catch (e) { setError(e.message); } finally { setBusy(''); } };
  const openCredit = async (d) => { try { const full = await adminFinanceApi.document(d.id); setCredit({ doc: full, chosen: new Set(), reason: '' }); } catch (e) { setError(e.message); } };

  const toInvoice = month?.hotels.filter((h) => h.toInvoice.stays > 0) || [];
  const totalToInvoice = toInvoice.reduce((a, h) => a + h.toInvoice.total, 0);

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Invoices & statements</h1>
          <p className="text-sm text-gray-600 mt-1">Monthly commission tax invoices to hotels, credit notes and statements of account. <Link to="/admin/finance/settings" className="text-brand-700 underline">Finance settings</Link></p>
        </div>
        <div className="flex items-end gap-3">
        <div role="tablist" aria-label="View" className="flex rounded-lg border border-gray-300 overflow-hidden text-sm font-semibold">
          {[['month', 'By month'], ['property', 'By property']].map(([k, label]) => <button key={k} type="button" role="tab" aria-selected={view === k} onClick={() => setView(k)} className={`px-3 py-1.5 ${view === k ? 'bg-navy-800 text-white' : 'bg-white text-gray-700'}`}>{label}</button>)}
        </div>
        {view === 'month' && <label className="text-xs font-semibold text-gray-600">Month<input type="month" className="block mt-1 rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm" value={period} max={new Date(Date.now() + IST).toISOString().slice(0, 7)} onChange={(e) => e.target.value && setPeriod(e.target.value)} /></label>}
        </div>
      </div>
      {notice && <p className="rounded-lg bg-green-50 text-green-800 px-4 py-3 text-sm flex items-center gap-2"><CheckCircle2 size={16} /> {notice}</p>}
      {error && <p role="alert" className="rounded-lg bg-red-50 text-red-800 px-4 py-3 text-sm">{error}</p>}
      {view === 'property' ? <PropertyView onError={setError} download={download} busy={busy} /> : !month ? <Loader2 className="animate-spin text-gray-400" /> : (
        <>
          <section className="bg-white rounded-xl border border-gray-200 p-5" aria-label="To invoice">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-bold text-gray-900">{month.label}: still to invoice</h2>
              {canManage && toInvoice.length > 0 && month.complete && (
                <button type="button" disabled={!!busy} onClick={() => act('issue', () => adminFinanceApi.issue(period), (r) => `${r.issued.length} invoice(s) issued.`)} className={`${btn} bg-brand-600 text-white disabled:opacity-60`}>{busy === 'issue' ? <Loader2 size={15} className="animate-spin" /> : <Receipt size={15} />} Issue {toInvoice.length} invoice{toInvoice.length === 1 ? '' : 's'} ({inr(totalToInvoice)})</button>
              )}
            </div>
            {!month.complete && <p className="mt-2 text-sm text-amber-800 flex items-center gap-1.5"><AlertTriangle size={15} /> {month.label} isn&apos;t over yet: its invoices can be issued from the 1st (automatically if switched on).</p>}
            {toInvoice.length === 0 ? <p className="mt-2 text-sm text-gray-500">Nothing left to invoice for {month.label}.</p> : (
              <div className="overflow-x-auto mt-3"><table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-gray-600"><tr>{['Property', 'GST state', 'Stays', 'Commission', 'GST', 'Total'].map((h, i) => <th key={h} scope="col" className={`px-3 py-2 font-semibold ${i > 1 ? 'text-right' : 'text-left'}`}>{h}</th>)}</tr></thead>
                <tbody>{toInvoice.map((h) => (
                  <tr key={h.hotelId} className="border-t border-gray-100"><td className="px-3 py-2 font-semibold">{h.name}<span className="block text-xs font-normal text-gray-500">{h.gstin || 'Not registered for GST'}</span></td><td className="px-3 py-2">{h.state || <span className="text-amber-700">unknown</span>}</td>
                    <td className="px-3 py-2 text-right">{h.toInvoice.stays}</td><td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{inr(h.toInvoice.commission)}</td><td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{inr(h.toInvoice.gst)}</td><td className="px-3 py-2 text-right tabular-nums whitespace-nowrap font-semibold">{inr(h.toInvoice.total)}</td></tr>
                ))}</tbody>
              </table></div>
            )}
          </section>

          <section className="bg-white rounded-xl border border-gray-200 overflow-hidden" aria-label="Documents issued">
            <div className="flex flex-wrap items-center justify-between gap-2 px-5 pt-4">
              <h2 className="font-bold text-gray-900">Documents for {month.label}</h2>
              <div className="flex gap-2">
                <button type="button" onClick={() => download('csv', `documents?period=${period}&format=csv`, `ZivoPlus-commission-documents-${period}.csv`)} className={`${btn} border border-gray-300`}><FileSpreadsheet size={15} /> List for GSTR-1 (CSV)</button>
                {docs.length > 0 && <button type="button" disabled={!!busy} onClick={() => download('zip', `documents/zip?period=${period}`, `ZivoPlus-commission-documents-${period}.zip`)} className={`${btn} border border-gray-300 disabled:opacity-60`}>{busy === 'zip' ? <Loader2 size={15} className="animate-spin" /> : <FileArchive size={15} />} All PDFs (ZIP)</button>}
                {canManage && <button type="button" disabled={!!busy} onClick={() => window.confirm(`Email ${month.label}'s documents to every hotel owner with activity that month?`) && act('email', () => adminFinanceApi.emailMonth(period), (r) => `${r.queued} owner email(s) queued.`)} className={`${btn} border border-gray-300 disabled:opacity-60`}>{busy === 'email' ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} Email all owners</button>}
              </div>
            </div>
            {docs.length === 0 ? <p className="p-5 text-sm text-gray-500">No documents for this month yet.</p> : (
              <div className="overflow-x-auto mt-3"><table className="min-w-full text-sm">
                <thead className="bg-navy-800 text-white"><tr>{['Number', 'Property', 'Date', 'Stays', 'Taxable', 'GST', 'Total', 'Emailed', ''].map((h, i) => <th key={i} scope="col" className={`px-3 py-2 font-semibold whitespace-nowrap ${[3, 4, 5, 6].includes(i) ? 'text-right' : 'text-left'}`}>{h}</th>)}</tr></thead>
                <tbody>{docs.map((d) => (
                  <tr key={d.id} className="border-b border-gray-100">
                    <td className="px-3 py-2 whitespace-nowrap"><span className="font-mono text-xs">{d.number}</span><span className="block text-xs text-gray-500">{d.kind === 'INVOICE' ? 'Tax invoice' : `Credit note: ${d.reason || ''}`}{!d.live ? ' · test' : ''}</span></td>
                    <td className="px-3 py-2">{d.hotel}<span className="block text-xs text-gray-500">{d.gstin || 'unregistered'}</span></td>
                    <td className="px-3 py-2 whitespace-nowrap">{day(d.issueDate)}</td><td className="px-3 py-2 text-right">{d.stays}</td>
                    <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{inr(d.taxable)}</td><td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{inr(d.cgst + d.sgst + d.igst)}<span className="block text-xs text-gray-500">{d.igst ? 'IGST' : 'CGST + SGST'}</span></td>
                    <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap font-semibold">{inr(d.total)}</td><td className="px-3 py-2 whitespace-nowrap">{d.emailedAt ? day(d.emailedAt) : '–'}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-right">
                      <button type="button" onClick={() => download(`pdf-${d.id}`, `documents/${d.id}?format=pdf`, `${d.number.replace(/\//g, '-')}.pdf`)} className={`${btn} border border-gray-300`} aria-label={`Download ${d.number}`}>{busy === `pdf-${d.id}` ? <Loader2 size={15} className="animate-spin" /> : <FileText size={15} />} PDF</button>
                      {canManage && d.kind === 'INVOICE' && <button type="button" onClick={() => openCredit(d)} className={`${btn} ml-1 border border-gray-300`}>Credit note</button>}
                    </td>
                  </tr>
                ))}</tbody>
              </table></div>
            )}
          </section>

          {credit && (
            <section className="bg-white rounded-xl border-2 border-brand-200 p-5" aria-label="Credit note">
              <h2 className="font-bold text-gray-900">Credit note against {credit.doc.number}</h2>
              <p className="text-sm text-gray-600">Gives back the commission and its GST on the stays you choose (for example after a refund). The amount is added to the hotel&apos;s next payout.</p>
              <div className="mt-3 space-y-1">
                {credit.doc.lines.map((l) => {
                  const done = credit.doc.creditNotes.some((c) => c.settlementIds.includes(l.settlementId));
                  return (
                    <label key={l.settlementId} className={`flex items-center gap-2 text-sm ${done ? 'text-gray-400' : ''}`}>
                      <input type="checkbox" disabled={done} className="rounded border-gray-300" checked={credit.chosen.has(l.settlementId)} onChange={(e) => { const c = new Set(credit.chosen); if (e.target.checked) c.add(l.settlementId); else c.delete(l.settlementId); setCredit({ ...credit, chosen: c }); }} />
                      <span className="font-mono text-xs">{l.ref}</span> {l.guest} · {l.kind} · commission {inr(l.commission)} + GST {inr(l.total - l.commission)} = <b>{inr(l.total)}</b>{done ? ' (already credited)' : ''}
                    </label>
                  );
                })}
              </div>
              <label className="mt-3 block text-sm font-semibold text-gray-700">Reason (printed on the credit note)<input className="mt-1 block w-full max-w-lg rounded-lg border border-gray-300 px-3 py-2 text-sm" value={credit.reason} onChange={(e) => setCredit({ ...credit, reason: e.target.value })} placeholder="e.g. Guest refunded after the stay" /></label>
              <div className="mt-3 flex gap-2">
                <button type="button" disabled={!!busy || credit.chosen.size === 0 || credit.reason.trim().length < 5} onClick={() => act('cn', () => adminFinanceApi.creditNote(credit.doc.id, [...credit.chosen], credit.reason), (r) => { setCredit(null); return `Credit note ${r.number} issued (${inr(r.total)}).`; })} className={`${btn} bg-brand-600 text-white disabled:opacity-60`}>Issue credit note ({inr(credit.doc.lines.filter((l) => credit.chosen.has(l.settlementId)).reduce((a, l) => a + l.total, 0))})</button>
                <button type="button" onClick={() => setCredit(null)} className={`${btn} border border-gray-300`}>Cancel</button>
              </div>
            </section>
          )}

          <section className="bg-white rounded-xl border border-gray-200 p-5" aria-label="Statements">
            <h2 className="font-bold text-gray-900">Statements of account · {month.label}</h2>
            <p className="text-sm text-gray-600">Each hotel&apos;s month: opening balance, stays, commission, GST, TCS, TDS, credit notes, payouts and closing balance.</p>
            {month.hotels.length === 0 ? <p className="mt-2 text-sm text-gray-500">No hotel activity this month.</p> : (
              <ul className="mt-3 divide-y divide-gray-100">{month.hotels.map((h) => (
                <li key={h.hotelId} className="py-2 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-gray-900">{h.name}</span>
                  <span className="flex gap-1">
                    <button type="button" onClick={() => download(`st-${h.hotelId}`, `statement?hotelId=${h.hotelId}&period=${period}&format=pdf`, `ZivoPlus-Statement-${period}-${h.name.replace(/\W+/g, '-')}.pdf`)} className={`${btn} border border-gray-300`}><FileText size={15} /> PDF</button>
                    <button type="button" onClick={() => download(`sx-${h.hotelId}`, `statement?hotelId=${h.hotelId}&period=${period}&format=xlsx`, `ZivoPlus-Statement-${period}-${h.name.replace(/\W+/g, '-')}.xlsx`)} className={`${btn} border border-gray-300`}><FileSpreadsheet size={15} /> Excel</button>
                    {canManage && <button type="button" disabled={!!busy} onClick={() => act(`em-${h.hotelId}`, () => adminFinanceApi.emailMonth(period, h.hotelId), (r) => (r.queued ? `Emailed to ${h.name}'s owner.` : `${h.name} has no owner email.`))} className={`${btn} border border-gray-300 disabled:opacity-60`}><Send size={15} /> Email owner</button>}
                  </span>
                </li>
              ))}</ul>
            )}
          </section>
        </>
      )}
    </div>
  );
};

/** One property's financial year, month by month, with every invoice and statement to download. */
const fyNow = () => { const d = new Date(Date.now() + IST); const y = d.getUTCFullYear() - (d.getUTCMonth() < 3 ? 1 : 0); return y; };
const fyLabel = (y) => `${y}-${String((y + 1) % 100).padStart(2, '0')}`;

const PropertyView = ({ onError, download, busy }) => {
  const [hotels, setHotels] = useState(null);
  const [hotelId, setHotelId] = useState('');
  const [fy, setFy] = useState(fyLabel(fyNow()));
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => { adminReportsApi.list().then((d) => { setHotels(d.hotels); if (d.hotels[0]) setHotelId((h) => h || d.hotels[0].id); }).catch((e) => onError(e.message)); }, [onError]);
  useEffect(() => {
    if (!hotelId) return undefined;
    let live = true;
    setLoading(true);
    adminFinanceApi.property(hotelId, fy).then((d) => { if (live) setData(d); }).catch((e) => live && onError(e.message)).finally(() => live && setLoading(false));
    return () => { live = false; };
  }, [hotelId, fy, onError]);
  if (!hotels) return <Loader2 className="animate-spin text-gray-400" />;
  const slug = (data?.hotel?.name || 'property').replace(/\W+/g, '-');
  const t = data?.totals;
  return (
    <section className="bg-white rounded-xl border border-gray-200 overflow-hidden" aria-label="Property view">
      <div className="flex flex-wrap items-end justify-between gap-3 px-5 pt-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs font-semibold text-gray-600">Property<select className="block mt-1 rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm max-w-[16rem]" value={hotelId} onChange={(e) => setHotelId(e.target.value)}>
            {hotels.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
          </select></label>
          <label className="text-xs font-semibold text-gray-600">Financial year<select className="block mt-1 rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm" value={fy} onChange={(e) => setFy(e.target.value)}>
            {[0, 1, 2].map((i) => fyLabel(fyNow() - i)).map((f) => <option key={f} value={f}>FY {f}</option>)}
          </select></label>
          {loading && <Loader2 size={18} className="animate-spin text-gray-400 mb-2" />}
        </div>
        {data && t.documents > 0 && <button type="button" disabled={!!busy} onClick={() => download('pzip', `documents/zip?hotelId=${hotelId}&fy=${fy}`, `ZivoPlus-invoices-${slug}-FY${fy}.zip`)} className={`${btn} bg-brand-600 text-white disabled:opacity-60`}>{busy === 'pzip' ? <Loader2 size={15} className="animate-spin" /> : <FileArchive size={15} />} All invoices FY {fy} (ZIP)</button>}
      </div>
      {data && <p className="px-5 mt-1 text-sm text-gray-600">{data.hotel.legalName}{data.hotel.gstin ? ` · GSTIN ${data.hotel.gstin}` : ' · not registered for GST'}{data.hotel.state ? ` · ${data.hotel.state}` : ''}</p>}
      {data && (
        <div className="overflow-x-auto mt-3"><table className="min-w-full text-sm">
          <thead className="bg-navy-800 text-white"><tr>{['Month', 'Stays', 'Room value', 'Commission', 'GST on it', 'TCS', 'TDS', 'Net to hotel', 'Paid out', 'Invoices & credit notes', 'Statement'].map((h, i) => <th key={h} scope="col" className={`px-3 py-2 font-semibold whitespace-nowrap ${i >= 1 && i <= 8 ? 'text-right' : 'text-left'}`}>{h}</th>)}</tr></thead>
          <tbody>{data.months.map((m) => (
            <tr key={m.period} className="border-b border-gray-100 align-top">
              <td className="px-3 py-2 whitespace-nowrap font-semibold">{m.label}{m.uninvoiced > 0 && <span className="block text-xs font-normal text-amber-700">{m.uninvoiced} stay{m.uninvoiced === 1 ? '' : 's'} not invoiced yet</span>}</td>
              <td className="px-3 py-2 text-right">{m.stays}</td><td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{inr(m.value)}</td><td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{inr(m.commission)}</td>
              <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{inr(m.commissionGst)}</td><td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{inr(m.tcs)}</td><td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{inr(m.tds)}</td>
              <td className={`px-3 py-2 text-right tabular-nums whitespace-nowrap font-semibold ${m.net < 0 ? 'text-red-700' : ''}`}>{inr(m.net)}</td><td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{inr(m.paid)}</td>
              <td className="px-3 py-2">{m.documents.length === 0 ? <span className="text-gray-400">–</span> : m.documents.map((d) => (
                <div key={d.id} className="flex items-center gap-2 whitespace-nowrap py-0.5">
                  <button type="button" onClick={() => download(`d-${d.id}`, `documents/${d.id}?format=pdf`, `${d.number.replace(/\//g, '-')}.pdf`)} className="inline-flex items-center gap-1 text-brand-700 hover:underline font-mono text-xs" aria-label={`Download ${d.number}`}>{busy === `d-${d.id}` ? <Loader2 size={12} className="animate-spin" /> : <FileText size={12} />}{d.number}</button>
                  <span className="text-xs text-gray-500">{d.kind === 'INVOICE' ? '' : 'credit note · '}{inr(d.total)}</span>
                </div>
              ))}</td>
              <td className="px-3 py-2 whitespace-nowrap">{m.stays > 0 || m.paid > 0 ? <>
                <button type="button" onClick={() => download(`s-${m.period}`, `statement?hotelId=${hotelId}&period=${m.period}&format=pdf`, `ZivoPlus-Statement-${m.period}-${slug}.pdf`)} className="text-brand-700 hover:underline text-xs font-semibold">PDF</button>
                <span className="text-gray-300"> · </span>
                <button type="button" onClick={() => download(`x-${m.period}`, `statement?hotelId=${hotelId}&period=${m.period}&format=xlsx`, `ZivoPlus-Statement-${m.period}-${slug}.xlsx`)} className="text-brand-700 hover:underline text-xs font-semibold">Excel</button>
              </> : <span className="text-gray-400">–</span>}</td>
            </tr>
          ))}</tbody>
          <tfoot className="bg-gray-50 font-bold border-t-2 border-navy-800"><tr>
            <td className="px-3 py-2">FY {data.fy}</td><td className="px-3 py-2 text-right">{t.stays}</td><td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{inr(t.value)}</td><td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{inr(t.commission)}</td>
            <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{inr(t.commissionGst)}</td><td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{inr(t.tcs)}</td><td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{inr(t.tds)}</td>
            <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{inr(t.net)}</td><td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{inr(t.paid)}</td><td className="px-3 py-2">{t.documents} document{t.documents === 1 ? '' : 's'}</td><td />
          </tr></tfoot>
        </table></div>
      )}
    </section>
  );
};

export default FinanceDocuments;
