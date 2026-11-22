import { useCallback, useEffect, useState } from 'react';
import { Copy, RefreshCw, Loader2, CheckCircle2, AlertTriangle, Eye } from 'lucide-react';
import { adminGoogleApi } from '../../services/api';
import usePageTitle from '../../hooks/usePageTitle';

/**
 * Admin → Google Hotels: the feeds Google Hotel Center reads (hotel list, prices, changes, landing
 * page), which hotels appear, what each hotel still needs for Google to match it, what Google
 * would be given for a hotel, and a price accuracy check.
 */
const input = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none';
const card = 'bg-white rounded-xl border border-gray-200 p-5';
const btn = 'inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold';
const when = (s) => (s ? new Date(s).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : 'Never');
const FEEDS = [
  ['hotelList', 'Hotel list feed', 'Hotel Center → Hotel list: scheduled fetch from this address'],
  ['pointOfSale', 'Point of sale (landing page)', 'Hotel Center → Settings → Point of sale file'],
  ['query', 'Price requests ("pull" endpoint)', 'Give this to Google as your Query / Transaction endpoint (HTTPS POST)'],
  ['hint', 'Changes ("hint" endpoint)', 'Google asks here which hotels\' prices changed'],
];

const GoogleHotels = () => {
  usePageTitle('Google Hotels');
  const [data, setData] = useState(null);
  const [form, setForm] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [sample, setSample] = useState(null);
  const [accuracy, setAccuracy] = useState(null);

  const load = useCallback(() => adminGoogleApi.get().then((d) => { setData(d); setForm(d.settings); }).catch((e) => setError(e.message)), []);
  useEffect(() => { load(); }, [load]);

  const save = async (extra = {}) => {
    setBusy(true); setError(''); setNotice('');
    try { await adminGoogleApi.save({ ...form, ...extra }); setNotice(extra.regenerateToken ? 'New feed addresses made: update them in Hotel Center.' : 'Saved.'); await load(); } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  const copy = (text) => { navigator.clipboard?.writeText(text).then(() => setNotice('Copied.')).catch(() => {}); };
  const toggleHotel = async (h) => { try { await adminGoogleApi.setHotel(h.id, h.included); await load(); } catch (e) { setError(e.message); } };
  const showSample = async (h) => { setSample({ hotel: h.name, loading: true }); try { const r = await adminGoogleApi.sample(h.id); setSample({ hotel: h.name, ...r }); } catch (e) { setSample(null); setError(e.message); } };
  const runAccuracy = async () => { setAccuracy({ loading: true }); try { setAccuracy(await adminGoogleApi.accuracy()); } catch (e) { setAccuracy(null); setError(e.message); } };

  if (!data || !form) return <div className="p-8">{error ? <p className="text-red-700">{error}</p> : <Loader2 className="animate-spin text-gray-400" />}</div>;
  const included = data.hotels.filter((h) => h.included);
  const needWork = included.filter((h) => h.problems.length);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Google Hotels</h1>
        <p className="text-sm text-gray-600 mt-1 max-w-3xl">Show ZivoHotels&apos; price on hotels in Google Search and Maps, with a link to the hotel page. Google reads the feeds below once your Hotel Center account is approved. Prices come from the same engine as checkout, so they always match.</p>
      </div>
      {notice && <p className="rounded-lg bg-green-50 text-green-800 px-4 py-3 text-sm">{notice}</p>}
      {error && <p role="alert" className="rounded-lg bg-red-50 text-red-800 px-4 py-3 text-sm">{error}</p>}

      <section className={card}>
        <h2 className="font-bold text-gray-900">Settings</h2>
        <label className="mt-3 flex items-center gap-2 text-sm font-semibold"><input type="checkbox" className="rounded border-gray-300" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} /> Feeds on (Google can read them)</label>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <label className="text-sm"><span className="font-semibold text-gray-700">Hotel Center account ID</span><input className={`${input} mt-1`} value={form.accountId} onChange={(e) => setForm({ ...form, accountId: e.target.value })} placeholder="From Hotel Center" /></label>
          <label className="text-sm"><span className="font-semibold text-gray-700">Point of sale name</span><input className={`${input} mt-1`} value={form.posId} onChange={(e) => setForm({ ...form, posId: e.target.value })} /></label>
          <label className="text-sm"><span className="font-semibold text-gray-700">Longest stay priced (nights)</span><input type="number" min={1} max={30} className={`${input} mt-1`} value={form.maxNights} onChange={(e) => setForm({ ...form, maxNights: e.target.value })} /></label>
        </div>
        <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" className="rounded border-gray-300" checked={form.includeNewHotels} onChange={(e) => setForm({ ...form, includeNewHotels: e.target.checked })} /> Include hotels automatically when they go live (each hotel can still opt out in the Extranet)</label>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" disabled={busy} onClick={() => save()} className={`${btn} bg-brand-600 text-white disabled:opacity-60`}>{busy ? 'Saving…' : 'Save'}</button>
          <button type="button" disabled={busy} onClick={() => window.confirm('Make new secret feed addresses? The old ones stop working; update them in Hotel Center.') && save({ regenerateToken: true })} className={`${btn} border border-gray-300`}><RefreshCw size={14} /> New secret addresses</button>
        </div>
      </section>

      {data.urls && (
        <section className={card}>
          <h2 className="font-bold text-gray-900">Feed addresses for Hotel Center</h2>
          <p className="text-sm text-gray-600">Secret: anyone with these can read prices. Share them only inside Hotel Center.</p>
          <div className="mt-3 space-y-3">
            {FEEDS.map(([k, label, hint]) => (
              <div key={k}>
                <div className="flex items-center justify-between gap-2"><p className="text-sm font-semibold text-gray-800">{label}</p>
                  <p className="text-xs text-gray-500">Last read by Google: {when(data.fetches?.[k === 'pointOfSale' ? 'pos' : k]?.at)}{data.fetches?.[k === 'pointOfSale' ? 'pos' : k]?.count ? ` · ${data.fetches[k === 'pointOfSale' ? 'pos' : k].count} times` : ''}</p></div>
                <div className="mt-1 flex gap-2"><input readOnly className={`${input} font-mono text-xs bg-gray-50`} value={data.urls[k]} onFocus={(e) => e.target.select()} />
                  <button type="button" onClick={() => copy(data.urls[k])} className={`${btn} border border-gray-300`} aria-label={`Copy ${label}`}><Copy size={14} /></button></div>
                <p className="mt-0.5 text-xs text-gray-500">{hint}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className={card}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-bold text-gray-900">Hotels ({included.length} of {data.hotels.length} live hotels included)</h2>
          <button type="button" onClick={runAccuracy} className={`${btn} border border-gray-300`}>{accuracy?.loading ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Check price accuracy</button>
        </div>
        {accuracy && !accuracy.loading && (
          <p className={`mt-2 text-sm ${accuracy.mismatches.length ? 'text-red-700' : 'text-green-700'}`}>
            {accuracy.mismatches.length ? `${accuracy.mismatches.length} price(s) Google was given no longer match checkout: they're corrected on Google's next request.` : `Checked ${accuracy.checked} hotels (2 nights from ${accuracy.checkin}): prices match checkout.`}
          </p>
        )}
        {needWork.length > 0 && <p className="mt-2 text-sm text-amber-800 flex items-center gap-1.5"><AlertTriangle size={15} /> {needWork.length} included hotel{needWork.length === 1 ? '' : 's'} miss details Google uses to match them to Google Maps.</p>}
        <ul className="mt-3 divide-y divide-gray-100">
          {data.hotels.map((h) => (
            <li key={h.id} className="py-3 flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-semibold text-gray-900">{h.name} <span className="text-xs font-normal text-gray-500">· {h.city}</span></p>
                <p className="text-xs text-gray-500">{h.included ? 'On Google' : h.adminExcluded ? 'Left out by ZivoHotels' : h.hotelChoice === false ? 'The hotel opted out (Extranet)' : 'Not included'}</p>
                {h.problems.length > 0 && <p className="text-xs text-amber-800">Missing: {h.problems.join(', ')}</p>}
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => showSample(h)} className={`${btn} border border-gray-300`}><Eye size={14} /> What Google gets</button>
                {(h.included || h.adminExcluded) && <button type="button" onClick={() => toggleHotel(h)} className={`${btn} border ${h.included ? 'border-red-200 text-red-700' : 'border-gray-300'}`}>{h.included ? 'Leave out' : 'Include again'}</button>}
              </div>
            </li>
          ))}
        </ul>
      </section>

      {sample && (
        <section className={card}>
          <h2 className="font-bold text-gray-900">What Google gets: {sample.hotel} (1 night, tomorrow, 2 adults)</h2>
          {sample.loading ? <Loader2 className="mt-3 animate-spin text-gray-400" /> : <pre className="mt-3 max-h-96 overflow-auto rounded-lg bg-gray-900 text-gray-100 text-xs p-3">{sample.transaction}</pre>}
        </section>
      )}
    </div>
  );
};

export default GoogleHotels;
