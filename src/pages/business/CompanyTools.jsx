import { useCallback, useEffect, useState } from 'react';
import { Loader2, Plus, Trash2, Save, CheckCircle2, XCircle, Download, ShieldCheck } from 'lucide-react';
import { businessApi } from '../../services/api';

/**
 * ZivoPlus for Business (companies): travel policy, approvals and spend reports.
 */
const inr = (n) => `₹${Math.round(Number(n || 0)).toLocaleString('en-IN')}`;
const day = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
const input = 'mt-1 w-full px-3 py-2.5 border border-gray-300 rounded-lg text-base sm:text-sm disabled:bg-gray-50';
const btn = 'inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold disabled:opacity-50';
const Note = ({ msg }) => (msg ? <p role={msg.ok ? 'status' : 'alert'} className={`text-sm px-3 py-2 rounded-lg ${msg.ok ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'}`}>{msg.text}</p> : null);

// ─── Policy ──────────────────────────────────────────────────────────────────
export const PolicyTab = ({ org }) => {
  const edit = org.can['org.edit'];
  const [p, setP] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  useEffect(() => { businessApi.policy(org.id).then((x) => setP({ ...x, metroText: (x.metroCities || []).join(', ') })).catch((e) => setMsg({ ok: false, text: e.message })); }, [org.id]);
  if (!p) return <p className="text-sm text-gray-500 flex items-center gap-2">{msg ? msg.text : <><Loader2 size={15} className="animate-spin" /> Loading…</>}</p>;
  const setGrade = (i, k, v) => setP((x) => ({ ...x, grades: x.grades.map((g, j) => (j === i ? { ...g, [k]: v } : g)) }));
  const save = async () => {
    setBusy(true); setMsg(null);
    try {
      const saved = await businessApi.savePolicy(org.id, { ...p, metroCities: p.metroText, grades: p.grades.map((g) => ({ ...g, capMetro: Number(g.capMetro), capOther: Number(g.capOther) })) });
      setP({ ...saved, metroText: saved.metroCities.join(', ') }); setMsg({ ok: true, text: 'Policy saved. It applies to new bookings.' });
    } catch (e) { setMsg({ ok: false, text: e.message }); } finally { setBusy(false); }
  };
  return (
    <div className="space-y-5">
      <section className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4">
        <label className="flex items-center gap-2 text-sm font-semibold text-gray-900"><input type="checkbox" disabled={!edit} checked={p.enabled} onChange={(e) => setP({ ...p, enabled: e.target.checked })} /> Apply the travel policy to bookings</label>
        <fieldset className="grid gap-2 sm:grid-cols-3" disabled={!edit}>
          <legend className="text-sm font-semibold text-gray-800 mb-1">Approval needed</legend>
          {[['NEVER', 'Never', 'Over-the-limit stays only need a reason'], ['OUT_OF_POLICY', 'When over the limit', 'An approver OKs stays over the limit'], ['ALWAYS', 'For every trip', 'An approver OKs every stay']].map(([v, l, h]) => (
            <label key={v} className={`flex gap-2 p-3 rounded-xl border cursor-pointer ${p.approval === v ? 'border-navy-800 bg-navy-50' : 'border-gray-200'}`}>
              <input type="radio" name="approval" className="mt-1" checked={p.approval === v} onChange={() => setP({ ...p, approval: v })} />
              <span><span className="block text-sm font-semibold">{l}</span><span className="block text-xs text-gray-600">{h}</span></span>
            </label>
          ))}
        </fieldset>
        <label className="block text-sm font-semibold text-gray-800 max-w-sm">Finance also approves trips above (₹, total; empty: never)<input type="number" min="1000" className={input} disabled={!edit} value={p.financeApprovalAbove ?? ''} onChange={(e) => setP({ ...p, financeApprovalAbove: e.target.value === '' ? null : e.target.value })} /></label>
        <label className="flex items-center gap-2 text-sm text-gray-800"><input type="checkbox" disabled={!edit} checked={p.requireReason} onChange={(e) => setP({ ...p, requireReason: e.target.checked })} /> Ask for a reason when a stay is over the limit</label>
        <label className="block text-sm font-semibold text-gray-800">Metro cities (the metro limit applies here)<textarea rows={2} className={input} disabled={!edit} value={p.metroText} onChange={(e) => setP({ ...p, metroText: e.target.value })} /></label>
      </section>
      <section className="bg-white border border-gray-200 rounded-2xl p-5 space-y-3">
        <h3 className="font-bold text-gray-900">Grades and nightly limits</h3>
        <p className="text-xs text-gray-600">Room price per room per night, before GST, after your company rate.</p>
        {p.grades.map((g, i) => (
          <div key={i} className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto_auto] sm:items-end">
            <label className="text-sm font-semibold text-gray-800">Grade<input className={input} disabled={!edit} value={g.name} onChange={(e) => setGrade(i, 'name', e.target.value)} /></label>
            <label className="text-sm font-semibold text-gray-800">Metro (₹/night)<input type="number" min="500" className={input} disabled={!edit} value={g.capMetro} onChange={(e) => setGrade(i, 'capMetro', e.target.value)} /></label>
            <label className="text-sm font-semibold text-gray-800">Other cities (₹/night)<input type="number" min="500" className={input} disabled={!edit} value={g.capOther} onChange={(e) => setGrade(i, 'capOther', e.target.value)} /></label>
            <label className="text-xs font-semibold text-gray-700 flex items-center gap-1 pb-3"><input type="radio" name="defaultGrade" disabled={!edit} checked={p.defaultGrade === g.key} onChange={() => setP({ ...p, defaultGrade: g.key })} /> Default</label>
            {edit && p.grades.length > 1 && <button type="button" aria-label={`Remove ${g.name}`} onClick={() => setP({ ...p, grades: p.grades.filter((_, j) => j !== i) })} className="p-2 mb-1 text-gray-500 hover:text-red-600"><Trash2 size={16} /></button>}
          </div>
        ))}
        {edit && <button type="button" onClick={() => setP({ ...p, grades: [...p.grades, { name: '', capMetro: 5000, capOther: 3500 }] })} className={`${btn} border border-gray-300`}><Plus size={15} /> Add grade</button>}
      </section>
      <Note msg={msg} />
      {edit && <button type="button" onClick={save} disabled={busy} className={`${btn} bg-navy-800 text-white`}>{busy ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Save policy</button>}
      <p className="text-xs text-gray-500">Set each person&apos;s grade, approver and cost centre in the Team tab. Admins&apos; own bookings don&apos;t wait for approval.</p>
    </div>
  );
};

/** Grade, approver and cost centre on a member row (Team tab, companies). */
export const MemberPolicyFields = ({ org, member, members, grades, onChange }) => {
  if (org.kind !== 'CORPORATE') return null;
  const manage = org.can['members.manage'];
  const sel = 'px-2 py-1.5 border border-gray-300 rounded-lg text-sm';
  if (!manage) return <p className="text-xs text-gray-500">{[member.grade && `Grade ${member.grade}`, member.costCenter].filter(Boolean).join(' · ')}</p>;
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <select aria-label={`Grade of ${member.user.name}`} className={sel} value={member.grade || ''} onChange={(e) => onChange({ grade: e.target.value })}>
        <option value="">Default grade</option>{(grades || []).map((g) => <option key={g.key} value={g.key}>{g.name}</option>)}
      </select>
      <select aria-label={`Approver for ${member.user.name}`} className={sel} value={member.approverMemberId || ''} onChange={(e) => onChange({ approverMemberId: e.target.value || null })}>
        <option value="">Approver: admins &amp; approvers</option>{members.filter((x) => x.id !== member.id && x.status === 'ACTIVE').map((x) => <option key={x.id} value={x.id}>Approver: {x.user.name}</option>)}
      </select>
      <input aria-label={`Cost centre of ${member.user.name}`} className={`${sel} w-36`} placeholder="Cost centre" defaultValue={member.costCenter || ''} onBlur={(e) => { if ((e.target.value || '') !== (member.costCenter || '')) onChange({ costCenter: e.target.value }); }} />
    </div>
  );
};

// ─── Approvals ───────────────────────────────────────────────────────────────
export const ApprovalsTab = ({ org, onChange }) => {
  const [rows, setRows] = useState(null);
  const [notes, setNotes] = useState({});
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState(null);
  const load = useCallback(() => businessApi.approvals(org.id).then(setRows).catch((e) => setMsg({ ok: false, text: e.message })), [org.id]);
  useEffect(() => { load(); }, [load]);
  const decide = async (b, decision) => {
    setBusy(b.id + decision); setMsg(null);
    try {
      await businessApi.decide(org.id, b.id, { decision, note: notes[b.id] || '' });
      setMsg({ ok: true, text: decision === 'APPROVE' ? `Approved: ${b.guestName}'s stay is confirmed.` : 'Not approved: the rooms were released.' });
      await load(); onChange?.();
    } catch (e) { setMsg({ ok: false, text: e.message }); } finally { setBusy(''); }
  };
  if (!rows) return <p className="text-sm text-gray-500 flex items-center gap-2"><Loader2 size={15} className="animate-spin" /> Loading…</p>;
  return (
    <div className="space-y-4">
      <Note msg={msg} />
      {rows.length === 0 ? <p className="text-sm text-gray-600 bg-white border border-gray-200 rounded-2xl p-5">Nothing waiting for your approval.</p> : rows.map((b) => {
        const pol = b.business?.policy;
        return (
          <section key={b.id} className="bg-white border border-gray-200 rounded-2xl p-5 space-y-3">
            <div className="flex flex-col sm:flex-row sm:justify-between gap-2">
              <div>
                <p className="font-bold text-gray-900">{b.guestName} · {b.hotel.name}, {b.hotel.city}</p>
                <p className="text-sm text-gray-600">{day(b.checkIn)} to {day(b.checkOut)} · {b.rooms} room{b.rooms > 1 ? 's' : ''} · booked by {b.business?.bookedBy?.name}</p>
              </div>
              <p className="text-lg font-black text-gray-900">{inr(b.total)}</p>
            </div>
            {(b.business?.approval?.steps || []).length > 1 && <p className="text-xs text-gray-700">Step {(b.business.approval.current || 0) + 1} of {b.business.approval.steps.length}: <b>{b.business.approval.steps[b.business.approval.current || 0].label} approval</b>{(b.business.approval.history || []).map((h) => ` · ${h.label} approved by ${h.by}`).join('')}</p>}
            {pol && <p className={`text-sm px-3 py-2 rounded-lg ${pol.within ? 'bg-green-50 text-green-800' : 'bg-amber-50 text-amber-900'}`}>{pol.within ? `Within policy (${inr(pol.perNight)} a night, limit ${inr(pol.cap)})` : `Over policy: ${inr(pol.perNight)} a night, limit ${inr(pol.cap)} for ${pol.gradeName}.`}{pol.reason ? ` Reason: ${pol.reason}` : ''}</p>}
            <p className="text-xs text-gray-500">Held until {new Date(b.heldUntil).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}; released if not approved by then.</p>
            <label className="block text-sm font-semibold text-gray-800">Note (needed to reject)<input className={input} value={notes[b.id] || ''} onChange={(e) => setNotes({ ...notes, [b.id]: e.target.value })} /></label>
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={!!busy} onClick={() => decide(b, 'APPROVE')} className={`${btn} bg-green-700 text-white`}>{busy === b.id + 'APPROVE' ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />} Approve and pay {inr(b.total)}</button>
              <button type="button" disabled={!!busy} onClick={() => decide(b, 'REJECT')} className={`${btn} border border-gray-300 text-red-700`}><XCircle size={15} /> Reject</button>
            </div>
          </section>
        );
      })}
    </div>
  );
};

// ─── Reports ─────────────────────────────────────────────────────────────────
const firstOfMonth = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10); };
// Default: stays checking in this month and the next two (bookings are usually made ahead)
const lastOfMonth = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth() + 3, 0).toISOString().slice(0, 10); };
const Group = ({ title, rows }) => (
  <section className="bg-white border border-gray-200 rounded-2xl overflow-x-auto">
    <h3 className="font-bold text-gray-900 px-4 py-3 border-b border-gray-100">{title}</h3>
    <table className="w-full text-sm">
      <thead className="bg-gray-50 text-xs text-gray-500 uppercase"><tr><th className="text-left px-4 py-2">Name</th><th className="text-right px-4 py-2">Stays</th><th className="text-right px-4 py-2">Room nights</th><th className="text-right px-4 py-2">Spend</th><th className="text-right px-4 py-2">Saved</th></tr></thead>
      <tbody className="divide-y divide-gray-100">{rows.length === 0 ? <tr><td colSpan={5} className="px-4 py-3 text-gray-500">No stays.</td></tr> : rows.slice(0, 10).map((g) => <tr key={g.key}><td className="px-4 py-2">{g.key}</td><td className="px-4 py-2 text-right">{g.bookings}</td><td className="px-4 py-2 text-right">{g.roomNights}</td><td className="px-4 py-2 text-right">{inr(g.spend)}</td><td className="px-4 py-2 text-right text-green-700">{inr(g.savings)}</td></tr>)}</tbody>
    </table>
  </section>
);

export const ReportsTab = ({ org }) => {
  const [range, setRange] = useState({ from: firstOfMonth(), to: lastOfMonth() });
  const [data, setData] = useState(null);
  const [msg, setMsg] = useState(null);
  useEffect(() => { setData(null); businessApi.spend(org.id, range).then(setData).catch((e) => setMsg({ ok: false, text: e.message })); }, [org.id, range]);
  const csv = async () => {
    try { const b = await businessApi.spendCsv(org.id, range); const u = URL.createObjectURL(b); const a = document.createElement('a'); a.href = u; a.download = `${org.code}-stays-${range.from}-to-${range.to}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(u), 30000); } catch (e) { setMsg({ ok: false, text: e.message }); }
  };
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm font-semibold text-gray-800">Check-in from<input type="date" className={input} value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} /></label>
        <label className="text-sm font-semibold text-gray-800">to<input type="date" className={input} value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} /></label>
        <button type="button" onClick={csv} className={`${btn} border border-gray-300`}><Download size={15} /> Download stays with GST details (CSV)</button>
      </div>
      <Note msg={msg} />
      {!data ? <p className="text-sm text-gray-500 flex items-center gap-2"><Loader2 size={15} className="animate-spin" /> Loading…</p> : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            {[['Spend', inr(data.totals.spend)], ['GST (input credit)', inr(data.totals.tax)], ['Saved vs public price', inr(data.totals.savings)], ['Room nights', data.totals.roomNights], ['Avg per night', inr(data.totals.averagePerNight)]].map(([k, v]) => <div key={k} className="rounded-xl bg-white border border-gray-200 p-3"><p className="text-xs text-gray-500">{k}</p><p className="text-lg font-bold text-gray-900">{v}</p></div>)}
          </div>
          {data.totals.checkedAgainstPolicy > 0 && <p className="text-sm text-gray-700 flex items-center gap-2"><ShieldCheck size={16} className="text-brand-700" aria-hidden="true" /> {data.totals.checkedAgainstPolicy - data.totals.outOfPolicy} of {data.totals.checkedAgainstPolicy} stays within policy.</p>}
          <div className="grid gap-4 lg:grid-cols-2">
            <Group title="By traveller" rows={data.byTraveller} />
            <Group title="By cost centre" rows={data.byCostCenter} />
            <Group title="By city" rows={data.byCity} />
            <Group title="By hotel" rows={data.byHotel} />
          </div>
          {data.outOfPolicy.length > 0 && (
            <section className="bg-white border border-gray-200 rounded-2xl overflow-x-auto">
              <h3 className="font-bold text-gray-900 px-4 py-3 border-b border-gray-100">Over policy</h3>
              <table className="w-full text-sm"><tbody className="divide-y divide-gray-100">{data.outOfPolicy.map((x) => <tr key={x.bookingRef}><td className="px-4 py-2"><b>{x.traveller}</b><span className="block text-xs text-gray-500">{x.bookingRef} · {x.hotel}, {x.city}</span></td><td className="px-4 py-2 text-right">{inr(x.perNight)} / limit {inr(x.cap)}</td><td className="px-4 py-2 text-gray-600">{x.reason}{x.approvedBy ? ` · approved by ${x.approvedBy}` : ''}</td></tr>)}</tbody></table>
            </section>
          )}
        </>
      )}
    </div>
  );
};

// ─── Trip requests ───────────────────────────────────────────────────────────
const TRIP = { SUBMITTED: ['bg-amber-50 text-amber-900', 'Waiting for the travel desk'], BOOKED: ['bg-green-50 text-green-800', 'Booked'], DECLINED: ['bg-red-50 text-red-700', 'Declined'], CANCELLED: ['bg-gray-100 text-gray-600', 'Cancelled'] };
const plus = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

/** Employees ask for trips; the travel desk (bookers, admins) books them or declines. */
export const TripsTab = ({ org, onBook }) => {
  const [data, setData] = useState(null);
  const [f, setF] = useState({ city: '', checkIn: plus(7), checkOut: plus(8), rooms: 1, adults: 1, purpose: '', notes: '' });
  const [colleagues, setColleagues] = useState([]);
  const [notes, setNotes] = useState({});
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState(null);
  const load = useCallback(() => businessApi.trips(org.id).then(setData).catch((e) => setMsg({ ok: false, text: e.message })), [org.id]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (data?.desk) businessApi.members(org.id).then((ms) => setColleagues(ms.filter((x) => x.status === 'ACTIVE'))).catch(() => {}); }, [org.id, data?.desk]);
  const act = async (key, fn, ok) => { setBusy(key); setMsg(null); try { await fn(); await load(); setMsg({ ok: true, text: ok }); } catch (e) { setMsg({ ok: false, text: e.message }); } finally { setBusy(''); } };
  const submit = (e) => { e.preventDefault(); act('new', async () => { await businessApi.requestTrip(org.id, f); setF({ ...f, city: '', purpose: '', notes: '' }); }, 'Request sent to the travel desk. You\'ll be told when it\'s booked.'); };
  if (!data) return <p className="text-sm text-gray-500 flex items-center gap-2"><Loader2 size={15} className="animate-spin" /> Loading…</p>;
  const waiting = data.trips.filter((t) => t.status === 'SUBMITTED');
  const others = data.trips.filter((t) => t.status !== 'SUBMITTED');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <div className="space-y-5">
      <form onSubmit={submit} className="bg-white border border-gray-200 rounded-2xl p-5 space-y-3">
        <h3 className="font-bold text-gray-900">Request a trip</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <label className="text-sm font-semibold text-gray-800 lg:col-span-2">City<input className={input} required value={f.city} onChange={set('city')} /></label>
          <label className="text-sm font-semibold text-gray-800">Check-in<input type="date" className={input} min={plus(0)} required value={f.checkIn} onChange={set('checkIn')} /></label>
          <label className="text-sm font-semibold text-gray-800">Check-out<input type="date" className={input} min={f.checkIn} required value={f.checkOut} onChange={set('checkOut')} /></label>
          <label className="text-sm font-semibold text-gray-800">Rooms<input type="number" min="1" max="8" className={input} value={f.rooms} onChange={set('rooms')} /></label>
          <label className="text-sm font-semibold text-gray-800">Guests per room<input type="number" min="1" max="6" className={input} value={f.adults} onChange={set('adults')} /></label>
          <label className="text-sm font-semibold text-gray-800 lg:col-span-3">Purpose<input className={input} required value={f.purpose} onChange={set('purpose')} placeholder="e.g. Client meeting at Acme" /></label>
          <label className="text-sm font-semibold text-gray-800 lg:col-span-3">Notes (optional)<input className={input} value={f.notes} onChange={set('notes')} placeholder="Area, hotel you prefer…" /></label>
          {data.desk && colleagues.length > 0 && <label className="text-sm font-semibold text-gray-800 lg:col-span-2">For<select className={input} value={f.travellerMemberId || ''} onChange={set('travellerMemberId')}><option value="">Me</option>{colleagues.map((m) => <option key={m.id} value={m.id}>{m.user.name}</option>)}</select></label>}
        </div>
        <button type="submit" disabled={busy === 'new'} className={`${btn} bg-brand-600 hover:bg-brand-700 text-white`}>{busy === 'new' && <Loader2 size={15} className="animate-spin" />} Send request</button>
      </form>
      <Note msg={msg} />
      <section className="space-y-3">
        <h3 className="font-bold text-gray-900">{data.desk ? `Waiting for the travel desk (${waiting.length})` : 'Your requests'}</h3>
        {waiting.length === 0 && <p className="text-sm text-gray-600">Nothing waiting.</p>}
        {waiting.map((t) => (
          <div key={t.id} className="bg-white border border-gray-200 rounded-2xl p-4 space-y-2">
            <div className="flex flex-col sm:flex-row sm:justify-between gap-1"><p className="font-semibold text-gray-900">{t.traveller} · {t.city}</p><p className="text-sm text-gray-600">{day(t.checkIn)} to {day(t.checkOut)} · {t.rooms} room{t.rooms > 1 ? 's' : ''}, {t.adults} guest{t.adults > 1 ? 's' : ''} per room</p></div>
            <p className="text-sm text-gray-700">{t.purpose}{t.notes ? ` · ${t.notes}` : ''}{t.requester !== t.traveller ? ` · asked by ${t.requester}` : ''}</p>
            <div className="flex flex-wrap items-end gap-2">
              {data.desk && <button type="button" onClick={() => onBook(t)} className={`${btn} bg-navy-800 text-white`}>Book this trip</button>}
              {data.desk && <><input aria-label="Reason to decline" placeholder="Reason to decline" className="px-3 py-2 border border-gray-300 rounded-lg text-sm" value={notes[t.id] || ''} onChange={(e) => setNotes({ ...notes, [t.id]: e.target.value })} /><button type="button" disabled={!!busy} onClick={() => act(t.id, () => businessApi.declineTrip(org.id, t.id, notes[t.id] || ''), 'Declined; the traveller was told.')} className={`${btn} border border-gray-300 text-red-700`}>Decline</button></>}
              {!data.desk && <button type="button" disabled={!!busy} onClick={() => act(t.id, () => businessApi.cancelTrip(org.id, t.id), 'Request cancelled.')} className={`${btn} border border-gray-300`}>Cancel request</button>}
            </div>
          </div>
        ))}
      </section>
      {others.length > 0 && (
        <section className="bg-white border border-gray-200 rounded-2xl divide-y divide-gray-100">
          {others.map((t) => { const [c, l] = TRIP[t.status]; return (
            <div key={t.id} className="p-4 flex flex-col sm:flex-row sm:items-center gap-2 justify-between">
              <div><p className="font-semibold text-gray-900 text-sm">{t.traveller} · {t.city} · {day(t.checkIn)}</p><p className="text-xs text-gray-600">{t.purpose}{t.handlerNote ? ` · ${t.handlerNote}` : ''}{t.handledBy ? ` · ${t.handledBy}` : ''}</p></div>
              <span className={`px-2 py-0.5 rounded-md text-xs font-semibold self-start ${c}`}>{l}</span>
            </div>
          ); })}
        </section>
      )}
    </div>
  );
};

// ─── Import people (CSV) ─────────────────────────────────────────────────────
export const ImportMembers = ({ org, onDone }) => {
  const [open, setOpen] = useState(false);
  const [csv, setCsv] = useState('');
  const [pv, setPv] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const run = async (commit) => {
    setBusy(true); setMsg(null);
    try { const r = await businessApi.importMembers(org.id, csv, commit); setPv(r); if (commit) { setMsg({ ok: true, text: `Done: ${r.summary.invite} invited, ${r.summary.update} updated.` }); onDone?.(); } } catch (e) { setMsg({ ok: false, text: e.message }); } finally { setBusy(false); }
  };
  const file = (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (!f) return; const rd = new FileReader(); rd.onload = () => { setCsv(String(rd.result || '')); setPv(null); }; rd.readAsText(f); };
  if (!open) return <button type="button" onClick={() => setOpen(true)} className="text-sm font-semibold text-navy-800 underline">Import people from a CSV file</button>;
  return (
    <section className="bg-white border border-gray-200 rounded-2xl p-5 space-y-3">
      <h3 className="font-bold text-gray-900">Import people</h3>
      <p className="text-xs text-gray-600">Columns: <code>name, email, role, grade, approver_email, cost_centre</code>. Role: ADMIN, BOOKER, APPROVER, FINANCE or TRAVELLER (default). New people get an invitation; people already here get their grade, approver and cost centre updated.</p>
      <div className="flex flex-wrap gap-2 items-center"><label className={`${btn} border border-gray-300 cursor-pointer`}>Choose CSV file<input type="file" accept=".csv,text/csv" className="sr-only" onChange={file} /></label><span className="text-xs text-gray-500">or paste below</span></div>
      <textarea rows={5} className={`${input} font-mono text-xs`} value={csv} onChange={(e) => { setCsv(e.target.value); setPv(null); }} placeholder={'name,email,role,grade,approver_email,cost_centre\nAsha Rao,asha@yourco.com,TRAVELLER,STANDARD,manager@yourco.com,Sales'} />
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy || !csv.trim()} onClick={() => run(false)} className={`${btn} border border-gray-300`}>Check</button>
        {pv?.preview && pv.summary.errors === 0 && <button type="button" disabled={busy} onClick={() => run(true)} className={`${btn} bg-navy-800 text-white`}>Import {pv.summary.invite + pv.summary.update} people</button>}
        <button type="button" onClick={() => setOpen(false)} className="text-sm text-gray-600 underline">Close</button>
      </div>
      <Note msg={msg} />
      {pv && (
        <div className="text-sm space-y-1">
          <p className="font-semibold">{pv.summary.invite} to invite · {pv.summary.update} to update · {pv.summary.errors} with errors</p>
          <ul className="max-h-48 overflow-y-auto text-xs space-y-0.5">{pv.rows.map((r) => <li key={r.row} className={r.action === 'ERROR' ? 'text-red-700' : 'text-gray-700'}>Row {r.row}: {r.email || '(no email)'}: {r.action === 'ERROR' ? r.errors.join('; ') : r.action === 'INVITE' ? `invite as ${r.role.toLowerCase()}` : 'update details'}</li>)}</ul>
        </div>
      )}
    </section>
  );
};

/** Away: a stand-in approves this member's trips until a date (the member, or an admin). */
export const DelegateFields = ({ org, member, members, meId, onChange }) => {
  const canSet = member.id === meId || org.can['members.manage'];
  const [d, setD] = useState({ delegateMemberId: member.delegateMemberId || '', delegateUntil: member.delegateUntil ? String(member.delegateUntil).slice(0, 10) : '' });
  if (org.kind !== 'CORPORATE' || !['ADMIN', 'APPROVER', 'FINANCE'].includes(member.role)) return null;
  const active = member.delegateMemberId && members.find((x) => x.id === member.delegateMemberId);
  if (!canSet) return active ? <p className="text-xs text-gray-600">Away: {active.user.name} approves until {day(member.delegateUntil)}</p> : null;
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="font-semibold text-gray-700">Stand-in while away:</span>
      <select aria-label={`Stand-in for ${member.user.name}`} className="px-2 py-1 border border-gray-300 rounded-lg" value={d.delegateMemberId} onChange={(e) => setD({ ...d, delegateMemberId: e.target.value })}><option value="">None</option>{members.filter((x) => x.id !== member.id && x.status === 'ACTIVE').map((x) => <option key={x.id} value={x.id}>{x.user.name}</option>)}</select>
      {d.delegateMemberId && <input type="date" aria-label="Until" className="px-2 py-1 border border-gray-300 rounded-lg" min={plus(1)} value={d.delegateUntil} onChange={(e) => setD({ ...d, delegateUntil: e.target.value })} />}
      <button type="button" className="font-semibold underline" onClick={() => onChange(d.delegateMemberId ? { delegateMemberId: d.delegateMemberId, delegateUntil: `${d.delegateUntil}T23:59:00+05:30` } : { delegateMemberId: null })}>Save</button>
      {active && <span className="text-gray-500">({active.user.name} until {day(member.delegateUntil)})</span>}
    </div>
  );
};

// ─── Travellers (duty of care) ───────────────────────────────────────────────
const WHEN = { staying: ['Staying now', 'Checked in, or due in today, and not yet checked out.'], arriving: ['Arriving', 'Checking in in the coming days.'], recent: ['Checked out', 'Stays that ended in the last days.'] };
const shortDay = (d) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });

const TravellerCard = ({ r }) => (
  <li className="bg-white border border-gray-200 rounded-2xl p-4 space-y-2">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0">
        <p className="font-bold text-gray-900">{r.traveller.name}</p>
        <p className="text-xs text-gray-600">{[r.traveller.costCenter, r.bookingRef].filter(Boolean).join(' · ')}</p>
      </div>
      {r.traveller.phone && <a href={`tel:${r.traveller.phone}`} className="text-sm font-semibold text-navy-800 underline">Call {r.traveller.name.split(' ')[0]}</a>}
    </div>
    <div className="text-sm text-gray-800">
      <p className="font-semibold">{r.hotel.name}</p>
      <p className="text-gray-600">{r.hotel.address}</p>
      <p className="text-gray-600">{shortDay(r.checkIn)} to {shortDay(r.checkOut)} · {r.nights} night{r.nights > 1 ? 's' : ''}{r.status === 'CHECKED_IN' ? ' · checked in' : ''}</p>
    </div>
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
      {r.hotel.phone && <a href={`tel:${r.hotel.phone}`} className="font-semibold text-navy-800 underline">Hotel front desk</a>}
      {r.hotel.latitude != null && r.hotel.longitude != null && <a href={`https://www.google.com/maps/search/?api=1&query=${r.hotel.latitude},${r.hotel.longitude}`} target="_blank" rel="noopener noreferrer" className="font-semibold text-navy-800 underline">Map</a>}
    </div>
  </li>
);

export const TravellersTab = ({ org }) => {
  const [q, setQ] = useState({ days: '7', city: '' });
  const [data, setData] = useState(null);
  const [msg, setMsg] = useState(null);
  useEffect(() => { setData(null); businessApi.travellers(org.id, q).then(setData).catch((e) => setMsg({ ok: false, text: e.message })); }, [org.id, q]);
  const csv = async () => {
    try { const b = await businessApi.travellersCsv(org.id, q); const u = URL.createObjectURL(b); const a = document.createElement('a'); a.href = u; a.download = `${org.code}-travellers.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(u), 30000); } catch (e) { setMsg({ ok: false, text: e.message }); }
  };
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm font-semibold text-gray-800">Days ahead and back<select className={input} value={q.days} onChange={(e) => setQ({ ...q, days: e.target.value })}>{['3', '7', '14', '30'].map((d) => <option key={d} value={d}>{d} days</option>)}</select></label>
        <label className="text-sm font-semibold text-gray-800">City<select className={input} value={q.city} onChange={(e) => setQ({ ...q, city: e.target.value })}><option value="">All cities</option>{(data?.cities || []).map((c) => <option key={c} value={c}>{c}</option>)}</select></label>
        <button type="button" onClick={csv} className={`${btn} border border-gray-300 bg-white`}><Download size={15} /> Download CSV</button>
      </div>
      <Note msg={msg} />
      {!data ? <p className="text-sm text-gray-500 flex items-center gap-2"><Loader2 size={15} className="animate-spin" /> Loading…</p> : (
        <>
          <section className="bg-white border border-gray-200 rounded-2xl p-5">
            <h3 className="font-bold text-gray-900">{data.staying.length ? `${data.staying.length} traveller${data.staying.length > 1 ? 's' : ''} away tonight` : 'No one is away tonight'}</h3>
            {data.byCity.length > 0 && (
              <ul className="mt-3 flex flex-wrap gap-2">
                {data.byCity.map((c) => <li key={c.city}><button type="button" onClick={() => setQ({ ...q, city: q.city === c.city ? '' : c.city })} className={`px-3 py-1.5 rounded-full text-sm font-semibold border ${q.city === c.city ? 'border-navy-800 bg-navy-50 text-navy-900' : 'border-gray-200 text-gray-700'}`}>{c.city} · {c.count}</button></li>)}
              </ul>
            )}
          </section>
          {Object.entries(WHEN).map(([k, [title, hint]]) => (
            <section key={k} className="space-y-2">
              <div><h3 className="font-bold text-gray-900">{title} <span className="text-gray-500 font-normal">({data[k].length})</span></h3><p className="text-xs text-gray-500">{hint}</p></div>
              {data[k].length === 0 ? <p className="text-sm text-gray-500">No one.</p> : <ul className="grid gap-3 md:grid-cols-2">{data[k].map((r) => <TravellerCard key={r.bookingId} r={r} />)}</ul>}
            </section>
          ))}
        </>
      )}
    </div>
  );
};
