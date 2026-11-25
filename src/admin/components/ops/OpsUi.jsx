/**
 * Small building blocks shared by the operations pages (System control, System health, Demand
 * forecasting, Revenue per search, Experiments, Fraud & risk).
 */
import { Loader2, RefreshCw } from 'lucide-react';
import { int } from './opsFormat';


export const PageHeader = ({ title, sub, children }) => (
  <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
    <div className="min-w-0">
      <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
      {sub && <p className="text-sm text-gray-600 mt-1 max-w-3xl">{sub}</p>}
    </div>
    {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
  </div>
);

export const Card = ({ title, sub, right, children, className = '' }) => (
  <section className={`bg-white border border-gray-200 rounded-2xl ${className}`}>
    {(title || right) && (
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5">
        <div className="min-w-0">
          {title && <h2 className="font-bold text-gray-900">{title}</h2>}
          {sub && <p className="text-xs text-gray-500 mt-0.5">{sub}</p>}
        </div>
        {right}
      </div>
    )}
    <div className="p-5">{children}</div>
  </section>
);

export const Stat = ({ label, value, hint, tone }) => (
  <div className="bg-white border border-gray-200 rounded-2xl p-4">
    <p className="text-xs font-semibold text-gray-500">{label}</p>
    <p className={`text-2xl font-bold tabular-nums mt-1 ${tone === 'good' ? 'text-green-700' : tone === 'bad' ? 'text-red-600' : tone === 'warn' ? 'text-amber-700' : 'text-gray-900'}`}>{value}</p>
    {hint && <p className="text-xs text-gray-500 mt-1">{hint}</p>}
  </div>
);

const TONES = {
  ok: 'bg-green-50 text-green-800 border-green-200', good: 'bg-green-50 text-green-800 border-green-200',
  warn: 'bg-amber-50 text-amber-800 border-amber-200', medium: 'bg-amber-50 text-amber-800 border-amber-200',
  down: 'bg-red-50 text-red-700 border-red-200', bad: 'bg-red-50 text-red-700 border-red-200', high: 'bg-red-50 text-red-700 border-red-200',
  info: 'bg-sky-50 text-sky-800 border-sky-200', low: 'bg-gray-50 text-gray-700 border-gray-200', off: 'bg-gray-50 text-gray-600 border-gray-200',
};
export const Pill = ({ tone = 'off', children }) => (
  <span className={`inline-flex items-center px-2 py-0.5 rounded-md border text-xs font-semibold whitespace-nowrap ${TONES[tone] || TONES.off}`}>{children}</span>
);

export const Loading = ({ text = 'Loading…' }) => <p className="text-sm text-gray-500 flex items-center gap-2 py-8"><Loader2 size={16} className="animate-spin" /> {text}</p>;
export const ErrorNote = ({ error, onRetry }) => (
  <div role="alert" className="text-sm px-4 py-3 rounded-xl bg-red-50 text-red-700 flex flex-wrap items-center gap-3">
    {error}
    {onRetry && <button type="button" onClick={onRetry} className="font-semibold underline">Try again</button>}
  </div>
);
export const Empty = ({ children }) => <p className="text-sm text-gray-500 py-6 text-center">{children}</p>;

export const RefreshButton = ({ onClick, busy }) => (
  <button type="button" onClick={onClick} disabled={busy} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm font-semibold text-gray-800 hover:border-gray-300 disabled:opacity-60">
    <RefreshCw size={15} className={busy ? 'animate-spin' : ''} aria-hidden="true" /> Refresh
  </button>
);

export const Segmented = ({ value, options, onChange, label }) => (
  <div role="radiogroup" aria-label={label} className="inline-flex bg-white border border-gray-200 rounded-lg p-0.5">
    {options.map(([v, text]) => (
      <button key={v} type="button" role="radio" aria-checked={value === v} onClick={() => onChange(v)}
        className={`px-3 py-1.5 rounded-md text-sm font-semibold ${value === v ? 'bg-navy-800 text-white' : 'text-gray-600 hover:text-gray-900'}`}>{text}</button>
    ))}
  </div>
);

/**
 * Simple bar chart (SVG). data: [{ label, value, value2? }]; value2 is drawn as a lighter bar
 * behind (e.g. capacity behind booked rooms).
 */
export const Bars = ({ data, height = 140, format = int, label, color = '#1e3a8a', backColor = '#e5e7eb', showEvery }) => {
  if (!data?.length) return <Empty>No data yet.</Empty>;
  const max = Math.max(1, ...data.map((d) => Math.max(d.value || 0, d.value2 || 0)));
  const w = 100 / data.length;
  const every = showEvery || Math.ceil(data.length / 8);
  return (
    <div className="w-full" role="img" aria-label={label}>
      <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" className="w-full" style={{ height }}>
        {[0.25, 0.5, 0.75].map((g) => <line key={g} x1="0" x2="100" y1={height * g} y2={height * g} stroke="#f1f5f9" strokeWidth="0.3" vectorEffect="non-scaling-stroke" />)}
        {data.map((d, i) => {
          const h2 = ((d.value2 || 0) / max) * (height - 4);
          const h = ((d.value || 0) / max) * (height - 4);
          return (
            <g key={d.label + i}>
              <title>{`${d.label}: ${format(d.value)}${d.value2 !== undefined ? ` of ${format(d.value2)}` : ''}`}</title>
              {d.value2 !== undefined && <rect x={i * w + w * 0.15} width={w * 0.7} y={height - h2} height={h2} fill={backColor} rx="0.4" />}
              <rect x={i * w + w * 0.15} width={w * 0.7} y={height - h} height={Math.max(h, d.value ? 0.6 : 0)} fill={d.color || color} rx="0.4" />
            </g>
          );
        })}
      </svg>
      <div className="relative h-4 text-[10px] text-gray-500 mt-1 tabular-nums">
        {data.map((d, i) => (i % every === 0 ? <span key={d.label + i} style={{ left: `${(i + 0.5) * w}%` }} className="absolute -translate-x-1/2 whitespace-nowrap">{d.label}</span> : null))}
      </div>
    </div>
  );
};

export const Table = ({ head, children, empty }) => (
  <div className="overflow-x-auto -mx-5">
    <table className="w-full text-sm min-w-[560px]">
      <thead><tr className="text-left text-xs text-gray-500 border-b border-gray-100">{head.map((h, i) => <th key={i} className={`px-5 py-2 font-semibold ${h.startsWith('#') ? 'text-right' : ''}`}>{h.replace(/^#/, '')}</th>)}</tr></thead>
      <tbody className="divide-y divide-gray-50">{children}</tbody>
    </table>
    {empty}
  </div>
);
