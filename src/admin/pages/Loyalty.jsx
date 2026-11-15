import { useState, useEffect, useCallback } from 'react';
import { Award, Users, Coins, Settings2, Search, X, Plus, Minus, Loader2 } from 'lucide-react';

/**
 * Admin -> Loyalty (Zivo Rewards): program numbers, settings (earn rate, point value, redemption
 * limits, bonuses, tiers) and members (balance, tier, history, manual adjustments with a reason).
 * Points used by guests are paid for by Zivo: the hotel's settlement is on the full price.
 */
const API = `${import.meta.env.VITE_API_URL || '/api/v1'}/admin/loyalty`;
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
const inr = (n) => `₹${Math.round(Number(n || 0)).toLocaleString('en-IN')}`;
const num = (n) => Number(n || 0).toLocaleString('en-IN');

const Settings = ({ config, onSaved }) => {
  const [c, setC] = useState(config);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const set = (k, v) => setC((x) => ({ ...x, [k]: v }));
  const setTier = (i, k, v) => setC((x) => ({ ...x, tiers: x.tiers.map((t, j) => (j === i ? { ...t, [k]: v } : t)) }));
  const save = async () => {
    setSaving(true); setMsg(null);
    try { onSaved(await call('/config', 'PUT', c)); setMsg({ ok: true, text: 'Settings saved. They apply to new bookings.' }); } catch (e) { setMsg({ ok: false, text: e.message }); } finally { setSaving(false); }
  };
  const input = 'mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none';
  const label = 'text-xs font-semibold text-gray-600';
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-gray-900 flex items-center gap-2"><Settings2 size={18} /> Program settings</h2>
        <label className="flex items-center gap-2 text-sm font-semibold cursor-pointer">
          <input type="checkbox" checked={c.enabled} onChange={(e) => set('enabled', e.target.checked)} className="rounded border-gray-300" /> Program on
        </label>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <label className={label}>Points per ₹100 (Blue)<input type="number" step="0.1" min="0" className={input} value={c.earnPointsPer100} onChange={(e) => set('earnPointsPer100', e.target.value)} /></label>
        <label className={label}>Value of 1 point (₹)<input type="number" step="0.01" min="0.01" className={input} value={c.pointValue} onChange={(e) => set('pointValue', e.target.value)} /></label>
        <label className={label}>Minimum points to use<input type="number" min="0" className={input} value={c.minRedeemPoints} onChange={(e) => set('minRedeemPoints', e.target.value)} /></label>
        <label className={label}>Max % of room price<input type="number" min="0" max="100" className={input} value={c.maxRedeemPercent} onChange={(e) => set('maxRedeemPercent', e.target.value)} /></label>
        <label className={label}>Review bonus (points)<input type="number" min="0" className={input} value={c.reviewBonusPoints} onChange={(e) => set('reviewBonusPoints', e.target.value)} /></label>
        <label className={label}>Sign-up bonus (points)<input type="number" min="0" className={input} value={c.signupBonusPoints} onChange={(e) => set('signupBonusPoints', e.target.value)} /></label>
        <label className={label}>Tier period (months)<input type="number" min="1" max="36" className={input} value={c.tierWindowMonths} onChange={(e) => set('tierWindowMonths', e.target.value)} /></label>
        <label className={label}>Points expire after (months, 0 = never)<input type="number" min="0" max="120" className={input} value={c.expiryMonths ?? 24} onChange={(e) => set('expiryMonths', e.target.value)} /></label>
        <div className="text-xs text-gray-500 self-end pb-2 md:col-span-3">{Number(c.expiryMonths) > 0 ? `Each batch of points expires ${c.expiryMonths} months after it becomes usable. Oldest points are used first; guests are emailed 30 days before. ` : 'Points never expire. '}Guests get back {Math.round((Number(c.earnPointsPer100) / 100) * Number(c.pointValue) * 10000) / 100}% of what they spend (Blue).</div>
      </div>
      <div>
        <p className="text-sm font-bold text-gray-800 mb-2">Tiers <span className="text-xs font-normal text-gray-500">(reached by nights OR spend in the period)</span></p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-gray-500"><th className="py-1 pr-2">Name</th><th className="py-1 pr-2">Min nights</th><th className="py-1 pr-2">Min spend (₹)</th><th className="py-1 pr-2">Points multiplier</th><th /></tr></thead>
            <tbody>
              {c.tiers.map((t, i) => (
                <tr key={i}>
                  <td className="py-1 pr-2"><input aria-label="Tier name" className="w-full px-2 py-1.5 border border-gray-200 rounded" value={t.name} onChange={(e) => setTier(i, 'name', e.target.value)} /></td>
                  <td className="py-1 pr-2"><input aria-label="Min nights" type="number" min="0" disabled={i === 0} className="w-full px-2 py-1.5 border border-gray-200 rounded disabled:bg-gray-50" value={t.minNights} onChange={(e) => setTier(i, 'minNights', e.target.value)} /></td>
                  <td className="py-1 pr-2"><input aria-label="Min spend" type="number" min="0" disabled={i === 0} className="w-full px-2 py-1.5 border border-gray-200 rounded disabled:bg-gray-50" value={t.minSpend} onChange={(e) => setTier(i, 'minSpend', e.target.value)} /></td>
                  <td className="py-1 pr-2"><input aria-label="Multiplier" type="number" step="0.05" min="0" className="w-full px-2 py-1.5 border border-gray-200 rounded" value={t.multiplier} onChange={(e) => setTier(i, 'multiplier', e.target.value)} /></td>
                  <td className="py-1">{i > 0 && c.tiers.length > 1 && <button type="button" aria-label="Remove tier" onClick={() => setC((x) => ({ ...x, tiers: x.tiers.filter((_, j) => j !== i) }))} className="p-1 text-gray-400 hover:text-red-600"><X size={14} /></button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {c.tiers.length < 5 && <button type="button" onClick={() => setC((x) => ({ ...x, tiers: [...x.tiers, { name: 'New tier', minNights: (x.tiers.at(-1)?.minNights || 0) + 10, minSpend: (x.tiers.at(-1)?.minSpend || 0) + 50000, multiplier: (x.tiers.at(-1)?.multiplier || 1) + 0.25 }] }))} className="mt-2 text-xs font-bold text-brand-700">+ Add tier</button>}
      </div>
      <div className="flex items-center justify-end gap-3">
        {msg && <p role={msg.ok ? 'status' : 'alert'} className={`mr-auto text-sm ${msg.ok ? 'text-green-700' : 'text-red-600'}`}>{msg.text}</p>}
        <button type="button" disabled={saving} onClick={save} className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-sm font-bold disabled:opacity-50">{saving ? 'Saving…' : 'Save settings'}</button>
      </div>
    </div>
  );
};

const MemberDrawer = ({ member, onClose, onChanged }) => {
  const [data, setData] = useState(null);
  const [adj, setAdj] = useState({ points: '', reason: '' });
  const [err, setErr] = useState('');
  const load = useCallback(() => { call(`/members/${member.id}`).then(setData).catch((e) => setErr(e.message)); }, [member.id]);
  useEffect(() => { load(); }, [load]);
  const submit = async (sign) => {
    setErr('');
    try { await call(`/members/${member.id}/adjust`, 'POST', { points: sign * Math.abs(Number(adj.points)), reason: adj.reason }); setAdj({ points: '', reason: '' }); load(); onChanged(); } catch (e) { setErr(e.message); }
  };
  return (
    <div className="fixed inset-0 z-[200] bg-black/30 flex justify-end" role="dialog" aria-modal="true" aria-label="Member points">
      <div className="bg-white w-full max-w-lg h-full overflow-y-auto p-6 space-y-5">
        <div className="flex items-start justify-between">
          <div><h3 className="text-lg font-bold text-gray-900">{member.name}</h3><p className="text-sm text-gray-500">{member.email}</p></div>
          <button type="button" aria-label="Close" onClick={onClose} className="text-gray-400"><X size={20} /></button>
        </div>
        {!data ? <Loader2 className="animate-spin text-brand-700" /> : (
          <>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded-xl bg-gray-50 p-3"><p className="text-xs text-gray-500">Available</p><p className="text-xl font-black">{num(data.summary.available)}</p></div>
              <div className="rounded-xl bg-gray-50 p-3"><p className="text-xs text-gray-500">Pending</p><p className="text-xl font-black">{num(data.summary.pending)}</p></div>
              <div className="rounded-xl bg-gray-50 p-3"><p className="text-xs text-gray-500">Tier</p><p className="text-xl font-black">{data.summary.tier.name}</p></div>
            </div>
            <div className="rounded-xl border border-gray-200 p-4 space-y-2">
              <p className="text-sm font-bold text-gray-800">Adjust points</p>
              <div className="flex gap-2">
                <input type="number" min="1" aria-label="Points" placeholder="Points" value={adj.points} onChange={(e) => setAdj({ ...adj, points: e.target.value })} className="w-28 px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                <input aria-label="Reason" placeholder="Reason (shown to the guest)" value={adj.reason} onChange={(e) => setAdj({ ...adj, reason: e.target.value })} className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm" />
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => submit(1)} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-bold bg-green-600 text-white"><Plus size={14} /> Add</button>
                <button type="button" onClick={() => submit(-1)} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-bold border border-gray-300"><Minus size={14} /> Remove</button>
              </div>
              {err && <p role="alert" className="text-sm text-red-600">{err}</p>}
            </div>
            <div>
              <p className="text-sm font-bold text-gray-800 mb-2">History</p>
              <ul className="divide-y divide-gray-100 text-sm">
                {data.history.length === 0 && <li className="py-3 text-gray-500">No points yet.</li>}
                {data.history.map((h) => (
                  <li key={h.id} className="py-2.5 flex justify-between gap-3">
                    <div><p className="text-gray-900">{h.description || h.type}</p><p className="text-xs text-gray-500">{new Date(h.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} · {h.type} · {h.status}</p></div>
                    <span className={`font-bold ${h.status === 'REVERSED' ? 'line-through text-gray-400' : h.points > 0 ? 'text-green-700' : 'text-gray-900'}`}>{h.points > 0 ? '+' : ''}{num(h.points)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

const Loyalty = () => {
  const [stats, setStats] = useState(null);
  const [members, setMembers] = useState([]);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(null);
  const [error, setError] = useState('');

  const loadStats = useCallback(() => { call('/stats').then(setStats).catch((e) => setError(e.message)); }, []);
  const loadMembers = useCallback(() => { call(`/members?search=${encodeURIComponent(search)}`).then(setMembers).catch((e) => setError(e.message)); }, [search]);
  useEffect(() => { loadStats(); }, [loadStats]);
  useEffect(() => { const t = setTimeout(loadMembers, 300); return () => clearTimeout(t); }, [loadMembers]);

  return (
    <div className="space-y-6">
      <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><Award className="text-brand-700" size={22} /> Zivo Rewards</h1>
        <p className="text-gray-500 mt-1">Guests earn points on completed stays and use them at checkout. Zivo pays for points used, so hotel payouts are on the full price.</p>
      </div>
      {error && <p className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</p>}

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { icon: Users, k: 'Members with points', v: num(stats.members) },
            { icon: Coins, k: 'Points outstanding', v: num(stats.outstandingPoints), sub: `${inr(stats.outstandingValue)} liability · ${num(stats.pendingPoints)} pending` },
            { icon: Plus, k: 'Earned (30 days)', v: num(stats.earnedLast30) },
            { icon: Minus, k: 'Used (30 days)', v: num(stats.usedLast30), sub: `${num(stats.expiredLast30)} expired in 30 days` },
          ].map((s) => (
            <div key={s.k} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1"><s.icon size={13} /> {s.k}</p>
              <p className="text-2xl font-black text-gray-900 mt-1">{s.v}</p>
              {s.sub && <p className="text-xs text-gray-500">{s.sub}</p>}
            </div>
          ))}
        </div>
      )}

      {stats && <Settings config={stats.config} onSaved={() => loadStats()} />}

      <div className="bg-white border border-gray-200 rounded-xl shadow-sm">
        <div className="p-4 border-b border-gray-100 flex items-center justify-between gap-3">
          <h2 className="font-bold text-gray-900">Members</h2>
          <div className="relative w-64">
            <Search size={15} className="absolute left-3 top-2.5 text-gray-400" />
            <input aria-label="Search members" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name or email" className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm" />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-gray-500 bg-gray-50"><th className="px-4 py-2">Guest</th><th className="px-4 py-2">Tier</th><th className="px-4 py-2 text-right">Available</th><th className="px-4 py-2 text-right">Pending</th><th className="px-4 py-2 text-right">Nights / spend (period)</th><th /></tr></thead>
            <tbody>
              {members.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-500">No guests found.</td></tr>}
              {members.map((m) => (
                <tr key={m.id} className="border-t border-gray-100">
                  <td className="px-4 py-2.5"><p className="font-semibold text-gray-900">{m.name}</p><p className="text-xs text-gray-500">{m.email}</p></td>
                  <td className="px-4 py-2.5">{m.tier}</td>
                  <td className="px-4 py-2.5 text-right font-bold">{num(m.available)}</td>
                  <td className="px-4 py-2.5 text-right text-gray-500">{num(m.pending)}</td>
                  <td className="px-4 py-2.5 text-right text-gray-500">{m.nights} · {inr(m.spend)}</td>
                  <td className="px-4 py-2.5 text-right"><button type="button" onClick={() => setOpen(m)} className="px-3 py-1 rounded-lg text-xs font-bold bg-brand-50 text-brand-700">Manage</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {open && <MemberDrawer member={open} onClose={() => setOpen(null)} onChanged={() => { loadMembers(); loadStats(); }} />}
    </div>
  );
};

export default Loyalty;
