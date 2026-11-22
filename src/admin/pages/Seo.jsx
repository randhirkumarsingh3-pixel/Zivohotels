import { useCallback, useEffect, useState } from 'react';
import { Search, Globe, CheckCircle2, AlertTriangle, Plus, Trash2, Loader2, ExternalLink, EyeOff } from 'lucide-react';
import { adminSeoApi } from '../../services/api';
import usePageTitle from '../../hooks/usePageTitle';

/**
 * Admin → SEO: how ZivoHotels pages appear in Google and link previews.
 * Templates per page type, verification codes, IndexNow, redirects, per-hotel titles and
 * descriptions (or hidden from search), and a preview of any address.
 */
const input = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none';
const card = 'bg-white rounded-xl border border-gray-200 p-5';
const btn = 'inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold';

const PLACEHOLDERS = {
  home: [],
  hotel: ['{name}', '{place}', '{city}', '{area}', '{price}', '{stars}', '{type}', '{amenities}', '{cancellation}', '{site}'],
  city: ['{city}', '{count}', '{price}', '{areasText}', '{site}'],
  area: ['{area}', '{city}', '{count}', '{price}', '{site}'],
};
const TYPES = [['home', 'Home page'], ['hotel', 'Hotel pages'], ['city', 'City pages (/hotels-in-bengaluru)'], ['area', 'Area pages (/hotels-in-marathahalli-bengaluru)']];

const Stat = ({ label, value, warn }) => (
  <div className="rounded-lg bg-gray-50 px-3 py-2">
    <p className="text-xs text-gray-500">{label}</p>
    <p className={`text-lg font-bold ${warn ? 'text-amber-700' : 'text-gray-900'}`}>{value}</p>
  </div>
);

const Preview = ({ data }) => (data ? (
  <div className="mt-3 rounded-lg border border-gray-200 p-3 text-sm">
    {data.redirect ? <p>Moves permanently (301) to <strong>{data.redirect}</strong></p> : data.status === 404 ? <p className="text-red-700">Not found (404)</p> : (
      <>
        <p className="text-[#1a0dab] text-lg leading-snug">{data.title}</p>
        <p className="text-green-800 text-xs break-all">{data.canonical || '(no official address: not indexed)'}</p>
        <p className="text-gray-700 mt-1">{data.description}</p>
        <p className="text-xs text-gray-500 mt-2">{data.noindex ? 'Hidden from search engines' : 'Shown in search engines'}{data.structuredData?.length ? ` · structured data: ${data.structuredData.join(', ')}` : ''}</p>
      </>
    )}
  </div>
) : null);

const HotelRow = ({ h, onSaved }) => {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ title: h.override.title || '', description: h.override.description || '', noindex: Boolean(h.override.noindex) });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const save = async () => {
    setBusy(true); setMsg('');
    try { await adminSeoApi.saveHotel(h.id, f); setMsg('Saved'); onSaved(); } catch (e) { setMsg(e.message); } finally { setBusy(false); }
  };
  return (
    <li className="py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-gray-900">{h.name} <span className="text-xs font-normal text-gray-500">· {h.city} · {h.status}</span>
            {h.override.noindex && <span className="ml-2 inline-flex items-center gap-1 text-xs text-amber-800"><EyeOff size={12} /> hidden</span>}</p>
          {h.shown ? <p className="text-sm text-[#1a0dab] truncate">{h.shown.title}</p> : <p className="text-xs text-gray-500">Not public yet</p>}
          {h.descriptionWords < 80 && <p className="text-xs text-amber-700 flex items-center gap-1"><AlertTriangle size={12} /> Description has {h.descriptionWords} words: 150+ words of the hotel&apos;s own text ranks better</p>}
        </div>
        <div className="flex gap-2">
          {h.shown && <a href={h.path} target="_blank" rel="noreferrer" className={`${btn} border border-gray-300`}><ExternalLink size={14} /> Open</a>}
          <button type="button" onClick={() => setOpen((o) => !o)} className={`${btn} border border-gray-300`}>{open ? 'Close' : 'Edit'}</button>
        </div>
      </div>
      {open && (
        <div className="mt-3 grid gap-3">
          <label className="text-sm"><span className="font-semibold text-gray-700">Search title (empty: from the template)</span>
            <input className={`${input} mt-1`} maxLength={120} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder={h.shown?.title || ''} /></label>
          <label className="text-sm"><span className="font-semibold text-gray-700">Search description (empty: from the template)</span>
            <textarea rows={2} className={`${input} mt-1`} maxLength={300} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder={h.shown?.description || ''} /></label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.noindex} onChange={(e) => setF({ ...f, noindex: e.target.checked })} className="rounded border-gray-300" /> Hide this hotel from search engines (it stays bookable on the site)</label>
          <div className="flex items-center gap-3"><button type="button" disabled={busy} onClick={save} className={`${btn} bg-brand-600 text-white disabled:opacity-60`}>{busy ? 'Saving…' : 'Save'}</button>{msg && <span className="text-sm text-gray-600">{msg}</span>}</div>
        </div>
      )}
    </li>
  );
};

const Seo = () => {
  usePageTitle('SEO');
  const [data, setData] = useState(null);
  const [form, setForm] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const [q, setQ] = useState('');
  const [hotels, setHotels] = useState(null);
  const [previewPath, setPreviewPath] = useState('/');
  const [preview, setPreview] = useState(null);

  const load = useCallback(() => adminSeoApi.get().then((d) => { setData(d); setForm(d.settings); }).catch((e) => setError(e.message)), []);
  const loadHotels = useCallback((query) => adminSeoApi.hotels(query).then(setHotels).catch((e) => setError(e.message)), []);
  useEffect(() => { load(); loadHotels(''); }, [load, loadHotels]);

  const save = async () => {
    setSaving(true); setError(''); setNotice('');
    try { const s = await adminSeoApi.save(form); setForm(s); setNotice('SEO settings saved.'); load(); } catch (e) { setError(e.message); } finally { setSaving(false); }
  };
  const runPreview = async (path) => { setPreview(null); try { setPreview(await adminSeoApi.preview(path)); } catch (e) { setError(e.message); } };
  const setTpl = (type, field) => (e) => setForm((f) => ({ ...f, [type]: { ...f[type], [field]: e.target.value } }));

  if (!data || !form) return <div className="p-8">{error ? <p className="text-red-700">{error}</p> : <Loader2 className="animate-spin text-gray-400" />}</div>;
  const st = data.status;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">SEO</h1>
        <p className="text-sm text-gray-600 mt-1">How ZivoHotels pages appear in Google and in link previews. New hotels are added automatically when they go live.</p>
      </div>
      {notice && <p className="rounded-lg bg-green-50 text-green-800 px-4 py-3 text-sm">{notice}</p>}
      {error && <p role="alert" className="rounded-lg bg-red-50 text-red-800 px-4 py-3 text-sm">{error}</p>}

      <section className={card}>
        <h2 className="font-bold text-gray-900 flex items-center gap-2"><Globe size={18} className="text-navy-700" /> Status</h2>
        <p className={`mt-2 text-sm flex items-center gap-1.5 ${st.indexing ? 'text-green-700' : 'text-amber-800'}`}>
          {st.indexing ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
          {st.indexing ? `Search engines may index ${st.site}.` : `Search engines are kept out of ${st.site || 'this site'} (ALLOW_INDEXING is off). Turn it on in the server settings on the live site only.`}
        </p>
        <div className="mt-3 grid gap-2 grid-cols-2 md:grid-cols-6">
          <Stat label="Live hotels" value={st.liveHotels} />
          <Stat label="In sitemap" value={st.inSitemap} />
          <Stat label="Hidden" value={st.hidden} />
          <Stat label="City pages" value={st.cities} />
          <Stat label="Area pages" value={st.areas} />
          <Stat label="No description" value={st.withoutDescription} warn={st.withoutDescription > 0} />
        </div>
        <p className="mt-3 text-xs text-gray-500">Sitemap for Google Search Console: <a className="underline" href="/sitemap.xml" target="_blank" rel="noreferrer">{st.site}/sitemap.xml</a></p>
      </section>

      <section className={card}>
        <h2 className="font-bold text-gray-900">Titles and descriptions</h2>
        <p className="text-sm text-gray-600">Text in [square brackets] is left out when something inside it is missing (for example a hotel without a price yet).</p>
        <label className="block text-sm mt-3"><span className="font-semibold text-gray-700">Site name</span><input className={`${input} mt-1 max-w-xs`} value={form.siteName} onChange={(e) => setForm({ ...form, siteName: e.target.value })} /></label>
        <div className="mt-4 space-y-5">
          {TYPES.map(([type, label]) => (
            <fieldset key={type} className="rounded-xl border border-gray-200 p-4">
              <legend className="px-1 text-sm font-bold text-gray-800">{label}</legend>
              <label className="block text-sm"><span className="font-semibold text-gray-700">Title</span><input className={`${input} mt-1`} value={form[type].title} onChange={setTpl(type, 'title')} /></label>
              <label className="block text-sm mt-2"><span className="font-semibold text-gray-700">Description</span><textarea rows={2} className={`${input} mt-1`} value={form[type].description} onChange={setTpl(type, 'description')} /></label>
              {PLACEHOLDERS[type].length > 0 && <p className="mt-1 text-xs text-gray-500">Can use: {PLACEHOLDERS[type].join(' ')}</p>}
            </fieldset>
          ))}
        </div>
      </section>

      <section className={card}>
        <h2 className="font-bold text-gray-900">Search engines</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <label className="text-sm"><span className="font-semibold text-gray-700">Google Search Console verification code</span>
            <input className={`${input} mt-1`} value={form.googleVerification} onChange={(e) => setForm({ ...form, googleVerification: e.target.value })} placeholder='The content="…" value of the HTML tag' /></label>
          <label className="text-sm"><span className="font-semibold text-gray-700">Bing Webmaster verification code</span>
            <input className={`${input} mt-1`} value={form.bingVerification} onChange={(e) => setForm({ ...form, bingVerification: e.target.value })} /></label>
        </div>
        <label className="mt-3 flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-0.5 rounded border-gray-300" checked={Boolean(form.indexNowEnabled)} onChange={(e) => setForm({ ...form, indexNowEnabled: e.target.checked })} />
          <span>Tell Bing and other IndexNow search engines straight away when a hotel goes live or changes{form.indexNowKey ? <span className="block text-xs text-gray-500">Key: {form.indexNowKey}</span> : null}</span>
        </label>
      </section>

      <section className={card}>
        <h2 className="font-bold text-gray-900">Redirects</h2>
        <p className="text-sm text-gray-600">Old addresses that should move permanently to new ones (for example after a page is renamed).</p>
        <div className="mt-3 space-y-2">
          {form.redirects.map((r, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <input className={`${input} flex-1 min-w-[180px]`} placeholder="/old-address" value={r.from} onChange={(e) => setForm({ ...form, redirects: form.redirects.map((x, j) => (j === i ? { ...x, from: e.target.value } : x)) })} />
              <span className="text-gray-400">→</span>
              <input className={`${input} flex-1 min-w-[180px]`} placeholder="/new-address" value={r.to} onChange={(e) => setForm({ ...form, redirects: form.redirects.map((x, j) => (j === i ? { ...x, to: e.target.value } : x)) })} />
              <button type="button" aria-label="Remove redirect" onClick={() => setForm({ ...form, redirects: form.redirects.filter((_, j) => j !== i) })} className="p-2 rounded-lg hover:bg-red-50 text-red-700"><Trash2 size={16} /></button>
            </div>
          ))}
          <button type="button" onClick={() => setForm({ ...form, redirects: [...form.redirects, { from: '', to: '' }] })} className={`${btn} border border-gray-300`}><Plus size={14} /> Add redirect</button>
        </div>
      </section>

      <div className="sticky bottom-4 flex justify-end">
        <button type="button" disabled={saving} onClick={save} className={`${btn} px-5 py-3 bg-brand-600 hover:bg-brand-700 text-white shadow-lg disabled:opacity-60`}>{saving ? 'Saving…' : 'Save SEO settings'}</button>
      </div>

      <section className={card}>
        <h2 className="font-bold text-gray-900">Preview an address</h2>
        <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); runPreview(previewPath); }}>
          <input className={input} value={previewPath} onChange={(e) => setPreviewPath(e.target.value)} placeholder="/hotels-in-bengaluru" />
          <button type="submit" className={`${btn} bg-navy-800 text-white`}>Preview</button>
        </form>
        <Preview data={preview} />
      </section>

      <section className={card}>
        <h2 className="font-bold text-gray-900">Hotels</h2>
        <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); loadHotels(q); }}>
          <div className="relative flex-1"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" /><input className={`${input} pl-9`} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Hotel name or city" /></div>
          <button type="submit" className={`${btn} border border-gray-300`}>Search</button>
        </form>
        {!hotels ? <Loader2 className="mt-4 animate-spin text-gray-400" /> : (
          <ul className="mt-2 divide-y divide-gray-100">{hotels.map((h) => <HotelRow key={h.id} h={h} onSaved={() => loadHotels(q)} />)}</ul>
        )}
      </section>
    </div>
  );
};

export default Seo;
