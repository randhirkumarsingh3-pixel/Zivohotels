import { useState, useEffect, useCallback } from 'react';
import { Crown, Users, IndianRupee, Building2, Gift, X } from 'lucide-react';

/**
 * Admin -> Membership: plans (free Member and paid plans: price, length, benefits), members (gift
 * or cancel a plan with a reason), revenue, and hotels' member prices.
 */
const API = `${import.meta.env.VITE_API_URL || '/api/v1'}/admin/membership`;
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

const PlanEditor = ({ plan, onSaved }) => {
  const [p, setP] = useState(plan);
  const [msg, setMsg] = useState(null);
  const setB = (k, v) => setP((x) => ({ ...x, benefits: { ...x.benefits, [k]: v } }));
  const save = async () => {
    setMsg(null);
    try { await call(`/plans/${plan.id}`, 'PUT', p); setMsg({ ok: true, text: 'Saved. Applies to new bookings.' }); onSaved(); } catch (e) { setMsg({ ok: false, text: e.message }); }
  };
  const input = 'mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm';
  const label = 'text-xs font-semibold text-gray-600';
  return (
    <div className={`bg-white border rounded-xl p-5 shadow-sm space-y-4 ${plan.isFree ? 'border-gray-200' : 'border-amber-300'}`}>
      <div className="flex items-center justify-between">
        <p className="font-bold text-gray-900 flex items-center gap-2">{!plan.isFree && <Crown size={16} className="text-amber-500" />}{plan.code} {plan.isFree ? '(free, every guest account)' : ''}</p>
        <div className="flex items-center gap-3">
          {!plan.isFree && <span className="text-xs text-gray-500">{plan.activeMembers} active</span>}
          <label className="flex items-center gap-1.5 text-sm font-semibold"><input type="checkbox" checked={p.isActive} onChange={(e) => setP({ ...p, isActive: e.target.checked })} className="rounded border-gray-300" /> On</label>
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <label className={`${label} md:col-span-2`}>Name<input className={input} value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} /></label>
        {!plan.isFree && <label className={label}>Price (₹, GST incl.)<input type="number" min="1" className={input} value={p.price} onChange={(e) => setP({ ...p, price: e.target.value })} /></label>}
        {!plan.isFree && <label className={label}>Length (days)<input type="number" min="7" className={input} value={p.durationDays} onChange={(e) => setP({ ...p, durationDays: e.target.value })} /></label>}
        <label className={`${label} col-span-2 md:col-span-4`}>Description<input className={input} value={p.description || ''} onChange={(e) => setP({ ...p, description: e.target.value })} /></label>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <label className={label}>Extra discount % (Zivo pays)<input type="number" min="0" max="50" className={input} value={p.benefits.zivoDiscountPercent} onChange={(e) => setB('zivoDiscountPercent', e.target.value)} /></label>
        <label className={label}>Max extra discount (₹, 0 = no cap)<input type="number" min="0" className={input} value={p.benefits.zivoDiscountMax} onChange={(e) => setB('zivoDiscountMax', e.target.value)} /></label>
        <label className={label}>Points multiplier<input type="number" min="1" step="0.25" className={input} value={p.benefits.pointsMultiplier} onChange={(e) => setB('pointsMultiplier', e.target.value)} /></label>
        <label className={label}>Extra free-cancellation hours<input type="number" min="0" max="168" className={input} value={p.benefits.freeCancelExtraHours} onChange={(e) => setB('freeCancelExtraHours', e.target.value)} /></label>
      </div>
      <div className="flex flex-wrap gap-4 text-sm">
        {[['hotelMemberRates', "Hotels' member prices"], ['memberOffers', 'Member-only offers'], ['prioritySupport', 'Priority support']].map(([k, l]) => (
          <label key={k} className="flex items-center gap-1.5"><input type="checkbox" className="rounded border-gray-300" checked={Boolean(p.benefits[k])} onChange={(e) => setB(k, e.target.checked)} /> {l}</label>
        ))}
      </div>
      <div className="flex items-center justify-end gap-3">
        {msg && <p className={`mr-auto text-sm ${msg.ok ? 'text-green-700' : 'text-red-600'}`}>{msg.text}</p>}
        <button type="button" onClick={save} className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-sm font-bold">Save plan</button>
      </div>
    </div>
  );
};

const AdminMembership = () => {
  const [data, setData] = useState(null);
  const [members, setMembers] = useState([]);
  const [status, setStatus] = useState('ACTIVE');
  const [search, setSearch] = useState('');
  const [grant, setGrant] = useState(null);
  const [msg, setMsg] = useState(null);

  const loadOverview = useCallback(() => { call('/overview').then(setData).catch((e) => setMsg({ ok: false, text: e.message })); }, []);
  const loadMembers = useCallback(() => { call(`/members?status=${status}&search=${encodeURIComponent(search)}`).then(setMembers).catch(() => {}); }, [status, search]);
  useEffect(() => { loadOverview(); }, [loadOverview]);
  useEffect(() => { const t = setTimeout(loadMembers, 300); return () => clearTimeout(t); }, [loadMembers]);

  const doGrant = async (e) => {
    e.preventDefault();
    try { await call('/grant', 'POST', grant); setMsg({ ok: true, text: `${grant.email} now has the plan.` }); setGrant(null); loadMembers(); loadOverview(); } catch (err) { setMsg({ ok: false, text: err.message }); }
  };
  const cancel = async (m) => {
    const note = prompt(`Cancel ${m.plan} for ${m.user?.email}? Give a reason (no refund is made; credit Zivo Cash separately if needed):`);
    if (!note) return;
    try { await call(`/members/${m.id}/cancel`, 'POST', { note }); loadMembers(); loadOverview(); } catch (err) { setMsg({ ok: false, text: err.message }); }
  };
  const setHotelPct = async (h) => {
    const v = prompt(`Member discount % for ${h.name} (0 = off). Hotels normally set this themselves in the extranet.`, h.memberDiscountPercent);
    if (v === null) return;
    try { await call(`/hotels/${h.id}`, 'PUT', { memberDiscountPercent: Number(v) }); loadOverview(); } catch (err) { setMsg({ ok: false, text: err.message }); }
  };

  const paidPlans = (data?.plans || []).filter((p) => !p.isFree);
  return (
    <div className="space-y-6">
      <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><Crown className="text-amber-500" size={22} /> Membership</h1>
        <p className="text-gray-500 mt-1">Every guest account is a free Member. Paid plans add Zivo-funded savings, extra points and flexibility.</p>
      </div>
      {msg && <p role={msg.ok ? 'status' : 'alert'} className={`p-3 rounded-lg text-sm border ${msg.ok ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-700'}`}>{msg.text}</p>}

      {data && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { icon: Users, k: 'Active paid members', v: paidPlans.reduce((a, p) => a + (p.activeMembers || 0), 0) },
            { icon: IndianRupee, k: 'Membership revenue (30 days)', v: inr(data.revenueLast30), sub: `${inr(data.revenueTotal)} all time` },
            { icon: Building2, k: 'Hotels with member prices', v: `${data.hotelsOptedIn} / ${data.hotels.length}` },
            { icon: Crown, k: 'Paid plans on sale', v: paidPlans.filter((p) => p.isActive).length },
          ].map((c) => (
            <div key={c.k} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1"><c.icon size={13} /> {c.k}</p>
              <p className="text-2xl font-black text-gray-900 mt-1">{c.v}</p>
              {c.sub && <p className="text-xs text-gray-500">{c.sub}</p>}
            </div>
          ))}
        </div>
      )}

      <div className="space-y-4">
        <h2 className="font-bold text-gray-900">Plans</h2>
        {(data?.plans || []).map((p) => <PlanEditor key={p.id} plan={p} onSaved={loadOverview} />)}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl shadow-sm">
        <div className="p-4 border-b border-gray-100 flex flex-wrap items-center gap-2 justify-between">
          <h2 className="font-bold text-gray-900">Paid members</h2>
          <div className="flex items-center gap-2">
            <select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white">
              {['ACTIVE', 'EXPIRED', 'CANCELLED', 'ALL'].map((s) => <option key={s} value={s}>{s.toLowerCase()}</option>)}
            </select>
            <input aria-label="Search members" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name or email" className="px-3 py-2 border border-gray-200 rounded-lg text-sm" />
            <button type="button" onClick={() => setGrant({ email: '', planId: paidPlans[0]?.id || '', days: paidPlans[0]?.durationDays || 365, note: '' })} className="flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-bold bg-amber-500 text-white"><Gift size={14} /> Gift a plan</button>
          </div>
        </div>
        {grant && (
          <form onSubmit={doGrant} className="p-4 border-b border-gray-100 bg-amber-50/50 grid grid-cols-1 md:grid-cols-5 gap-2 items-end">
            <label className="text-xs font-semibold text-gray-600 md:col-span-2">Guest email<input required type="email" value={grant.email} onChange={(e) => setGrant({ ...grant, email: e.target.value })} className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" /></label>
            <label className="text-xs font-semibold text-gray-600">Plan<select value={grant.planId} onChange={(e) => setGrant({ ...grant, planId: e.target.value })} className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white">{paidPlans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
            <label className="text-xs font-semibold text-gray-600">Days<input type="number" min="1" value={grant.days} onChange={(e) => setGrant({ ...grant, days: e.target.value })} className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" /></label>
            <label className="text-xs font-semibold text-gray-600 md:col-span-4">Reason<input required value={grant.note} onChange={(e) => setGrant({ ...grant, note: e.target.value })} className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" placeholder="e.g. Service recovery for booking ZIVO-123456" /></label>
            <div className="flex gap-2"><button type="submit" className="px-3 py-2 rounded-lg text-sm font-bold bg-brand-600 text-white">Gift</button><button type="button" aria-label="Close" onClick={() => setGrant(null)} className="p-2 text-gray-400"><X size={16} /></button></div>
          </form>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-gray-500 bg-gray-50"><th className="px-4 py-2">Guest</th><th className="px-4 py-2">Plan</th><th className="px-4 py-2">Period</th><th className="px-4 py-2">Paid</th><th className="px-4 py-2">Status</th><th /></tr></thead>
            <tbody>
              {members.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-500">No members.</td></tr>}
              {members.map((m) => (
                <tr key={m.id} className="border-t border-gray-100">
                  <td className="px-4 py-2.5"><p className="font-semibold text-gray-900">{m.user?.name}</p><p className="text-xs text-gray-500">{m.user?.email}</p></td>
                  <td className="px-4 py-2.5">{m.plan}</td>
                  <td className="px-4 py-2.5 text-xs text-gray-600">{m.startsAt ? `${new Date(m.startsAt).toLocaleDateString('en-IN')} – ${new Date(m.endsAt).toLocaleDateString('en-IN')}` : '—'}</td>
                  <td className="px-4 py-2.5 text-xs">{m.paymentMethod === 'ADMIN' ? `Gift${m.note ? ` · ${m.note}` : ''}` : `${inr(m.pricePaid)} · ${m.paymentMethod === 'WALLET' ? 'Zivo Cash' : 'online'}`}</td>
                  <td className="px-4 py-2.5 text-xs font-semibold">{m.status.toLowerCase()}</td>
                  <td className="px-4 py-2.5 text-right">{m.status === 'ACTIVE' && <button type="button" onClick={() => cancel(m)} className="text-xs font-semibold text-gray-500 hover:text-red-600">Cancel</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl shadow-sm">
        <h2 className="p-4 border-b border-gray-100 font-bold text-gray-900">Hotels&apos; member prices <span className="text-xs font-normal text-gray-500">(set by each hotel in the extranet; hotel-funded)</span></h2>
        <table className="w-full text-sm">
          <tbody>
            {(data?.hotels || []).map((h) => (
              <tr key={h.id} className="border-t border-gray-100 first:border-0">
                <td className="px-4 py-2.5"><p className="font-semibold text-gray-900">{h.name}</p><p className="text-xs text-gray-500">{h.city}</p></td>
                <td className="px-4 py-2.5">{h.memberDiscountPercent > 0 ? <span className="font-bold text-green-700">{h.memberDiscountPercent}% off for members</span> : <span className="text-gray-400">Not offered</span>}</td>
                <td className="px-4 py-2.5 text-right"><button type="button" onClick={() => setHotelPct(h)} className="text-xs font-semibold text-brand-600">Change</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AdminMembership;
