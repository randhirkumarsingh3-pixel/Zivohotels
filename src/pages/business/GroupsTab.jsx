import { useCallback, useEffect, useState } from 'react';
import { Loader2, Plus, Trash2, Users, CheckCircle2, Clock, XCircle, Save, ClipboardList } from 'lucide-react';
import { businessApi } from '../../services/api';

/**
 * ZivoPlus for Business / Partner Hub → Groups: ask a hotel for 9 to 60 rooms, see its quote, book
 * it from the account, and fill in who is in each room (the rooming list).
 */
const inr = (n) => `₹${Math.round(Number(n || 0)).toLocaleString('en-IN')}`;
const day = (d) => (d ? new Date(`${String(d).slice(0, 10)}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
const input = 'mt-1 w-full px-3 py-2.5 border border-gray-300 rounded-lg text-base sm:text-sm disabled:bg-gray-50';
const btn = 'inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold disabled:opacity-50';
const Note = ({ msg }) => (msg ? <p role={msg.ok ? 'status' : 'alert'} className={`text-sm px-3 py-2 rounded-lg ${msg.ok ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'}`}>{msg.text}</p> : null);
const plusDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const STATUS = {
  SUBMITTED: ['bg-blue-50 text-blue-800', 'Waiting for the hotel\'s quote'], QUOTED: ['bg-amber-50 text-amber-900', 'Quote to accept'],
  ACCEPTED: ['bg-green-50 text-green-800', 'Booked'], DECLINED: ['bg-red-50 text-red-800', 'Declined by the hotel'], CANCELLED: ['bg-gray-100 text-gray-600', 'Cancelled'],
};
const MIN = 9; const MAX = 60;

// ─── Rooming list ────────────────────────────────────────────────────────────
export const RoomingList = ({ org, bookingId }) => {
  const [data, setData] = useState(null);
  const [names, setNames] = useState({});
  const [paste, setPaste] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const load = useCallback(() => businessApi.roomingList(org.id, bookingId).then((d) => { setData(d); setNames(Object.fromEntries(d.rooms.map((r) => [r.roomNumber, r.guestName]))); }).catch((e) => setMsg({ ok: false, text: e.message })), [org.id, bookingId]);
  useEffect(() => { load(); }, [load]);
  if (!data) return <p className="text-sm text-gray-500 flex items-center gap-2">{msg ? msg.text : <><Loader2 size={15} className="animate-spin" /> Loading rooms…</>}</p>;
  const rooms = data.rooms.filter((r) => !r.cancelled);
  const fill = () => {
    const list = paste.split(/\r?\n/).map((x) => x.split(/[,\t]/)[0].trim()).filter(Boolean);
    setNames((n) => ({ ...n, ...Object.fromEntries(rooms.slice(0, list.length).map((r, i) => [r.roomNumber, list[i]])) }));
    setMsg({ ok: true, text: `${Math.min(list.length, rooms.length)} names filled in, in room order. Check them, then save.` });
  };
  const save = async () => {
    setBusy(true); setMsg(null);
    try { const d = await businessApi.saveRoomingList(org.id, bookingId, rooms.map((r) => ({ roomNumber: r.roomNumber, guestName: names[r.roomNumber] || '' }))); setData(d); setMsg({ ok: true, text: d.changed ? `Saved: ${d.changed} room${d.changed > 1 ? 's' : ''} updated. The hotel was told.` : 'No changes.' }); } catch (e) { setMsg({ ok: false, text: e.message }); } finally { setBusy(false); }
  };
  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-600">Who is in each room ({data.bookingRef}). {data.editable ? 'You can change it until the day of check-in; the hotel sees the names straight away.' : 'It can\'t be changed any more.'}</p>
      <ol className="grid gap-2 sm:grid-cols-2">
        {rooms.map((r) => (
          <li key={r.roomNumber}>
            <label className="text-xs font-semibold text-gray-700">Room {r.roomNumber} · {r.roomType} · {r.adults} adult{r.adults > 1 ? 's' : ''}
              <input className={input} disabled={!data.editable} value={names[r.roomNumber] || ''} onChange={(e) => setNames({ ...names, [r.roomNumber]: e.target.value })} />
            </label>
          </li>
        ))}
      </ol>
      {data.editable && (
        <details className="rounded-xl bg-gray-50 p-3">
          <summary className="text-sm font-semibold text-gray-800 cursor-pointer">Paste a list of names</summary>
          <textarea rows={4} className={input} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder={'One name per line, in room order\n(from a spreadsheet column, for example)'} />
          <button type="button" onClick={fill} disabled={!paste.trim()} className={`${btn} mt-2 border border-gray-300 bg-white`}>Fill in the rooms</button>
        </details>
      )}
      <Note msg={msg} />
      {data.editable && <button type="button" onClick={save} disabled={busy} className={`${btn} bg-navy-800 text-white`}>{busy ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Save rooming list</button>}
    </div>
  );
};

// ─── Request form ────────────────────────────────────────────────────────────
const RequestForm = ({ org, onDone }) => {
  const [q, setQ] = useState('');
  const [hotels, setHotels] = useState([]);
  const [hotelId, setHotelId] = useState('');
  const [f, setF] = useState({ checkIn: plusDays(14), checkOut: plusDays(16), purpose: '', notes: '' });
  const [lines, setLines] = useState([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  useEffect(() => { const t = setTimeout(() => { businessApi.groupHotels(org.id, q).then(setHotels).catch((e) => setMsg({ ok: false, text: e.message })); }, 250); return () => clearTimeout(t); }, [org.id, q]);
  const hotel = hotels.find((h) => h.id === hotelId);
  const pickHotel = (id) => { setHotelId(id); const h = hotels.find((x) => x.id === id); setLines(h?.roomTypes?.length ? [{ roomTypeId: h.roomTypes[0].id, rooms: 10, adults: 2 }] : []); };
  const total = lines.reduce((t, l) => t + (Number(l.rooms) || 0), 0);
  const setLine = (i, k, v) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, [k]: v } : l)));
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setMsg(null);
    try { await businessApi.requestGroup(org.id, { hotelId, ...f, lines: lines.map((l) => ({ ...l, rooms: Number(l.rooms), adults: Number(l.adults) })) }); onDone('Sent to the hotel. You\'ll be told when it quotes.'); } catch (err) { setMsg({ ok: false, text: err.message }); } finally { setBusy(false); }
  };
  const unused = hotel ? hotel.roomTypes.filter((rt) => !lines.some((l) => l.roomTypeId === rt.id)) : [];
  return (
    <form onSubmit={submit} className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4">
      <h3 className="font-bold text-gray-900">Ask a hotel for a group rate</h3>
      <p className="text-sm text-gray-600">For {MIN} to {MAX} rooms at one hotel: offsites, conferences, training batches, wedding guests. The hotel quotes a rate per room; you book only if it suits you.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-semibold text-gray-800">Find the hotel<input className={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Hotel name or city" /></label>
        <label className="text-sm font-semibold text-gray-800">Hotel<select className={input} value={hotelId} onChange={(e) => pickHotel(e.target.value)} required><option value="">Choose…</option>{hotels.map((h) => <option key={h.id} value={h.id}>{h.name}, {h.city}</option>)}</select></label>
        <label className="text-sm font-semibold text-gray-800">Check-in<input type="date" className={input} min={plusDays(1)} value={f.checkIn} onChange={(e) => setF({ ...f, checkIn: e.target.value })} required /></label>
        <label className="text-sm font-semibold text-gray-800">Check-out<input type="date" className={input} min={f.checkIn} value={f.checkOut} onChange={(e) => setF({ ...f, checkOut: e.target.value })} required /></label>
      </div>
      {hotel && (
        <div className="space-y-2">
          <p className="text-sm font-semibold text-gray-800">Rooms</p>
          {lines.map((l, i) => {
            const rt = hotel.roomTypes.find((x) => x.id === l.roomTypeId);
            return (
              <div key={i} className="grid gap-2 grid-cols-[1fr_5rem_6rem_auto] items-end">
                <label className="text-xs font-semibold text-gray-700">Room type<select className={input} value={l.roomTypeId} onChange={(e) => setLine(i, 'roomTypeId', e.target.value)}>{hotel.roomTypes.filter((x) => x.id === l.roomTypeId || !lines.some((y) => y.roomTypeId === x.id)).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
                <label className="text-xs font-semibold text-gray-700">Rooms<input type="number" min="1" max={MAX} className={input} value={l.rooms} onChange={(e) => setLine(i, 'rooms', e.target.value)} /></label>
                <label className="text-xs font-semibold text-gray-700">Guests each<input type="number" min="1" max={rt?.maxOccupancy || 2} className={input} value={l.adults} onChange={(e) => setLine(i, 'adults', e.target.value)} /></label>
                <button type="button" aria-label="Remove" onClick={() => setLines(lines.filter((_, j) => j !== i))} className="p-2.5 text-gray-500 hover:text-red-700" disabled={lines.length === 1}><Trash2 size={16} /></button>
              </div>
            );
          })}
          {unused.length > 0 && <button type="button" onClick={() => setLines([...lines, { roomTypeId: unused[0].id, rooms: 1, adults: 2 }])} className="text-sm font-semibold text-navy-800 inline-flex items-center gap-1"><Plus size={14} /> Another room type</button>}
          <p className={`text-xs ${total < MIN || total > MAX ? 'text-amber-800' : 'text-gray-600'}`}>{total} rooms{total < MIN ? ` (a group is ${MIN} or more)` : total > MAX ? ` (up to ${MAX})` : ''}</p>
        </div>
      )}
      <label className="block text-sm font-semibold text-gray-800">What it is for<input className={input} value={f.purpose} onChange={(e) => setF({ ...f, purpose: e.target.value })} placeholder="e.g. Annual sales offsite" required /></label>
      <label className="block text-sm font-semibold text-gray-800">Anything else the hotel should know <span className="font-normal text-gray-500">(optional)</span><textarea rows={2} className={input} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="Meeting room, meals, arrival times, budget…" /></label>
      <Note msg={msg} />
      <button type="submit" disabled={busy || !hotel || total < MIN || total > MAX} className={`${btn} bg-brand-600 hover:bg-brand-700 text-white`}>{busy ? <Loader2 size={15} className="animate-spin" /> : <Users size={15} />} Send to the hotel</button>
    </form>
  );
};

// ─── A request and its quote ─────────────────────────────────────────────────
const RequestCard = ({ org, r, desk, onChange }) => {
  const [price, setPrice] = useState(null);
  const [lead, setLead] = useState({ leadName: '', leadPhone: '' });
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState(null);
  const [showRooms, setShowRooms] = useState(false);
  const [c, label] = STATUS[r.status] || STATUS.CANCELLED;
  const open = r.status === 'QUOTED' && desk && !r.quote?.expired;
  useEffect(() => { if (open) businessApi.groupPrice(org.id, r.id).then(setPrice).catch((e) => setMsg({ ok: false, text: e.message })); }, [open, org.id, r.id]);
  const act = async (key, fn) => { setBusy(key); setMsg(null); try { await fn(); await onChange(); } catch (e) { setMsg({ ok: false, text: e.message }); } finally { setBusy(''); } };
  return (
    <li className="bg-white border border-gray-200 rounded-2xl p-5 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-bold text-gray-900">{r.hotel.name}, {r.hotel.city}</p>
          <p className="text-sm text-gray-600">{day(r.checkIn)} to {day(r.checkOut)} · {r.nights} night{r.nights > 1 ? 's' : ''} · {r.rooms} rooms ({r.lines.map((l) => `${l.rooms} × ${l.roomTypeName}`).join(', ')})</p>
          <p className="text-sm text-gray-600">{r.purpose}</p>
        </div>
        <span className={`px-2 py-1 rounded-md text-xs font-bold ${c}`}>{r.quote?.expired ? 'Quote expired' : label}</span>
      </div>
      {r.status === 'DECLINED' && <p className="text-sm text-red-700">The hotel said: {r.declineNote}</p>}
      {r.quote && ['QUOTED', 'ACCEPTED'].includes(r.status) && (
        <div className="rounded-xl bg-gray-50 p-3 text-sm space-y-1">
          {r.quote.lines.map((l) => <div key={l.roomTypeId} className="flex justify-between gap-3"><span>{l.rooms} × {l.roomTypeName} · {l.ratePlanName} · {inr(l.nightlyRate)} a night</span><span>{inr(l.amount)}</span></div>)}
          <div className="flex justify-between font-bold border-t border-gray-200 pt-1"><span>Quoted, before GST</span><span>{inr(r.quote.total)}</span></div>
          {r.quote.note && <p className="text-xs text-gray-600">From the hotel: {r.quote.note}</p>}
          {r.status === 'QUOTED' && <p className="text-xs text-gray-500">Valid until {day(r.quote.validUntil)}.{r.quote.expired ? ' Ask the hotel to quote again.' : ''}</p>}
        </div>
      )}
      {open && (
        <div className="space-y-3">
          {!price ? <p className="text-sm text-gray-500 flex items-center gap-2"><Loader2 size={15} className="animate-spin" /> Working out the price…</p> : (
            <p className="text-sm text-gray-800">You pay <strong>{inr(price.price.total)}</strong> including GST {inr(price.price.tax)}{price.cappedAtPublic ? ' (the website price for these dates is lower than the quote, so you pay that)' : ''}.{!price.canPayNow && price.available != null ? ` Your account has ${inr(price.available)}: top up, or hold the rooms and pay later.` : ''}</p>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-semibold text-gray-800">Group leader<input className={input} value={lead.leadName} onChange={(e) => setLead({ ...lead, leadName: e.target.value })} placeholder="The hotel's contact for the group" /></label>
            <label className="text-sm font-semibold text-gray-800">Leader&apos;s phone<input className={input} inputMode="tel" value={lead.leadPhone} onChange={(e) => setLead({ ...lead, leadPhone: e.target.value })} /></label>
          </div>
          <Note msg={msg} />
          <div className="flex flex-wrap gap-2">
            {price?.canPayNow && <button type="button" disabled={!!busy} onClick={() => act('book', () => businessApi.acceptGroup(org.id, r.id, lead))} className={`${btn} bg-brand-600 hover:bg-brand-700 text-white`}>{busy === 'book' ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />} Book and pay {inr(price.price.total)}</button>}
            {price?.holdUntil && <button type="button" disabled={!!busy} onClick={() => act('hold', () => businessApi.acceptGroup(org.id, r.id, { ...lead, hold: true }))} className={`${btn} border border-gray-300`}>{busy === 'hold' ? <Loader2 size={15} className="animate-spin" /> : <Clock size={15} />} Hold until {new Date(price.holdUntil).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</button>}
            <button type="button" disabled={!!busy} onClick={() => act('cancel', () => businessApi.cancelGroup(org.id, r.id))} className={`${btn} border border-gray-300 text-red-700`}><XCircle size={15} /> Not needed</button>
          </div>
        </div>
      )}
      {!open && msg && <Note msg={msg} />}
      {desk && r.status === 'SUBMITTED' && <button type="button" disabled={!!busy} onClick={() => act('cancel', () => businessApi.cancelGroup(org.id, r.id))} className="text-sm font-semibold text-red-700 underline">Cancel the request</button>}
      {r.status === 'ACCEPTED' && r.bookingId && (
        <div className="space-y-2">
          <button type="button" onClick={() => setShowRooms((s) => !s)} className="text-sm font-semibold text-navy-800 inline-flex items-center gap-1.5"><ClipboardList size={15} /> {showRooms ? 'Hide the rooming list' : 'Rooming list: who is in each room'}</button>
          {showRooms && <RoomingList org={org} bookingId={r.bookingId} />}
        </div>
      )}
    </li>
  );
};

export const GroupsTab = ({ org }) => {
  const [data, setData] = useState(null);
  const [asking, setAsking] = useState(false);
  const [msg, setMsg] = useState(null);
  const load = useCallback(() => businessApi.groups(org.id).then(setData).catch((e) => setMsg({ ok: false, text: e.message })), [org.id]);
  useEffect(() => { load(); }, [load]);
  if (!data) return <p className="text-sm text-gray-500 flex items-center gap-2">{msg ? msg.text : <><Loader2 size={15} className="animate-spin" /> Loading…</>}</p>;
  return (
    <div className="space-y-5">
      {data.desk && (asking
        ? <RequestForm org={org} onDone={(text) => { setAsking(false); setMsg({ ok: true, text }); load(); }} />
        : <button type="button" onClick={() => { setAsking(true); setMsg(null); }} className={`${btn} bg-brand-600 hover:bg-brand-700 text-white`}><Users size={15} /> Ask for a group rate</button>)}
      <Note msg={msg} />
      {data.requests.length === 0 ? <p className="text-sm text-gray-600 bg-white border border-gray-200 rounded-2xl p-5">No group requests yet.</p> : (
        <ul className="space-y-3">{data.requests.map((r) => <RequestCard key={r.id} org={org} r={r} desk={data.desk} onChange={load} />)}</ul>
      )}
    </div>
  );
};

export default GroupsTab;
