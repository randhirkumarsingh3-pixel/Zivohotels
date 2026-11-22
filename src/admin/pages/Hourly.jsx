import { useCallback, useEffect, useState } from 'react';
import { Clock, Loader2, CheckCircle2, PauseCircle, Save } from 'lucide-react';
import { getAdminHourly, saveAdminHourlySettings, approveHotelHourly } from '../../services/api';

/**
 * Admin → Hourly Stays: ZivoPlus' rules for hourly stays (on/off, durations hotels may offer,
 * maximum hours, commission, default cancellation) and the properties that switched them on,
 * to approve or pause.
 */
const DURATIONS = [3, 6, 9, 12];
const inr = (n) => `₹${Math.round(Number(n) || 0).toLocaleString('en-IN')}`;

const AdminHourly = () => {
  const [data, setData] = useState(null);
  const [form, setForm] = useState(null);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState('');

  const load = useCallback(() => getAdminHourly().then((d) => { setData(d); setForm({ ...d.platform, commissionPercent: d.platform.commissionPercent ?? '' }); }).catch((e) => setMsg({ ok: false, text: e.message })), []);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setBusy('settings'); setMsg(null);
    try { const r = await saveAdminHourlySettings({ ...form, commissionPercent: form.commissionPercent === '' ? null : Number(form.commissionPercent) }); setMsg({ ok: true, text: r?.message || 'Saved.' }); await load(); } catch (e) { setMsg({ ok: false, text: e.message }); } finally { setBusy(''); }
  };
  const approve = async (h, approved) => {
    setBusy(h.id); setMsg(null);
    try { const r = await approveHotelHourly(h.id, approved); setMsg({ ok: true, text: `${h.name}: ${r?.message}` }); await load(); } catch (e) { setMsg({ ok: false, text: e.message }); } finally { setBusy(''); }
  };

  if (!form) return <div className="flex h-64 items-center justify-center">{msg ? <p className="text-red-700">{msg.text}</p> : <Loader2 className="animate-spin text-navy-700" size={32} />}</div>;
  const waiting = data.hotels.filter((h) => h.settings.enabled && !h.settings.approved);

  return (
    <div className="space-y-6 max-w-6xl pb-12">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><Clock className="text-navy-700" aria-hidden="true" /> Hourly stays</h1>
        <p className="text-gray-500 mt-1">Rules for hourly stays on ZivoPlus, and the properties offering them.</p>
      </div>
      {msg && <p role="status" className={`text-sm rounded-lg px-4 py-2 ${msg.ok ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'}`}>{msg.text}</p>}

      <section className="bg-white rounded-card border border-gray-200 p-6 space-y-5">
        <h2 className="text-lg font-bold text-gray-900">Platform rules</h2>
        <label className="flex items-center gap-3 text-sm font-semibold text-gray-900">
          <input type="checkbox" checked={form.enabled} onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))} className="h-5 w-5 rounded border-gray-300" /> Hourly stays on ZivoPlus (off hides them everywhere)
        </label>
        <fieldset>
          <legend className="text-sm font-semibold text-gray-700 mb-2">Durations hotels may offer</legend>
          <div className="flex flex-wrap gap-2">
            {DURATIONS.map((d) => (
              <button key={d} type="button" aria-pressed={form.durations.includes(d)}
                onClick={() => setForm((f) => ({ ...f, durations: f.durations.includes(d) ? f.durations.filter((x) => x !== d) : [...f.durations, d].sort((a, b) => a - b) }))}
                className={`px-4 py-2 rounded-lg border text-sm font-semibold ${form.durations.includes(d) ? 'border-brand-600 bg-brand-50 text-brand-800' : 'border-gray-300 text-gray-700'}`}>{d} hours</button>
            ))}
          </div>
        </fieldset>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="text-sm"><span className="block font-semibold text-gray-700 mb-1">Longest stay (hours)</span>
            <select value={form.maxHours} onChange={(e) => setForm((f) => ({ ...f, maxHours: Number(e.target.value) }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg">{DURATIONS.map((d) => <option key={d} value={d}>{d}</option>)}</select></label>
          <label className="text-sm"><span className="block font-semibold text-gray-700 mb-1">Commission on hourly stays (%)</span>
            <input type="number" min={0} max={50} value={form.commissionPercent} onChange={(e) => setForm((f) => ({ ...f, commissionPercent: e.target.value }))} placeholder="Same as nightly" className="w-full px-3 py-2 border border-gray-300 rounded-lg" /></label>
          <label className="text-sm"><span className="block font-semibold text-gray-700 mb-1">Default free cancellation (hours before)</span>
            <input type="number" min={0} max={48} value={form.defaultFreeCancelHours} onChange={(e) => setForm((f) => ({ ...f, defaultFreeCancelHours: Number(e.target.value) }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg" /></label>
        </div>
        <button type="button" onClick={save} disabled={busy === 'settings'} className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-navy-900 text-white text-sm font-semibold disabled:opacity-60">
          {busy === 'settings' ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} aria-hidden="true" />} Save rules
        </button>
      </section>

      <section className="bg-white rounded-card border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">Properties</h2>
          <p className="text-sm text-gray-500">{waiting.length ? `${waiting.length} waiting for approval.` : 'Properties that switch hourly stays on appear here for approval.'}</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs text-gray-500"><tr>
              <th className="px-4 py-2 font-semibold">Property</th><th className="px-4 py-2 font-semibold">Hours &amp; durations</th><th className="px-4 py-2 font-semibold">Rooms &amp; prices</th><th className="px-4 py-2 font-semibold">Last 30 days</th><th className="px-4 py-2 font-semibold">Status</th><th className="px-4 py-2" />
            </tr></thead>
            <tbody className="divide-y divide-gray-100">
              {data.hotels.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-500">No property has switched hourly stays on yet.</td></tr>}
              {data.hotels.map((h) => (
                <tr key={h.id} className="align-top">
                  <td className="px-4 py-3"><p className="font-semibold text-gray-900">{h.name}</p><p className="text-xs text-gray-500">{h.city}{h.requestedAt ? ` · asked ${new Date(h.requestedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : ''}</p></td>
                  <td className="px-4 py-3 text-gray-700">{h.settings.openFrom}–{h.settings.openTo}<span className="block text-xs text-gray-500">{h.settings.durations.join(', ')} h · cleaning {h.settings.cleaningMinutes} min · free cancel {h.settings.freeCancelHours} h</span></td>
                  <td className="px-4 py-3 text-gray-700">{h.roomTypes.length ? h.roomTypes.map((rt) => <span key={rt.name} className="block">{rt.name}: {rt.hourlyRooms} room{rt.hourlyRooms === 1 ? '' : 's'} · {Object.entries(rt.hourlyPrices || {}).map(([d, p]) => `${d}h ${inr(p)}`).join(', ')}</span>) : <span className="text-amber-700">No rooms set</span>}</td>
                  <td className="px-4 py-3 text-gray-700 tabular-nums">{h.bookings30d} booking{h.bookings30d === 1 ? '' : 's'}<span className="block text-xs text-gray-500">{inr(h.revenue30d)}</span></td>
                  <td className="px-4 py-3">
                    {h.live ? <span className="inline-flex items-center gap-1 text-xs font-bold text-green-700"><CheckCircle2 size={14} aria-hidden="true" /> Live</span>
                      : h.settings.approved ? <span className="text-xs font-bold text-gray-600">Approved (off by hotel)</span>
                        : <span className="text-xs font-bold text-amber-800">Waiting for approval</span>}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    {h.settings.approved
                      ? <button type="button" disabled={busy === h.id} onClick={() => approve(h, false)} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-300 text-xs font-semibold text-gray-700 hover:bg-gray-50"><PauseCircle size={14} aria-hidden="true" /> Pause</button>
                      : <button type="button" disabled={busy === h.id || !h.roomTypes.length} onClick={() => approve(h, true)} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-green-700 text-white text-xs font-semibold disabled:opacity-50"><CheckCircle2 size={14} aria-hidden="true" /> Approve</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};

export default AdminHourly;
