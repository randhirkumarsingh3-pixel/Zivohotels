import { useState, useEffect, useCallback } from 'react';
import { Star, BadgeCheck, MessageSquareReply, Camera } from 'lucide-react';
import { getReviews } from '../../services/api';
import { getImageUrl } from '../../utils/image';

/**
 * Verified guest reviews on the hotel page: score, rating split, aspect scores, most mentioned
 * tags, and the reviews themselves (sort, filter by stars / photos / trip type) with the hotel's
 * replies. Only published reviews from guests who stayed are shown.
 */
const ASPECT_LABEL = { cleanliness: 'Cleanliness', staff: 'Staff & service', comfort: 'Room comfort', location: 'Location', value: 'Value for money' };
const TRIP_LABEL = { BUSINESS: 'Business trip', COUPLE: 'Couple', FAMILY: 'Family', FRIENDS: 'Friends', SOLO: 'Solo traveller' };
const scoreLabel = (s) => (s >= 4.5 ? 'Exceptional' : s >= 4 ? 'Very good' : s >= 3.5 ? 'Good' : s >= 3 ? 'Pleasant' : s > 0 ? 'Okay' : '');

const Stars = ({ value, size = 14 }) => (
  <span className="inline-flex gap-0.5" aria-label={`${value} out of 5`}>
    {[1, 2, 3, 4, 5].map((n) => <Star key={n} size={size} className={n <= Math.round(value) ? 'text-amber-400 fill-amber-400' : 'text-gray-200 fill-gray-200'} />)}
  </span>
);

const ReviewCard = ({ r }) => {
  const [open, setOpen] = useState(false);
  const long = (r.comment || '').length > 320;
  return (
    <article className="py-5 border-b border-gray-100 last:border-0">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-brand-50 text-brand-700 font-bold flex items-center justify-center shrink-0">{(r.guest || 'G')[0]}</div>
          <div>
            <p className="font-semibold text-gray-900 text-sm flex items-center gap-1.5">{r.guest}{r.verified && <span className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-green-700"><BadgeCheck size={13} /> Verified stay</span>}</p>
            <p className="text-xs text-gray-500">
              {[r.tripType && TRIP_LABEL[r.tripType], r.roomType, r.stayedIn && `Stayed ${new Date(r.stayedIn).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}`, r.nights && `${r.nights} night${r.nights === 1 ? '' : 's'}`].filter(Boolean).join(' · ')}
            </p>
          </div>
        </div>
        <div className="text-right shrink-0">
          <span className="inline-flex items-center gap-1 bg-green-50 text-green-700 font-bold text-sm px-2 py-0.5 rounded"><Star size={12} className="fill-current" /> {r.rating}</span>
          <p className="text-[11px] text-gray-400 mt-1">{new Date(r.publishedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
        </div>
      </div>
      {r.title && <h4 className="font-bold text-gray-900 mt-3">{r.title}</h4>}
      {r.comment && (
        <p className="text-sm text-gray-700 leading-relaxed mt-1 whitespace-pre-line">
          {long && !open ? `${r.comment.slice(0, 320)}…` : r.comment}
          {long && <button type="button" onClick={() => setOpen((o) => !o)} className="ml-1 text-brand-600 font-semibold text-sm">{open ? 'Show less' : 'Read more'}</button>}
        </p>
      )}
      {r.tags?.length > 0 && <div className="flex flex-wrap gap-1.5 mt-2">{r.tags.map((t) => <span key={t} className="px-2 py-0.5 rounded-full bg-gray-100 text-[11px] text-gray-600">{t}</span>)}</div>}
      {r.photos?.length > 0 && (
        <div className="flex gap-2 mt-3 flex-wrap">
          {r.photos.map((p) => (
            <a key={p.url} href={getImageUrl(p.url)} target="_blank" rel="noopener noreferrer"><img src={getImageUrl(p.url)} alt="Guest photo" loading="lazy" className="w-20 h-20 rounded-lg object-cover border border-gray-100" /></a>
          ))}
        </div>
      )}
      {r.reply && (
        <div className="mt-3 ml-4 pl-4 border-l-2 border-brand-200">
          <p className="text-xs font-bold text-gray-900 flex items-center gap-1"><MessageSquareReply size={13} className="text-brand-600" /> Response from the property</p>
          <p className="text-sm text-gray-600 mt-1 whitespace-pre-line">{r.reply.text}</p>
        </div>
      )}
    </article>
  );
};

const ReviewsSection = ({ hotelId }) => {
  const [data, setData] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [filters, setFilters] = useState({ sort: 'recent', rating: '', withPhotos: '', tripType: '' });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (nextPage, f) => {
    setLoading(true);
    try {
      const params = Object.fromEntries(Object.entries({ ...f, page: nextPage, limit: 5 }).filter(([, v]) => v !== '' && v !== undefined));
      const d = await getReviews(hotelId, params);
      setData(d);
      setReviews((prev) => (nextPage === 1 ? d.reviews : [...prev, ...d.reviews]));
      setPage(nextPage);
    } catch {
      setData((d) => d || { summary: { count: 0 }, reviews: [] });
    } finally {
      setLoading(false);
    }
  }, [hotelId]);

  useEffect(() => { load(1, filters); }, [load, filters]);

  if (!data) return <p className="text-sm text-gray-400">Loading reviews…</p>;
  const s = data.summary;
  if (!s.count) {
    return (
      <div className="text-center py-6">
        <Star className="mx-auto text-gray-200 mb-2" size={32} />
        <p className="font-semibold text-gray-700">No reviews yet</p>
        <p className="text-sm text-gray-500">Only guests who stayed here can review it, from the day after check-in.</p>
      </div>
    );
  }
  const setF = (k, v) => setFilters((f) => ({ ...f, [k]: v }));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="flex md:flex-col items-center md:items-start gap-4 md:gap-1">
          <div className="w-16 h-16 rounded-2xl bg-green-600 text-white flex items-center justify-center text-2xl font-black">{s.score}</div>
          <div>
            <p className="text-lg font-bold text-gray-900 md:mt-2">{scoreLabel(s.score)}</p>
            <p className="text-sm text-gray-500">{s.count} verified review{s.count === 1 ? '' : 's'}</p>
            {s.replyRate > 0 && <p className="text-xs text-gray-400 mt-1">Property replies to {s.replyRate}% of reviews</p>}
          </div>
        </div>
        <div className="space-y-1.5">
          {[5, 4, 3, 2, 1].map((n) => {
            const c = s.distribution?.[n] || 0;
            return (
              <button key={n} type="button" onClick={() => setF('rating', filters.rating === String(n) ? '' : String(n))} className={`w-full flex items-center gap-2 text-xs ${filters.rating === String(n) ? 'font-bold text-gray-900' : 'text-gray-600'}`} aria-pressed={filters.rating === String(n)}>
                <span className="w-6 text-right">{n}★</span>
                <span className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden"><span className="block h-full bg-amber-400" style={{ width: `${(c / s.count) * 100}%` }} /></span>
                <span className="w-6 text-left">{c}</span>
              </button>
            );
          })}
        </div>
        <div className="space-y-2">
          {Object.entries(s.aspects || {}).map(([k, v]) => (
            <div key={k} className="text-xs">
              <div className="flex justify-between text-gray-600"><span>{ASPECT_LABEL[k] || k}</span><span className="font-bold text-gray-900">{v}</span></div>
              <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden mt-0.5"><div className="h-full bg-green-500" style={{ width: `${(v / 5) * 100}%` }} /></div>
            </div>
          ))}
        </div>
      </div>

      {s.topTags?.length > 0 && (
        <div>
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Guests mention</p>
          <div className="flex flex-wrap gap-2">{s.topTags.map((t) => <span key={t.tag} className="px-3 py-1 rounded-full bg-gray-50 border border-gray-200 text-xs text-gray-700">{t.tag} <span className="text-gray-400">({t.count})</span></span>)}</div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 pt-4">
        <select aria-label="Sort reviews" value={filters.sort} onChange={(e) => setF('sort', e.target.value)} className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm bg-white">
          <option value="recent">Most recent</option>
          <option value="highest">Highest rated</option>
          <option value="lowest">Lowest rated</option>
        </select>
        <select aria-label="Type of trip" value={filters.tripType} onChange={(e) => setF('tripType', e.target.value)} className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm bg-white">
          <option value="">All travellers</option>
          {Object.entries(TRIP_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <button type="button" aria-pressed={filters.withPhotos === 'true'} onClick={() => setF('withPhotos', filters.withPhotos === 'true' ? '' : 'true')}
          className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm border ${filters.withPhotos === 'true' ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-700 border-gray-200'}`}>
          <Camera size={14} /> With photos
        </button>
        {filters.rating && <button type="button" onClick={() => setF('rating', '')} className="text-sm text-brand-600 font-semibold">{filters.rating}★ only ✕</button>}
      </div>

      <div>
        {reviews.length === 0 && !loading && <p className="text-sm text-gray-500 py-4">No reviews match these filters.</p>}
        {reviews.map((r) => <ReviewCard key={r.id} r={r} />)}
      </div>
      {data.pages > page && (
        <button type="button" disabled={loading} onClick={() => load(page + 1, filters)} className="w-full py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50">
          {loading ? 'Loading…' : `Show more reviews (${data.total - reviews.length} more)`}
        </button>
      )}
    </div>
  );
};

export default ReviewsSection;
