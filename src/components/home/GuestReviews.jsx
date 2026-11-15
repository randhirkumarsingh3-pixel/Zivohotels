import { Link } from 'react-router-dom';
import { Star, BadgeCheck } from 'lucide-react';

/** Recent 4- and 5-star reviews from guests who stayed (the server sends them only if 3+ exist). */
const GuestReviews = ({ reviews = [] }) => {
  if (reviews.length < 3) return null;
  return (
    <section className="py-14 bg-gray-50" aria-labelledby="reviews-heading">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <h2 id="reviews-heading" className="text-2xl md:text-3xl font-bold text-navy-900 mb-1">What guests say</h2>
        <p className="text-gray-600 mb-6 flex items-center gap-1.5"><BadgeCheck size={18} className="text-green-700" aria-hidden="true" /> Reviews from verified stays</p>
        <div className="flex gap-4 overflow-x-auto snap-x snap-mandatory pb-2 -mx-4 px-4 sm:mx-0 sm:px-0">
          {reviews.map((r) => (
            <figure key={r.id} className="w-[290px] sm:w-[340px] shrink-0 snap-start bg-white rounded-card border border-gray-200 p-5 flex flex-col">
              <div className="flex items-center gap-0.5" role="img" aria-label={`${r.rating} out of 5`}>
                {Array.from({ length: 5 }, (_, i) => <Star key={i} size={16} className={i < Math.round(r.rating) ? 'text-amber-400 fill-current' : 'text-gray-300'} aria-hidden="true" />)}
              </div>
              {r.title && <p className="font-bold text-gray-900 mt-2">{r.title}</p>}
              <blockquote className="text-gray-700 mt-2 leading-relaxed line-clamp-5">&ldquo;{r.comment}&rdquo;</blockquote>
              <figcaption className="mt-auto pt-4 text-sm text-gray-600">
                <span className="font-semibold text-gray-900">{r.guest}</span> stayed at{' '}
                <Link to={`/hotel/${r.hotelId}`} className="text-navy-700 font-semibold hover:underline">{r.hotelName}</Link>
                {r.city ? `, ${r.city}` : ''} · {new Date(r.stayedAt).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
};

export default GuestReviews;
