import { useState } from 'react';
import { Sparkles, Search, Plus, Trash2, Eye, EyeOff, Loader2, MapPin } from 'lucide-react';
import { suggestNearbyPlaces, lookupNearbyPlace } from '../../../services/api';
import { NEARBY_CATEGORIES, formatDistance } from '../../../constants/nearbyPlaces';

/**
 * Location step -> What's nearby: transit, attractions, landmarks and restaurants with their
 * distance from the map pin. "Find nearby places" fills it from OpenStreetMap; owners then remove,
 * rename, re-type or hide places, and add their own (search the map, or type a name and distance).
 * Guests see the visible places on the hotel page.
 */
const newId = () => (crypto.randomUUID ? crypto.randomUUID() : `p-${Date.now()}-${Math.random().toString(36).slice(2)}`);
const inputCls = 'px-3 py-2 border border-slate-300 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 outline-none text-sm bg-white text-slate-900';

const NearbyPlacesEditor = ({ formData, updateForm }) => {
  const places = Array.isArray(formData.nearbyPlaces) ? formData.nearbyPlaces : [];
  const lat = parseFloat(formData.latitude);
  const lng = parseFloat(formData.longitude);
  const hasPin = Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0);

  const [tab, setTab] = useState('TRANSIT');
  const [finding, setFinding] = useState(false);
  const [message, setMessage] = useState(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [looking, setLooking] = useState(false);
  const [manual, setManual] = useState({ name: '', distanceKm: '' });

  const cat = NEARBY_CATEGORIES.find((c) => c.key === tab);
  const save = (list) => updateForm({ nearbyPlaces: list, nearbyPlacesEdited: true });
  const change = (id, patch) => save(places.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  const remove = (id) => save(places.filter((p) => p.id !== id));
  const exists = (category, name) => places.some((p) => p.category === category && p.name.trim().toLowerCase() === name.trim().toLowerCase());

  const findNearby = async () => {
    setFinding(true); setMessage(null);
    try {
      const found = await suggestNearbyPlaces(lat, lng);
      const fresh = found.filter((p) => !exists(p.category, p.name));
      save([...places, ...fresh].slice(0, 80));
      setMessage({ ok: true, text: fresh.length ? `Added ${fresh.length} place${fresh.length === 1 ? '' : 's'} from the map. Remove any that aren't right.` : 'No new places found near the pin. Add your own below.' });
    } catch (e) {
      setMessage({ ok: false, text: e.message || 'Could not look up nearby places. Add them yourself below.' });
    } finally { setFinding(false); }
  };

  const lookup = async () => {
    if (query.trim().length < 3) return;
    setLooking(true); setResults(null);
    try { setResults(await lookupNearbyPlace(query.trim(), hasPin ? lat : undefined, hasPin ? lng : undefined)); } catch (e) { setResults({ error: e.message }); } finally { setLooking(false); }
  };

  const addResult = (r) => {
    if (exists(tab, r.name)) return;
    save([...places, { id: newId(), name: r.name, category: tab, type: cat.types.includes(r.type) ? r.type : cat.types[0], lat: r.lat, lng: r.lng, distanceKm: r.distanceKm, source: 'MANUAL', visible: true }]);
    setResults(null); setQuery('');
  };
  const addManual = () => {
    const name = manual.name.trim();
    if (!name || exists(tab, name)) return;
    const d = parseFloat(manual.distanceKm);
    save([...places, { id: newId(), name, category: tab, type: cat.types[0], lat: null, lng: null, distanceKm: Number.isFinite(d) && d >= 0 ? d : null, source: 'MANUAL', visible: true }]);
    setManual({ name: '', distanceKm: '' });
  };

  const inTab = places.filter((p) => p.category === tab).sort((a, b) => (a.distanceKm ?? 999) - (b.distanceKm ?? 999));

  return (
    <section className="mt-10 border border-slate-200 rounded-2xl p-6 bg-white shadow-sm" aria-labelledby="nearby-heading">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 id="nearby-heading" className="text-xl font-extrabold text-slate-900">What&apos;s nearby</h2>
          <p className="text-slate-500 text-sm mt-1">Transit, attractions, landmarks and restaurants near your property, with the distance from your map pin. Guests see these on your property page.</p>
        </div>
        <button type="button" onClick={findNearby} disabled={!hasPin || finding} title={hasPin ? '' : 'Set the property on the map first'}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed">
          {finding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          {finding ? 'Looking at the map…' : 'Find nearby places'}
        </button>
      </div>
      {!hasPin && <p className="text-sm text-amber-700 bg-amber-50 rounded-lg px-3 py-2 mt-3">Set the property on the map first: distances are measured from the pin.</p>}
      {finding && <p className="text-sm text-slate-500 mt-3">This takes about 40 seconds. You can keep filling in the form.</p>}
      {message && <p role="status" className={`text-sm mt-3 rounded-lg px-3 py-2 ${message.ok ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'}`}>{message.text}</p>}

      <div role="tablist" className="flex gap-1 mt-5 border-b border-slate-200 overflow-x-auto">
        {NEARBY_CATEGORIES.map((c) => {
          const n = places.filter((p) => p.category === c.key).length;
          return (
            <button key={c.key} type="button" role="tab" aria-selected={tab === c.key} onClick={() => { setTab(c.key); setResults(null); }}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-bold border-b-2 -mb-px whitespace-nowrap ${tab === c.key ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
              <c.icon className="w-4 h-4" /> {c.label} <span className="text-xs font-semibold text-slate-400">{n}</span>
            </button>
          );
        })}
      </div>

      <ul className="divide-y divide-slate-100 mt-2">
        {inTab.length === 0 && <li className="py-6 text-sm text-slate-500 text-center">No {cat.label.toLowerCase()} yet.</li>}
        {inTab.map((p) => (
          <li key={p.id} className={`flex flex-wrap items-center gap-2 py-2.5 ${p.visible === false ? 'opacity-50' : ''}`}>
            <input aria-label="Place name" value={p.name} onChange={(e) => change(p.id, { name: e.target.value })} className={`${inputCls} flex-1 min-w-[180px]`} />
            <select aria-label="Type" value={p.type} onChange={(e) => change(p.id, { type: e.target.value })} className={`${inputCls} w-40`}>
              {[...new Set([...cat.types, p.type])].map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            {p.lat != null && p.lng != null ? (
              <span className="w-24 text-sm font-semibold text-slate-700 text-right" title="Measured from your map pin">{formatDistance(p.distanceKm)}</span>
            ) : (
              <span className="flex items-center gap-1 w-24">
                <input aria-label="Distance in km" type="number" min="0" step="0.1" value={p.distanceKm ?? ''} onChange={(e) => change(p.id, { distanceKm: e.target.value === '' ? null : parseFloat(e.target.value) })} className={`${inputCls} w-16`} />
                <span className="text-xs text-slate-500">km</span>
              </span>
            )}
            <button type="button" onClick={() => change(p.id, { visible: p.visible === false })} aria-label={p.visible === false ? 'Show to guests' : 'Hide from guests'} title={p.visible === false ? 'Hidden from guests' : 'Shown to guests'} className="p-2 rounded-lg text-slate-500 hover:bg-slate-100">
              {p.visible === false ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
            <button type="button" onClick={() => remove(p.id)} aria-label={`Remove ${p.name}`} className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50"><Trash2 className="w-4 h-4" /></button>
          </li>
        ))}
      </ul>

      <div className="mt-4 grid gap-4">
        <div className="relative">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Add from the map</p>
          <div className="flex gap-2">
            <input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); lookup(); } }}
              placeholder={`Search a place, e.g. ${tab === 'TRANSIT' ? 'Central Station' : tab === 'RESTAURANT' ? 'Cafe Madras' : 'City Mall'}`} className={`${inputCls} flex-1`} />
            <button type="button" onClick={lookup} disabled={looking || query.trim().length < 3} className="px-3 py-2 rounded-lg border border-slate-300 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40 flex items-center gap-1.5">
              {looking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />} Search
            </button>
          </div>
          {results && (
            <div className="mt-2 border border-slate-200 rounded-xl max-h-60 overflow-y-auto bg-white shadow-lg">
              {results.error && <p className="p-3 text-sm text-red-700">{results.error}</p>}
              {Array.isArray(results) && results.length === 0 && <p className="p-3 text-sm text-slate-500">Nothing found near the property. Type it in with its distance instead.</p>}
              {Array.isArray(results) && results.map((r, i) => (
                <button key={`${r.lat}-${r.lng}-${i}`} type="button" onClick={() => addResult(r)} className="w-full text-left px-3 py-2.5 text-sm hover:bg-slate-50 border-b border-slate-100 last:border-0 flex items-start gap-2">
                  <MapPin className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                  <span className="flex-1 min-w-0"><span className="font-semibold text-slate-900">{r.name}</span><span className="block text-xs text-slate-500 truncate">{r.detail}</span></span>
                  {r.distanceKm != null && <span className="text-xs font-semibold text-slate-600 whitespace-nowrap">{formatDistance(r.distanceKm)}</span>}
                </button>
              ))}
            </div>
          )}
        </div>
        <div>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Or type it in</p>
          <div className="flex gap-2">
            <input value={manual.name} onChange={(e) => setManual((m) => ({ ...m, name: e.target.value }))} placeholder="Place name" className={`${inputCls} flex-1`} />
            <input value={manual.distanceKm} onChange={(e) => setManual((m) => ({ ...m, distanceKm: e.target.value }))} type="number" min="0" step="0.1" placeholder="km" aria-label="Distance in km" className={`${inputCls} w-20`} />
            <button type="button" onClick={addManual} disabled={!manual.name.trim()} className="px-3 py-2 rounded-lg bg-slate-900 text-white text-sm font-bold disabled:opacity-40 flex items-center gap-1"><Plus className="w-4 h-4" /> Add</button>
          </div>
        </div>
      </div>
    </section>
  );
};

export default NearbyPlacesEditor;
