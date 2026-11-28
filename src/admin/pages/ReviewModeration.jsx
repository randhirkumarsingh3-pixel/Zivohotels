import { useState, useEffect, useCallback } from 'react';
import { Star, ShieldCheck, Flag, CheckCircle2, XCircle, MessageSquareX, Loader2, BadgeCheck, QrCode, Search, Download } from 'lucide-react';
import { getImageUrl } from '../../utils/image';

/**
 * Admin -> Reviews: the moderation queue.
 *  - Held: reviews the automatic check didn't publish (contact details, links, strong language).
 *  - Reported: published reviews a hotel reported, with its reason.
 *  - Published / Not published: search and change any decision.
 * Rejecting needs a note, which the guest sees. Removing a hotel's reply is also possible.
 */
const API = `${import.meta.env.VITE_API_URL || '/api/v1'}/admin`;
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
const QUEUES = [['held', 'Held for check'], ['reported', 'Reported by hotels'], ['published', 'Published'], ['rejected', 'Not published']];
const REJECT_NOTES = ['Contains personal contact details', 'Contains links or advertising', 'Abusive or offensive language', 'Not about this property or stay', 'Contains false or misleading claims'];

/** Feedback QR codes for any property: search, then download the printable card or the image. */
const FeedbackQrPanel = ({ hotels }) => {
  const [q, setQ] = useState('');
  const [pick, setPick] = useState('');
  const term = q.trim().toLowerCase();
  const matches = term ? hotels.filter((h) => `${h.name} ${h.city || ''}`.toLowerCase().includes(term)).slice(0, 8) : [];
  const chosen = hotels.find((h) => h.id === pick);
  return (
    <section className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm" aria-labelledby="fqr-admin-h">
      <h2 id="fqr-admin-h" className="font-bold text-gray-900 flex items-center gap-2"><QrCode size={18} aria-hidden="true" /> Feedback QR codes</h2>
      <p className="text-sm text-gray-600 mt-1">Download a property&apos;s code to print. Guests who booked there scan it, sign in and rate their stay.</p>
      <div className="mt-3 flex flex-col md:flex-row md:items-start gap-3">
        <div className="relative flex-1 max-w-md">
          <label htmlFor="fqr-search" className="sr-only">Find a property</label>
          <Search size={15} className="absolute left-3 top-2.5 text-gray-400" aria-hidden="true" />
          <input id="fqr-search" value={q} onChange={(e) => { setQ(e.target.value); setPick(''); }} placeholder="Find a property by name or city" className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm" autoComplete="off" />
          {matches.length > 0 && !pick && (
            <ul className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-auto" role="listbox">
              {matches.map((h) => (
                <li key={h.id}><button type="button" onClick={() => { setPick(h.id); setQ(h.name); }} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50">{h.name}<span className="text-gray-500">{h.city ? ` · ${h.city}` : ''}</span></button></li>
              ))}
            </ul>
          )}
          {term && !matches.length && !pick && <p className="text-xs text-gray-500 mt-1">No property matches.</p>}
        </div>
        {chosen && (
          <div className="flex flex-wrap gap-2">
            <a href={`${API}/reviews/qr/${chosen.id}.pdf`} download className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-semibold"><Download size={15} aria-hidden="true" /> Printable card (PDF)</a>
            <a href={`${API}/reviews/qr/${chosen.id}.png`} download className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-gray-300 text-sm font-semibold"><Download size={15} aria-hidden="true" /> QR image (PNG)</a>
          </div>
        )}
      </div>
    </section>
  );
};

const ReviewModeration = () => {
  const [queue, setQueue] = useState('held');
  const [hotelId, setHotelId] = useState('');
  const [hotels, setHotels] = useState([]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [notes, setNotes] = useState({});
  const [msg, setMsg] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await call(`/reviews?${new URLSearchParams({ queue, ...(hotelId ? { hotelId } : {}) })}`));
    } catch (e) {
      setMsg({ type: 'error', text: e.message });
    } finally {
      setLoading(false);
    }
  }, [queue, hotelId]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { call('/reviews/hotels').then((h) => setHotels(Array.isArray(h) ? h : [])).catch(() => {}); }, []);

  const decide = async (r, action) => {
    const note = notes[r.id] || '';
    if (action === 'REJECT' && !note.trim()) { setMsg({ type: 'error', text: 'Choose or type a reason before not publishing a review (the guest sees it).' }); return; }
    if (action === 'REMOVE_REPLY' && !confirm('Remove the hotel\'s reply from this review?')) return;
    try {
      await call(`/reviews/${r.id}`, 'PATCH', { action, note });
      setMsg({ type: 'success', text: { APPROVE: 'Review published.', REJECT: 'Review not published. The guest can see the reason.', KEEP: 'Report closed; the review stays published.', REMOVE_REPLY: 'Reply removed.' }[action] });
      load();
    } catch (e) { setMsg({ type: 'error', text: e.message }); }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><ShieldCheck className="text-brand-700" size={22} /> Guest Reviews</h1>
        <p className="text-gray-500 mt-1">Clean reviews are published automatically. Check held reviews and hotels&apos; reports here.</p>
        <div className="flex flex-wrap items-center gap-2 mt-4">
          {QUEUES.map(([id, label]) => (
            <button key={id} type="button" aria-pressed={queue === id} onClick={() => setQueue(id)}
              className={`px-3 py-1.5 rounded-full text-sm font-semibold ${queue === id ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {label}{data?.counts && <span className="ml-1 opacity-70">({data.counts[id]})</span>}
            </button>
          ))}
          <select aria-label="Property" value={hotelId} onChange={(e) => setHotelId(e.target.value)} className="ml-auto px-3 py-1.5 border border-gray-200 rounded-lg text-sm bg-white">
            <option value="">All properties</option>
            {hotels.map((h) => <option key={h.id} value={h.id}>{h.name}{h.city ? ` · ${h.city}` : ''}</option>)}
          </select>
        </div>
      </div>

      <FeedbackQrPanel hotels={hotels} />

      {msg && <div role={msg.type === 'error' ? 'alert' : 'status'} className={`p-3 rounded-lg text-sm border ${msg.type === 'error' ? 'bg-red-50 border-red-200 text-red-700' : 'bg-green-50 border-green-200 text-green-800'}`}>{msg.text}</div>}

      {loading && !data ? <div className="flex justify-center py-12"><Loader2 className="animate-spin text-brand-700" /></div> : (data?.reviews || []).length === 0 ? (
        <div className="bg-white border border-dashed border-gray-300 rounded-xl p-10 text-center text-gray-500">Nothing in this queue.</div>
      ) : (
        <div className="space-y-4">
          {data.reviews.map((r) => (
            <div key={r.id} className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-bold text-gray-900">{r.hotel?.name} <span className="text-xs font-medium text-gray-400">· {r.hotel?.city}</span></p>
                  <p className="text-xs text-gray-500 mt-0.5">{r.guestName} ({r.guestEmail}) <BadgeCheck size={12} className="inline text-green-700" /> · {r.bookingRef} · {new Date(r.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</p>
                </div>
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((n) => <Star key={n} size={15} className={n <= r.rating ? 'text-amber-400 fill-amber-400' : 'text-gray-200 fill-gray-200'} />)}
                  <span className={`ml-2 px-2 py-0.5 rounded text-xs font-bold ${r.status === 'APPROVED' ? 'bg-green-100 text-green-700' : r.status === 'PENDING' ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-700'}`}>{r.status === 'APPROVED' ? 'PUBLISHED' : r.status === 'PENDING' ? 'HELD' : 'NOT PUBLISHED'}</span>
                </div>
              </div>
              {r.status === 'PENDING' && r.moderationNote && <p className="mt-3 text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">Held because: {r.moderationNote}</p>}
              {r.report && !r.report.resolved && <p className="mt-3 text-xs font-semibold text-red-800 bg-red-50 border border-red-100 rounded-lg px-3 py-2 flex items-start gap-1.5"><Flag size={13} className="mt-0.5 shrink-0" /> Hotel reported it: {r.report.reason}</p>}
              {r.status === 'REJECTED' && r.moderationNote && <p className="mt-3 text-xs text-gray-500">Reason given to the guest: {r.moderationNote}</p>}
              {r.title && <h3 className="font-bold text-gray-900 mt-3">{r.title}</h3>}
              {r.comment && <p className="text-sm text-gray-700 mt-1 whitespace-pre-line">{r.comment}</p>}
              {r.photos?.length > 0 && <div className="flex gap-2 mt-3">{r.photos.map((p) => <a key={p.url} href={getImageUrl(p.url, 400)} target="_blank" rel="noopener noreferrer"><img src={getImageUrl(p.url, 400)} alt="" className="w-16 h-16 rounded-lg object-cover border" /></a>)}</div>}
              {r.reply && (
                <div className="mt-3 bg-gray-50 border border-gray-100 rounded-lg p-3">
                  <div className="flex justify-between items-center"><p className="text-xs font-bold text-gray-700">Hotel reply</p>
                    <button type="button" onClick={() => decide(r, 'REMOVE_REPLY')} className="flex items-center gap-1 text-xs font-semibold text-gray-500 hover:text-red-600"><MessageSquareX size={13} /> Remove reply</button></div>
                  <p className="text-sm text-gray-700 mt-1 whitespace-pre-line">{r.reply.text}</p>
                </div>
              )}

              <div className="mt-4 border-t border-gray-100 pt-3 flex flex-wrap items-center gap-2">
                <input list={`notes-${r.id}`} value={notes[r.id] || ''} onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })} placeholder="Note / reason (required to not publish)" aria-label="Moderation note"
                  className="flex-1 min-w-[220px] px-3 py-1.5 border border-gray-200 rounded-lg text-sm" />
                <datalist id={`notes-${r.id}`}>{REJECT_NOTES.map((n) => <option key={n} value={n} />)}</datalist>
                {r.status !== 'APPROVED' && <button type="button" onClick={() => decide(r, 'APPROVE')} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-bold bg-green-600 text-white hover:bg-green-700"><CheckCircle2 size={15} /> Publish</button>}
                {r.report && !r.report.resolved && <button type="button" onClick={() => decide(r, 'KEEP')} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-bold border border-gray-300 hover:bg-gray-50"><CheckCircle2 size={15} /> Keep published</button>}
                {r.status !== 'REJECTED' && <button type="button" onClick={() => decide(r, 'REJECT')} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-bold bg-red-600 text-white hover:bg-red-700"><XCircle size={15} /> Don&apos;t publish</button>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ReviewModeration;
