import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Save, Briefcase, Handshake, KeyRound } from 'lucide-react';
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

/**
 * Company sign-in (single sign-on) for ZivoPlus for Business. Shown once the server sends `sso`
 * with the settings: { enabled, providers: { GOOGLE, MICROSOFT } } (saved with the rest), and
 * `ssoStatus`: { GOOGLE: { configured }, MICROSOFT: { configured }, redirectUri } (read-only:
 * the app keys live in the server's environment, never here).
 */
const SSO_PROVIDERS = [
  ['GOOGLE', 'Google Workspace', 'Google Cloud console → APIs & Services → Credentials → OAuth client (Web application)'],
  ['MICROSOFT', 'Microsoft Entra ID', 'Microsoft Entra admin centre → App registrations → New registration (multitenant)'],
];
const SsoSettings = ({ s, setS, edit }) => {
  const st = s.ssoStatus || {};
  const setSso = (k, v) => setS((x) => ({ ...x, sso: { ...x.sso, [k]: v } }));
  return (
    <section className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4">
      <h2 className="font-bold text-gray-900 flex items-center gap-2"><KeyRound size={18} aria-hidden="true" /> Company sign-in (single sign-on)</h2>
      <p className="text-sm text-gray-600">Companies can let their employees sign in with Google Workspace or Microsoft work accounts. Each company admin verifies their email domains and tests it in their portal (Sign-in tab).</p>
      <label className="flex items-center gap-2 text-sm font-semibold text-gray-900"><input type="checkbox" disabled={!edit} checked={Boolean(s.sso.enabled)} onChange={(e) => setSso('enabled', e.target.checked)} /> Offer company sign-in to companies</label>
      <ul className="space-y-3">
        {SSO_PROVIDERS.map(([k, label, where]) => {
          const configured = Boolean(st[k]?.configured);
          return (
            <li key={k} className="rounded-xl border border-gray-200 p-3 space-y-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                  <input type="checkbox" disabled={!edit || !configured} checked={configured && Boolean(s.sso.providers?.[k])} onChange={(e) => setSso('providers', { ...s.sso.providers, [k]: e.target.checked })} /> {label}
                </label>
                <span className={`text-xs font-bold px-2 py-0.5 rounded ${configured ? 'bg-green-50 text-green-800' : 'bg-amber-50 text-amber-800'}`}>{configured ? 'App keys set on the server' : 'App keys not set on the server'}</span>
              </div>
              {!configured && <p className="text-xs text-gray-600">Create the app in {where}, then put its client ID and secret in the server&apos;s .env file and redeploy.</p>}
            </li>
          );
        })}
      </ul>
      {st.redirectUri && (
        <div className="text-xs text-gray-700">
          <p className="font-semibold">Redirect URI to register with both providers</p>
          <code className="mt-1 block break-all rounded-lg bg-gray-50 border border-gray-200 px-2.5 py-1.5 text-gray-900">{st.redirectUri}</code>
        </div>
      )}
    </section>
  );
};

/** Credits a month's incentives now (normally automatic early the next month; once per agency). */
const RunIncentives = () => {
  const d = new Date(); d.setMonth(d.getMonth() - 1);
  const [month, setMonth] = useState(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  const [out, setOut] = useState(null);
  const [busy, setBusy] = useState(false);
  const run = async () => { setBusy(true); try { setOut(await adminBusinessApi.runIncentives(month)); } catch (e) { setOut({ error: e.message }); } finally { setBusy(false); } };
  return (
    <div className="flex flex-wrap items-end gap-2 pt-2 border-t border-gray-200">
      <label className="text-xs font-semibold text-gray-700">Credit incentives for<input type="month" className={input} value={month} onChange={(e) => setMonth(e.target.value)} /></label>
      <button type="button" onClick={run} disabled={busy} className="px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm font-semibold disabled:opacity-50">{busy ? 'Crediting…' : 'Credit now'}</button>
      {out && <p className="text-xs text-gray-700 w-full">{out.error || out.skipped || (out.credited.length ? out.credited.map((c) => `${c.name}: ${c.slab}, ₹${c.bonus.toLocaleString('en-IN')} (${c.roomNights} room nights)`).join(' · ') : 'Nothing new to credit for that month.')}</p>}
    </div>
  );
};

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
      <label className="flex items-center gap-2 text-sm text-gray-800"><input type="checkbox" disabled={!edit} checked={Boolean(s[g].requireAgreement)} onChange={(e) => set(g, 'requireAgreement', e.target.checked)} /> Agreement must be signed before booking (wording in Agreement template)</label>
      <label className="text-xs font-semibold text-gray-700 block max-w-xs">Hold time for unpaid / approval bookings (hours)<input type="number" min="0" max="72" className={input} disabled={!edit} value={s[g].holdHours ?? 24} onChange={(e) => set(g, 'holdHours', e.target.value)} /></label>
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
        <Link to="/admin/business" className="text-sm font-semibold text-navy-800 underline">Business &amp; Partners</Link>
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
        <div className="rounded-xl bg-gray-50 p-4 space-y-3">
          <label className="flex items-center gap-2 text-sm font-semibold text-gray-900"><input type="checkbox" disabled={!edit} checked={Boolean(s.agency.incentives?.enabled)} onChange={(e) => set('agency', 'incentives', { ...s.agency.incentives, enabled: e.target.checked })} /> Monthly incentive slabs</label>
          <p className="text-xs text-gray-600">An agent reaching a slab gets its bonus % on the room charges (before GST) of all its stays that checked out that month, credited early next month less TDS; its tier becomes the slab name.</p>
          {(s.agency.incentives?.slabs || []).map((sl, i) => (
            <div key={i} className="grid gap-2 grid-cols-[1fr_1fr_1fr_auto] items-end">
              <label className="text-xs font-semibold text-gray-700">Slab<input className={input} disabled={!edit} value={sl.name} onChange={(e) => set('agency', 'incentives', { ...s.agency.incentives, slabs: s.agency.incentives.slabs.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} /></label>
              <label className="text-xs font-semibold text-gray-700">From room nights<input type="number" min="1" className={input} disabled={!edit} value={sl.minRoomNights} onChange={(e) => set('agency', 'incentives', { ...s.agency.incentives, slabs: s.agency.incentives.slabs.map((x, j) => (j === i ? { ...x, minRoomNights: e.target.value } : x)) })} /></label>
              <label className="text-xs font-semibold text-gray-700">Bonus %<input type="number" min="0.1" step="0.1" className={input} disabled={!edit} value={sl.bonusPct} onChange={(e) => set('agency', 'incentives', { ...s.agency.incentives, slabs: s.agency.incentives.slabs.map((x, j) => (j === i ? { ...x, bonusPct: e.target.value } : x)) })} /></label>
              {edit && <button type="button" className="text-xs text-gray-600 underline pb-3" onClick={() => set('agency', 'incentives', { ...s.agency.incentives, slabs: s.agency.incentives.slabs.filter((_, j) => j !== i) })}>Remove</button>}
            </div>
          ))}
          {edit && <button type="button" className="text-sm font-semibold text-navy-800 underline" onClick={() => set('agency', 'incentives', { ...s.agency.incentives, slabs: [...(s.agency.incentives?.slabs || []), { name: '', minRoomNights: 100, bonusPct: 1 }] })}>Add slab</button>}
          <RunIncentives />
        </div>
        <p className="text-xs text-gray-500">Agents get each hotel&apos;s travel agent discount (Extranet → Business rates): as a lower net rate, or as commission. The extra commission is on top, paid by ZivoPlus.</p>
      </section>
      {s.sso && <SsoSettings s={s} setS={setS} edit={edit} />}
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
