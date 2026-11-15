import { useState } from 'react';
import { MapPin, Star, Heart } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useBooking } from '../context/BookingContext';
import { getImageUrl } from '../utils/image';

const HotelCard = ({ hotel }) => {
  const [imgError, setImgError] = useState(false);
  const { searchParams } = useBooking();
  // Carry the stay dates into the hotel page link so a reload or shared link keeps them
  const detailQuery = searchParams?.checkIn && searchParams?.checkOut
    ? `?${new URLSearchParams({ checkin: searchParams.checkIn, checkout: searchParams.checkOut, guests: String(searchParams.guests || 2), rooms: String(searchParams.rooms || 1) })}`
    : '';

  // Use startingPrice or price from backend (lowest configured rate plan)
  // Guest review score from verified reviews (search sends it as rating; other lists as reviewScore)
  const reviewCount = hotel.reviewCount || 0;
  const reviewScore = hotel.reviewScore ?? hotel.rating;
  // An automatic offer (promotion) lowers the price shown; checkout gives the same discount.
  const offer = hotel.offer || null;
  const listPrice = hotel.startingPrice || hotel.price || 0;
  const displayPrice = offer ? offer.nightlyPriceAfter : listPrice;
  // Only show a struck-through price when there really was a higher one. (It used to invent one at
  // +20%, which advertises a discount that never existed.)
  const originalPrice = offer ? offer.nightlyPriceBefore : (hotel.originalPrice > displayPrice ? hotel.originalPrice : null);
  
  const fallbackImg = "https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=800&q=80";

  return (
    <div className="bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 border border-gray-100 group flex flex-col h-full">
      <div className="relative h-56 sm:h-64 overflow-hidden shrink-0">
        <div className="absolute top-4 right-4 z-10 bg-white/90 backdrop-blur-sm p-2 rounded-full cursor-pointer hover:text-brand-500 transition-colors shadow-sm">
          <Heart className="h-5 w-5" />
        </div>
        {hotel.badges?.isTopRated && (
          <div className="absolute top-4 left-4 z-10 bg-brand-600 text-white text-xs font-bold px-3 py-1 rounded-md shadow-sm">
            Top Rated
          </div>
        )}
        {hotel.badges?.isBestValue && (
          <div className="absolute top-12 left-4 z-10 bg-amber-500 text-white text-xs font-bold px-3 py-1 rounded-md shadow-sm">
            Best Value
          </div>
        )}
        {hotel.badges?.isSoldOut && (
          <div className="absolute inset-0 z-20 bg-black/60 flex items-center justify-center">
            <span className="bg-red-600 text-white font-bold px-4 py-2 rounded-lg text-sm tracking-wide">
              SOLD OUT
            </span>
          </div>
        )}
        {imgError ? (
          <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-navy-600 to-navy-900 text-white">
            <span className="text-4xl font-black opacity-50">
              {hotel.name?.charAt(0) || 'Z'}
            </span>
            <span className="text-xs opacity-40 mt-1 font-medium">{hotel.city}</span>
          </div>
        ) : (
          <img 
            src={getImageUrl(hotel.image || fallbackImg)} 
            alt={hotel.name} 
            className="w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-500"
            onError={() => setImgError(true)}
          />
        )}
      </div>
      
      <div className="p-5 flex flex-col flex-grow">
        <div className="flex justify-between items-start mb-2">
          <div>
            <h3 className="text-lg font-bold text-gray-900 mb-1 group-hover:text-brand-600 transition-colors line-clamp-1">{hotel.name}</h3>
            <div className="flex items-center text-gray-500 text-xs">
              <MapPin className="h-3.5 w-3.5 mr-1" />
              <span className="line-clamp-1">{hotel.location}</span>
            </div>
          </div>
          {reviewCount > 0 ? (
            <div className="flex items-center bg-green-50 px-2 py-1 rounded shrink-0 ml-2" title={`${reviewCount} verified review${reviewCount === 1 ? '' : 's'}`}>
              <Star className="h-3.5 w-3.5 text-green-600 mr-1 fill-current" />
              <span className="font-bold text-green-700 text-sm">{reviewScore}</span>
              <span className="text-[10px] text-green-700/70 ml-1">({reviewCount})</span>
            </div>
          ) : (
            <span className="shrink-0 ml-2 px-2 py-1 rounded bg-gray-50 text-[11px] font-semibold text-gray-500">New</span>
          )}
        </div>
        
        <div className="flex items-center gap-2 mt-4 text-xs font-medium text-gray-500 flex-wrap">
          {hotel.amenities?.slice(0, 3).map((amenity, i) => (
            <span key={i} className="bg-gray-100 px-2 py-1 rounded-md">{amenity}</span>
          )) || <span className="text-gray-400">Standard amenities included</span>}
          {(hotel.amenities?.length > 3) && (
            <span className="text-gray-400">+{hotel.amenities.length - 3} more</span>
          )}
          {hotel.badges?.isFreeCancellation && (
            <span className="bg-green-50 text-green-700 px-2 py-1 rounded-md border border-green-100">Free Cancellation</span>
          )}
          {offer && (
            <span className="bg-green-600 text-white px-2 py-1 rounded-md font-bold" title={offer.name}>{offer.label}</span>
          )}
          {hotel.memberDiscountPercent > 0 && (
            <span className="bg-amber-100 text-amber-800 px-2 py-1 rounded-md font-bold" title="For signed-in members">Member −{hotel.memberDiscountPercent}%</span>
          )}
        </div>
        
        <div className="mt-auto pt-5 border-t border-gray-100 flex justify-between items-end">
          <div>
            {displayPrice > 0 ? (
              <>
                {originalPrice && (
                  <p className="text-xs text-gray-400 line-through mb-0.5">₹{originalPrice.toLocaleString('en-IN')}</p>
                )}
                <div className="flex items-baseline">
                  <span className="text-xl font-extrabold text-gray-900">₹{displayPrice.toLocaleString('en-IN')}</span>
                  <span className="text-xs text-gray-500 ml-1">/ night</span>
                </div>
                <p className="text-[10px] text-green-600 font-medium mt-0.5">+ ₹{Math.round(displayPrice * (displayPrice <= 7500 ? 0.05 : 0.18)).toLocaleString('en-IN')} taxes & fees</p>
              </>
            ) : (
              <p className="text-sm font-semibold text-orange-600">Price not available</p>
            )}
          </div>
          <Link to={`/hotel/${hotel.id}${detailQuery}`} className="bg-gray-900 hover:bg-brand-600 text-white px-5 py-2.5 rounded-xl font-semibold transition-colors text-sm">
            View Details
          </Link>
        </div>
      </div>
    </div>
  );
};

export default HotelCard;
