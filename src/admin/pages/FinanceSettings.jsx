import { useEffect, useState } from 'react';
import { Loader2, AlertTriangle, CheckCircle2, ShieldCheck } from 'lucide-react';
import { adminFinanceApi } from '../../services/api';
import usePageTitle from '../../hooks/usePageTitle';
import useAccess from '../../hooks/useAccess';

/**
 * Admin → Finance → Settings: what commission invoices and statements print, and how they are sent.
 * ZivoPlus' legal details and TAN; its TCS registration (GSTIN) in each state where hotels are;
 * the invoice and credit-note series; switching invoicing live (numbering starts at 000001; until
 * then documents are TEST-numbered and marked as tests); and the monthly automation.
 */
const input = 'mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none disabled:bg-gray-50';
const card = 'bg-white rounded-xl border border-gray-200 p-5';

const FinanceSettings = () => {
  usePageTitle('Finance settings');
  const { can } = useAccess();
  const canEdit = can('finance.manage');
  const [data, setData] = useState(null);
  const [form, setForm] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [addState, setAddState] = useState('');

  const load = () => adminFinanceApi.settings().then((d) => { setData(d); setForm(structuredClone(d.settings)); }).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  const save = async (extra) => {
    setBusy(true); setError(''); setNotice('');
    try {
      await adminFinanceApi.saveSettings({ ...form, ...(extra || {}), invoice: { ...form.invoice, ...(extra?.invoice || {}) } });
      setNotice(extra?.invoice?.live ? 'Invoicing is live. The next invoice is numbered 000001.' : 'Saved.');
      await load();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  const goLive = () => {
    if (window.confirm(`Switch commission invoicing to live?\n\nFrom now on invoices are real tax invoices numbered ${form.invoice.prefix}/…/000001 onwards and reported in GSTR-1. This can't be switched off.`)) save({ invoice: { live: true } });
  };

  if (!data || !form) return <div className="p-8">{error ? <p role="alert" className="text-red-700">{error}</p> : <Loader2 className="animate-spin text-gray-400" />}</div>;
  const set = (section, key, value) => setForm({ ...form, [section]: { ...form[section], [key]: value } });
  const r = data.readiness;
  const tcsStates = [...new Set([...data.hotelStates, ...Object.keys(form.tcsRegistrations)])].sort((a, b) => (data.states[a] || '').localeCompare(data.states[b] || ''));
  const ro = !canEdit;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Finance settings</h1>
        <p className="text-sm text-gray-600 mt-1">What ZivoPlus prints on the commission tax invoices, credit notes and statements it sends hotels, and when they go out.</p>
      </div>
      {notice && <p className="rounded-lg bg-green-50 text-green-800 px-4 py-3 text-sm flex items-center gap-2"><CheckCircle2 size={16} /> {notice}</p>}
      {error && <p role="alert" className="rounded-lg bg-red-50 text-red-800 px-4 py-3 text-sm">{error}</p>}

      <section className={`${card} ${r.missing.length || r.tcsMissing.length ? 'border-amber-300 bg-amber-50' : 'border-green-300 bg-green-50'}`} aria-label="Readiness">
        {r.missing.length || r.tcsMissing.length ? (
          <div className="text-sm text-amber-900 flex gap-2"><AlertTriangle size={18} className="shrink-0" /><div>
            <p className="font-semibold">Before invoices go to hotels:</p>
            <ul className="list-disc ml-5 mt-1">
              {r.missing.map((m) => <li key={m}>Add {m}</li>)}
              {r.tcsMissing.length > 0 && <li>Add ZivoPlus&apos; TCS registration for: {r.tcsMissing.join(', ')} (states with live hotels). Until then documents show &quot;registration pending&quot;.</li>}
            </ul></div></div>
        ) : <p className="text-sm text-green-800 flex items-center gap-2"><CheckCircle2 size={16} /> Company details and TCS registrations are complete for every state with live hotels.</p>}
      </section>

      <section className={card} aria-label="Company details">
        <h2 className="font-bold text-gray-900">ZivoPlus company details</h2>
        <p className="text-sm text-gray-600">Printed as the supplier on every invoice and statement. Legal names stay as registered.</p>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {[['legalName', 'Legal name'], ['tradeName', 'Brand name'], ['gstin', 'GSTIN'], ['pan', 'PAN'], ['cin', 'CIN'], ['tan', 'TAN (TDS under section 194-O)'], ['email', 'Partner contact email'], ['phone', 'Phone']].map(([k, label]) => (
            <label key={k} className="text-sm font-semibold text-gray-700">{label}<input className={input} disabled={ro} value={form.company[k] || ''} onChange={(e) => set('company', k, e.target.value)} /></label>
          ))}
          <label className="text-sm font-semibold text-gray-700 md:col-span-2">Registered address<textarea rows={2} className={input} disabled={ro} value={form.company.address || ''} onChange={(e) => set('company', 'address', e.target.value)} /></label>
          <label className="text-sm font-semibold text-gray-700">GST state (decides CGST + SGST or IGST)<select className={input} disabled={ro} value={form.company.stateCode} onChange={(e) => set('company', 'stateCode', e.target.value)}>
            {Object.entries(data.states).sort((a, b) => a[1].localeCompare(b[1])).map(([c, nme]) => <option key={c} value={c}>{nme} ({c})</option>)}
          </select></label>
        </div>
        <p className="mt-2 text-xs text-gray-500">Commission GST: hotels in {data.states[form.company.stateCode]} are charged CGST {form.rates.commissionGstPercent / 2}% + SGST {form.rates.commissionGstPercent / 2}%; hotels in every other state IGST {form.rates.commissionGstPercent}%.</p>
      </section>

      <section className={card} aria-label="TCS registrations">
        <h2 className="font-bold text-gray-900">TCS registrations by state</h2>
        <p className="text-sm text-gray-600">ZivoPlus collects TCS (GST section 52, {form.rates.tcsPercent}%) from GST-registered hotels and needs a TCS registration in each state where its hotels are. It is printed on each hotel&apos;s statement and TCS sheet.</p>
        <div className="mt-3 space-y-2">
          {tcsStates.length === 0 && <p className="text-sm text-gray-500">No live hotels yet.</p>}
          {tcsStates.map((code) => (
            <div key={code} className="flex flex-wrap items-center gap-3">
              <span className="w-56 text-sm font-semibold text-gray-800">{data.states[code]} ({code}){data.hotelStates.includes(code) ? '' : <span className="ml-1 text-xs font-normal text-gray-500">no live hotels</span>}</span>
              <input aria-label={`TCS registration for ${data.states[code]}`} className={`${input} mt-0 max-w-xs font-mono`} disabled={ro} placeholder={`${code}AADCZ1700C1C…`} value={form.tcsRegistrations[code] || ''} onChange={(e) => setForm({ ...form, tcsRegistrations: { ...form.tcsRegistrations, [code]: e.target.value.toUpperCase() } })} />
              {!form.tcsRegistrations[code] && data.hotelStates.includes(code) && <span className="text-xs text-amber-700">pending</span>}
            </div>
          ))}
          {canEdit && (
            <div className="flex items-center gap-2 pt-1">
              <select aria-label="Add a state" className={`${input} mt-0 max-w-xs`} value={addState} onChange={(e) => setAddState(e.target.value)}>
                <option value="">Add another state…</option>
                {Object.entries(data.states).filter(([c]) => !tcsStates.includes(c)).sort((a, b) => a[1].localeCompare(b[1])).map(([c, nme]) => <option key={c} value={c}>{nme}</option>)}
              </select>
              <button type="button" disabled={!addState} onClick={() => { setForm({ ...form, tcsRegistrations: { ...form.tcsRegistrations, [addState]: '' } }); setAddState(''); }} className="px-3 py-2 rounded-lg text-sm font-semibold border border-gray-300 disabled:opacity-50">Add</button>
            </div>
          )}
        </div>
      </section>

      <section className={card} aria-label="Tax rates">
        <h2 className="font-bold text-gray-900">Tax rates</h2>
        <p className="text-sm text-gray-600">Used for stays settled from now on. Each stay keeps the rates it was settled with, so changing them never alters past stays, invoices or statements.</p>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          {[['commissionGstPercent', 'GST on commission (%)', 'Split CGST + SGST in your state, IGST elsewhere', 28], ['tcsPercent', 'TCS under GST section 52 (%)', 'On the online value before GST, GST-registered hotels only', 2], ['tdsPercent', 'TDS under section 194-O (%)', 'On the sale value before GST', 5]].map(([k, label, hint, max]) => (
            <label key={k} className="text-sm font-semibold text-gray-700">{label}
              <input type="number" min={0} max={max} step="0.01" className={input} disabled={ro} value={form.rates[k]} onChange={(e) => set('rates', k, e.target.value)} />
              <span className="mt-1 block text-xs font-normal text-gray-500">{hint}</span>
            </label>
          ))}
        </div>
        {form.rates.changedAt && <p className="mt-2 text-xs text-gray-500">Last changed {new Date(form.rates.changedAt).toLocaleString('en-IN')}.</p>}
      </section>

      <section className={card} aria-label="Invoice numbering">
        <h2 className="font-bold text-gray-900">Invoices and credit notes</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <label className="text-sm font-semibold text-gray-700">Invoice series<input className={input} disabled={ro || form.invoice.live} value={form.invoice.prefix} onChange={(e) => set('invoice', 'prefix', e.target.value.toUpperCase())} /></label>
          <label className="text-sm font-semibold text-gray-700">Credit-note series<input className={input} disabled={ro || form.invoice.live} value={form.invoice.creditPrefix} onChange={(e) => set('invoice', 'creditPrefix', e.target.value.toUpperCase())} /></label>
          <label className="text-sm font-semibold text-gray-700">SAC<input className={input} disabled={ro} value={form.invoice.sac} onChange={(e) => set('invoice', 'sac', e.target.value)} /></label>
          <label className="text-sm font-semibold text-gray-700 md:col-span-2">Service description<input className={input} disabled={ro} value={form.invoice.description} onChange={(e) => set('invoice', 'description', e.target.value)} /></label>
          <label className="text-sm font-semibold text-gray-700">Signed by<input className={input} disabled={ro} value={form.invoice.signatory} onChange={(e) => set('invoice', 'signatory', e.target.value)} /></label>
        </div>
        <p className="mt-2 text-sm text-gray-700">Numbers: <span className="font-mono">{form.invoice.prefix}/2026-27/000001</span> and <span className="font-mono">{form.invoice.creditPrefix}/2026-27/000001</span>, restarting each financial year (April).</p>
        <div className={`mt-3 rounded-lg p-3 text-sm ${form.invoice.live ? 'bg-green-50 text-green-900' : 'bg-amber-50 text-amber-900'}`}>
          {form.invoice.live
            ? <p className="flex items-center gap-2"><ShieldCheck size={16} /> Live since {new Date(form.invoice.liveSince).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}: documents are real tax invoices.</p>
            : <>
              <p><b>Test mode.</b> Documents are numbered TEST-{form.invoice.prefix}/… and marked &quot;Test · not a tax invoice&quot;. Switch to live when the site goes live: the first real invoice is numbered 000001.</p>
              {canEdit && <button type="button" disabled={busy || r.missing.length > 0} onClick={goLive} className="mt-2 px-4 py-2 rounded-lg text-sm font-semibold bg-navy-800 text-white disabled:opacity-50">Switch invoicing to live</button>}
              {r.missing.length > 0 && <p className="mt-1 text-xs">Complete the company details first.</p>}
            </>}
        </div>
      </section>

      <section className={card} aria-label="Monthly automation">
        <h2 className="font-bold text-gray-900">Every month</h2>
        <label className="mt-3 flex items-start gap-2 text-sm"><input type="checkbox" className="mt-0.5 rounded border-gray-300" disabled={ro} checked={form.automation.issueMonthly} onChange={(e) => set('automation', 'issueMonthly', e.target.checked)} /><span><b>Issue last month&apos;s commission invoices on the 1st</b> (6 am). One per hotel, for stays settled that month.</span></label>
        <label className="mt-2 flex items-start gap-2 text-sm"><input type="checkbox" className="mt-0.5 rounded border-gray-300" disabled={ro} checked={form.automation.emailOwners} onChange={(e) => set('automation', 'emailOwners', e.target.checked)} /><span><b>Email each hotel owner</b> the tax invoice, statement of account and Excel workbook.</span></label>
        {data.lastRun && <p className="mt-2 text-xs text-gray-500">Last run: {data.lastRun.period} — {data.lastRun.issued} invoice(s), {data.lastRun.emailed} email(s), {new Date(data.lastRun.at).toLocaleString('en-IN')}.</p>}
      </section>

      {canEdit && <div className="flex gap-2"><button type="button" disabled={busy} onClick={() => save()} className="px-5 py-2.5 rounded-lg text-sm font-semibold bg-brand-600 text-white disabled:opacity-60">{busy ? 'Saving…' : 'Save settings'}</button></div>}
    </div>
  );
};

export default FinanceSettings;
