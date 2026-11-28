import { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { Star, Loader2, CheckCircle2, QrCode, BedDouble } from 'lucide-react';
import { apiFetch, getReviewOptions, submitReview } from '../services/api';
import { useAuth } from '../context/AuthContext';
import usePageTitle from '../hooks/usePageTitle';

/**
 * Where the hotel's feedback QR code lands (/feedback/<hotel>). Signed-in guests see their ZivoPlus
 * stays at this hotel (booked by them, or as the named guest) and rate one from check-in day.
 * Without a stay here there is no form.
 */
const API = import.meta.env.VITE_API_URL || '/api/v1';
const cap = (t) => { const v = String(t?.label || t || ''); return v.charAt(0).toUpperCase() + v.slice(1).toLowerCase(); };
const keyOf = (t) => t?.key || t;
const day = (d) => new Date(d).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });

const Stars = ({ value, onChange, label, size = 30 }) => (
  <div role="radiogroup" aria-label={label} className="flex gap-1">
    {[1, 2, 3, 4, 5].map((n) => (
      <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${n} star${n === 1 ? '' : 's'}`} onClick={() => onChange(n)} className="p-0.5">
        <Star size={size} className={n <= value ? 'fill-amber-400 text-amber-400' : 'text-gray-300'} aria-hidden="true" />
      </button>
    ))}
  </div>
);

const ReviewForm = ({ stay, options, onDone }) => {
  const [rating, setRating] = useState(0);
  const [aspects, setAspects] = useState({});
  const [tripType, setTripType] = useState('');
  const [title, setTitle] = useState('');
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    if (!rating) { setError('Choose 1 to 5 stars.'); return; }
    setBusy(true); setError('');
    try {
      const r = await submitReview({ bookingId: stay.bookingId, source: 'QR', rating, aspectRatings: Object.fromEntries(Object.entries(aspects).filter(([, v]) => v)), tripType: tripType || null, title: title.trim() || null, comment: comment.trim() || null });
      onDone(r?.data || r);
    } catch (err) { setError(err.message || 'Could not send your review.'); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={submit} className="space-y-5">
      <div>
        <p className="font-semibold text-gray-900 mb-1">Your rating</p>
        <Stars value={rating} onChange={setRating} label="Overall rating" />
      </div>
      {options?.aspects?.length > 0 && (
        <div className="grid sm:grid-cols-2 gap-3">
          {options.aspects.map((a) => (
            <div key={keyOf(a)}>
              <p className="text-sm text-gray-700">{cap(a)}</p>
              <Stars value={aspects[keyOf(a)] || 0} onChange={(v) => setAspects((x) => ({ ...x, [keyOf(a)]: v }))} label={cap(a)} size={20} />
            </div>
          ))}
        </div>
      )}
      {options?.tripTypes?.length > 0 && (
        <label className="block text-sm font-semibold text-gray-800">Trip type <span className="font-normal text-gray-500">(optional)</span>
          <select value={tripType} onChange={(e) => setTripType(e.target.value)} className="mt-1 w-full border border-gray-300 rounded-xl px-3 py-2.5">
            <option value="">Choose…</option>
            {options.tripTypes.map((t) => <option key={keyOf(t)} value={keyOf(t)}>{cap(t)}</option>)}
          </select>
        </label>
      )}
      <label className="block text-sm font-semibold text-gray-800">Title <span className="font-normal text-gray-500">(optional)</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} className="mt-1 w-full border border-gray-300 rounded-xl px-3 py-2.5" placeholder="Sum up your stay" />
      </label>
      <label className="block text-sm font-semibold text-gray-800">Your review <span className="font-normal text-gray-500">(optional)</span>
        <textarea value={comment} onChange={(e) => setComment(e.target.value)} maxLength={3000} rows={4} className="mt-1 w-full border border-gray-300 rounded-xl px-3 py-2.5" placeholder="What did you like? What could be better?" />
      </label>
      {error && <p role="alert" className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
      <button type="submit" disabled={busy} className="w-full py-3 rounded-full bg-brand-600 hover:bg-brand-700 text-white font-bold disabled:opacity-60">{busy ? 'Sending…' : 'Send my review'}</button>
      <p className="text-xs text-gray-500">Reviews are checked before they&apos;re published. Phone numbers, emails and links are held back. You can edit yours for 48 hours in My Bookings.</p>
    </form>
  );
};

const Feedback = () => {
  const { ref } = useParams();
  const location = useLocation();
  const { isAuthenticated, user } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [options, setOptions] = useState(null);
  const [chosen, setChosen] = useState(null);
  const [sent, setSent] = useState(null);
  usePageTitle(data?.hotel ? `Rate your stay at ${data.hotel.name}` : 'Rate your stay');
  useEffect(() => {
    apiFetch(`${API}/feedback/${encodeURIComponent(ref)}`, { cache: 'no-store' }, 0).then((r) => setData(r?.data || null)).catch((e) => setError(e.message || 'This feedback code isn\'t valid.'));
  }, [ref, isAuthenticated]);
  useEffect(() => { getReviewOptions().then(setOptions).catch(() => {}); }, []);

  const open = (data?.stays || []).filter((s) => s.canReview);
  const stay = chosen || (open.length === 1 ? open[0] : null);
  const box = 'bg-white rounded-2xl border border-gray-200 p-6';

  return (
    <div className="pt-24 pb-16 bg-gray-50 min-h-screen">
      <div className="max-w-xl mx-auto px-4">
        <p className="text-xs font-bold uppercase tracking-wider text-brand-700 flex items-center gap-1.5"><QrCode size={14} aria-hidden="true" /> Guest feedback</p>
        <h1 className="text-2xl md:text-3xl font-bold text-navy-900 mt-1">{data?.hotel ? `How is your stay at ${data.hotel.name}?` : 'Rate your stay'}</h1>
        {data?.hotel?.city && <p className="text-gray-600">{data.hotel.city}</p>}

        <div className="mt-6">
          {error ? <div className={box}><p className="text-gray-800">{error}</p><Link to="/" className="inline-block mt-3 font-semibold text-navy-800 underline">Go to ZivoPlus</Link></div>
            : !data ? <p className="flex items-center gap-2 text-gray-500"><Loader2 className="animate-spin" size={18} /> Loading…</p>
            : !data.signedIn ? (
              <div className={box}>
                <p className="text-gray-800">Sign in with the account you booked with, and we&apos;ll find your stay.</p>
                <Link to="/login" state={{ from: { pathname: location.pathname }, notice: 'Sign in to rate your stay.' }} className="mt-4 block text-center py-3 rounded-full bg-brand-600 text-white font-bold">Sign in</Link>
                <p className="mt-3 text-xs text-gray-500">Only guests with a ZivoPlus booking at this hotel can leave a review.</p>
              </div>
            ) : sent ? (
              <div className={`${box} text-center`}>
                <CheckCircle2 className="mx-auto text-green-700" size={40} aria-hidden="true" />
                <p className="mt-2 font-bold text-gray-900">Thank you for your review</p>
                <p className="text-sm text-gray-600 mt-1">{sent.status === 'APPROVED' ? 'It is published on the hotel page.' : 'It will be published after a quick check.'} The hotel can reply to you.</p>
                <Link to="/my-bookings" className="inline-block mt-4 font-semibold text-navy-800 underline">My Bookings</Link>
              </div>
            ) : data.stays.length === 0 ? (
              <div className={box}>
                <p className="font-semibold text-gray-900">We couldn&apos;t find a ZivoPlus stay at {data.hotel.name} on this account</p>
                <p className="text-sm text-gray-600 mt-1">Reviews are only for guests who booked on ZivoPlus. If you booked with another account{user?.email ? ` (you're signed in as ${user.email})` : ''}, sign out and sign in with that one.</p>
              </div>
            ) : stay ? (
              <div className={box}>
                <p className="text-sm text-gray-700 flex items-center gap-2 mb-5"><BedDouble size={16} aria-hidden="true" /> {stay.roomType || 'Your stay'} · {day(stay.checkIn)} → {day(stay.checkOut)} · {stay.bookingRef}</p>
                <ReviewForm stay={stay} options={options} onDone={setSent} />
                {open.length > 1 && <button type="button" onClick={() => setChosen(null)} className="mt-4 text-sm font-semibold text-navy-800 underline">Choose another stay</button>}
              </div>
            ) : (
              <div className={box}>
                <p className="font-semibold text-gray-900 mb-3">Your stays at {data.hotel.name}</p>
                <ul className="divide-y divide-gray-100">
                  {data.stays.map((s) => (
                    <li key={s.bookingId} className="py-3 flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm text-gray-800">{s.roomType || 'Stay'} · {day(s.checkIn)} → {day(s.checkOut)}<span className="block text-xs text-gray-500">{s.bookingRef}</span></span>
                      {s.canReview ? <button type="button" onClick={() => setChosen(s)} className="px-4 py-2 rounded-full bg-navy-800 text-white text-sm font-semibold">Rate this stay</button>
                        : s.review ? <span className="text-xs text-gray-600">Reviewed{s.review.status !== 'APPROVED' ? ' (being checked)' : ''}{s.review.canEdit ? ' · edit in My Bookings' : ''}</span>
                        : <span className="text-xs text-gray-600">{s.blocker}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
        </div>
      </div>
    </div>
  );
};

export default Feedback;
