import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Save, Briefcase, Handshake } from 'lucide-react';
import { adminBusinessApi } from '../../services/api';
import usePageTitle from '../../hooks/usePageTitle';
import useAccess from '../../hooks/useAccess';

/**
 * Admin → Business settings: open ZivoPlus for Business (companies) and Partner Hub (travel
 * agents) for applications, and the terms every organisation gets unless set on it.
 */
const input = 'mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm disabled:bg-gray-50';
const MODES = [['PREPAID', 'Prepaid wallet only'], ['CREDIT', 'Credit line'], ['BOTH', 'Wallet first, then credit']];
const INVOICE = [['ON_BEHALF', 'ZivoPlus, on behalf of the hotel (hotel is the supplier)'], ['ZIVO_SUPPLIER', 'ZivoPlus as supplier'], ['HOTEL_ISSUES', 'The hotel issues it']];
const PRICING = [['NET', 'Net rates: the agent adds their own markup'], ['COMMISSION', 'Commission on the public price'], ['BOTH', 'Both: the agent chooses per booking']];

const BusinessSettings = () => {
  usePageTitle('Business settings');
  const { can } = useAccess();
  const edit = can('settings.manage');
  const [s, setS] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  useEffect(() => { adminBusinessApi.settings().then(setS).catch((e) => setMsg({ ok: false, text: e.message })); }, []);
  if (!s) return <p className="text-sm text-gray-500 flex items-center gap-2">{msg ? msg.text : <><Loader2 size={16} className="animate-spin" /> Loading…</>}</p>;
  const set = (group, k, v) => setS((x) => ({ ...x, [group]: { ...x[group], [k]: v } }));
  const save = async () => {
    setBusy(true); setMsg(null);
    try { setS(await adminBusinessApi.saveSettings(s)); setMsg({ ok: true, text: 'Saved. Organisations without their own terms use these from now on.' }); } catch (e) { setMsg({ ok: false, text: e.message }); } finally { setBusy(false); }
  };
  const common = (g) => (
    <>
      <label className="flex items-center gap-2 text-sm font-semibold text-gray-900"><input type="checkbox" disabled={!edit} checked={s[g].enabled} onChange={(e) => set(g, 'enabled', e.target.checked)} /> Take applications</label>
      <label className="flex items-center gap-2 text-sm text-gray-800"><input type="checkbox" disabled={!edit} checked={s[g].requireGstin} onChange={(e) => set(g, 'requireGstin', e.target.checked)} /> GSTIN required to apply</label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-semibold text-gray-700">Payment<select className={input} disabled={!edit} value={s[g].paymentMode} onChange={(e) => set(g, 'paymentMode', e.target.value)}>{MODES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        <label className="text-xs font-semibold text-gray-700">Credit days<input type="number" min="1" max="120" className={input} disabled={!edit} value={s[g].creditDays} onChange={(e) => set(g, 'creditDays', e.target.value)} /></label>
        <label className="text-xs font-semibold text-gray-700 sm:col-span-2">GST invoice for their stays issued by<select className={input} disabled={!edit} value={s[g].invoiceMode} onChange={(e) => set(g, 'invoiceMode', e.target.value)}>{INVOICE.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
      </div>
    </>
  );
  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Business settings</h1>
          <p className="text-sm text-gray-600 mt-1">Defaults for companies and travel agents. You can set different terms on any organisation.</p>
        </div>
        <Link to="/admin/organisations" className="text-sm font-semibold text-navy-800 underline">Organisations</Link>
      </div>
      <section className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4">
        <h2 className="font-bold text-gray-900 flex items-center gap-2"><Briefcase size={18} aria-hidden="true" /> ZivoPlus for Business (companies)</h2>
        {common('corporate')}
      </section>
      <section className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4">
        <h2 className="font-bold text-gray-900 flex items-center gap-2"><Handshake size={18} aria-hidden="true" /> ZivoPlus Partner Hub (travel agents)</h2>
        {common('agency')}
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-semibold text-gray-700 sm:col-span-2">Pricing<select className={input} disabled={!edit} value={s.agency.pricingModel} onChange={(e) => set('agency', 'pricingModel', e.target.value)}>{PRICING.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
          <label className="text-xs font-semibold text-gray-700">Default markup %<input type="number" min="0" step="0.5" className={input} disabled={!edit} value={s.agency.defaultMarkupPct} onChange={(e) => set('agency', 'defaultMarkupPct', e.target.value)} /></label>
          <label className="text-xs font-semibold text-gray-700">Maximum markup %<input type="number" min="0" step="0.5" className={input} disabled={!edit} value={s.agency.maxMarkupPct} onChange={(e) => set('agency', 'maxMarkupPct', e.target.value)} /></label>
          <label className="text-xs font-semibold text-gray-700">Extra commission ZivoPlus pays %<input type="number" min="0" max="30" step="0.5" className={input} disabled={!edit} value={s.agency.extraCommissionPct} onChange={(e) => set('agency', 'extraCommissionPct', e.target.value)} /></label>
          <label className="text-xs font-semibold text-gray-700">TDS on commission % (194H)<input type="number" min="0" max="20" step="0.1" className={input} disabled={!edit} value={s.agency.tdsPct} onChange={(e) => set('agency', 'tdsPct', e.target.value)} /></label>
        </div>
        <p className="text-xs text-gray-500">Agents get each hotel&apos;s travel agent discount (Extranet → Business rates): as a lower net rate, or as commission. The extra commission is on top, paid by ZivoPlus.</p>
      </section>
      <section className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4">
        <h2 className="font-bold text-gray-900">Credit and top-ups</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="text-xs font-semibold text-gray-700">Highest credit limit (₹)<input type="number" min="0" className={input} disabled={!edit} value={s.credit.maxLimit} onChange={(e) => set('credit', 'maxLimit', e.target.value)} /></label>
          <label className="text-xs font-semibold text-gray-700">Smallest top-up (₹)<input type="number" min="1" className={input} disabled={!edit} value={s.topup.minAmount} onChange={(e) => set('topup', 'minAmount', e.target.value)} /></label>
          <label className="text-xs font-semibold text-gray-700">Largest top-up (₹)<input type="number" min="1" className={input} disabled={!edit} value={s.topup.maxAmount} onChange={(e) => set('topup', 'maxAmount', e.target.value)} /></label>
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-800"><input type="checkbox" disabled={!edit} checked={s.credit.holdWhenOverdue} onChange={(e) => set('credit', 'holdWhenOverdue', e.target.checked)} /> Put credit on hold while a payment is overdue (the wallet balance can still be used)</label>
      </section>
      {msg && <p role="status" className={`text-sm px-3 py-2 rounded-lg ${msg.ok ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'}`}>{msg.text}</p>}
      {edit && <button type="button" onClick={save} disabled={busy} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-navy-800 text-white text-sm font-bold disabled:opacity-60">{busy ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Save settings</button>}
      {s.updatedAt && <p className="text-xs text-gray-500">Last saved {new Date(s.updatedAt).toLocaleString('en-IN')} by {s.updatedBy}.</p>}
    </div>
  );
};

export default BusinessSettings;
