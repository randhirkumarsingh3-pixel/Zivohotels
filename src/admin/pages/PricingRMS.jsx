import { useState, useEffect, useCallback } from 'react';
import { Zap, Building2, CalendarDays, ShieldAlert, Plus, Trash2, ArrowLeft } from 'lucide-react';
import DynamicPricingManager from '../../components/pricing/DynamicPricingManager';

/**
 * Admin -> Pricing & RMS. (This page was a mock with made-up hotels and numbers.)
 *  - Properties: dynamic pricing state of every property; open one to manage its rules and limits
 *    (the same screen the owner has in the extranet).
 *  - Holiday calendar: festival / event dates with a price uplift, for all cities or one city.
 *    Each property chooses whether to apply it.
 *  - Platform mode: SAFE_MODE holds payouts and experiments platform-wide.
 */
const API = `${import.meta.env.VITE_API_URL || '/api/v1'}/pricing`;
const headers = () => {
  const token = localStorage.getItem('jwt_token');
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
};
const call = async (path, method = 'GET', body) => {
  const res = await fetch(`${API}${path}`, { method, headers: headers(), ...(body ? { body: JSON.stringify(body) } : {}) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.success === false) throw new Error(json.message || 'Something went wrong');
  return json.data;
};

const TABS = [
  { id: 'properties', label: 'Properties', icon: Building2 },
  { id: 'holidays', label: 'Holiday calendar', icon: CalendarDays },
  { id: 'platform', label: 'Platform mode', icon: ShieldAlert },
];

const Properties = () => {
  const [rows, setRows] = useState(null);
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState('');
  const load = useCallback(() => { call('/dynamic').then(setRows).catch((e) => setError(e.message)); }, []);
  useEffect(() => { load(); }, [load]);

  if (selected) {
    return (
      <div className="space-y-4">
        <button type="button" onClick={() => { setSelected(null); load(); }} className="flex items-center gap-1 text-sm font-semibold text-gray-600 hover:text-gray-900"><ArrowLeft size={16} /> All properties</button>
        <h2 className="text-xl font-bold text-gray-900">{selected.name} <span className="text-sm font-medium text-gray-400">· {selected.city}</span></h2>
        <DynamicPricingManager hotelId={selected.id} inventoryLink="/admin/inventory-pricing" />
      </div>
    );
  }
  if (error) return <p className="p-4 bg-red-50 text-red-700 rounded-lg text-sm">{error}</p>;
  if (!rows) return <p className="text-gray-400">Loading…</p>;
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-gray-500 bg-gray-50">
            <th className="px-4 py-3 font-semibold">Property</th>
            <th className="px-4 py-3 font-semibold">Dynamic pricing</th>
            <th className="px-4 py-3 font-semibold">Active rules</th>
            <th className="px-4 py-3 font-semibold">Last update</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody>
          {rows.map((h) => (
            <tr key={h.id} className="border-t border-gray-100">
              <td className="px-4 py-3"><div className="font-semibold text-gray-900">{h.name}</div><div className="text-xs text-gray-400">{h.city}{h.integrationMode === 'CHANNEL_MANAGER' ? ' · channel manager' : ''}</div></td>
              <td className="px-4 py-3">
                <span className={`px-2 py-0.5 rounded text-xs font-bold ${h.enabled ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-500'}`}>{h.enabled ? 'ON' : 'OFF'}</span>
              </td>
              <td className="px-4 py-3 text-gray-700">{h.rules}</td>
              <td className="px-4 py-3 text-xs text-gray-500">
                {h.lastRunAt ? new Date(h.lastRunAt).toLocaleString('en-IN') : '—'}
                {h.lastRunSummary?.status === 'ON' && <div>{h.lastRunSummary.dynamicNights} nights adjusted</div>}
              </td>
              <td className="px-4 py-3 text-right">
                <button type="button" onClick={() => setSelected(h)} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-brand-50 text-brand-700 hover:bg-brand-100">Manage</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const Holidays = () => {
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState({ date: '', name: '', city: '', upliftPercent: 15 });
  const [msg, setMsg] = useState(null);
  const load = useCallback(() => { call('/holidays').then(setRows).catch((e) => setMsg({ type: 'error', text: e.message })); }, []);
  useEffect(() => { load(); }, [load]);

  const add = async (e) => {
    e.preventDefault();
    try {
      await call('/holidays', 'POST', form);
      setMsg({ type: 'success', text: `${form.name} added. Properties that apply the holiday calendar are being updated.` });
      setForm({ date: '', name: '', city: '', upliftPercent: 15 });
      load();
    } catch (err) { setMsg({ type: 'error', text: err.message }); }
  };
  const remove = async (h) => {
    if (!confirm(`Remove ${h.name}?`)) return;
    try { await call(`/holidays/${h.id}`, 'DELETE'); load(); } catch (err) { setMsg({ type: 'error', text: err.message }); }
  };
  const input = 'px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none';

  return (
    <div className="space-y-4">
      {msg && <div role={msg.type === 'error' ? 'alert' : 'status'} className={`p-3 rounded-lg text-sm border ${msg.type === 'error' ? 'bg-red-50 border-red-200 text-red-700' : 'bg-green-50 border-green-200 text-green-800'}`}>{msg.text}</div>}
      <form onSubmit={add} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
        <label className="text-xs font-semibold text-gray-600">Date<input type="date" required className={`${input} w-full mt-1`} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></label>
        <label className="text-xs font-semibold text-gray-600 md:col-span-2">Holiday or event<input required className={`${input} w-full mt-1`} placeholder="e.g. Diwali" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
        <label className="text-xs font-semibold text-gray-600">City (empty = all)<input className={`${input} w-full mt-1`} placeholder="All cities" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></label>
        <div className="flex gap-2 items-end">
          <label className="text-xs font-semibold text-gray-600 flex-1">Uplift %<input type="number" min="-50" max="200" required className={`${input} w-full mt-1`} value={form.upliftPercent} onChange={(e) => setForm({ ...form, upliftPercent: e.target.value })} /></label>
          <button type="submit" className="px-3 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-sm font-bold flex items-center gap-1"><Plus size={15} /> Add</button>
        </div>
      </form>
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm">
        {rows.length === 0 ? <p className="p-6 text-sm text-gray-400">No upcoming holidays or events.</p> : (
          <ul className="divide-y divide-gray-100">
            {rows.map((h) => (
              <li key={h.id} className="px-4 py-3 flex items-center justify-between gap-3 text-sm">
                <span className="font-medium text-gray-900 w-32">{new Date(h.date).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</span>
                <span className="flex-1 text-gray-700">{h.name}</span>
                <span className="text-gray-500 w-32">{h.city || 'All cities'}</span>
                <span className="font-bold text-orange-700 w-16 text-right">{h.multiplier > 0 ? '+' : ''}{Math.round(h.multiplier * 100)}%</span>
                <button type="button" aria-label={`Remove ${h.name}`} onClick={() => remove(h)} className="p-1.5 text-gray-400 hover:text-red-600"><Trash2 size={15} /></button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="text-xs text-gray-500">The uplift applies on that night to every property with dynamic pricing on that applies the holiday calendar, within its own limits.</p>
    </div>
  );
};

const Platform = () => {
  const [mode, setMode] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { call('/config').then((d) => setMode(d.systemMode)).catch((e) => setError(e.message)); }, []);
  const change = async (next) => {
    if (next === 'SAFE_MODE' && !confirm('Switch the platform to SAFE MODE? Payouts are held and experiments paused until you switch back.')) return;
    try { setMode((await call('/config', 'PUT', { systemMode: next })).systemMode); } catch (e) { setError(e.message); }
  };
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm space-y-3 max-w-xl">
      {error && <p className="text-sm text-red-600">{error}</p>}
      <p className="text-sm text-gray-600">Current mode: <strong>{mode || '…'}</strong></p>
      <p className="text-xs text-gray-500">SAFE MODE holds payouts and pauses pricing experiments platform-wide. Use it only during an incident.</p>
      <div className="flex gap-2">
        <button type="button" disabled={mode === 'NORMAL'} onClick={() => change('NORMAL')} className="px-4 py-2 rounded-lg text-sm font-bold border disabled:opacity-40">Normal</button>
        <button type="button" disabled={mode === 'SAFE_MODE'} onClick={() => change('SAFE_MODE')} className="px-4 py-2 rounded-lg text-sm font-bold bg-red-600 text-white disabled:opacity-40">Safe mode</button>
      </div>
    </div>
  );
};

const PricingRMS = () => {
  const [tab, setTab] = useState('properties');
  return (
    <div className="space-y-6">
      <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><Zap className="text-purple-600" size={22} /> Pricing &amp; RMS</h1>
        <p className="text-gray-500 mt-1">Dynamic pricing rules per property, the holiday &amp; event calendar, and platform mode.</p>
        <div className="flex gap-1 mt-4 border-b border-gray-100" role="tablist">
          {TABS.map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-4 py-2 text-sm font-semibold border-b-2 -mb-px ${tab === t.id ? 'border-brand-600 text-brand-700' : 'border-transparent text-gray-500 hover:text-gray-800'}`}>
              <t.icon size={15} /> {t.label}
            </button>
          ))}
        </div>
      </div>
      {tab === 'properties' && <Properties />}
      {tab === 'holidays' && <Holidays />}
      {tab === 'platform' && <Platform />}
    </div>
  );
};

export default PricingRMS;
