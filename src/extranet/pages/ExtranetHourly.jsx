import { useCallback, useEffect, useMemo, useState } from 'react';
import { Clock, Loader2, CheckCircle2, AlertTriangle, CalendarDays, Save, ChevronLeft, ChevronRight } from 'lucide-react';
import { fetchHourlySetup, saveHourlySetup, fetchHourlyAllocations, setHourlyAllocation, fetchHourlyTimeline } from '../../services/extranetApi';

/**
 * Extranet → Hourly Stays: switch hourly stays on, set the hours, durations, cleaning time and
 * cancellation; per room type the rooms set aside for hourly use and a price per duration; change
 * the rooms for single days; and see a day's hourly bookings on a timeline.
 */
const ymd = (d) => new Date(d.getTime() + 330 * 60000).toISOString().slice(0, 10);
const addDays = (s, n) => ymd(new Date(new Date(`${s}T06:00:00Z`).getTime() + n * 86400000));
const dayLabel = (s) => new Date(`${s}T06:00:00Z`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
const tm = (d) => new Date(d).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });
const toMin = (hhmm) => { const [h, m] = String(hhmm || '0:0').split(':').map(Number); return h * 60 + m; };
const TIMES = Array.from({ length: 48 }, (_, i) => `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`);
const inputCls = 'px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:border-navy-500 focus:ring-2 focus:ring-navy-500/20 outline-none';

const Card = ({ title, note, children, right }) => (
  <section className="bg-white rounded-card border border-gray-200 shadow-sm">
    <div className="px-6 py-4 border-b border-gray-100 flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="text-lg font-bold text-gray-900">{title}</h2>{note && <p className="text-sm text-gray-500 mt-0.5">{note}</p>}</div>
      {right}
    </div>
    <div className="px-6 py-5">{children}</div>
  </section>
);

const StatusBanner = ({ settings, platform }) => {
  if (!platform.enabled) return <p className="flex items-start gap-2 rounded-lg bg-gray-100 px-4 py-3 text-sm text-gray-700"><AlertTriangle size={18} className="shrink-0" aria-hidden="true" /> Hourly stays are switched off on ZivoHotels right now.</p>;
  if (!settings.enabled) return <p className="flex items-start gap-2 rounded-lg bg-gray-100 px-4 py-3 text-sm text-gray-700"><Clock size={18} className="shrink-0" aria-hidden="true" /> Hourly stays are off. Switch them on, set your rooms and prices, and save: ZivoHotels approves them before guests can book.</p>;
  if (!settings.approved) return <p className="flex items-start gap-2 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900"><AlertTriangle size={18} className="shrink-0" aria-hidden="true" /> Waiting for ZivoHotels to approve hourly stays for your property. You can keep editing; guests can book once approved.</p>;
  return <p className="flex items-start gap-2 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-800"><CheckCircle2 size={18} className="shrink-0" aria-hidden="true" /> Live: guests can book your rooms by the hour.</p>;
};

const Timeline = ({ date, setDate }) => {
  const [data, setData] = useState(null);
  useEffect(() => { let live = true; setData(null); fetchHourlyTimeline(date).then((d) => live && setData(d)).catch(() => live && setData({ roomTypes: [] })); return () => { live = false; }; }, [date]);
  const from = toMin(data?.openFrom || '08:00');
  const to = toMin(data?.openTo || '21:00');
  const span = Math.max(60, to - from);
  const minutesOf = (d) => { const x = new Date(new Date(d).getTime() + 330 * 60000); return x.getUTCHours() * 60 + x.getUTCMinutes(); };
  const hours = [];
  for (let m = Math.ceil(from / 60) * 60; m <= to; m += 120) hours.push(m);
  return (
    <Card title="Day timeline" note="Hourly bookings for the day, with the cleaning time after each."
      right={<div className="flex items-center gap-2">
        <button type="button" onClick={() => setDate(addDays(date, -1))} aria-label="Previous day" className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50"><ChevronLeft size={16} /></button>
        <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} className={inputCls} aria-label="Day" />
        <button type="button" onClick={() => setDate(addDays(date, 1))} aria-label="Next day" className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50"><ChevronRight size={16} /></button>
      </div>}>
      {!data ? <Loader2 className="animate-spin text-navy-700" /> : !data.roomTypes.length ? <p className="text-sm text-gray-500">No room types are offered by the hour yet.</p> : (
        <div className="space-y-5 overflow-x-auto">
          <div className="relative h-5 min-w-[560px] ml-40 text-[11px] text-gray-400">
            {hours.map((m) => <span key={m} className="absolute -translate-x-1/2" style={{ left: `${((m - from) / span) * 100}%` }}>{`${String(Math.floor(m / 60)).padStart(2, '0')}:00`}</span>)}
          </div>
          {data.roomTypes.map((rt) => (
            <div key={rt.id} className="flex items-start gap-3 min-w-[720px]">
              <div className="w-40 shrink-0"><p className="text-sm font-semibold text-gray-900">{rt.name}</p><p className="text-xs text-gray-500">{rt.rooms} hourly room{rt.rooms === 1 ? '' : 's'}</p></div>
              <div className="relative flex-1 min-h-[44px] rounded-lg bg-gray-50 border border-gray-200">
                {rt.bookings.map((b, i) => {
                  const s = Math.max(from, minutesOf(b.slotStart));
                  const e = Math.min(to + data.cleaningMinutes, minutesOf(b.slotEnd));
                  const lane = i % 3;
                  return (
                    <div key={b.id} title={`${b.bookingRef} · ${b.guestName} · ${tm(b.slotStart)}–${tm(b.slotEnd)}`}
                      className="absolute h-[12px] rounded flex items-center" style={{ top: 4 + lane * 13, left: `${((s - from) / span) * 100}%`, width: `${((e - s + data.cleaningMinutes) / span) * 100}%` }}>
                      <span className={`h-full rounded-l ${b.status === 'PENDING' ? 'bg-amber-400' : 'bg-brand-600'}`} style={{ width: `${((e - s) / (e - s + data.cleaningMinutes)) * 100}%` }} />
                      <span className="h-full flex-1 rounded-r bg-gray-300" />
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          {data.roomTypes.some((rt) => rt.bookings.length) && (
            <ul className="text-sm divide-y divide-gray-100 border-t border-gray-100">
              {data.roomTypes.flatMap((rt) => rt.bookings.map((b) => (
                <li key={b.id} className="py-2 flex flex-wrap justify-between gap-2">
                  <span><b>{tm(b.slotStart)}–{tm(b.slotEnd)}</b> · {rt.name} · {b.guestName} <span className="text-gray-500">({b.guestPhone})</span></span>
                  <span className="text-gray-500">{b.bookingRef}{b.status === 'PENDING' ? ' · awaiting payment' : ''}</span>
                </li>
              )))}
            </ul>
          )}
          <p className="flex flex-wrap gap-4 text-xs text-gray-500"><span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-brand-600" /> Booked</span><span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-amber-400" /> Awaiting payment</span><span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-gray-300" /> Cleaning</span></p>
        </div>
      )}
    </Card>
  );
};

const Allocations = () => {
  const [from, setFrom] = useState(ymd(new Date()));
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState('');
  const load = useCallback(() => fetchHourlyAllocations(from, 14).then(setData).catch(() => setData({ dates: [], roomTypes: [] })), [from]);
  useEffect(() => { load(); }, [load]);
  const change = async (rt, day, patch) => {
    setBusy(`${rt.id}|${day.date}`);
    try { await setHourlyAllocation({ roomTypeId: rt.id, date: day.date, ...patch }); await load(); } finally { setBusy(''); }
  };
  return (
    <Card title="Hourly rooms by day" note="Rooms set aside for hourly stays each day. Change a day, or close it for hourly bookings."
      right={<div className="flex items-center gap-2">
        <button type="button" onClick={() => setFrom(addDays(from, -14))} aria-label="Previous 2 weeks" className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50"><ChevronLeft size={16} /></button>
        <span className="text-sm text-gray-600 flex items-center gap-1"><CalendarDays size={15} aria-hidden="true" /> {dayLabel(from)}</span>
        <button type="button" onClick={() => setFrom(addDays(from, 14))} aria-label="Next 2 weeks" className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50"><ChevronRight size={16} /></button>
      </div>}>
      {!data ? <Loader2 className="animate-spin text-navy-700" /> : !data.roomTypes.length ? <p className="text-sm text-gray-500">Offer a room type by the hour (above) to set its rooms by day.</p> : (
        <div className="overflow-x-auto">
          <table className="text-sm min-w-full">
            <thead><tr><th className="text-left font-semibold text-gray-500 pr-3 py-2 sticky left-0 bg-white">Room type</th>{data.dates.map((d) => <th key={d} className="px-1 py-2 text-xs font-semibold text-gray-500 whitespace-nowrap">{dayLabel(d)}</th>)}</tr></thead>
            <tbody>
              {data.roomTypes.map((rt) => (
                <tr key={rt.id} className="border-t border-gray-100">
                  <td className="pr-3 py-2 font-semibold text-gray-900 whitespace-nowrap sticky left-0 bg-white">{rt.name}<span className="block text-xs font-normal text-gray-500">Usually {rt.defaultRooms}</span></td>
                  {rt.days.map((day) => (
                    <td key={day.date} className="px-1 py-2 text-center">
                      <div className={`rounded-lg border p-1 ${day.stopSell ? 'bg-red-50 border-red-200' : day.custom ? 'bg-navy-50 border-navy-200' : 'border-gray-200'}`}>
                        <input type="number" min={0} aria-label={`${rt.name} hourly rooms on ${dayLabel(day.date)}`} disabled={busy === `${rt.id}|${day.date}`}
                          defaultValue={day.rooms} key={`${day.date}-${day.rooms}-${day.stopSell}`}
                          onBlur={(e) => Number(e.target.value) !== day.rooms && change(rt, day, { rooms: Number(e.target.value), stopSell: false })}
                          className="w-12 text-center text-sm bg-transparent outline-none" />
                        <button type="button" onClick={() => change(rt, day, day.stopSell ? { rooms: null, stopSell: false } : { rooms: day.rooms, stopSell: true })}
                          className={`block w-full text-[10px] font-semibold ${day.stopSell ? 'text-red-700' : 'text-gray-400 hover:text-red-700'}`}>{day.stopSell ? 'Closed' : 'Close'}</button>
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
};

const ExtranetHourly = () => {
  const [setup, setSetup] = useState(null);
  const [form, setForm] = useState(null);
  const [rts, setRts] = useState([]);
  const [msg, setMsg] = useState(null);
  const [saving, setSaving] = useState(false);
  const [date, setDate] = useState(ymd(new Date()));

  const apply = (d) => { setSetup(d); setForm({ ...d.settings }); setRts(d.roomTypes.map((r) => ({ ...r, hourlyPrices: { ...(r.hourlyPrices || {}) } }))); };
  useEffect(() => { fetchHourlySetup().then(apply).catch((e) => setMsg({ ok: false, text: e.message })); }, []);

  const durations = useMemo(() => (setup?.platform.durations || [3, 6, 9, 12]).filter((d) => d <= (setup?.platform.maxHours || 12)), [setup]);
  if (!form) return <div className="flex h-64 items-center justify-center">{msg ? <p className="text-red-700">{msg.text}</p> : <Loader2 className="animate-spin text-navy-700" size={32} />}</div>;

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e?.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e }));
  const toggleDuration = (d) => setForm((f) => ({ ...f, durations: f.durations.includes(d) ? f.durations.filter((x) => x !== d) : [...f.durations, d].sort((a, b) => a - b) }));
  const setRt = (id, patch) => setRts((list) => list.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const save = async () => {
    setSaving(true); setMsg(null);
    try {
      const d = await saveHourlySetup({
        settings: { ...form, cleaningMinutes: Number(form.cleaningMinutes), leadMinutes: Number(form.leadMinutes), freeCancelHours: Number(form.freeCancelHours), extraHourPrice: Number(form.extraHourPrice) || 0 },
        roomTypes: rts.map((r) => ({ id: r.id, hourlyEnabled: r.hourlyEnabled, hourlyRooms: Number(r.hourlyRooms) || 0, hourlyPrices: r.hourlyPrices })),
      });
      apply(d);
      setMsg({ ok: true, text: d.settings.enabled && !d.settings.approved ? 'Saved. ZivoHotels will review hourly stays for your property.' : 'Saved.' });
    } catch (e) { setMsg({ ok: false, text: e.message }); } finally { setSaving(false); }
  };

  return (
    <div className="space-y-6 pb-12 max-w-5xl">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Hourly stays</h1>
        <p className="text-gray-500 mt-1">Sell rooms for 3 to 12 hours during the day. Rooms you set aside for hourly use never affect your night bookings.</p>
      </div>
      <StatusBanner settings={setup.settings} platform={setup.platform} />

      <Card title="Settings">
        <div className="space-y-5">
          <label className="flex items-center gap-3 text-sm font-semibold text-gray-900">
            <input type="checkbox" checked={form.enabled} onChange={set('enabled')} className="h-5 w-5 rounded border-gray-300" /> Offer hourly stays
          </label>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-sm"><span className="block font-semibold text-gray-700 mb-1">Hourly stays from</span>
              <select value={form.openFrom} onChange={set('openFrom')} className={`${inputCls} w-full`}>{TIMES.map((t) => <option key={t}>{t}</option>)}</select></label>
            <label className="text-sm"><span className="block font-semibold text-gray-700 mb-1">Must end by</span>
              <select value={form.openTo} onChange={set('openTo')} className={`${inputCls} w-full`}>{TIMES.map((t) => <option key={t}>{t}</option>)}</select></label>
            <label className="text-sm"><span className="block font-semibold text-gray-700 mb-1">Cleaning after each stay</span>
              <select value={form.cleaningMinutes} onChange={set('cleaningMinutes')} className={`${inputCls} w-full`}>{[0, 15, 30, 45, 60, 90, 120].map((m) => <option key={m} value={m}>{m ? `${m} minutes` : 'None'}</option>)}</select></label>
            <label className="text-sm"><span className="block font-semibold text-gray-700 mb-1">Book at least</span>
              <select value={form.leadMinutes} onChange={set('leadMinutes')} className={`${inputCls} w-full`}>{[0, 30, 60, 120, 180, 360].map((m) => <option key={m} value={m}>{m ? `${m >= 60 ? `${m / 60} hour${m === 60 ? '' : 's'}` : `${m} minutes`} ahead` : 'Any time'}</option>)}</select></label>
            <label className="text-sm"><span className="block font-semibold text-gray-700 mb-1">Free cancellation until</span>
              <select value={form.freeCancelHours} onChange={set('freeCancelHours')} className={`${inputCls} w-full`}>{[0, 1, 2, 3, 6, 12, 24].map((h) => <option key={h} value={h}>{h ? `${h} hour${h === 1 ? '' : 's'} before` : 'No free cancellation'}</option>)}</select></label>
            <label className="text-sm"><span className="block font-semibold text-gray-700 mb-1">Extra hour (₹, optional)</span>
              <input type="number" min={0} value={form.extraHourPrice || ''} onChange={set('extraHourPrice')} className={`${inputCls} w-full`} placeholder="e.g. 400" /></label>
          </div>
          <fieldset>
            <legend className="text-sm font-semibold text-gray-700 mb-2">Durations you offer</legend>
            <div className="flex flex-wrap gap-2">
              {durations.map((d) => (
                <button key={d} type="button" onClick={() => toggleDuration(d)} aria-pressed={form.durations.includes(d)}
                  className={`px-4 py-2 rounded-lg border text-sm font-semibold ${form.durations.includes(d) ? 'border-brand-600 bg-brand-50 text-brand-800' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}>{d} hours</button>
              ))}
            </div>
            <p className="mt-1 text-xs text-gray-500">A duration must fit between the start and end times.</p>
          </fieldset>
        </div>
      </Card>

      <Card title="Rooms and prices" note="Choose the room types you offer by the hour, how many rooms of each you set aside for hourly stays, and a price per duration (before GST).">
        <div className="space-y-4">
          {rts.map((r) => (
            <div key={r.id} className={`rounded-xl border p-4 ${r.hourlyEnabled ? 'border-brand-200 bg-brand-50/30' : 'border-gray-200'}`}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <label className="flex items-center gap-3 font-semibold text-gray-900">
                  <input type="checkbox" checked={r.hourlyEnabled} onChange={(e) => setRt(r.id, { hourlyEnabled: e.target.checked })} className="h-5 w-5 rounded border-gray-300" /> {r.name}
                </label>
                <label className="text-sm flex items-center gap-2 text-gray-700">Hourly rooms
                  <input type="number" min={0} value={r.hourlyRooms} onChange={(e) => setRt(r.id, { hourlyRooms: e.target.value })} disabled={!r.hourlyEnabled} className={`${inputCls} w-20`} />
                </label>
              </div>
              {r.hourlyEnabled && (
                <div className="mt-3 grid gap-3 grid-cols-2 sm:grid-cols-4">
                  {form.durations.map((d) => (
                    <label key={d} className="text-sm"><span className="block text-gray-600 mb-1">{d} hours (₹)</span>
                      <input type="number" min={0} value={r.hourlyPrices[d] ?? ''} onChange={(e) => setRt(r.id, { hourlyPrices: { ...r.hourlyPrices, [d]: e.target.value } })} className={`${inputCls} w-full`} placeholder="Price" /></label>
                  ))}
                </div>
              )}
            </div>
          ))}
          {!rts.length && <p className="text-sm text-gray-500">Add room types in Rooms &amp; Rate Plans first.</p>}
        </div>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={save} disabled={saving} className="flex items-center gap-2 px-5 py-3 rounded-lg bg-navy-900 text-white font-semibold disabled:opacity-60">
          {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} aria-hidden="true" />} Save hourly settings
        </button>
        {msg && <p role="status" className={`text-sm ${msg.ok ? 'text-green-700' : 'text-red-700'}`}>{msg.text}</p>}
      </div>

      <Allocations />
      <Timeline date={date} setDate={setDate} />
    </div>
  );
};

export default ExtranetHourly;
