import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, ChevronLeft, ChevronRight, X, Lock, Info, Layers } from 'lucide-react';
import BulkUpdatePanel from './BulkUpdatePanel';

/**
 * Rates & availability calendar for one property (Admin -> Inventory & Rates and the extranet).
 *
 * Per room type: rooms to sell / booked / available and stop-sell, per day.
 * Per rate plan: price per night (a daily rate, or the base price when none is set).
 * Clicking a cell opens the editor for that day; the editor also does date ranges and weekdays.
 * Bulk update changes several room types / rate plans over a date range in one go.
 * Backend: GET /admin/ari/calendar, POST /admin/ari/inventory, /rates and /bulk.
 */

const API = `${import.meta.env.VITE_API_URL || '/api/v1'}/admin/ari`;
const headers = () => {
  const token = localStorage.getItem('jwt_token');
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
};
const ymd = (d) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MEAL = { NONE: 'Room only', EP: 'Room only', CP: 'Breakfast', MAP: 'Half board', AP: 'Full board' };
const SPAN = 14;

const AriCalendar = ({ hotelId, canEditWhenChannelManager = false }) => {
  const [start, setStart] = useState(() => new Date(new Date().setHours(0, 0, 0, 0)));
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [editor, setEditor] = useState(null); // { kind: 'inventory'|'rate', id, name, start, end, ... }
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [bulkOpen, setBulkOpen] = useState(false);

  const load = useCallback(async () => {
    if (!hotelId) return;
    setLoading(true); setError('');
    try {
      const q = new URLSearchParams({ hotelId, start: ymd(start), end: ymd(addDays(start, SPAN - 1)) });
      const res = await fetch(`${API}/calendar?${q}`, { headers: headers() });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || 'Could not load the calendar');
      setData(json.data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [hotelId, start]);

  useEffect(() => { load(); }, [load]);

  const locked = Boolean(data?.channelManager) && !canEditWhenChannelManager;

  const openInventory = (rt, cell) => setEditor({
    kind: 'inventory', id: rt.id, name: rt.name, physical: rt.physicalRooms,
    start: ymd(cell.date), end: ymd(cell.date), weekdays: [],
    totalRooms: String(cell.totalRooms), stopSell: cell.stopSell ? 'close' : 'open'
  });
  const openRate = (rt, rp, cell) => setEditor({
    kind: 'rate', id: rp.id, name: `${rt.name} · ${rp.name}`, basePrice: rp.basePrice,
    start: ymd(cell.date), end: ymd(cell.date), weekdays: [], price: String(cell.price)
  });

  const save = async (reset = false) => {
    if (!editor) return;
    setSaving(true); setError(''); setNotice('');
    try {
      const common = { start: editor.start, end: editor.end, weekdays: editor.weekdays };
      const body = editor.kind === 'inventory'
        ? { roomTypeId: editor.id, ...common, totalRooms: editor.totalRooms === '' ? undefined : Number(editor.totalRooms), stopSell: editor.stopSell === 'close' }
        : { ratePlanId: editor.id, ...common, price: reset ? null : Number(editor.price) };
      const res = await fetch(`${API}/${editor.kind === 'inventory' ? 'inventory' : 'rates'}`, { method: 'POST', headers: headers(), body: JSON.stringify(body) });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || 'Could not save');
      setNotice(`Saved for ${json.data.updated} day${json.data.updated === 1 ? '' : 's'}.`);
      setEditor(null);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleWeekday = (i) => setEditor((ed) => ({ ...ed, weekdays: ed.weekdays.includes(i) ? ed.weekdays.filter((d) => d !== i) : [...ed.weekdays, i] }));

  if (!hotelId) return null;

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-wrap items-center gap-3 justify-between">
        <div className="flex items-center gap-2">
          <button type="button" aria-label="Previous two weeks" onClick={() => setStart((s) => addDays(s, -SPAN))} className="p-2 border rounded-lg hover:bg-gray-50"><ChevronLeft size={16} /></button>
          <input type="date" aria-label="Start date" value={ymd(start)} onChange={(e) => e.target.value && setStart(new Date(`${e.target.value}T00:00:00`))} className="px-3 py-2 border rounded-lg text-sm" />
          <button type="button" aria-label="Next two weeks" onClick={() => setStart((s) => addDays(s, SPAN))} className="p-2 border rounded-lg hover:bg-gray-50"><ChevronRight size={16} /></button>
          <span className="text-xs text-gray-500 ml-1">{SPAN} days</span>
        </div>
        <div className="flex flex-wrap items-center gap-4 text-xs text-gray-500">
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-100 border border-green-300" /> Open</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-100 border border-red-300" /> Sold out / closed</span>
          <span className="flex items-center gap-1"><span className="px-1 rounded font-bold text-blue-700 bg-blue-50">₹</span> Daily rate (overrides base)</span>
          <span className="flex items-center gap-1"><span className="px-1 rounded font-bold text-purple-700 bg-purple-50">₹</span> Dynamic pricing</span>
          <button type="button" onClick={load} disabled={loading} className="flex items-center gap-1.5 px-3 py-2 border rounded-lg hover:bg-gray-50 font-semibold text-gray-700">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
          <button type="button" onClick={() => { setNotice(''); setBulkOpen(true); }} disabled={locked || !data?.roomTypes?.length}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white font-semibold disabled:opacity-50">
            <Layers size={14} /> Bulk update
          </button>
        </div>
      </div>

      {data?.channelManager && (
        <div className={`p-4 rounded-xl border text-sm flex items-start gap-3 ${locked ? 'bg-amber-50 border-amber-200 text-amber-900' : 'bg-blue-50 border-blue-200 text-blue-900'}`}>
          {locked ? <Lock size={18} className="shrink-0 mt-0.5" /> : <Info size={18} className="shrink-0 mt-0.5" />}
          <p>
            Rates and availability for this property come from <strong>{data.channelManager.provider}</strong>.
            {locked ? ' Update them in your channel manager.' : ' Changes made here are overwritten by its next update.'}
          </p>
        </div>
      )}

      {error && <div role="alert" className="p-3 bg-red-50 text-red-700 rounded-lg border border-red-200 text-sm">{error}</div>}
      {notice && <div role="status" className="p-3 bg-green-50 text-green-700 rounded-lg border border-green-200 text-sm">{notice}</div>}

      {/* Grid */}
      {!data ? (
        <div className="py-12 text-center text-gray-400 bg-white rounded-xl border border-gray-200">{loading ? 'Loading…' : ''}</div>
      ) : data.roomTypes.length === 0 ? (
        <div className="py-12 text-center text-gray-500 bg-white rounded-xl border border-gray-200">No active room types. Add rooms and rate plans in Room Config first.</div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto shadow-sm">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-4 py-3 text-left font-bold text-gray-700 min-w-[220px] sticky left-0 bg-gray-50 z-10 border-r border-gray-200">Room / rate plan</th>
                {data.days.map((d) => {
                  const day = new Date(d); const weekend = day.getDay() === 0 || day.getDay() === 6;
                  return (
                    <th key={d} className={`px-2 py-2 text-center border-r border-gray-100 min-w-[78px] ${weekend ? 'bg-gray-100' : ''}`}>
                      <div className="text-[10px] text-gray-400 font-semibold uppercase">{WEEKDAYS[day.getDay()]}</div>
                      <div className="font-bold text-gray-800 text-xs">{day.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {data.roomTypes.map((rt) => (
                <FragmentRows key={rt.id} rt={rt} locked={locked} onInventory={openInventory} onRate={openRate} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {bulkOpen && data && (
        <BulkUpdatePanel
          api={API}
          headers={headers}
          hotelId={hotelId}
          roomTypes={data.roomTypes}
          defaultStart={start}
          onClose={() => setBulkOpen(false)}
          onSaved={async (msg) => { setBulkOpen(false); setNotice(msg); await load(); }}
        />
      )}

      {/* Editor */}
      {editor && (
        <div className="fixed inset-0 z-[200] bg-black/30 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Edit rates and availability">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-gray-400">{editor.kind === 'inventory' ? 'Availability' : 'Price per night'}</p>
                <h3 className="text-lg font-bold text-gray-900">{editor.name}</h3>
              </div>
              <button type="button" aria-label="Close" onClick={() => setEditor(null)} className="text-gray-400 hover:text-gray-700"><X size={20} /></button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs font-semibold text-gray-600">From
                <input type="date" value={editor.start} onChange={(e) => setEditor({ ...editor, start: e.target.value })} className="mt-1 w-full px-3 py-2 border rounded-lg text-sm" />
              </label>
              <label className="text-xs font-semibold text-gray-600">To
                <input type="date" value={editor.end} min={editor.start} onChange={(e) => setEditor({ ...editor, end: e.target.value })} className="mt-1 w-full px-3 py-2 border rounded-lg text-sm" />
              </label>
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-600 mb-1">Only on (optional)</p>
              <div className="flex gap-1 flex-wrap">
                {WEEKDAYS.map((w, i) => (
                  <button key={w} type="button" aria-pressed={editor.weekdays.includes(i)} onClick={() => toggleWeekday(i)}
                    className={`px-2.5 py-1 rounded-md text-xs font-semibold border ${editor.weekdays.includes(i) ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-gray-600 border-gray-200'}`}>{w}</button>
                ))}
              </div>
            </div>

            {editor.kind === 'inventory' ? (
              <>
                <label className="block text-xs font-semibold text-gray-600">Rooms to sell (of {editor.physical})
                  <input type="number" min="0" max={editor.physical} value={editor.totalRooms} onChange={(e) => setEditor({ ...editor, totalRooms: e.target.value })} className="mt-1 w-full px-3 py-2 border rounded-lg text-sm" />
                </label>
                <div className="flex gap-2" role="radiogroup" aria-label="Sale status">
                  {[{ id: 'open', label: 'Open for sale' }, { id: 'close', label: 'Stop sell' }].map((o) => (
                    <button key={o.id} type="button" role="radio" aria-checked={editor.stopSell === o.id} onClick={() => setEditor({ ...editor, stopSell: o.id })}
                      className={`flex-1 px-3 py-2 rounded-lg text-sm font-semibold border ${editor.stopSell === o.id ? (o.id === 'close' ? 'bg-red-600 text-white border-red-600' : 'bg-green-600 text-white border-green-600') : 'bg-white text-gray-700 border-gray-200'}`}>{o.label}</button>
                  ))}
                </div>
                <p className="text-xs text-gray-500">Rooms to sell can&apos;t be lower than rooms already booked on a date.</p>
              </>
            ) : (
              <>
                <label className="block text-xs font-semibold text-gray-600">Price per night (₹, base occupancy, before GST)
                  <input type="number" min="1" step="1" value={editor.price} onChange={(e) => setEditor({ ...editor, price: e.target.value })} className="mt-1 w-full px-3 py-2 border rounded-lg text-sm" />
                </label>
                <p className="text-xs text-gray-500">Base price {inr(editor.basePrice)}. Extra adult, child, bed and meal charges from the rate plan still apply.</p>
              </>
            )}

            <div className="flex justify-between gap-2 pt-2">
              {editor.kind === 'rate' ? (
                <button type="button" disabled={saving} onClick={() => save(true)} className="px-3 py-2 text-sm font-semibold text-gray-600 hover:text-gray-900" title="Removes the daily rate; dynamic pricing (if on) sets the price again within the hour">Reset to base price</button>
              ) : <span />}
              <div className="flex gap-2">
                <button type="button" onClick={() => setEditor(null)} className="px-4 py-2 border rounded-lg text-sm font-semibold">Cancel</button>
                <button type="button" disabled={saving} onClick={() => save(false)} className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-sm font-bold disabled:opacity-50">{saving ? 'Saving…' : 'Save'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const FragmentRows = ({ rt, locked, onInventory, onRate }) => (
  <>
    <tr className="border-t-2 border-gray-200 bg-white">
      <td className="px-4 py-3 sticky left-0 bg-white border-r border-gray-200 z-10">
        <div className="font-bold text-gray-900">{rt.name}</div>
        <div className="text-xs text-gray-500">Available / to sell · {rt.physicalRooms} rooms</div>
      </td>
      {rt.inventory.map((c) => {
        const closed = c.stopSell || c.availableRooms <= 0;
        return (
          <td key={c.date} className="px-1 py-2 border-r border-gray-100 text-center">
            <button type="button" disabled={locked} onClick={() => onInventory(rt, c)}
              title={c.stopSell ? 'Stop sell' : `${c.bookedRooms} booked`}
              aria-label={`${rt.name} ${new Date(c.date).toDateString()}: ${c.stopSell ? 'stop sell' : `${c.availableRooms} of ${c.totalRooms} available`}`}
              className={`w-full rounded-md py-1.5 text-xs font-bold border ${closed ? 'bg-red-50 text-red-700 border-red-200' : 'bg-green-50 text-green-700 border-green-200'} ${locked ? 'cursor-default' : 'hover:ring-2 hover:ring-brand-300'}`}>
              {c.stopSell ? 'Closed' : `${c.availableRooms}/${c.totalRooms}`}
              {c.bookedRooms > 0 && <span className="block text-[9px] font-semibold text-orange-600">{c.bookedRooms} sold</span>}
            </button>
          </td>
        );
      })}
    </tr>
    {rt.ratePlans.map((rp) => (
      <tr key={rp.id} className="bg-gray-50/40">
        <td className="px-4 py-2 pl-8 sticky left-0 bg-gray-50 border-r border-gray-200 z-10">
          <div className="text-sm font-semibold text-gray-800">{rp.name}</div>
          <div className="text-[11px] text-gray-500">{MEAL[rp.mealPlan] || 'Room only'} · base {inr(rp.basePrice)}</div>
        </td>
        {rp.rates.map((r) => (
          <td key={r.date} className="px-1 py-2 border-r border-gray-100 text-center">
            <button type="button" disabled={locked} onClick={() => onRate(rt, rp, r)}
              title={r.source === 'DYNAMIC' ? 'Set by dynamic pricing. Setting a price here overrides it.' : r.isOverride ? 'Daily rate' : 'Base price'}
              aria-label={`${rp.name} ${new Date(r.date).toDateString()}: ${inr(r.price)}${r.source === 'DYNAMIC' ? ' (dynamic pricing)' : r.isOverride ? ' (daily rate)' : ''}`}
              className={`w-full rounded-md py-1.5 text-xs border border-transparent ${r.source === 'DYNAMIC' ? 'font-bold text-purple-700 bg-purple-50' : r.isOverride ? 'font-extrabold text-blue-700 bg-blue-50' : 'text-gray-700'} ${locked ? 'cursor-default' : 'hover:border-brand-300'}`}>
              {Number(r.price).toLocaleString('en-IN')}
            </button>
          </td>
        ))}
      </tr>
    ))}
  </>
);

export default AriCalendar;
