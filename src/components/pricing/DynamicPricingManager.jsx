import { useState, useEffect, useCallback } from 'react';
import { Zap, Plus, Trash2, Pencil, RefreshCw, Lock, CalendarDays, TrendingUp, TrendingDown, X, CheckCircle2, AlertTriangle } from 'lucide-react';

/**
 * Dynamic pricing for one property: on/off, limits, rules and a preview of the next nights.
 * Shared by Extranet -> Dynamic Pricing (owner) and Admin -> Pricing & RMS (any property).
 * Prices it sets are saved as daily rates, so the guest sees and pays exactly that price; manual
 * prices in Inventory & Rates always win. Backend: /pricing/hotels/:hotelId/dynamic.
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
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;
const pct = (n) => `${n > 0 ? '+' : ''}${Number(n)}%`;

const TYPE_LABEL = {
  WEEKDAY: 'Days of the week',
  OCCUPANCY: 'Occupancy',
  LAST_MINUTE: 'Last minute',
  EARLY_BIRD: 'Early bird',
  DATE_RANGE: 'Season / event dates',
};

const PRESETS = [
  { name: 'Weekend uplift', type: 'WEEKDAY', condition: { weekdays: [5, 6] }, adjustment: 15 },
  { name: 'High demand', type: 'OCCUPANCY', condition: { minOccupancy: 70 }, adjustment: 20 },
  { name: 'Fill empty rooms', type: 'OCCUPANCY', condition: { maxOccupancy: 30 }, adjustment: -10 },
  { name: 'Last-minute deal', type: 'LAST_MINUTE', condition: { withinDays: 2 }, adjustment: -10 },
  { name: 'Early bird', type: 'EARLY_BIRD', condition: { beyondDays: 60 }, adjustment: -8 },
  { name: 'Peak season', type: 'DATE_RANGE', condition: { start: '', end: '' }, adjustment: 25 },
];

const describeRule = (rule) => {
  const c = rule.condition || {};
  switch (rule.type) {
    case 'WEEKDAY': return `Every ${(c.weekdays || []).map((d) => WEEKDAYS[d]).join(', ')}`;
    case 'OCCUPANCY': return c.minOccupancy !== undefined ? `When ${c.minOccupancy}% or more of the room type is booked` : `When ${c.maxOccupancy}% or less of the room type is booked`;
    case 'LAST_MINUTE': return c.withinDays === 0 ? 'Same-day stays' : `Stays starting within ${c.withinDays} day${c.withinDays === 1 ? '' : 's'}`;
    case 'EARLY_BIRD': return `Stays starting ${c.beyondDays}+ days away`;
    case 'DATE_RANGE': return `${new Date(`${c.start}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} – ${new Date(`${c.end}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`;
    default: return rule.type;
  }
};

const RuleForm = ({ initial, roomTypes, onCancel, onSave }) => {
  const [form, setForm] = useState(() => ({
    name: initial?.name || '',
    type: initial?.type || 'WEEKDAY',
    adjustment: initial?.adjustment ?? 10,
    roomTypeId: initial?.roomTypeId || '',
    ratePlanId: initial?.ratePlanId || '',
    weekdays: initial?.condition?.weekdays || [5, 6],
    occMode: initial?.condition?.maxOccupancy !== undefined ? 'max' : 'min',
    occValue: initial?.condition?.minOccupancy ?? initial?.condition?.maxOccupancy ?? 70,
    withinDays: initial?.condition?.withinDays ?? 2,
    beyondDays: initial?.condition?.beyondDays ?? 60,
    start: initial?.condition?.start || '',
    end: initial?.condition?.end || '',
  }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const plans = roomTypes.find((r) => r.id === form.roomTypeId)?.ratePlans || [];

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    const condition = {
      WEEKDAY: { weekdays: form.weekdays },
      OCCUPANCY: form.occMode === 'min' ? { minOccupancy: Number(form.occValue) } : { maxOccupancy: Number(form.occValue) },
      LAST_MINUTE: { withinDays: Number(form.withinDays) },
      EARLY_BIRD: { beyondDays: Number(form.beyondDays) },
      DATE_RANGE: { start: form.start, end: form.end },
    }[form.type];
    setSaving(true);
    try {
      await onSave({ name: form.name, type: form.type, condition, adjustment: Number(form.adjustment), roomTypeId: form.roomTypeId || null, ratePlanId: form.ratePlanId || null });
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const input = 'px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none';
  return (
    <form onSubmit={submit} className="bg-brand-50/40 border border-brand-200 rounded-xl p-4 space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <label className="text-xs font-semibold text-gray-600 md:col-span-2">Rule name
          <input className={`${input} w-full mt-1`} value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Weekend uplift" required />
        </label>
        <label className="text-xs font-semibold text-gray-600">Price change (%)
          <input type="number" className={`${input} w-full mt-1`} value={form.adjustment} onChange={(e) => set('adjustment', e.target.value)} required step="0.5" />
          <span className="block text-[11px] font-normal text-gray-400 mt-0.5">Use minus for a discount, e.g. -10</span>
        </label>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-semibold text-gray-600">Applies when</p>
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(TYPE_LABEL).map(([id, label]) => (
            <button key={id} type="button" aria-pressed={form.type === id} onClick={() => set('type', id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${form.type === id ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-gray-700 border-gray-200'}`}>{label}</button>
          ))}
        </div>
        {form.type === 'WEEKDAY' && (
          <div className="flex gap-1 flex-wrap">
            {WEEKDAYS.map((w, i) => (
              <button key={w} type="button" aria-pressed={form.weekdays.includes(i)} onClick={() => set('weekdays', form.weekdays.includes(i) ? form.weekdays.filter((d) => d !== i) : [...form.weekdays, i])}
                className={`px-2.5 py-1 rounded-md text-xs font-semibold border ${form.weekdays.includes(i) ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-600 border-gray-200'}`}>{w}</button>
            ))}
          </div>
        )}
        {form.type === 'OCCUPANCY' && (
          <div className="flex flex-wrap items-center gap-2 text-sm text-gray-700">
            <select className={input} value={form.occMode} onChange={(e) => set('occMode', e.target.value)} aria-label="Occupancy condition">
              <option value="min">at or above</option>
              <option value="max">at or below</option>
            </select>
            <input type="number" min="0" max="100" className={`${input} w-24`} value={form.occValue} onChange={(e) => set('occValue', e.target.value)} aria-label="Occupancy percent" />
            <span>% of the room type booked on that night</span>
          </div>
        )}
        {form.type === 'LAST_MINUTE' && (
          <div className="flex items-center gap-2 text-sm text-gray-700">
            <span>Stay starts within</span>
            <input type="number" min="0" max="30" className={`${input} w-20`} value={form.withinDays} onChange={(e) => set('withinDays', e.target.value)} aria-label="Days" />
            <span>days of today</span>
          </div>
        )}
        {form.type === 'EARLY_BIRD' && (
          <div className="flex items-center gap-2 text-sm text-gray-700">
            <span>Stay starts</span>
            <input type="number" min="1" max="365" className={`${input} w-20`} value={form.beyondDays} onChange={(e) => set('beyondDays', e.target.value)} aria-label="Days" />
            <span>or more days from today</span>
          </div>
        )}
        {form.type === 'DATE_RANGE' && (
          <div className="flex flex-wrap items-center gap-2 text-sm text-gray-700">
            <input type="date" className={input} value={form.start} onChange={(e) => set('start', e.target.value)} aria-label="From" required />
            <span>to</span>
            <input type="date" className={input} value={form.end} min={form.start} onChange={(e) => set('end', e.target.value)} aria-label="To" required />
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label className="text-xs font-semibold text-gray-600">Room type
          <select className={`${input} w-full mt-1`} value={form.roomTypeId} onChange={(e) => { set('roomTypeId', e.target.value); set('ratePlanId', ''); }}>
            <option value="">All room types</option>
            {roomTypes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </label>
        <label className="text-xs font-semibold text-gray-600">Rate plan
          <select className={`${input} w-full mt-1`} value={form.ratePlanId} onChange={(e) => set('ratePlanId', e.target.value)} disabled={!form.roomTypeId}>
            <option value="">All rate plans</option>
            {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
      </div>

      <div className="flex items-center justify-end gap-2">
        {error && <p role="alert" className="mr-auto text-sm font-medium text-red-600">{error}</p>}
        <button type="button" onClick={onCancel} className="px-4 py-2 border border-gray-200 bg-white rounded-lg text-sm font-semibold">Cancel</button>
        <button type="submit" disabled={saving} className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-sm font-bold disabled:opacity-50">{saving ? 'Saving…' : 'Save rule'}</button>
      </div>
    </form>
  );
};

const DynamicPricingManager = ({ hotelId, inventoryLink }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(null);
  const [limits, setLimits] = useState(null);
  const [editing, setEditing] = useState(null); // null | 'new' | rule | preset object
  const [holidays, setHolidays] = useState([]);
  const [previewPlan, setPreviewPlan] = useState('');
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);

  const flash = (type, text) => {
    setNotice({ type, text });
    if (type === 'success') setTimeout(() => setNotice((n) => (n?.text === text ? null : n)), 5000);
  };
  const summaryText = (s) => {
    if (!s) return '';
    if (s.status === 'OFF') return 'Dynamic pricing is off: guests see your base prices and manual daily rates.';
    if (s.status === 'CHANNEL_MANAGER') return 'Prices come from your channel manager, so dynamic pricing is paused.';
    return `Prices updated for the next ${s.nights} nights: ${s.dynamicNights} rate-plan night${s.dynamicNights === 1 ? '' : 's'} adjusted${s.keptManual ? `, ${s.keptManual} kept at your manual price` : ''}.`;
  };

  const load = useCallback(async () => {
    if (!hotelId) return;
    setLoading(true);
    setError('');
    try {
      const [d, h] = await Promise.all([call(`/hotels/${hotelId}/dynamic`), call('/holidays').catch(() => [])]);
      setData(d);
      setLimits({
        minPercent: d.settings.minPercent, maxPercent: d.settings.maxPercent,
        minPrice: d.settings.minPrice ?? '', maxPrice: d.settings.maxPrice ?? '',
        horizonDays: d.settings.horizonDays, applyHolidays: d.settings.applyHolidays,
      });
      setHolidays(h.filter((x) => !x.city || x.city.trim().toLowerCase() === (d.hotel.city || '').trim().toLowerCase()));
      setPreviewPlan((p) => p || d.roomTypes[0]?.ratePlans[0]?.id || '');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [hotelId]);

  useEffect(() => { load(); }, [load]);

  const loadPreview = useCallback(async () => {
    if (!previewPlan || !hotelId) { setPreview(null); return; }
    try {
      setPreview(await call(`/hotels/${hotelId}/dynamic/preview?ratePlanId=${previewPlan}&nights=14`));
    } catch (e) {
      setPreview(null);
      flash('error', e.message);
    }
  }, [hotelId, previewPlan]);

  useEffect(() => { loadPreview(); }, [loadPreview, data]);

  const saveSettings = async (patch, okText) => {
    setBusy(true);
    try {
      const r = await call(`/hotels/${hotelId}/dynamic/settings`, 'PUT', patch);
      flash('success', `${okText} ${summaryText(r.summary)}`);
      await load();
    } catch (e) {
      flash('error', e.message);
    } finally {
      setBusy(false);
    }
  };

  const saveRule = async (body) => {
    const isEdit = editing && editing.id;
    const r = isEdit
      ? await call(`/hotels/${hotelId}/dynamic/rules/${editing.id}`, 'PATCH', body)
      : await call(`/hotels/${hotelId}/dynamic/rules`, 'POST', body);
    setEditing(null);
    flash('success', `Rule "${body.name}" saved. ${summaryText(r.summary)}`);
    await load();
  };

  const toggleRule = async (rule) => {
    try {
      const r = await call(`/hotels/${hotelId}/dynamic/rules/${rule.id}`, 'PATCH', { isActive: !rule.isActive });
      flash('success', `${rule.name} ${rule.isActive ? 'paused' : 'turned on'}. ${summaryText(r.summary)}`);
      await load();
    } catch (e) { flash('error', e.message); }
  };

  const deleteRule = async (rule) => {
    if (!confirm(`Delete the rule "${rule.name}"?`)) return;
    try {
      const r = await call(`/hotels/${hotelId}/dynamic/rules/${rule.id}`, 'DELETE');
      flash('success', `Rule deleted. ${summaryText(r.summary)}`);
      await load();
    } catch (e) { flash('error', e.message); }
  };

  const recompute = async () => {
    setBusy(true);
    try {
      flash('success', summaryText(await call(`/hotels/${hotelId}/dynamic/recompute`, 'POST')));
      await load();
    } catch (e) { flash('error', e.message); } finally { setBusy(false); }
  };

  if (!hotelId) return null;
  if (!data) return <div className="py-12 text-center text-gray-400 bg-white rounded-xl border border-gray-200">{loading ? 'Loading…' : error}</div>;

  const { settings, rules, roomTypes, channelManager } = data;
  const scopeName = (rule) => {
    const rt = roomTypes.find((r) => r.id === rule.roomTypeId);
    const rp = rt?.ratePlans.find((p) => p.id === rule.ratePlanId);
    return rt ? `${rt.name}${rp ? ` · ${rp.name}` : ''}` : 'All rooms';
  };
  const input = 'px-3 py-2 border border-gray-200 rounded-lg text-sm w-full focus:ring-2 focus:ring-brand-500 outline-none';

  return (
    <div className="space-y-5">
      {notice && (
        <div role={notice.type === 'error' ? 'alert' : 'status'} className={`flex items-start gap-2 p-3 rounded-lg text-sm border ${notice.type === 'error' ? 'bg-red-50 border-red-200 text-red-700' : 'bg-green-50 border-green-200 text-green-800'}`}>
          {notice.type === 'error' ? <AlertTriangle size={16} className="mt-0.5 shrink-0" /> : <CheckCircle2 size={16} className="mt-0.5 shrink-0" />}
          <span className="flex-1">{notice.text}</span>
          <button type="button" aria-label="Dismiss" onClick={() => setNotice(null)} className="opacity-60 hover:opacity-100"><X size={14} /></button>
        </div>
      )}

      {channelManager && (
        <div className="p-4 rounded-xl border bg-amber-50 border-amber-200 text-amber-900 text-sm flex items-start gap-3">
          <Lock size={18} className="shrink-0 mt-0.5" />
          <p>This property&apos;s prices come from <strong>{channelManager}</strong>, so dynamic pricing doesn&apos;t change them. Set up pricing rules in your channel manager.</p>
        </div>
      )}

      {/* Status */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm flex flex-col md:flex-row md:items-center gap-4 justify-between">
        <div className="flex items-start gap-3">
          <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${settings.enabled ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-400'}`}><Zap size={22} /></div>
          <div>
            <h3 className="font-bold text-gray-900">Dynamic pricing is {settings.enabled ? 'on' : 'off'}</h3>
            <p className="text-sm text-gray-500 max-w-xl">
              {settings.enabled
                ? 'Your rules adjust nightly prices automatically. Prices you set by hand in Inventory & Rates always take priority.'
                : 'Guests see your base prices and the daily rates you set. Turn it on to let the rules below adjust prices.'}
            </p>
            {settings.lastRunAt && <p className="text-xs text-gray-400 mt-1">Last updated {new Date(settings.lastRunAt).toLocaleString('en-IN')} · {summaryText(settings.lastRunSummary)}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {settings.enabled && (
            <button type="button" onClick={recompute} disabled={busy} className="flex items-center gap-1.5 px-3 py-2 border rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50">
              <RefreshCw size={14} className={busy ? 'animate-spin' : ''} /> Update now
            </button>
          )}
          <button type="button" role="switch" aria-checked={settings.enabled} disabled={busy}
            onClick={() => saveSettings({ enabled: !settings.enabled }, settings.enabled ? 'Dynamic pricing turned off.' : 'Dynamic pricing turned on.')}
            className={`px-4 py-2 rounded-lg text-sm font-bold disabled:opacity-50 ${settings.enabled ? 'bg-gray-800 text-white hover:bg-gray-900' : 'bg-purple-600 text-white hover:bg-purple-700'}`}>
            {settings.enabled ? 'Turn off' : 'Turn on'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Rules */}
        <div className="lg:col-span-2 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-gray-900">Rules</h3>
            {!editing && (
              <button type="button" onClick={() => setEditing('new')} className="flex items-center gap-1 text-sm font-semibold text-brand-700 bg-brand-50 hover:bg-brand-100 px-3 py-1.5 rounded-lg">
                <Plus size={15} /> Add rule
              </button>
            )}
          </div>

          {editing === 'new' && (
            <div className="flex flex-wrap gap-1.5">
              <span className="text-xs text-gray-500 self-center mr-1">Start from:</span>
              {PRESETS.map((p) => (
                <button key={p.name} type="button" onClick={() => setEditing({ ...p, preset: true })} className="px-2.5 py-1 rounded-full text-xs font-semibold border border-gray-200 bg-white hover:border-brand-300">{p.name} ({pct(p.adjustment)})</button>
              ))}
            </div>
          )}
          {editing && (
            <RuleForm key={editing.id || editing.name || 'new'} initial={editing === 'new' ? null : editing} roomTypes={roomTypes} onCancel={() => setEditing(null)} onSave={saveRule} />
          )}

          {rules.length === 0 && !editing ? (
            <div className="bg-white border border-dashed border-gray-300 rounded-xl p-8 text-center text-sm text-gray-500">
              No rules yet. Add one, for example +15% on Friday and Saturday nights, or -10% for stays booked within 2 days.
            </div>
          ) : (
            rules.map((rule) => (
              <div key={rule.id} className={`bg-white border rounded-xl p-4 flex items-start gap-3 ${rule.isActive ? 'border-gray-200' : 'border-dashed border-gray-300 opacity-70'}`}>
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${rule.adjustment > 0 ? 'bg-orange-50 text-orange-600' : 'bg-green-50 text-green-600'}`}>
                  {rule.adjustment > 0 ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="font-bold text-gray-900">{rule.name}</h4>
                    <span className={`text-sm font-extrabold ${rule.adjustment > 0 ? 'text-orange-600' : 'text-green-600'}`}>{pct(rule.adjustment)}</span>
                    {!rule.isActive && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">PAUSED</span>}
                  </div>
                  <p className="text-sm text-gray-600">{describeRule(rule)}</p>
                  <p className="text-xs text-gray-400">{TYPE_LABEL[rule.type]} · {scopeName(rule)}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button type="button" onClick={() => toggleRule(rule)} className="text-xs font-semibold px-2 py-1 rounded hover:bg-gray-100 text-gray-600">{rule.isActive ? 'Pause' : 'Turn on'}</button>
                  <button type="button" aria-label={`Edit ${rule.name}`} onClick={() => setEditing(rule)} className="p-1.5 text-gray-400 hover:text-brand-600"><Pencil size={15} /></button>
                  <button type="button" aria-label={`Delete ${rule.name}`} onClick={() => deleteRule(rule)} className="p-1.5 text-gray-400 hover:text-red-600"><Trash2 size={15} /></button>
                </div>
              </div>
            ))
          )}
          <p className="text-xs text-gray-500">When several rules match a night their percentages add up, then the total is kept within your limits.</p>
        </div>

        {/* Limits */}
        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm space-y-3 h-fit">
          <h3 className="font-bold text-gray-900">Limits</h3>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs font-semibold text-gray-600">Lowest change (%)
              <input type="number" max="0" min="-90" className={`${input} mt-1`} value={limits.minPercent} onChange={(e) => setLimits({ ...limits, minPercent: e.target.value })} />
            </label>
            <label className="text-xs font-semibold text-gray-600">Highest change (%)
              <input type="number" min="0" max="300" className={`${input} mt-1`} value={limits.maxPercent} onChange={(e) => setLimits({ ...limits, maxPercent: e.target.value })} />
            </label>
            <label className="text-xs font-semibold text-gray-600">Never below (₹)
              <input type="number" min="1" className={`${input} mt-1`} value={limits.minPrice} placeholder="optional" onChange={(e) => setLimits({ ...limits, minPrice: e.target.value })} />
            </label>
            <label className="text-xs font-semibold text-gray-600">Never above (₹)
              <input type="number" min="1" className={`${input} mt-1`} value={limits.maxPrice} placeholder="optional" onChange={(e) => setLimits({ ...limits, maxPrice: e.target.value })} />
            </label>
          </div>
          <label className="block text-xs font-semibold text-gray-600">Apply to the next
            <select className={`${input} mt-1`} value={limits.horizonDays} onChange={(e) => setLimits({ ...limits, horizonDays: Number(e.target.value) })}>
              {[30, 60, 90, 180, 365].map((d) => <option key={d} value={d}>{d} nights</option>)}
            </select>
          </label>
          <label className="flex items-start gap-2 text-sm text-gray-700 cursor-pointer">
            <input type="checkbox" className="mt-0.5 rounded border-gray-300" checked={limits.applyHolidays} onChange={(e) => setLimits({ ...limits, applyHolidays: e.target.checked })} />
            <span>Apply Zivo&apos;s holiday &amp; event calendar{holidays.length ? ` (${holidays.length} upcoming)` : ''}</span>
          </label>
          <button type="button" disabled={busy} onClick={() => saveSettings(limits, 'Limits saved.')} className="w-full px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-sm font-bold disabled:opacity-50">Save limits</button>
          {holidays.length > 0 && (
            <div className="border-t border-gray-100 pt-3">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Upcoming holidays &amp; events</p>
              <ul className="space-y-1">
                {holidays.slice(0, 6).map((h) => (
                  <li key={h.id} className="text-xs text-gray-600 flex justify-between gap-2">
                    <span>{new Date(h.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} · {h.name}</span>
                    <span className="font-semibold text-orange-600">{pct(Math.round(h.multiplier * 100))}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* Preview */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm">
        <div className="p-4 flex flex-wrap items-center justify-between gap-3 border-b border-gray-100">
          <div>
            <h3 className="font-bold text-gray-900">What guests pay, next 14 nights</h3>
            <p className="text-xs text-gray-500">Per night for base occupancy, before GST and any promotion.</p>
          </div>
          <div className="flex items-center gap-2">
            <select aria-label="Rate plan to preview" className="px-3 py-2 border border-gray-200 rounded-lg text-sm" value={previewPlan} onChange={(e) => setPreviewPlan(e.target.value)}>
              {roomTypes.flatMap((rt) => rt.ratePlans.map((rp) => <option key={rp.id} value={rp.id}>{rt.name} · {rp.name}</option>))}
            </select>
            {inventoryLink && <a href={inventoryLink} className="flex items-center gap-1 text-sm font-semibold text-brand-700 hover:underline"><CalendarDays size={15} /> Calendar</a>}
          </div>
        </div>
        {preview ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 bg-gray-50">
                  <th className="px-4 py-2 font-semibold">Night</th>
                  <th className="px-4 py-2 font-semibold">Booked</th>
                  <th className="px-4 py-2 font-semibold">Rules applied</th>
                  <th className="px-4 py-2 font-semibold text-right">Base</th>
                  <th className="px-4 py-2 font-semibold text-right">Guest pays</th>
                </tr>
              </thead>
              <tbody>
                {preview.nights.map((n) => (
                  <tr key={n.date} className="border-t border-gray-100">
                    <td className="px-4 py-2 font-medium text-gray-800">{new Date(n.date).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}</td>
                    <td className="px-4 py-2 text-gray-500">{n.occupancy}%</td>
                    <td className="px-4 py-2 text-gray-600">
                      {n.override ? <span className="text-blue-700">{n.override.source === 'CHANNEL_MANAGER' ? 'Channel manager price' : 'Your manual price'}</span>
                        : !preview.enabled ? <span className="text-gray-400">Dynamic pricing off</span>
                        : n.applied.length ? n.applied.map((a) => `${a.name} ${pct(a.percent)}`).join(', ') + (n.percent !== n.applied.reduce((s, a) => s + a.percent, 0) ? ` → limited to ${pct(n.percent)}` : '')
                        : <span className="text-gray-400">None</span>}
                    </td>
                    <td className="px-4 py-2 text-right text-gray-500">{inr(preview.ratePlan.basePrice)}</td>
                    <td className={`px-4 py-2 text-right font-bold ${n.guestPrice > preview.ratePlan.basePrice ? 'text-orange-600' : n.guestPrice < preview.ratePlan.basePrice ? 'text-green-600' : 'text-gray-900'}`}>{inr(n.guestPrice)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="p-6 text-sm text-gray-400">{roomTypes.length ? 'Loading…' : 'Add room types and rate plans first.'}</p>
        )}
      </div>
    </div>
  );
};

export default DynamicPricingManager;
