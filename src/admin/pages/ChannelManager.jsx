import { useState, useEffect, useCallback } from 'react';
import { Network, RefreshCw, KeyRound, Copy, Check, X, AlertTriangle } from 'lucide-react';

/**
 * Admin -> Channel Manager, with ZivoPlus as the OTA.
 *
 * Each property either manages rates & availability in the ZivoPlus extranet, or connects its
 * own channel manager (STAAH, AxisRooms, eZee...). For a connected property we record the provider
 * and the property's code there, map room types / rate plans to the channel manager's codes and
 * issue an API key. The channel manager then pushes ARI to /channel-manager/ari and pulls bookings
 * from /channel-manager/bookings. (This page used to show hard-coded "Booking.com / MakeMyTrip /
 * Agoda" connections as if ZivoPlus were a hotel distributing to other OTAs.)
 */

const API_BASE = import.meta.env.VITE_API_URL || '/api/v1';
const API = `${API_BASE}/admin/channel-manager`;
const headers = () => {
  const token = localStorage.getItem('jwt_token');
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
};
const call = async (url, opts = {}) => {
  const res = await fetch(url, { headers: headers(), ...opts });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.success) throw new Error(json.message || 'Request failed');
  return json.data;
};
const when = (d) => (d ? new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '—');
const STATUS_STYLE = { ACTIVE: 'bg-green-50 text-green-700', PENDING: 'bg-amber-50 text-amber-700', PAUSED: 'bg-gray-100 text-gray-600' };

const ChannelManager = () => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [openId, setOpenId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { setRows(await call(API)); } catch (e) { setError(e.message); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center">
            <Network className="mr-2 h-6 w-6 text-brand-700" /> Channel Manager Connectivity
          </h1>
          <p className="text-gray-500 mt-1 max-w-3xl">
            How each property sends its rates and availability to ZivoPlus: managed in the ZivoPlus extranet,
            or pushed by the property&apos;s own channel manager, which also collects its ZivoPlus bookings.
          </p>
        </div>
        <button type="button" onClick={load} disabled={loading} className="flex items-center gap-2 px-4 py-2 border rounded-lg text-sm font-semibold hover:bg-gray-50">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {error && <div role="alert" className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>}

      <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="text-left px-4 py-3">Property</th>
              <th className="text-left px-4 py-3">Rates &amp; availability</th>
              <th className="text-left px-4 py-3">Status</th>
              <th className="text-left px-4 py-3">Mapping</th>
              <th className="text-left px-4 py-3">Last update received</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-3"><div className="font-semibold text-gray-900">{r.name}</div><div className="text-xs text-gray-500">{r.city || '—'}</div></td>
                <td className="px-4 py-3">
                  {r.mode === 'CHANNEL_MANAGER'
                    ? <span><b>{r.provider}</b><span className="text-gray-500"> · code {r.externalHotelCode || '—'}</span></span>
                    : <span className="text-gray-600">ZivoPlus extranet</span>}
                </td>
                <td className="px-4 py-3">
                  {r.mode === 'CHANNEL_MANAGER'
                    ? <span className={`px-2 py-0.5 rounded text-xs font-bold ${STATUS_STYLE[r.status] || ''}`}>{r.status}</span>
                    : <span className="text-xs text-gray-400">—</span>}
                </td>
                <td className="px-4 py-3 text-xs text-gray-600">
                  {r.mode === 'CHANNEL_MANAGER' && r.coverage
                    ? `${r.coverage.roomsMapped}/${r.coverage.roomsTotal} rooms · ${r.coverage.plansMapped}/${r.coverage.plansTotal} rates`
                    : '—'}
                </td>
                <td className="px-4 py-3 text-xs">
                  <div className="text-gray-700">{r.mode === 'CHANNEL_MANAGER' ? when(r.lastAriAt) : '—'}</div>
                  {r.lastAriError && <div className="text-red-600 flex items-center gap-1 mt-0.5"><AlertTriangle size={12} />{r.lastAriError}</div>}
                </td>
                <td className="px-4 py-3 text-right">
                  <button type="button" onClick={() => setOpenId(r.id)} className="text-brand-700 font-semibold hover:text-brand-700">Configure</button>
                </td>
              </tr>
            ))}
            {!loading && rows.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-400">No properties yet.</td></tr>}
          </tbody>
        </table>
      </div>

      <IntegrationGuide />

      {openId && <ConnectionPanel hotelId={openId} onClose={() => { setOpenId(null); load(); }} />}
    </div>
  );
};

const ConnectionPanel = ({ hotelId, onClose }) => {
  const [c, setC] = useState(null);
  const [form, setForm] = useState(null);
  const [mapping, setMapping] = useState([]);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [newKey, setNewKey] = useState('');
  const [copied, setCopied] = useState(false);

  const apply = (data) => {
    setC(data);
    setForm({ mode: data.mode, provider: data.provider || data.providers[0], externalHotelCode: data.externalHotelCode, status: data.status });
    setMapping(data.roomTypes);
  };
  useEffect(() => { call(`${API}/${hotelId}`).then(apply).catch((e) => setMsg({ type: 'error', text: e.message })); }, [hotelId]);

  const run = async (fn, okText) => {
    setBusy(true); setMsg(null);
    try { await fn(); if (okText) setMsg({ type: 'ok', text: okText }); } catch (e) { setMsg({ type: 'error', text: e.message }); } finally { setBusy(false); }
  };
  const saveConnection = (status) => run(async () => {
    apply(await call(`${API}/${hotelId}`, { method: 'PUT', body: JSON.stringify({ ...form, status: status || form.status }) }));
  }, status === 'ACTIVE' ? 'Connection is active.' : 'Saved.');
  const saveMapping = () => run(async () => {
    apply(await call(`${API}/${hotelId}/mappings`, { method: 'PUT', body: JSON.stringify({ roomTypes: mapping }) }));
  }, 'Mapping saved.');
  const createKey = () => run(async () => {
    if (c.apiKeyHint && !window.confirm('Create a new key? The current key stops working immediately.')) return;
    const { apiKey } = await call(`${API}/${hotelId}/api-key`, { method: 'POST' });
    setNewKey(apiKey);
    apply(await call(`${API}/${hotelId}`));
  });
  const setRoomCode = (i, v) => setMapping((m) => m.map((r, idx) => (idx === i ? { ...r, externalRoomCode: v } : r)));
  const setRateCode = (i, j, v) => setMapping((m) => m.map((r, idx) => (idx === i ? { ...r, ratePlans: r.ratePlans.map((p, k) => (k === j ? { ...p, externalRateCode: v } : p)) } : r)));

  const saved = c && c.mode === 'CHANNEL_MANAGER';
  const input = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none';

  return (
    <div className="fixed inset-0 z-[200] bg-black/30 flex justify-end" role="dialog" aria-modal="true" aria-label="Channel manager connection">
      <div className="bg-white w-full max-w-2xl h-full overflow-y-auto p-6 space-y-6 shadow-2xl">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-gray-400">Channel manager connection</p>
            <h2 className="text-xl font-bold text-gray-900">{c?.hotel.name || 'Loading…'}</h2>
          </div>
          <button type="button" aria-label="Close" onClick={onClose} className="text-gray-400 hover:text-gray-700"><X size={22} /></button>
        </div>

        {msg && <div role={msg.type === 'error' ? 'alert' : 'status'} className={`p-3 rounded-lg text-sm border ${msg.type === 'error' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-green-50 text-green-700 border-green-200'}`}>{msg.text}</div>}

        {form && (
          <>
            <section className="space-y-3">
              <h3 className="font-bold text-gray-900">1. How are rates and availability managed?</h3>
              <div className="grid grid-cols-2 gap-3" role="radiogroup">
                {[{ id: 'EXTRANET', t: 'ZivoPlus extranet', d: 'The property or our team updates them in Inventory & Rates.' },
                  { id: 'CHANNEL_MANAGER', t: 'Channel manager', d: 'Pushed by the property\'s channel manager; bookings are collected by it.' }].map((o) => (
                  <button key={o.id} type="button" role="radio" aria-checked={form.mode === o.id} onClick={() => setForm({ ...form, mode: o.id })}
                    className={`text-left p-4 rounded-xl border-2 ${form.mode === o.id ? 'border-brand-600 bg-brand-50/40' : 'border-gray-200'}`}>
                    <p className="font-bold text-sm text-gray-900">{o.t}</p><p className="text-xs text-gray-500 mt-1">{o.d}</p>
                  </button>
                ))}
              </div>
              {form.mode === 'CHANNEL_MANAGER' && (
                <div className="grid grid-cols-2 gap-3">
                  <label className="text-xs font-semibold text-gray-600">Channel manager
                    <select className={`${input} mt-1`} value={form.provider} onChange={(e) => setForm({ ...form, provider: e.target.value })}>
                      {c.providers.map((p) => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </label>
                  <label className="text-xs font-semibold text-gray-600">Property code at the channel manager
                    <input className={`${input} mt-1`} value={form.externalHotelCode} onChange={(e) => setForm({ ...form, externalHotelCode: e.target.value })} placeholder="e.g. 10234" />
                  </label>
                </div>
              )}
              <div className="flex justify-end">
                <button type="button" disabled={busy} onClick={() => saveConnection(form.mode === 'CHANNEL_MANAGER' ? (c.status === 'ACTIVE' ? 'ACTIVE' : 'PENDING') : undefined)}
                  className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-semibold disabled:opacity-50">Save</button>
              </div>
            </section>

            {saved && (
              <>
                <section className="space-y-3">
                  <h3 className="font-bold text-gray-900">2. API key for {c.provider}</h3>
                  <p className="text-sm text-gray-600">The channel manager sends this key in the <code>X-Api-Key</code> header. It is shown once; only a fingerprint is stored.</p>
                  {newKey ? (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                      <p className="text-xs font-bold text-amber-900 mb-1">Copy this key now. It won&apos;t be shown again.</p>
                      <div className="flex gap-2">
                        <code className="flex-1 text-xs break-all bg-white border rounded px-2 py-1.5">{newKey}</code>
                        <button type="button" onClick={() => { navigator.clipboard?.writeText(newKey); setCopied(true); }} className="px-3 border rounded-lg text-sm flex items-center gap-1">
                          {copied ? <Check size={14} /> : <Copy size={14} />}{copied ? 'Copied' : 'Copy'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-gray-700">{c.apiKeyHint ? <>Current key ends in <b>…{c.apiKeyHint}</b>.</> : 'No key yet.'}</p>
                  )}
                  <button type="button" disabled={busy} onClick={createKey} className="flex items-center gap-2 px-4 py-2 border rounded-lg text-sm font-semibold hover:bg-gray-50">
                    <KeyRound size={14} /> {c.apiKeyHint ? 'Replace key' : 'Create API key'}
                  </button>
                </section>

                <section className="space-y-3">
                  <h3 className="font-bold text-gray-900">3. Map rooms and rates to {c.provider} codes</h3>
                  {mapping.length === 0 ? <p className="text-sm text-gray-500">This property has no active room types. Add them in Room Config.</p> : (
                    <div className="border rounded-xl divide-y">
                      {mapping.map((r, i) => (
                        <div key={r.id} className="p-3 space-y-2">
                          <div className="grid grid-cols-2 gap-3 items-center">
                            <div className="text-sm font-semibold text-gray-900">{r.name}</div>
                            <input aria-label={`${r.name} room code`} className={input} value={r.externalRoomCode} onChange={(e) => setRoomCode(i, e.target.value)} placeholder="Room code" />
                          </div>
                          {r.ratePlans.map((p, j) => (
                            <div key={p.id} className="grid grid-cols-2 gap-3 items-center pl-4">
                              <div className="text-xs text-gray-600">{p.name}</div>
                              <input aria-label={`${r.name} ${p.name} rate code`} className={input} value={p.externalRateCode} onChange={(e) => setRateCode(i, j, e.target.value)} placeholder="Rate code" />
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex justify-end">
                    <button type="button" disabled={busy} onClick={saveMapping} className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-semibold disabled:opacity-50">Save mapping</button>
                  </div>
                </section>

                <section className="space-y-3">
                  <h3 className="font-bold text-gray-900">4. Status</h3>
                  <p className="text-sm text-gray-600">
                    <b>Pending</b>: the channel manager can test. <b>Active</b>: it becomes the source of truth (owners can&apos;t edit rates and availability by hand).
                    <b> Paused</b>: its calls are refused.
                  </p>
                  <div className="flex gap-2">
                    {['PENDING', 'ACTIVE', 'PAUSED'].map((s) => (
                      <button key={s} type="button" disabled={busy} onClick={() => saveConnection(s)} aria-pressed={c.status === s}
                        className={`px-4 py-2 rounded-lg text-sm font-semibold border ${c.status === s ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-gray-700 border-gray-200'}`}>{s.charAt(0) + s.slice(1).toLowerCase()}</button>
                    ))}
                  </div>
                  <p className="text-xs text-gray-500">Last update received: {when(c.lastAriAt)}{c.lastAriError ? ` · ${c.lastAriError}` : ''}</p>
                </section>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
};

const IntegrationGuide = () => {
  const base = `${API_BASE.startsWith('http') ? API_BASE : window.location.origin + API_BASE}/channel-manager`;
  return (
    <details className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
      <summary className="font-bold text-gray-800 cursor-pointer">Integration guide for channel managers</summary>
      <div className="mt-4 space-y-3 text-sm text-gray-700">
        <p>Each property gets its own API key, sent as <code>X-Api-Key</code>. Codes are the ones mapped above.</p>
        <p><b>Check the mapping</b>: <code>GET {base}/property</code></p>
        <p><b>Push rates and availability</b>: <code>POST {base}/ari</code></p>
        <pre className="bg-gray-50 border rounded-lg p-3 text-xs overflow-x-auto">{`{
  "hotelCode": "10234",
  "updates": [
    { "roomCode": "DLX", "rateCode": "BAR", "from": "2027-01-10", "to": "2027-01-15", "available": 3, "price": 4500 },
    { "roomCode": "STD", "from": "2027-01-12", "to": "2027-01-12", "stopSell": true }
  ]
}`}</pre>
        <p className="text-xs text-gray-500"><code>available</code> = rooms left to sell on ZivoPlus; <code>price</code> = per night at base occupancy, before GST (needs a <code>rateCode</code>). Each update is applied or rejected with a reason.</p>
        <p><b>Collect bookings</b>: <code>GET {base}/bookings?since=2027-01-01T00:00:00Z</code> returns new, changed and cancelled bookings (oldest first) with room / rate codes, guest and amounts; pass the returned <code>next</code> as <code>since</code> on the next call.</p>
      </div>
    </details>
  );
};

export default ChannelManager;
