import { useState, useEffect, useCallback } from 'react';
import { Wallet, Users, Building2, Search, X, Plus, Minus, Loader2, ArrowDownLeft, ArrowUpRight } from 'lucide-react';

/**
 * Admin -> Wallet Control. (This page showed made-up accounts and balances.)
 *  - Guest wallets (Zivo Cash): total owed to guests, credits and spending, each guest's history,
 *    and credits / debits with a reason (shown to the guest, audited).
 *  - Hotel wallets: each property's balance from its settlements and payouts (on hold, ready,
 *    owed to Zivo, paid out) with its statement.
 */
const API = `${import.meta.env.VITE_API_URL || '/api/v1'}/admin/wallets`;
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
const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

const Drawer = ({ title, sub, onClose, children }) => (
  <div className="fixed inset-0 z-[200] bg-black/30 flex justify-end" role="dialog" aria-modal="true" aria-label={title}>
    <div className="bg-white w-full max-w-xl h-full overflow-y-auto p-6 space-y-5">
      <div className="flex items-start justify-between">
        <div><h3 className="text-lg font-bold text-gray-900">{title}</h3>{sub && <p className="text-sm text-gray-500">{sub}</p>}</div>
        <button type="button" aria-label="Close" onClick={onClose} className="text-gray-400"><X size={20} /></button>
      </div>
      {children}
    </div>
  </div>
);

const GuestDrawer = ({ guest, onClose, onChanged }) => {
  const [data, setData] = useState(null);
  const [form, setForm] = useState({ amount: '', reason: '' });
  const [err, setErr] = useState('');
  const load = useCallback(() => { call(`/guests/${guest.id}`).then(setData).catch((e) => setErr(e.message)); }, [guest.id]);
  useEffect(() => { load(); }, [load]);
  const adjust = async (direction) => {
    setErr('');
    try { await call(`/guests/${guest.id}/adjust`, 'POST', { ...form, direction }); setForm({ amount: '', reason: '' }); load(); onChanged(); } catch (e) { setErr(e.message); }
  };
  return (
    <Drawer title={guest.name} sub={guest.email} onClose={onClose}>
      {!data ? <Loader2 className="animate-spin text-brand-700" /> : (
        <>
          <div className="rounded-xl bg-gray-900 text-white p-4"><p className="text-xs text-gray-400 uppercase tracking-wider font-bold">Zivo Cash balance</p><p className="text-3xl font-black">{inr(data.balance)}</p></div>
          <div className="rounded-xl border border-gray-200 p-4 space-y-2">
            <p className="text-sm font-bold text-gray-800">Credit or debit</p>
            <div className="flex gap-2">
              <input type="number" min="1" step="0.01" aria-label="Amount" placeholder="₹ amount" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className="w-32 px-3 py-2 border border-gray-200 rounded-lg text-sm" />
              <input aria-label="Reason" placeholder="Reason (the guest sees it)" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm" />
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => adjust('CREDIT')} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-bold bg-green-600 text-white"><Plus size={14} /> Credit</button>
              <button type="button" onClick={() => adjust('DEBIT')} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-bold border border-gray-300"><Minus size={14} /> Debit</button>
            </div>
            {err && <p role="alert" className="text-sm text-red-600">{err}</p>}
            <p className="text-xs text-gray-400">Zivo Cash can only be spent on bookings. Use credits for goodwill or to correct a refund.</p>
          </div>
          <ul className="divide-y divide-gray-100 text-sm">
            {data.transactions.length === 0 && <li className="py-3 text-gray-500">No transactions.</li>}
            {data.transactions.map((t) => (
              <li key={t.id} className="py-2.5 flex justify-between gap-3">
                <div className="flex gap-2">
                  {t.type === 'CREDIT' ? <ArrowDownLeft size={15} className="text-green-700 mt-0.5" /> : <ArrowUpRight size={15} className="text-gray-400 mt-0.5" />}
                  <div><p className="text-gray-900">{t.description || t.label}</p><p className="text-xs text-gray-500">{new Date(t.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })} · {t.label}</p></div>
                </div>
                <div className="text-right"><p className={`font-bold ${t.type === 'CREDIT' ? 'text-green-700' : ''}`}>{t.type === 'CREDIT' ? '+' : '−'}{inr(t.amount)}</p>{t.balanceAfter != null && <p className="text-xs text-gray-400">{inr(t.balanceAfter)}</p>}</div>
              </li>
            ))}
          </ul>
        </>
      )}
    </Drawer>
  );
};

const HotelDrawer = ({ hotel, onClose }) => {
  const [data, setData] = useState(null);
  useEffect(() => { call(`/hotels/${hotel.id}`).then(setData).catch(() => setData({ statement: [] })); }, [hotel.id]);
  return (
    <Drawer title={hotel.name} sub={`${hotel.city} · statement`} onClose={onClose}>
      {!data ? <Loader2 className="animate-spin text-brand-700" /> : (
        <>
          <div className="grid grid-cols-2 gap-3 text-sm">
            {[['On hold', data.onHold], ['Ready', data.ready], ['Owed to Zivo', data.owed], ['Paid out', data.paidOut]].map(([k, v]) => (
              <div key={k} className="rounded-xl bg-gray-50 p-3"><p className="text-xs text-gray-500">{k}</p><p className="text-lg font-black">{inr(v)}</p></div>
            ))}
          </div>
          <ul className="divide-y divide-gray-100 text-sm">
            {(data.statement || []).length === 0 && <li className="py-3 text-gray-500">No settlements yet.</li>}
            {(data.statement || []).map((e) => (
              <li key={`${e.kind}-${e.id}`} className="py-2.5 flex justify-between gap-3">
                <div><p className="text-gray-900">{e.title}</p><p className="text-xs text-gray-500">{new Date(e.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}{e.detail ? ` · ${e.detail}` : ''} · {e.status}</p></div>
                <div className="text-right"><p className={`font-bold ${e.amount >= 0 ? 'text-green-700' : ''}`}>{e.amount >= 0 ? '+' : '−'}{inr(Math.abs(e.amount))}</p><p className="text-xs text-gray-400">{inr(e.balance)}</p></div>
              </li>
            ))}
          </ul>
        </>
      )}
    </Drawer>
  );
};

const WalletControl = () => {
  const [tab, setTab] = useState('guests');
  const [overview, setOverview] = useState(null);
  const [guests, setGuests] = useState([]);
  const [search, setSearch] = useState('');
  const [guest, setGuest] = useState(null);
  const [hotel, setHotel] = useState(null);
  const [error, setError] = useState('');

  const loadOverview = useCallback(() => { call('/overview').then(setOverview).catch((e) => setError(e.message)); }, []);
  const loadGuests = useCallback(() => { call(`/guests?search=${encodeURIComponent(search)}`).then(setGuests).catch((e) => setError(e.message)); }, [search]);
  useEffect(() => { loadOverview(); }, [loadOverview]);
  useEffect(() => { const t = setTimeout(loadGuests, 300); return () => clearTimeout(t); }, [loadGuests]);

  return (
    <div className="space-y-6">
      <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><Wallet className="text-brand-700" size={22} /> Wallet Control</h1>
        <p className="text-gray-500 mt-1">Guests&apos; Zivo Cash and what each property is owed or owes.</p>
      </div>
      {error && <p className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</p>}

      {overview && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { k: 'Zivo Cash owed to guests', v: inr(overview.guest.liability), sub: `${overview.guest.walletsWithBalance} guest${overview.guest.walletsWithBalance === 1 ? '' : 's'} with a balance` },
            { k: 'Credited (30 days)', v: inr(overview.guest.creditedLast30), sub: `${inr(overview.guest.spentLast30)} spent on bookings` },
            { k: 'Hotels: on hold + ready', v: inr(overview.hotelTotals.onHold + overview.hotelTotals.ready), sub: `${inr(overview.hotelTotals.ready)} ready to pay` },
            { k: 'Owed by hotels', v: inr(overview.hotelTotals.owed), sub: 'Commission on pay-at-hotel stays' },
          ].map((c) => (
            <div key={c.k} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{c.k}</p>
              <p className="text-2xl font-black text-gray-900 mt-1">{c.v}</p>
              <p className="text-xs text-gray-500">{c.sub}</p>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2" role="tablist">
        {[['guests', 'Guest wallets', Users], ['hotels', 'Hotel wallets', Building2]].map(([id, label, Icon]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold ${tab === id ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600'}`}><Icon size={15} /> {label}</button>
        ))}
      </div>

      {tab === 'guests' ? (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm">
          <div className="p-4 border-b border-gray-100 flex justify-end">
            <div className="relative w-64"><Search size={15} className="absolute left-3 top-2.5 text-gray-400" /><input aria-label="Search guests" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name or email" className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm" /></div>
          </div>
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-gray-500 bg-gray-50"><th className="px-4 py-2">Guest</th><th className="px-4 py-2 text-right">Zivo Cash</th><th className="px-4 py-2">Last movement</th><th /></tr></thead>
            <tbody>
              {guests.length === 0 && <tr><td colSpan={4} className="px-4 py-6 text-center text-gray-500">No guests found.</td></tr>}
              {guests.map((g) => (
                <tr key={g.id} className="border-t border-gray-100">
                  <td className="px-4 py-2.5"><p className="font-semibold text-gray-900">{g.name}</p><p className="text-xs text-gray-500">{g.email}</p></td>
                  <td className="px-4 py-2.5 text-right font-bold">{inr(g.balance)}</td>
                  <td className="px-4 py-2.5 text-xs text-gray-500">{g.updatedAt ? new Date(g.updatedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</td>
                  <td className="px-4 py-2.5 text-right"><button type="button" onClick={() => setGuest(g)} className="px-3 py-1 rounded-lg text-xs font-bold bg-brand-50 text-brand-700">Manage</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-gray-500 bg-gray-50"><th className="px-4 py-2">Property</th><th className="px-4 py-2 text-right">On hold</th><th className="px-4 py-2 text-right">Ready</th><th className="px-4 py-2 text-right">Owed to Zivo</th><th className="px-4 py-2 text-right">Balance</th><th className="px-4 py-2 text-right">Paid out</th><th /></tr></thead>
            <tbody>
              {(overview?.hotels || []).map((h) => (
                <tr key={h.id} className="border-t border-gray-100">
                  <td className="px-4 py-2.5"><p className="font-semibold text-gray-900">{h.name}</p><p className="text-xs text-gray-500">{h.city}{h.nextPayoutDate ? ` · next payout ${new Date(h.nextPayoutDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : ''}</p></td>
                  <td className="px-4 py-2.5 text-right">{inr(h.onHold)}</td>
                  <td className="px-4 py-2.5 text-right">{inr(h.ready)}</td>
                  <td className={`px-4 py-2.5 text-right ${h.owed > 0 ? 'text-red-600 font-semibold' : ''}`}>{inr(h.owed)}</td>
                  <td className="px-4 py-2.5 text-right font-bold">{h.balance < 0 ? '−' : ''}{inr(Math.abs(h.balance))}</td>
                  <td className="px-4 py-2.5 text-right text-gray-500">{inr(h.paidOut)}</td>
                  <td className="px-4 py-2.5 text-right"><button type="button" onClick={() => setHotel(h)} className="px-3 py-1 rounded-lg text-xs font-bold bg-brand-50 text-brand-700">Statement</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {guest && <GuestDrawer guest={guest} onClose={() => setGuest(null)} onChanged={() => { loadGuests(); loadOverview(); }} />}
      {hotel && <HotelDrawer hotel={hotel} onClose={() => setHotel(null)} />}
    </div>
  );
};

export default WalletControl;
