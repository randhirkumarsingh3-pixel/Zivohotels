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
