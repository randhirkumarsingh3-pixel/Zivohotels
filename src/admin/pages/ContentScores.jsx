import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Search, Star, MapPin, X, CheckCircle2, Circle, ArrowRight, Lightbulb, Pencil, Mail, Phone } from 'lucide-react';
import { adminContentApi } from '../../services/api';
import usePageTitle from '../../hooks/usePageTitle';
import useAccess from '../../hooks/useAccess';
import { ScoreRing } from '../../extranet/components/PropertyHeader';
import { scoreTone } from '../../extranet/components/propertySections';

/**
 * Admin → Content Scores: how complete every property's listing is, which part needs work, and a
 * shortcut into that part of the admin property editor. Lowest scores first, so the listings
 * that need help are at the top.
 */

const SECTION_COLS = [
  ['basics', 'Basics'], ['location', 'Location'], ['amenities', 'Amenities'],
  ['rooms', 'Rooms'], ['photos', 'Photos'], ['policies', 'Policies'],
];
const BANDS = [
  ['', 'All'], ['needs-work', 'Needs work'], ['fair', 'Fair'], ['good', 'Good'], ['excellent', 'Excellent'],
];
const STATUS = ['', 'LIVE', 'ACTIVE', 'DRAFT', 'IN_REVIEW', 'INFORMATION_REQUESTED', 'APPROVED', 'PENDING_AGREEMENT', 'PAUSED', 'SUSPENDED'];
const statusText = (s) => (s ? String(s).replace(/_/g, ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase()) : 'All statuses');
const editLink = (id, section) => `/admin/properties/edit/${id}?section=${section}`;

const MiniBar = ({ score, max, label }) => {
  const pct = Math.round((score / max) * 100);
  return (
    <div className="min-w-[64px]" title={`${label}: ${score} of ${max}`}>
      <div className="text-xs text-gray-700 tabular-nums">{score}/{max}</div>
      <div className="mt-1 h-1.5 rounded-full bg-gray-100 overflow-hidden" aria-hidden="true">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: scoreTone(pct).ring }} />
      </div>
    </div>
  );
};

const Detail = ({ hotelId, canEdit, onClose }) => {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    setData(null); setError('');
    adminContentApi.detail(hotelId).then((d) => live && setData(d)).catch((e) => live && setError(e.message));
    return () => { live = false; };
  }, [hotelId]);
  useEffect(() => {
    const esc = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label="Property content score">
      <button type="button" className="absolute inset-0 bg-navy-950/40" onClick={onClose} aria-label="Close" />
      <aside className="relative w-full max-w-xl h-full bg-white shadow-2xl overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-5 py-4 flex items-start justify-between gap-3 z-10">
          {data ? (
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-gray-900 truncate">{data.hotel.name}</h2>
              <p className="text-sm text-gray-600 flex items-center gap-1.5 flex-wrap">
                {data.hotel.stars ? <span className="flex" aria-label={`${data.hotel.stars} star`}>{Array.from({ length: data.hotel.stars }).map((_, i) => <Star key={i} size={12} className="fill-amber-400 text-amber-400" aria-hidden="true" />)}</span> : null}
                {data.hotel.type} · <MapPin size={13} className="text-gray-400" aria-hidden="true" /> {[data.hotel.area, data.hotel.city].filter(Boolean).join(', ')} · {statusText(data.hotel.status)}
              </p>
            </div>
          ) : <div className="h-10" />}
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100" aria-label="Close"><X size={18} /></button>
        </div>

        {error && <p className="p-5 text-sm text-red-700">{error}</p>}
        {!data && !error && <div className="flex h-64 items-center justify-center"><Loader2 className="animate-spin text-navy-700" size={28} /></div>}
        {data && (
          <div className="p-5 space-y-5">
            <div className="flex items-center gap-4">
              <ScoreRing score={data.content.score} size={88} stroke={9} />
              <div className="space-y-1 text-sm">
                <p className={`font-semibold ${scoreTone(data.content.score).text}`}>{data.content.label}</p>
                <p className="text-gray-700">Guest rating: {data.rating.score != null ? <b>{data.rating.score.toFixed(1)}/5</b> : 'no reviews yet'}{data.rating.count ? ` (${data.rating.count})` : ''}</p>
                <p className="text-gray-700">{data.hotel.photos} photos · {data.hotel.roomTypes} room type{data.hotel.roomTypes === 1 ? '' : 's'}</p>
              </div>
            </div>

            {data.owner && (
              <div className="rounded-lg bg-gray-50 p-3 text-sm">
                <p className="font-semibold text-gray-900">{data.owner.name}</p>
                <p className="text-gray-700 flex items-center gap-1.5"><Mail size={14} aria-hidden="true" /> <span className="select-all">{data.owner.email}</span></p>
                {data.owner.phone && <p className="text-gray-700 flex items-center gap-1.5"><Phone size={14} aria-hidden="true" /> <span className="select-all">{data.owner.phone}</span></p>}
              </div>
            )}

            {data.content.nextSteps.length > 0 && (
              <div>
                <h3 className="font-bold text-gray-900 flex items-center gap-2"><Lightbulb size={16} className="text-amber-500" aria-hidden="true" /> Biggest gains</h3>
                <ol className="mt-2 space-y-2">
                  {data.content.nextSteps.slice(0, 3).map((t, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <span className="w-5 h-5 shrink-0 rounded-full bg-navy-800 text-white text-xs font-bold flex items-center justify-center">{i + 1}</span>
                      <span className="flex-1 text-gray-800">{t.tip}</span>
                      <span className="text-xs font-semibold text-green-800 whitespace-nowrap">+{Math.round(t.gain)}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {data.content.sections.map((sec) => {
              const pct = Math.round((sec.score / sec.max) * 100);
              return (
                <section key={sec.key} className="border border-gray-200 rounded-card p-4">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="font-bold text-gray-900">{sec.label}</h3>
                    <span className="text-sm font-semibold text-gray-700 tabular-nums">{sec.score}/{sec.max}</span>
                  </div>
                  <div className="mt-2 h-1.5 rounded-full bg-gray-100 overflow-hidden" aria-hidden="true"><div className="h-full rounded-full" style={{ width: `${pct}%`, background: scoreTone(pct).ring }} /></div>
                  <ul className="mt-3 space-y-2">
                    {sec.checks.map((c) => (
                      <li key={c.key} className="flex items-start gap-2 text-sm">
                        {c.done ? <CheckCircle2 size={16} className="text-green-700 shrink-0 mt-0.5" aria-label="Done" /> : <Circle size={16} className="text-gray-300 shrink-0 mt-0.5" aria-label="To do" />}
                        <span className="flex-1">
                          <span className={c.done ? 'text-gray-700' : 'text-gray-900 font-medium'}>{c.label}</span>
                          {!c.done && <span className="block text-xs text-gray-600">{c.tip}</span>}
                        </span>
                        <span className="text-xs text-gray-500 tabular-nums">{Math.round(c.earned)}/{c.points}</span>
                      </li>
                    ))}
                  </ul>
                  {canEdit && sec.score < sec.max && (
                    <Link to={editLink(data.hotel.id, sec.key)} className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-navy-700 hover:underline">
                      Edit {sec.label.toLowerCase()} <ArrowRight size={14} aria-hidden="true" />
                    </Link>
                  )}
                </section>
              );
            })}
          </div>
        )}
      </aside>
    </div>
  );
};

const ContentScores = () => {
  usePageTitle('Content Scores');
  const { can } = useAccess();
  const canEdit = can('properties.manage');
  const [filters, setFilters] = useState({ search: '', status: '', band: '' });
  const [query, setQuery] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sort, setSort] = useState('score-asc');
  const [open, setOpen] = useState(null);

  const load = useCallback(() => {
    setLoading(true); setError('');
    adminContentApi.list(filters).then(setData).catch((e) => setError(e.message)).finally(() => setLoading(false));
  }, [filters]);
  useEffect(() => { load(); }, [load]);
  // Search as you type, a moment after the last key
  useEffect(() => {
    const t = setTimeout(() => setFilters((f) => (f.search === query ? f : { ...f, search: query })), 350);
    return () => clearTimeout(t);
  }, [query]);

  const rows = useMemo(() => {
    const list = [...(data?.properties || [])];
    const by = {
      'score-asc': (a, b) => a.score - b.score || a.name.localeCompare(b.name),
      'score-desc': (a, b) => b.score - a.score || a.name.localeCompare(b.name),
      name: (a, b) => a.name.localeCompare(b.name),
      fixes: (a, b) => b.openFixes - a.openFixes,
    }[sort];
    return list.sort(by);
  }, [data, sort]);

  const s = data?.summary;
  const select = 'border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white';

  return (
    <div className="space-y-6 pb-12">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Content Scores</h1>
        <p className="text-sm text-gray-600 mt-1 max-w-3xl">How complete each property&apos;s listing is, out of 100: basics 20, location 15, photos 25, rooms 20, amenities 10, policies 10. The same score and tips hotel owners see in their extranet.</p>
      </div>

      {s && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="bg-white rounded-card border border-gray-200 p-5 flex items-center gap-4">
            <ScoreRing score={s.averageScore} size={84} stroke={8} />
            <div>
              <p className="text-sm text-gray-600">Average across {s.properties} propert{s.properties === 1 ? 'y' : 'ies'}</p>
              <p className={`font-semibold ${scoreTone(s.averageScore).text}`}>{s.averageScore >= 85 ? 'Excellent' : s.averageScore >= 70 ? 'Good' : s.averageScore >= 50 ? 'Fair' : 'Needs work'}</p>
              {s.weakestSection && <p className="text-sm text-gray-700 mt-1">Weakest everywhere: <b>{s.weakestSection.label}</b> ({s.weakestSection.averagePercent}%)</p>}
            </div>
          </div>
          <div className="bg-white rounded-card border border-gray-200 p-5">
            <p className="text-sm font-semibold text-gray-900">Properties by score</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {BANDS.slice(1).map(([key, label]) => (
                <button key={key} type="button" onClick={() => setFilters((f) => ({ ...f, band: f.band === key ? '' : key }))} aria-pressed={filters.band === key}
                  className={`text-left rounded-lg border px-3 py-2 ${filters.band === key ? 'border-navy-700 bg-navy-50' : 'border-gray-200 hover:bg-gray-50'}`}>
                  <span className="block text-lg font-bold text-gray-900 tabular-nums">{s.bands[key]}</span>
                  <span className="text-xs text-gray-600">{label}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="bg-white rounded-card border border-gray-200 p-5">
            <p className="text-sm font-semibold text-gray-900">Average by section</p>
            <ul className="mt-3 space-y-2">
              {s.sectionAverages.map((x) => (
                <li key={x.key} className="text-sm">
                  <div className="flex justify-between"><span className="text-gray-700">{x.label}</span><span className="tabular-nums text-gray-900">{x.averagePercent}%</span></div>
                  <div className="mt-1 h-1.5 rounded-full bg-gray-100 overflow-hidden" aria-hidden="true"><div className="h-full rounded-full" style={{ width: `${x.averagePercent}%`, background: scoreTone(x.averagePercent).ring }} /></div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <label className="relative flex-1 min-w-[220px] max-w-md">
          <span className="sr-only">Search properties</span>
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" aria-hidden="true" />
          <input id="cs-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by property, city or owner email" className="w-full border border-gray-300 rounded-lg pl-9 pr-3 py-2 text-sm" />
        </label>
        <select id="cs-status" aria-label="Status" value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))} className={select}>
          {STATUS.map((x) => <option key={x} value={x}>{statusText(x)}</option>)}
        </select>
        <select id="cs-band" aria-label="Score band" value={filters.band} onChange={(e) => setFilters((f) => ({ ...f, band: e.target.value }))} className={select}>
          {BANDS.map(([k, l]) => <option key={k} value={k}>{k ? l : 'All scores'}</option>)}
        </select>
        <select id="cs-sort" aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value)} className={select}>
          <option value="score-asc">Lowest score first</option>
          <option value="score-desc">Highest score first</option>
          <option value="fixes">Most fixes open</option>
          <option value="name">Name A–Z</option>
        </select>
        {loading && <Loader2 size={18} className="animate-spin text-navy-700" aria-label="Loading" />}
      </div>

      {error && <p className="text-sm text-red-700">{error}</p>}

      <div className="bg-white rounded-card border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm min-w-[980px]">
          <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-600">
            <tr>
              <th className="px-4 py-3">Property</th>
              <th className="px-3 py-3">Score</th>
              {SECTION_COLS.map(([, l]) => <th key={l} className="px-3 py-3">{l}</th>)}
              <th className="px-3 py-3">Next fix</th>
              <th className="px-4 py-3"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((h) => (
              <tr key={h.id} className="hover:bg-gray-50 align-top">
                <td className="px-4 py-3">
                  <button type="button" onClick={() => setOpen(h.id)} className="text-left font-semibold text-navy-800 hover:underline">{h.name}</button>
                  <div className="text-xs text-gray-600">{[h.area, h.city].filter(Boolean).join(', ')} · {statusText(h.status)}</div>
                  {h.owner && <div className="text-xs text-gray-500 truncate max-w-[220px]">{h.owner.email}</div>}
                </td>
                <td className="px-3 py-3">
                  <div className="flex items-center gap-2">
                    <ScoreRing score={h.score} size={38} stroke={4} />
                    <span className={`text-xs font-semibold ${scoreTone(h.score).text}`}>{h.label}</span>
                  </div>
                </td>
                {SECTION_COLS.map(([k, l]) => <td key={k} className="px-3 py-3"><MiniBar score={h.sections[k].score} max={h.sections[k].max} label={l} /></td>)}
                <td className="px-3 py-3 text-xs text-gray-700 min-w-[240px] max-w-[320px]">{h.nextTip ? h.nextTip.tip : <span className="text-green-800">Complete</span>}</td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => setOpen(h.id)} className="px-2.5 py-1.5 rounded-lg border border-gray-300 text-xs font-semibold hover:bg-gray-50">Details</button>
                    {canEdit && h.nextTip && (
                      <Link to={editLink(h.id, h.nextTip.section)} className="px-2.5 py-1.5 rounded-lg bg-navy-800 text-white text-xs font-semibold hover:bg-navy-900 inline-flex items-center gap-1"><Pencil size={12} aria-hidden="true" /> Fix</Link>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={10} className="px-4 py-10 text-center text-gray-600">No properties match these filters.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {open && <Detail hotelId={open} canEdit={canEdit} onClose={() => setOpen(null)} />}
    </div>
  );
};

export default ContentScores;
