import { useRef, useState } from 'react';
import { getHotelById } from '../services/api';
import { hourlyQuery } from '../utils/hourly';
import { MapPin, Star, CheckCircle2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { occupancyOf, occParams } from '../utils/occupancy';
import { useBooking } from '../context/BookingContext';
import { getImageUrl } from '../utils/image';
import { amenityLabels } from '../utils/amenityLabels';
import { hotelPath } from '../utils/hotelPath';
import SaveButton from './saved/SaveButton';

/**
 * A hotel in search results and on the home page.
 * layout="grid": photo on top (home rows, phones). layout="row": photo left, details, price right
 * (results page on larger screens, as on other OTAs).
 */
const FALLBACK_IMG = 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=800&q=80';


const scoreWord = (s) => (s >= 4.5 ? 'Exceptional' : s >= 4 ? 'Very good' : s >= 3.5 ? 'Good' : s >= 3 ? 'Pleasant' : 'Rated');

const HotelCard = ({ hotel, layout = 'grid' }) => {
  const [imgError, setImgError] = useState(false);
  const { searchParams } = useBooking();
  const detailQuery = searchParams?.checkIn && searchParams?.checkOut
    ? `?${new URLSearchParams({ checkin: searchParams.checkIn, checkout: searchParams.checkOut, ...occParams(occupancyOf(searchParams)) })}`
    : '';
  // Hourly search results link to the hotel's hourly booking for the same slot
  const href = hotel.hourly
    ? `${hotelPath(hotel)}?${hourlyQuery({ date: hotel.hourly.date, start: hotel.hourly.start || hotel.hourly.nextStart || '10:00', hours: hotel.hourly.hours, guests: searchParams?.guests || 2 })}`
    : hotelPath(hotel, detailQuery);

  // Pointing at (or touching) a card starts loading the hotel page and its details, so the page is
  // usually ready by the time the click lands
  const warmed = useRef(false);
  const warm = () => {
    if (warmed.current || hotel.hourly) return;
    warmed.current = true;
    import('../pages/Detail');
    getHotelById(hotel.id, { checkIn: searchParams?.checkIn, checkOut: searchParams?.checkOut }).catch(() => {});
  };

  const reviewCount = hotel.reviewCount || 0;
  const reviewScore = Number(hotel.reviewScore ?? hotel.rating) || 0;
  const stars = Number(hotel.starRating) || 0;
  const offer = hotel.offer || null;
  const listPrice = hotel.startingPrice || hotel.price || 0;
  const displayPrice = offer ? offer.nightlyPriceAfter : listPrice;
  // A struck-through price only when there really was a higher one
  const originalPrice = offer ? offer.nightlyPriceBefore : (hotel.originalPrice > displayPrice ? hotel.originalPrice : null);
  const amenities = amenityLabels(hotel.amenities);
  // Near-me results also say how far away the hotel is
  const place = [hotel.location || hotel.city, hotel.distanceKm != null ? `${hotel.distanceKm} km away` : ''].filter(Boolean).join(' · ');
  const freeCancel = hotel.freeCancellation || hotel.badges?.isFreeCancellation;
  const soldOut = hotel.badges?.isSoldOut;
  // The dates being looked at go with a saved hotel (for price-drop alerts)
  const occ = occupancyOf(searchParams || {});
  const saveStay = searchParams?.checkIn && searchParams?.checkOut ? { checkIn: searchParams.checkIn, checkOut: searchParams.checkOut, adults: occ.reduce((n, r) => n + (Number(r.adults) || 0), 0) || 2, rooms: occ.length || 1 } : {};
  const row = layout === 'row';

  const photo = (
    <div className={`relative overflow-hidden shrink-0 bg-gray-100 ${row ? 'h-52 md:h-auto md:w-72 md:min-h-[220px]' : 'h-52 sm:h-56'}`}>
      {hotel.badges?.isTopRated && <span className="absolute top-3 left-3 z-10 bg-navy-800 text-white text-xs font-bold px-2.5 py-1 rounded-md">Top rated</span>}
      {!hotel.hourly && <SaveButton hotelId={hotel.id} hotelName={hotel.name} className="absolute top-3 right-3 z-20" stay={saveStay} />}
      {soldOut && (
        <div className="absolute inset-0 z-20 bg-navy-950/60 flex items-center justify-center">
          <span className="bg-white text-gray-900 font-bold px-4 py-2 rounded-lg text-sm">{hotel.hourly ? 'Not free at this time' : 'Sold out for these dates'}</span>
        </div>
      )}
      {imgError ? (
        <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-navy-600 to-navy-900 text-white">
          <span className="text-4xl font-black opacity-50">{hotel.name?.charAt(0) || 'Z'}</span>
        </div>
      ) : (
        <img src={getImageUrl(hotel.image || FALLBACK_IMG, 800)} alt="" loading="lazy" onError={() => setImgError(true)}
          className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
      )}
    </div>
  );

  const score = reviewCount > 0 ? (
    <div className="flex items-center gap-2 shrink-0" title={`${reviewCount} verified review${reviewCount === 1 ? '' : 's'}`}>
      <div className="text-right leading-tight">
        <p className="text-sm font-semibold text-gray-900">{scoreWord(reviewScore)}</p>
        <p className="text-xs text-gray-500">{reviewCount} review{reviewCount === 1 ? '' : 's'}</p>
      </div>
      <span className="bg-navy-800 text-white text-sm font-bold px-2 py-1 rounded-md tabular-nums">{reviewScore.toFixed(1)}</span>
    </div>
  ) : (
    <span className="shrink-0 px-2 py-1 rounded-md bg-gray-100 text-xs font-semibold text-gray-600">New</span>
  );

  const price = displayPrice > 0 ? (
    <div className={row ? 'md:text-right' : ''}>
      {originalPrice && <p className="text-xs text-gray-500 line-through tabular-nums">₹{originalPrice.toLocaleString('en-IN')}</p>}
      <p className="tabular-nums whitespace-nowrap"><span className="text-xl font-bold text-gray-900">₹{displayPrice.toLocaleString('en-IN')}</span><span className="text-xs text-gray-500 ml-1">{hotel.hourly ? `for ${hotel.hourly.hours} hours` : '/ night'}</span></p>
      <p className="text-xs text-gray-500">+ GST</p>
    </div>
  ) : <p className="text-sm font-semibold text-gray-600">Price on request</p>;

  return (
    <article onPointerEnter={warm} onTouchStart={warm} onFocus={warm} className={`group bg-white rounded-card overflow-hidden border border-gray-200 hover:shadow-lg transition-shadow flex h-full ${row ? 'flex-col md:flex-row' : 'flex-col'}`}>
      <Link to={href} tabIndex={-1} aria-hidden="true" className={row ? 'md:flex' : ''}>{photo}</Link>
      <div className={`p-5 flex flex-col flex-grow min-w-0 ${row ? 'md:flex-row md:gap-6' : ''}`}>
        <div className="flex-1 min-w-0">
          <div className="flex justify-between items-start gap-3">
            <div className="min-w-0">
              {stars > 0 && (
                <span className="inline-flex items-center gap-0.5 mb-1" role="img" aria-label={`${stars}-star property`}>
                  {Array.from({ length: stars }, (_, i) => <Star key={i} size={12} className="text-amber-400 fill-current" aria-hidden="true" />)}
                </span>
              )}
              <h3 className="text-lg font-bold text-gray-900 leading-snug line-clamp-2"><Link to={href} className="hover:text-navy-700">{hotel.name}</Link></h3>
              {place && <p className="flex items-center text-gray-600 text-sm mt-0.5"><MapPin className="h-3.5 w-3.5 mr-1 shrink-0 text-brand-700" aria-hidden="true" /><span className="line-clamp-1">{place}</span></p>}
            </div>
            {!row && score}
          </div>

          <div className="flex flex-wrap gap-1.5 mt-3">
            {offer && <span className="bg-green-700 text-white px-2 py-0.5 rounded-md text-xs font-bold" title={offer.name}>{offer.label}</span>}
            {hotel.memberDiscountPercent > 0 && <span className="bg-amber-100 text-amber-900 px-2 py-0.5 rounded-md text-xs font-bold" title="For signed-in members">Member −{hotel.memberDiscountPercent}%</span>}
          </div>
          {freeCancel && <p className="flex items-center gap-1 text-sm text-green-800 font-medium mt-2"><CheckCircle2 size={14} aria-hidden="true" /> Free cancellation</p>}
          {amenities.length > 0 && (
            <p className="text-xs text-gray-600 mt-2 line-clamp-1">{amenities.slice(0, row ? 5 : 3).join(' · ')}{amenities.length > (row ? 5 : 3) ? ` · +${amenities.length - (row ? 5 : 3)} more` : ''}</p>
          )}
        </div>

        <div className={`mt-4 pt-4 border-t border-gray-100 flex justify-between items-end gap-3 ${row ? 'md:mt-0 md:pt-0 md:border-t-0 md:flex-col md:items-end md:justify-between md:w-48 md:shrink-0' : 'mt-auto'}`}>
          {row && <div className="hidden md:block">{score}</div>}
          <div className={`flex items-end justify-between gap-3 w-full ${row ? 'md:flex-col md:items-end' : ''}`}>
            {price}
            <Link to={href} className="shrink-0 bg-brand-600 hover:bg-brand-700 text-white px-4 py-2.5 rounded-lg font-semibold text-sm" aria-label={`See availability at ${hotel.name}`}>{row ? 'See availability' : 'View'}</Link>
          </div>
        </div>
        {row && <div className="md:hidden mt-3">{score}</div>}
      </div>
    </article>
  );
};

export default HotelCard;
