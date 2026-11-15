import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { getHotelById, trackEvent } from '../services/api';
import { getImageUrl } from '../utils/image';
import { useBooking } from '../context/BookingContext';
import {
  MapPin, Star, CheckCircle2,
  CalendarDays, Users, BedDouble, ShieldCheck, ChevronDown, ChevronUp, Flame, CreditCard
} from 'lucide-react';
import { useExperiment, useAllExperiments } from '../context/ExperimentContext';

// ─── Helpers ──────────────────────────────────────────────────────────────────
const formatDate = (dateStr) => {
  if (!dateStr) return 'Select date';
  try { return new Date(dateStr).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }); }
  catch { return dateStr; }
};

const getNights = (checkIn, checkOut) => {
  if (!checkIn || !checkOut) return 1;
  const diff = new Date(checkOut) - new Date(checkIn);
  const n = Math.ceil(diff / 86400000);
  return n > 0 ? n : 1;
};

const fmt = (v) => `₹${Number(v).toLocaleString('en-IN')}`;

// ─── Meal Plan Badge ──────────────────────────────────────────────────────────
const MEAL_LABELS = {
  NONE: { label: 'Room Only (EP)', icon: '🏨', color: 'bg-gray-50 border-gray-200 text-gray-700' },
  BREAKFAST: { label: 'Breakfast Included (CP)', icon: '☕', color: 'bg-amber-50 border-amber-200 text-amber-800' },
  // Plans are stored with these codes (MealPlan enum); without them every plan showed as "Room Only"
  EP: { label: 'Room Only (EP)', icon: '🏨', color: 'bg-gray-50 border-gray-200 text-gray-700' },
  CP: { label: 'Breakfast Included (CP)', icon: '☕', color: 'bg-amber-50 border-amber-200 text-amber-800' },
  MAP: { label: 'Half Board (MAP)', icon: '🍽️', color: 'bg-orange-50 border-orange-200 text-orange-800' },
  AP: { label: 'Full Board (AP)', icon: '🍴', color: 'bg-green-50 border-green-200 text-green-800' },
  HALF_BOARD: { label: 'Half Board (MAP)', icon: '🍽️', color: 'bg-orange-50 border-orange-200 text-orange-800' },
  FULL_BOARD: { label: 'Full Board (AP)', icon: '🍴', color: 'bg-green-50 border-green-200 text-green-800' },
};

// A photo that hides itself (grey tile) if the file can't be loaded, instead of a broken icon
const GalleryImage = ({ src, alt }) => {
  const [failed, setFailed] = useState(false);
  if (failed) return <div className="w-full h-full bg-gray-100" aria-label={alt} />;
  return (
    <img src={getImageUrl(src)} alt={alt} onError={() => setFailed(true)}
      className="w-full h-full object-cover hover:scale-105 transition-transform duration-700" />
  );
};

// The property's cancellation policy (CancellationPolicy.policyCode)
const CANCELLATION_TEXT = {
  FREE_CANCEL_CHECKIN: 'Free cancellation until check-in',
  FREE_CANCEL_24H: 'Free cancellation until 24 hours before check-in, then non-refundable',
  FREE_CANCEL_48H: 'Free cancellation until 48 hours before check-in, then non-refundable',
  FREE_CANCEL_72H: 'Free cancellation until 72 hours before check-in, then non-refundable',
  NON_REFUNDABLE: 'Non-refundable',
};

// Price per night for the chosen dates (daily rates included) when known, else the base price
const nightlyPrice = (plan) => Number(plan?.stayNightlyPrice ?? plan?.basePrice ?? 0);
// After the automatic offer (promotion) the plan qualifies for, if any: what checkout charges
const offerPrice = (plan) => (plan?.offer ? Number(plan.offer.nightlyPriceAfter) : nightlyPrice(plan));
// Same discount rule as checkout (backend promotionDomain.discountFor)
const offerDiscount = (offer, subtotal) => {
  if (!offer || !(subtotal > 0)) return 0;
  let d = offer.discountType === 'FLAT' ? offer.value : (subtotal * offer.value) / 100;
  if (offer.maxDiscount) d = Math.min(d, offer.maxDiscount);
  return Math.round(Math.min(d, subtotal));
};

// ─── Rate Plan Card ───────────────────────────────────────────────────────────
const RatePlanCard = ({ plan, nights, rooms, isSelected, onSelect }) => {
  const meal = MEAL_LABELS[plan.mealPlan] || MEAL_LABELS.NONE;
  const totalPerNight = nightlyPrice(plan);
  const total = totalPerNight * nights * rooms;

  return (
    <div
      onClick={() => onSelect(plan)}
      className={`cursor-pointer border-2 rounded-xl p-4 transition-all ${isSelected
        ? 'border-brand-600 bg-brand-50 shadow-md shadow-brand-100'
        : 'border-gray-200 hover:border-brand-300 hover:bg-gray-50'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${meal.color}`}>
              {meal.icon} {meal.label}
            </span>
          </div>
          <p className="text-sm font-semibold text-gray-900 mt-1.5">{plan.name}</p>
          {plan.cancellationPolicy && (
            <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
              <ShieldCheck size={11} /> {plan.cancellationPolicy}
            </p>
          )}
        </div>
        <div className="text-right shrink-0">
          {plan.offer && <p className="text-xs text-gray-400 line-through">{fmt(totalPerNight)}</p>}
          <p className="text-lg font-extrabold text-gray-900">{fmt(plan.offer ? plan.offer.nightlyPriceAfter : totalPerNight)}<span className="text-xs text-gray-400 font-normal">/night</span></p>
          {nights > 1 && (
            <p className="text-xs text-brand-600 font-medium mt-0.5">{fmt(plan.offer ? total - offerDiscount(plan.offer, total) : total)} total</p>
          )}
        </div>
      </div>
      {plan.offer && (
        <p className="mt-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-green-50 border border-green-200 text-green-700 text-xs font-bold">
          {plan.offer.label} · {plan.offer.name}
        </p>
      )}

      {/* Selection indicator */}
      <div className={`mt-3 flex items-center gap-1.5 text-xs font-semibold ${isSelected ? 'text-brand-600' : 'text-gray-300'}`}>
        <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${isSelected ? 'border-brand-600' : 'border-gray-300'}`}>
          {isSelected && <div className="w-2 h-2 bg-brand-600 rounded-full" />}
        </div>
        {isSelected ? 'Selected' : 'Select this plan'}
      </div>
    </div>
  );
};

// ─── Room Type Section ────────────────────────────────────────────────────────
const RoomTypeSection = ({ roomType, selectedRoomTypeId, selectedRatePlanId, nights, rooms, onSelect }) => {
  const isExpanded = selectedRoomTypeId === roomType.id;

  return (
    <div className={`border rounded-xl overflow-hidden transition-all ${isExpanded ? 'border-brand-300 shadow-sm' : 'border-gray-200'}`}>
      {/* Room type header */}
      <button
        onClick={() => onSelect(roomType, roomType.ratePlans?.[0])}
        className={`w-full flex items-center justify-between p-4 text-left transition-colors ${isExpanded ? 'bg-brand-50' : 'hover:bg-gray-50'}`}
      >
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${isExpanded ? 'bg-brand-100' : 'bg-gray-100'}`}>
            <BedDouble size={18} className={isExpanded ? 'text-brand-600' : 'text-gray-400'} />
          </div>
          <div>
            <p className="font-bold text-gray-900 text-sm">{roomType.name}</p>
            <p className="text-xs text-gray-500">
              {roomType.availableForStay === 0
                ? <span className="text-red-600 font-semibold">Sold out for your dates</span>
                : <>From {fmt(Math.min(...(roomType.ratePlans || []).map(offerPrice), Infinity) === Infinity ? 0 : Math.min(...roomType.ratePlans.map(offerPrice)))} / night{roomType.ratePlans?.some(p => p.offer) && <span className="ml-1 text-green-700 font-semibold">· offer</span>}</>}
              {roomType.ratePlans?.length > 1 && ` · ${roomType.ratePlans.length} rate plans`}
            </p>
          </div>
        </div>
        {isExpanded ? <ChevronUp size={16} className="text-brand-600" /> : <ChevronDown size={16} className="text-gray-400" />}
      </button>

      {/* Rate plans */}
      {isExpanded && (
        <div className="p-4 pt-2 bg-white border-t border-gray-100 space-y-3">
          {roomType.ratePlans?.length > 0 ? (
            roomType.ratePlans.map(plan => (
              <RatePlanCard
                key={plan.id}
                plan={plan}
                nights={nights}
                rooms={rooms}
                isSelected={selectedRatePlanId === plan.id}
                onSelect={(p) => onSelect(roomType, p)}
              />
            ))
          ) : (
            <p className="text-sm text-gray-400 text-center py-4">No active rate plans for this room type.</p>
          )}
        </div>
      )}
    </div>
  );
};

// ─── Detail Page ──────────────────────────────────────────────────────────────
const Detail = () => {
  const { id }       = useParams();
  const navigate     = useNavigate();
  const location     = useLocation();
  const { searchParams, selectedHotel: previousSelection, setSelectedHotel, updateSearchParams } = useBooking();
  const { checkIn, checkOut, guests, rooms } = searchParams;

  // Dates in the link (from search results, a reload or a shared link) take effect here
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    const linked = {
      checkIn: q.get('checkin') || '',
      checkOut: q.get('checkout') || '',
      guests: parseInt(q.get('guests')) || undefined,
      rooms: parseInt(q.get('rooms')) || undefined,
    };
    if (linked.checkIn && linked.checkOut && (linked.checkIn !== checkIn || linked.checkOut !== checkOut)) {
      updateSearchParams(Object.fromEntries(Object.entries(linked).filter(([, v]) => v !== undefined)));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);

  const [hotel,   setHotel]   = useState(null);
  const [loading, setLoading] = useState(true);

  // Selection state
  const [selectedRoomType, setSelectedRoomType] = useState(null);
  const [selectedRatePlan, setSelectedRatePlan] = useState(null);
  const [error, setError] = useState(null);

  // A/B Experiments
  const badgeVariant = useExperiment('badge_urgency');
  const allExperiments = useAllExperiments();

  // Re-fetched when the stay dates change (prices and availability depend on them). Intentionally
  // not on experiment changes, to avoid loops.
  const selectionRef = useRef({});
  selectionRef.current = { room: selectedRoomType?.id, plan: selectedRatePlan?.id };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    // Only the latest request may update the page: the first load (before the link's dates are
    // applied) can finish after the dated one and would show prices without daily rates or offers.
    let stale = false;
    const fetchHotel = async () => {
      try {
        const data = await getHotelById(id, { checkIn, checkOut });
        if (stale) return;
        setHotel(data);
        // Pre-select first room type + cheapest rate plan
        if (data.roomTypes?.length > 0) {
          // Keep the current choice (date change), or the one made before checkout ("Change room
          // or meal plan")
          const wanted = selectionRef.current.room
            ? selectionRef.current
            : previousSelection?.id === data.id ? { room: previousSelection.selectedRoomType?.id, plan: previousSelection.selectedRatePlan?.id } : {};
          const prevRoom = wanted.room ? data.roomTypes.find(rt => rt.id === wanted.room) : null;
          const room = prevRoom || data.roomTypes[0];
          setSelectedRoomType(room);
          const prevPlan = prevRoom ? room.ratePlans?.find(rp => rp.id === wanted.plan) : null;
          if (prevPlan) setSelectedRatePlan(prevPlan);
          else if (room.ratePlans?.length > 0) setSelectedRatePlan(room.ratePlans[0]);
        }
        
        // Analytics
        trackEvent('HOTEL_VIEWED', { hotelName: data.name }, data.id, data.city, allExperiments);
      } catch {
        console.error('Hotel not found');
      } finally {
        if (!stale) setLoading(false);
      }
    };
    if (!hotel) window.scrollTo(0, 0);
    fetchHotel();
    return () => { stale = true; };
  }, [id, checkIn, checkOut]);

  const handleRoomSelect = (roomType, ratePlan) => {
    setSelectedRoomType(roomType);
    setSelectedRatePlan(ratePlan || null);
  };

  const handleBookNow = () => {
    setError(null);
    if (!selectedRoomType || !selectedRatePlan) {
      setError('Please select a room type and rate plan to continue.');
      return;
    }
    if (selectedRoomType.availableForStay === 0) {
      setError(`${selectedRoomType.name} is sold out for these dates. Choose another room or other dates.`);
      return;
    }
    // Without dates the checkout showed "Invalid Date" and a ₹0 total
    if (!checkIn || !checkOut) {
      setError('Please choose your check-in and check-out dates first.');
      return;
    }
    // Pass full booking context including ratePlanId
    setSelectedHotel({
      ...hotel,
      price: nightlyPrice(selectedRatePlan),
      defaultRoomTypeId: selectedRoomType.id,
      defaultRatePlanId: selectedRatePlan.id,
      selectedRoomType,
      selectedRatePlan,
    });
    navigate('/checkout');
  };

  if (loading) return (
    <div className="min-h-screen pt-24 flex items-center justify-center">
      <span className="w-12 h-12 border-4 border-brand-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (!hotel) return (
    <div className="min-h-screen pt-24 flex items-center justify-center">
      <h2 className="text-2xl font-bold text-gray-800">Hotel not found</h2>
    </div>
  );

  const photos = [...(hotel.media || [])]
    .sort((x, y) => (y.isPrimary ? 1 : 0) - (x.isPrimary ? 1 : 0))
    .map(m => m.url)
    .filter(Boolean);
  const nights    = getNights(checkIn, checkOut);
  const nightsN   = rooms || 1;
  const pricePerNight = selectedRatePlan ? nightlyPrice(selectedRatePlan) : 0;
  const baseTotal = pricePerNight * nights * nightsN;
  const offer     = selectedRatePlan?.offer || null;
  const offerOff  = offerDiscount(offer, baseTotal);
  const afterOffer= baseTotal - offerOff;
  const taxRate   = (nights && nightsN ? afterOffer / (nights * nightsN) : pricePerNight) <= 7500 ? 0.05 : 0.18;
  const taxes     = Math.round(afterOffer * taxRate);
  const grandTotal= afterOffer + taxes;

  return (
    <div className="pt-20 pb-20 bg-gray-50">
      {/* Image Gallery: the property's own photos (primary first). It used to read fields the API
          doesn't send, so the main photo was blank and the rest were stock pictures, some broken. */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {photos.length === 0 ? (
          <div className="h-[30vh] rounded-2xl bg-gray-100 flex items-center justify-center text-gray-400 text-sm">Photos coming soon</div>
        ) : (
          <div className={`grid grid-cols-1 ${photos.length > 1 ? 'md:grid-cols-4' : ''} gap-4 h-[40vh] md:h-[60vh] rounded-2xl overflow-hidden`}>
            <div className={`${photos.length > 1 ? 'md:col-span-2' : ''} h-full bg-gray-100`}>
              <GalleryImage src={photos[0]} alt={hotel.name} />
            </div>
            {photos.length > 1 && (
              <div className={`hidden md:grid col-span-2 ${photos.length > 2 ? 'grid-cols-2' : 'grid-cols-1'} gap-4 h-full`}>
                {photos.slice(1, 5).map((src, i) => (
                  <div key={src + i} className={`bg-gray-100 ${photos.length === 3 ? 'row-span-2' : ''}`}>
                    <GalleryImage src={src} alt={`${hotel.name} photo ${i + 2}`} />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col lg:flex-row gap-8">

          {/* Left: Info + Room Selection */}
          <div className="flex-1 space-y-6">
            {/* Hotel Info */}
            <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
              {error && (
                <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl flex items-start gap-2">
                  <ShieldCheck size={16} className="mt-0.5 shrink-0" />
                  <p>{error}</p>
                </div>
              )}
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h1 className="text-3xl font-bold text-gray-900 mb-2">{hotel.name}</h1>
                  <div className="flex items-center text-gray-500 mb-4">
                    <MapPin className="h-5 w-5 mr-1 text-brand-600" />
                    {hotel.location}, {hotel.city}
                  </div>
                  
                  {/* Urgency Badges (A/B Tested) */}
                  {badgeVariant === 'variantA' && (
                    <div className="flex flex-wrap gap-2">
                      {hotel.viewsToday >= 10 && (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-50 text-red-700 text-xs font-bold border border-red-100">
                          <Flame size={14} className="fill-current animate-pulse" /> {hotel.viewsToday} people viewed today
                        </span>
                      )}
                      {hotel.bookingsToday >= 3 && (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-green-50 text-green-700 text-xs font-bold border border-green-100">
                          <CreditCard size={14} /> {hotel.bookingsToday} bookings today
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex items-center bg-green-50 px-3 py-1.5 rounded-lg">
                  <Star className="h-5 w-5 text-green-600 mr-1 fill-current" />
                  <span className="font-bold text-green-700 text-lg">{hotel.rating}</span>
                </div>
              </div>

              <div className="prose max-w-none text-gray-600 mb-8 mt-6">
                <h3 className="text-xl font-bold text-gray-900 mb-3">About this hotel</h3>
                <p className="leading-relaxed">{hotel.description}</p>
              </div>

              {/* Amenities */}
              <div>
                <h3 className="text-xl font-bold text-gray-900 mb-4">Popular Amenities</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-y-4">
                  {/* Only what the property actually listed (a fixed list here claimed a pool,
                      gym and breakfast for every hotel) */}
                  {(hotel.amenities || []).length === 0 && (
                    <p className="text-sm text-gray-400 col-span-full">The property hasn&apos;t listed its amenities yet.</p>
                  )}
                  {(hotel.amenities || []).map((a, i) => (
                    <div key={i} className="flex items-center text-gray-600">
                      <CheckCircle2 className="h-5 w-5 mr-3 text-brand-500" /> {a}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Room Type & Rate Plan Selection */}
            <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
              <h2 className="text-xl font-bold text-gray-900 mb-2">Select Your Room & Plan</h2>
              <p className="text-sm text-gray-500 mb-6">Choose a room type and your preferred meal plan / rate.</p>

              {hotel.roomTypes?.length > 0 ? (
                <div className="space-y-3">
                  {hotel.roomTypes.map(rt => (
                    <RoomTypeSection
                      key={rt.id}
                      roomType={rt}
                      selectedRoomTypeId={selectedRoomType?.id}
                      selectedRatePlanId={selectedRatePlan?.id}
                      nights={nights}
                      rooms={nightsN}
                      onSelect={handleRoomSelect}
                    />
                  ))}
                </div>
              ) : (
                <div className="text-center py-10 text-gray-400">
                  <BedDouble size={32} className="mx-auto mb-3 opacity-40" />
                  <p className="text-sm">No room types configured yet.</p>
                </div>
              )}
            </div>
          </div>

          {/* Right: Booking Widget */}
          <div className="w-full lg:w-[400px]">
            <div className="bg-white p-6 rounded-2xl shadow-xl border border-gray-100 sticky top-24">

              {/* Selected plan summary */}
              {selectedRatePlan ? (
                <div className="mb-4 border-b border-gray-100 pb-4">
                  <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Selected Plan</p>
                  <p className="font-semibold text-gray-900 text-sm">{selectedRatePlan.name}</p>
                  <div className="flex items-baseline mt-1">
                    {offer && <span className="text-base text-gray-400 line-through mr-2">{fmt(nightlyPrice(selectedRatePlan))}</span>}
                    <span className="text-3xl font-extrabold text-gray-900">{fmt(offerPrice(selectedRatePlan))}</span>
                    <span className="text-gray-500 ml-1 font-medium">/ night</span>
                  </div>
                  {offer && <p className="mt-1 text-xs font-bold text-green-700">{offer.label} · {offer.name}, applied at checkout</p>}
                </div>
              ) : (
                <div className="mb-4 pb-4 border-b border-gray-100 text-sm text-amber-600 bg-amber-50 px-3 py-2 rounded-lg">
                  ← Select a room &amp; plan from the left
                </div>
              )}

              {/* Dates & Guests */}
              <div className="space-y-3 mb-6">
                <div className="border border-gray-200 rounded-xl overflow-hidden">
                  <div className="flex border-b border-gray-200">
                    <div className="p-3 w-1/2 border-r border-gray-200">
                      <span className="flex items-center text-xs font-bold uppercase text-gray-500 mb-1">
                        <CalendarDays size={12} className="mr-1" /> Check-in
                      </span>
                      <span className={`font-medium text-sm ${!checkIn ? 'text-gray-400 italic' : 'text-gray-900'}`}>
                        {formatDate(checkIn)}
                      </span>
                    </div>
                    <div className="p-3 w-1/2">
                      <span className="flex items-center text-xs font-bold uppercase text-gray-500 mb-1">
                        <CalendarDays size={12} className="mr-1" /> Check-out
                      </span>
                      <span className={`font-medium text-sm ${!checkOut ? 'text-gray-400 italic' : 'text-gray-900'}`}>
                        {formatDate(checkOut)}
                      </span>
                    </div>
                  </div>
                  <div className="p-3">
                    <span className="flex items-center text-xs font-bold uppercase text-gray-500 mb-1">
                      <Users size={12} className="mr-1" /> Guests &amp; Rooms
                    </span>
                    <span className="font-medium text-sm text-gray-900">
                      {guests || 2} Guest{(guests || 2) > 1 ? 's' : ''}, {nightsN} Room{nightsN > 1 ? 's' : ''}
                    </span>
                  </div>
                </div>

                {/* Price Breakdown */}
                {checkIn && checkOut && selectedRatePlan ? (
                  <div className="bg-gray-50 rounded-xl p-4 text-sm space-y-2">
                    <div className="flex justify-between text-gray-600">
                      <span>{fmt(pricePerNight)} × {nights} night{nights > 1 ? 's' : ''} × {nightsN} room{nightsN > 1 ? 's' : ''}</span>
                      <span>{fmt(baseTotal)}</span>
                    </div>
                    {offerOff > 0 && (
                      <div className="flex justify-between text-green-700 font-medium">
                        <span>{offer.name}</span>
                        <span>− {fmt(offerOff)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-gray-600">
                      <span>Taxes &amp; Fees ({Math.round(taxRate * 100)}%)</span>
                      <span>{fmt(taxes)}</span>
                    </div>
                    <div className="flex justify-between font-bold text-gray-900 pt-2 border-t border-gray-200">
                      <span>Total</span>
                      <span>{fmt(grandTotal)}</span>
                    </div>
                  </div>
                ) : !checkIn && (
                  <p className="text-xs text-amber-600 bg-amber-50 px-3 py-2 rounded-lg font-medium">
                    ⚠ Search with dates for accurate pricing.
                  </p>
                )}
              </div>

              <button
                onClick={handleBookNow}
                disabled={!selectedRatePlan}
                className="w-full bg-brand-600 hover:bg-brand-700 text-white font-bold py-4 px-8 rounded-xl shadow-lg shadow-brand-500/30 transition-all transform hover:-translate-y-0.5 text-lg disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
              >
                {checkIn && checkOut && selectedRatePlan
                  ? `Book Now — ${fmt(grandTotal)}`
                  : 'Book Now'}
              </button>
              <p className="text-center text-sm text-gray-500 mt-4">You won&apos;t be charged yet</p>
              {/* Guests should see the cancellation terms before booking */}
              <p className="text-center text-xs text-gray-500 mt-2 flex items-center justify-center gap-1">
                <ShieldCheck size={12} className="text-green-600" />
                {CANCELLATION_TEXT[hotel.cancellationPolicy] || CANCELLATION_TEXT.FREE_CANCEL_24H}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Detail;
