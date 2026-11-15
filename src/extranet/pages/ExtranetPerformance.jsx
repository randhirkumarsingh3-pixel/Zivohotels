import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Eye, MousePointerClick, CalendarCheck, Percent, IndianRupee, BedDouble, XCircle, Clock, Trophy, Lightbulb, ChevronRight, Loader2, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { extranetGet } from '../../services/extranetApi';
import { useExtranet } from '../context/ExtranetContext';

/**
 * Extranet -> Performance: real figures for the last 7, 30 or 90 days (GET /extranet/performance):
 * page views and visitors, booking starts, bookings and conversion, revenue, room nights, average
 * daily rate, occupancy, cancellations and lead time, rank by views in the city, daily views and
 * bookings, and tips that follow from the property's own data. Replaces a page of sample figures.
 */
const inr = (n) => `₹${Math.round(Number(n) || 0).toLocaleString('en-IN')}`;
const RANGES = [[7, '7 days'], [30, '30 days'], [90, '90 days']];

const Change = ({ now, before, goodWhenUp = true, suffix = '' }) => {
  if (now == null || before == null || before === 0) return null;
  const pct = Math.round(((now - before) / before) * 100);
  if (!pct) return <span className="text-xs text-gray-500">No change</span>;
  const good = pct > 0 === goodWhenUp;
  const Icon = pct > 0 ? ArrowUpRight : ArrowDownRight;
  return <span className={`inline-flex items-center gap-0.5 text-xs font-semibold ${good ? 'text-green-800' : 'text-red-700'}`}><Icon size={14} aria-hidden="true" />{Math.abs(pct)}%{suffix} vs previous</span>;
};

const Kpi = ({ icon: Icon, label, value, note, change }) => (
  <div className="bg-white rounded-card border border-gray-200 p-5">
    <p className="flex items-center gap-2 text-sm font-medium text-gray-600"><Icon size={16} className="text-navy-700" aria-hidden="true" /> {label}</p>
    <p className="text-2xl font-bold text-gray-900 mt-1 tabular-nums">{value}</p>
    <div className="mt-1 min-h-[1rem] flex flex-wrap gap-x-2 text-xs text-gray-500">{note && <span>{note}</span>}{change}</div>
  </div>
);

/** One series per chart (views and bookings have different scales). Hover a bar for its value. */
const Bars = ({ title, series, field, unit }) => {
  const [hover, setHover] = useState(null);
  const max = Math.max(1, ...series.map((d) => d[field]));
  const total = series.reduce((s, d) => s + d[field], 0);
  const fmt = (d) => new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  return (
    <figure className="bg-white rounded-card border border-gray-200 p-5">
      <figcaption className="flex items-baseline justify-between gap-3">
        <span className="font-bold text-gray-900">{title}</span>
        <span className="text-sm text-gray-600 tabular-nums">{total.toLocaleString('en-IN')} in total</span>
      </figcaption>
      <div className="relative mt-4 h-40" onMouseLeave={() => setHover(null)}>
        <div className="absolute inset-x-0 bottom-0 border-t border-gray-200" aria-hidden="true" />
        <div className="absolute inset-0 flex items-end" style={{ gap: series.length > 40 ? 1 : 2 }}>
          {series.map((d, i) => (
            <button key={d.date} type="button" onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} onBlur={() => setHover(null)}
              aria-label={`${fmt(d.date)}: ${d[field]} ${unit}`} className="flex-1 h-full flex items-end focus:outline-none group">
              <span className={`w-full rounded-t-[4px] ${hover === i ? 'bg-navy-900' : 'bg-navy-600'}`} style={{ height: d[field] ? `${Math.max(3, (d[field] / max) * 100)}%` : 0 }} />
            </button>
          ))}
        </div>
        {hover != null && (
          <div className="absolute -top-2 pointer-events-none bg-gray-900 text-white text-xs rounded-md px-2 py-1 whitespace-nowrap -translate-x-1/2 -translate-y-full"
            style={{ left: `${((hover + 0.5) / series.length) * 100}%` }}>
            {fmt(series[hover].date)}: <strong>{series[hover][field]}</strong> {unit}
          </div>
        )}
      </div>
      <div className="mt-2 flex justify-between text-xs text-gray-500"><span>{fmt(series[0].date)}</span><span>{fmt(series[series.length - 1].date)}</span></div>
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-navy-700 font-medium">Show as table</summary>
        <div className="max-h-48 overflow-y-auto mt-2">
          <table className="w-full text-left text-sm">
            <thead><tr className="text-gray-500"><th className="py-1 font-medium">Date</th><th className="py-1 font-medium text-right">{title}</th></tr></thead>
            <tbody>{series.filter((d) => d[field]).map((d) => <tr key={d.date} className="border-t border-gray-100"><td className="py-1">{fmt(d.date)}</td><td className="py-1 text-right tabular-nums">{d[field]}</td></tr>)}</tbody>
          </table>
          {!series.some((d) => d[field]) && <p className="text-gray-500 py-2">None in this period.</p>}
        </div>
      </details>
    </figure>
  );
};

const ExtranetPerformance = () => {
  const { addToast, hotelId, property } = useExtranet();
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try { setData(await extranetGet(`/performance?days=${days}`)); } catch (e) { addToast(e.message, 'error'); } finally { setLoading(false); }
  }, [days, addToast]);
  useEffect(() => { if (hotelId) load(); }, [load, hotelId]);

  const c = data?.current; const p = data?.previous;
  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Performance</h1>
          <p className="text-gray-600 mt-1">How {property?.name || 'your property'} is doing on ZivoHotels. Bookings count when they were made; cancelled ones are left out of revenue.</p>
        </div>
        <div className="flex shrink-0 rounded-lg border border-gray-300 bg-white overflow-hidden self-start" role="group" aria-label="Period">
          {RANGES.map(([d, label]) => (
            <button key={d} type="button" aria-pressed={days === d} onClick={() => setDays(d)} className={`px-4 py-2 text-sm font-semibold whitespace-nowrap ${days === d ? 'bg-navy-800 text-white' : 'text-gray-700 hover:bg-gray-50'}`}>{label}</button>
          ))}
        </div>
      </div>

      {loading && !data ? <div className="flex h-64 items-center justify-center"><Loader2 className="animate-spin text-navy-700" size={32} /></div> : data && (
        <>
          <section aria-label="Guests" className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Kpi icon={Eye} label="Page views" value={c.views.toLocaleString('en-IN')} note={`${c.visitors} visitors`} change={<Change now={c.views} before={p.views} />} />
            <Kpi icon={MousePointerClick} label="Started booking" value={c.starts.toLocaleString('en-IN')} change={<Change now={c.starts} before={p.starts} />} />
            <Kpi icon={CalendarCheck} label="Bookings" value={c.bookings} change={<Change now={c.bookings} before={p.bookings} />} />
            <Kpi icon={Percent} label="Conversion" value={c.conversion != null ? `${c.conversion}%` : '—'} note="Bookings ÷ visitors" />
          </section>
          <section aria-label="Money and rooms" className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Kpi icon={IndianRupee} label="Revenue" value={inr(c.revenue)} change={<Change now={c.revenue} before={p.revenue} />} />
            <Kpi icon={BedDouble} label="Average daily rate" value={c.adr ? inr(c.adr) : '—'} note={`${c.roomNights} room night${c.roomNights === 1 ? '' : 's'}`} />
            <Kpi icon={BedDouble} label="Occupancy" value={c.occupancy != null ? `${c.occupancy}%` : '—'} note="Rooms sold ÷ rooms on sale, past nights" />
            <Kpi icon={XCircle} label="Cancellations" value={c.cancellationRate != null ? `${c.cancellationRate}%` : '—'} note={`${c.cancelled} cancelled${c.leadTimeDays != null ? ` · booked ${c.leadTimeDays} days ahead on average` : ''}`} />
          </section>

          <div className="grid gap-4 lg:grid-cols-2">
            <Bars title="Page views" series={data.series} field="views" unit="views" />
            <Bars title="Bookings" series={data.series} field="bookings" unit="bookings" />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <section className="bg-white rounded-card border border-gray-200 p-5">
              <h2 className="font-bold text-gray-900 flex items-center gap-2"><Trophy size={18} className="text-amber-600" aria-hidden="true" /> Your rank</h2>
              {data.rank
                ? <p className="mt-2 text-gray-700"><span className="text-3xl font-bold text-gray-900 tabular-nums">#{data.rank.position}</span> of {data.rank.of} hotels in {data.rank.city}, by page views in the last {days} days.</p>
                : <p className="mt-2 text-sm text-gray-600">You&apos;re the only ZivoHotels property in your city for now, so there&apos;s no ranking yet.</p>}
              <p className="mt-3 text-xs text-gray-500 flex items-center gap-1"><Clock size={12} aria-hidden="true" /> Updated when you open this page.</p>
            </section>
            <section className="lg:col-span-2 bg-white rounded-card border border-gray-200 p-5">
              <h2 className="font-bold text-gray-900 flex items-center gap-2"><Lightbulb size={18} className="text-brand-600" aria-hidden="true" /> Ways to get more bookings</h2>
              {data.tips.length ? (
                <ul className="mt-2 divide-y divide-gray-100">
                  {data.tips.map((t) => (
                    <li key={t.key}>
                      <Link to={t.link === 'EDIT_LISTING' ? `/extranet/onboarding/${hotelId}` : t.link} className="flex items-center justify-between gap-3 py-3 text-sm text-gray-700 hover:text-navy-800">
                        {t.text} <ChevronRight size={16} className="shrink-0 text-gray-400" aria-hidden="true" />
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : <p className="mt-2 text-sm text-gray-600">Nothing to suggest right now. Nice work.</p>}
            </section>
          </div>
        </>
      )}
    </div>
  );
};

export default ExtranetPerformance;
