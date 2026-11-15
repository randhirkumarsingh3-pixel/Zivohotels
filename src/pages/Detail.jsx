import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { getHotelById, trackEvent, getMyMembership, previewBookingApi } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { Link as RouterLink } from 'react-router-dom';
import { getImageUrl } from '../utils/image';
import { useBooking } from '../context/BookingContext';
import {
  MapPin, Star,
  CalendarDays, Users, BedDouble, ShieldCheck, ChevronDown, ChevronUp, Flame, CreditCard
} from 'lucide-react';
import { useExperiment, useAllExperiments } from '../context/ExperimentContext';
import PhotoGallery from '../components/hotel/PhotoGallery';
import usePageTitle from '../hooks/usePageTitle';
import { galleryPhotos } from '../components/hotel/galleryPhotos';
import ReviewsSection from '../components/hotel/ReviewsSection';
import { Section, Highlights, AmenitiesSection, PoliciesSection, LocationSection, RoomFeatures } from '../components/hotel/HotelSections';

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

// The property's cancellation policy (CancellationPolicy.policyCode)
const CANCELLATION_TEXT = {
  FREE_CANCEL_CHECKIN: 'Free cancellation until check-in',
  FREE_CANCEL_24H: 'Free cancellation until 24 hours before check-in, then non-refundable',
  FREE_CANCEL_48H: 'Free cancellation until 48 hours before check-in, then non-refundable',
  FREE_CANCEL_72H: 'Free cancellation until 72 hours before check-in, then non-refundable',
  NON_REFUNDABLE: 'Non-refundable',
};

// Price per night for the chosen dates (daily rates included) when known, else the base price
// "Whitefield, Bangalore" + "Bangalore" -> "Whitefield, Bangalore" (no repeated parts)
const placeLine = (...parts) => {
  const seen = new Set();
  return parts.filter(Boolean).flatMap((p) => String(p).split(',')).map((p) => p.trim()).filter((p) => {
    const k = p.toLowerCase();
    if (!p || seen.has(k)) return false;
    seen.add(k);
    return true;
  }).join(', ');
};
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
            <p className="text-xs text-brand-700 font-medium mt-0.5">{fmt(plan.offer ? total - offerDiscount(plan.offer, total) : total)} total</p>
          )}
        </div>
      </div>
      {plan.offer && (
        <p className="mt-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-green-50 border border-green-200 text-green-700 text-xs font-bold">
          {plan.offer.label} · {plan.offer.name}
        </p>
      )}

      {/* Selection indicator */}
      <div className={`mt-3 flex items-center gap-1.5 text-xs font-semibold ${isSelected ? 'text-brand-700' : 'text-gray-300'}`}>
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
  const roomPhoto = (roomType.images?.find((i) => i.isPrimary) || roomType.images?.[0])?.url;

  return (
    <div className={`border rounded-xl overflow-hidden transition-all ${isExpanded ? 'border-brand-300 shadow-sm' : 'border-gray-200'}`}>
      {/* Room type header */}
      <button
        onClick={() => onSelect(roomType, roomType.ratePlans?.[0])}
        className={`w-full flex items-start justify-between gap-3 p-4 text-left transition-colors ${isExpanded ? 'bg-brand-50' : 'hover:bg-gray-50'}`}
      >
        <div className="flex items-start gap-4 min-w-0">
          {roomPhoto ? (
            <img src={getImageUrl(roomPhoto)} alt={roomType.name} loading="lazy" className="w-24 h-20 md:w-32 md:h-24 rounded-lg object-cover bg-gray-100 shrink-0" />
          ) : (
            <div className={`w-12 h-12 rounded-lg flex items-center justify-center shrink-0 ${isExpanded ? 'bg-brand-100' : 'bg-gray-100'}`}>
              <BedDouble size={20} className={isExpanded ? 'text-brand-700' : 'text-gray-400'} />
            </div>
          )}
          <div className="min-w-0 space-y-1.5">
            <p className="font-bold text-gray-900">{roomType.name}</p>
            <p className="text-xs text-gray-500">
              {roomType.availableForStay === 0
                ? <span className="text-red-600 font-semibold">Sold out for your dates</span>
                : <>From {fmt(Math.min(...(roomType.ratePlans || []).map(offerPrice), Infinity) === Infinity ? 0 : Math.min(...roomType.ratePlans.map(offerPrice)))} / night{roomType.ratePlans?.some(p => p.offer) && <span className="ml-1 text-green-700 font-semibold">· offer</span>}</>}
              {roomType.ratePlans?.length > 1 && ` · ${roomType.ratePlans.length} rate plans`}
            </p>
            <RoomFeatures roomType={roomType} />
          </div>
        </div>
        {isExpanded ? <ChevronUp size={16} className="text-brand-700" /> : <ChevronDown size={16} className="text-gray-400" />}
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
  // Membership: member prices (hotel's %) and a paid plan's extra (same rules as checkout)
  const { isAuthenticated, user } = useAuth();
  const [membership, setMembership] = useState(null);
  useEffect(() => {
    if (isAuthenticated && user?.role === 'CUSTOMER') getMyMembership().then((m) => setMembership(m?.current || null)).catch(() => {});
  }, [isAuthenticated, user]);
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

  // The price shown here comes from the same server calculation as checkout (offers, member
  // prices, pay-now saving, GST), so the total doesn't change between this page and checkout.
  // The local estimate below is only shown until it arrives, or if it fails.
  usePageTitle(hotel ? [hotel.name, hotel.city].filter(Boolean).join(', ') : 'Hotel', hotel?.description ? String(hotel.description).slice(0, 155) : undefined);
  const [quote, setQuote] = useState(null);
  const quoteRoomId = selectedRoomType?.id;
  const quotePlanId = selectedRatePlan?.id;
  useEffect(() => {
    setQuote(null);
    if (!hotel?.id || !quoteRoomId || !quotePlanId || !checkIn || !checkOut) return undefined;
    let live = true;
    const t = setTimeout(() => {
      previewBookingApi({
        hotelId: hotel.id, roomTypeId: quoteRoomId, ratePlanId: quotePlanId, checkIn, checkOut,
        adults: searchParams.adults || guests || 2, children: searchParams.children || 0, extraBeds: 0,
        rooms: rooms || 1, paymentType: 'PREPAID',
      }).then((r) => { if (live) setQuote(r?.data || null); }).catch(() => { if (live) setQuote(null); });
    }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [hotel?.id, quoteRoomId, quotePlanId, checkIn, checkOut, guests, rooms, searchParams.adults, searchParams.children, isAuthenticated]);

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

  const photos = galleryPhotos(hotel);
  // Star category from onboarding (1-5, whole number); older listings hold a review score there
  const ratingNum = Number(hotel.rating) || 0;
  const stars = Number.isInteger(ratingNum) && ratingNum >= 1 && ratingNum <= 5 ? ratingNum : 0;
  const nights    = getNights(checkIn, checkOut);
  const nightsN   = rooms || 1;
  const pricePerNight = selectedRatePlan ? nightlyPrice(selectedRatePlan) : 0;
  const baseTotal = pricePerNight * nights * nightsN;
  const offer     = selectedRatePlan?.offer || null;
  const offerOff  = offerDiscount(offer, baseTotal);
  const memberPct = Number(hotel.memberDiscountPercent) || 0;
  const mb        = membership?.benefits;
  const memberHotelOff = membership && mb?.hotelMemberRates ? Math.round(((baseTotal - offerOff) * memberPct) / 100) : 0;
  let   memberZivoOff  = membership?.isPaid ? Math.round(((baseTotal - offerOff - memberHotelOff) * (mb.zivoDiscountPercent || 0)) / 100) : 0;
  if (mb?.zivoDiscountMax > 0) memberZivoOff = Math.min(memberZivoOff, mb.zivoDiscountMax);
  const afterOffer= baseTotal - offerOff - memberHotelOff - memberZivoOff;
  const taxRate   = (nights && nightsN ? afterOffer / (nights * nightsN) : pricePerNight) <= 7500 ? 0.05 : 0.18;
  const taxes     = Math.round(afterOffer * taxRate);
  const estimateTotal = afterOffer + taxes;
  const grandTotal = quote?.totalAmount ?? estimateTotal;
  // Lowest nightly price across rooms (after automatic offers), for the summary at the top
  const allPlans = (hotel.roomTypes || []).filter((rt) => rt.availableForStay !== 0).flatMap((rt) => rt.ratePlans || []);
  const fromPrice = allPlans.length ? Math.min(...allPlans.map(offerPrice).filter((n) => n > 0)) : 0;
  const placeText = placeLine(hotel.area || hotel.location, hotel.city);
  const goRooms = () => document.getElementById('rooms')?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <div className="pt-16 pb-28 lg:pb-20 bg-gray-50">
      {/* Summary first, as on other OTAs: name, rating, place and the lowest price, then the photos */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-4">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1.5">
              {stars > 0 && (
                <span className="inline-flex items-center gap-0.5" role="img" aria-label={`${stars}-star property`}>
                  {Array.from({ length: stars }, (_, i) => <Star key={i} size={14} className="text-amber-400 fill-current" aria-hidden="true" />)}
                </span>
              )}
              {hotel.type && <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">{hotel.type}</span>}
              {hotel.memberDiscountPercent > 0 && <RouterLink to="/membership" className="inline-flex items-center px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 text-xs font-bold">Member price: {hotel.memberDiscountPercent}% off</RouterLink>}
            </div>
            <h1 className="text-2xl md:text-3xl font-bold text-navy-900">{hotel.name}</h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
              <a href="#location" className="inline-flex items-start text-gray-600 hover:text-navy-800">
                <MapPin className="h-4 w-4 mr-1 mt-0.5 text-brand-700 shrink-0" aria-hidden="true" />
                {placeText}
                <span className="ml-2 font-semibold text-navy-700">Map</span>
              </a>
              {hotel.reviewCount > 0 ? (
                <a href="#reviews" className="inline-flex items-center gap-2">
                  <span className="bg-navy-800 text-white px-2 py-0.5 rounded-md text-sm font-bold tabular-nums">{hotel.reviewScore}</span>
                  <span className="text-gray-700 font-medium">{hotel.reviewCount} review{hotel.reviewCount === 1 ? '' : 's'}</span>
                </a>
              ) : <span className="text-gray-500">New on ZivoHotels</span>}
            </div>
          </div>
          {fromPrice > 0 && (
            <div className="hidden md:flex items-center gap-4 shrink-0">
              <div className="text-right">
                <p className="text-xs text-gray-500">From</p>
                <p className="text-2xl font-bold text-gray-900 tabular-nums">{fmt(fromPrice)}<span className="text-sm font-normal text-gray-500"> /night</span></p>
              </div>
              <button type="button" onClick={goRooms} className="px-5 py-3 rounded-lg bg-brand-600 hover:bg-brand-700 text-white font-semibold">See rooms</button>
            </div>
          )}
        </div>
      </div>

      {/* Photos from onboarding (primary first, then the rest and room photos) */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-6">
        <PhotoGallery hotelName={hotel.name} photos={photos} />
      </div>

      {/* Section tabs */}
      <nav aria-label="Hotel sections" className="sticky top-16 z-30 bg-gray-50/95 backdrop-blur border-b border-gray-200 mb-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex gap-6 overflow-x-auto text-sm font-semibold text-gray-600">
          {[['overview', 'Overview'], ['rooms', 'Rooms'], ['amenities', 'Amenities'], ['reviews', 'Reviews'], ['policies', 'Policies'], ['location', 'Location']].map(([sid, label]) => (
            <a key={sid} href={`#${sid}`} className="py-3 border-b-2 border-transparent hover:border-brand-600 hover:text-gray-900 whitespace-nowrap">{label}</a>
          ))}
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col lg:flex-row gap-8">

          {/* Left: Info + Room Selection */}
          <div className="flex-1 space-y-6">
            {/* Hotel Info */}
            <div id="overview" className="bg-white p-6 md:p-8 rounded-2xl shadow-sm border border-gray-100 scroll-mt-28">
              {error && (
                <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl flex items-start gap-2">
                  <ShieldCheck size={16} className="mt-0.5 shrink-0" />
                  <p>{error}</p>
                </div>
              )}
              <h2 className="text-lg font-bold text-gray-900 mb-3">Overview</h2>
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
              <div className="mt-4"><Highlights hotel={hotel} /></div>

              {hotel.description && (
                <div className="mt-6">
                  <h3 className="text-lg font-bold text-gray-900 mb-2">About this property</h3>
                  <p className="text-gray-600 leading-relaxed whitespace-pre-line">{hotel.description}</p>
                </div>
              )}
            </div>

            {/* Room Type & Rate Plan Selection */}
            <div id="rooms" className="bg-white p-6 md:p-8 rounded-2xl shadow-sm border border-gray-100 scroll-mt-28">
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

            <Section id="amenities" title="Amenities">
              <AmenitiesSection amenities={hotel.amenities} />
            </Section>

            <Section id="reviews" title="Guest reviews" subtitle="From guests who stayed here">
              <ReviewsSection hotelId={hotel.id} />
            </Section>

            <Section id="policies" title="Policies & house rules" subtitle="Set by the property. Please read before you book.">
              <PoliciesSection hotel={hotel} />
            </Section>

            <Section id="location" title="Location">
              <LocationSection hotel={hotel} />
            </Section>
          </div>

          {/* Right: Booking Widget */}
          <div className="w-full lg:w-[400px]">
            <div className="bg-white p-6 rounded-2xl shadow-xl border border-gray-100 lg:sticky lg:top-32">

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
                <div className="mb-4 pb-4 border-b border-gray-100 text-sm text-amber-700 bg-amber-50 px-3 py-2 rounded-lg">
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
                {checkIn && checkOut && selectedRatePlan && quote ? (
                  <div className="bg-gray-50 rounded-xl p-4 text-sm space-y-2 tabular-nums">
                    <div className="flex justify-between text-gray-600">
                      <span>{fmt(pricePerNight)} × {nights} night{nights > 1 ? 's' : ''} × {nightsN} room{nightsN > 1 ? 's' : ''}</span>
                      <span>{fmt((quote.roomPrice || 0) + (quote.extraGuestCharges || 0) + (quote.extraBedCharges || 0) + (quote.mealCharges || 0))}</span>
                    </div>
                    {quote.promotionDiscountAmount > 0 && (
                      <div className="flex justify-between text-green-700 font-medium"><span>{quote.promotion?.name || 'Offer'}</span><span>− {fmt(quote.promotionDiscountAmount)}</span></div>
                    )}
                    {quote.memberDiscountAmount > 0 && (
                      <div className="flex justify-between text-green-700 font-medium"><span>Member price</span><span>− {fmt(quote.memberDiscountAmount)}</span></div>
                    )}
                    {quote.prepaidDiscountAmount > 0 && (
                      <div className="flex justify-between text-green-700 font-medium"><span>Pay-now saving</span><span>− {fmt(quote.prepaidDiscountAmount)}</span></div>
                    )}
                    {memberPct > 0 && !membership && (
                      <p className="text-xs text-navy-800 bg-navy-50 rounded-lg px-2 py-1.5">
                        {memberPct}% off for members. {isAuthenticated ? 'Member prices are for guest accounts.' : <><RouterLink to="/login" className="font-bold underline">Log in</RouterLink> or <RouterLink to="/signup" className="font-bold underline">sign up free</RouterLink> to get it.</>}
                      </p>
                    )}
                    <div className="flex justify-between text-gray-600">
                      <span>GST ({quote.taxPercentage ?? Math.round(taxRate * 100)}%)</span>
                      <span>{fmt(quote.taxAmount || 0)}</span>
                    </div>
                    <div className="flex justify-between font-bold text-gray-900 pt-2 border-t border-gray-200">
                      <span>Total if you pay now</span>
                      <span>{fmt(quote.totalAmount)}</span>
                    </div>
                    <p className="text-xs text-gray-500">Part-payment and pay-at-hotel options are at checkout.</p>
                  </div>
                ) : checkIn && checkOut && selectedRatePlan ? (
                  <div className="bg-gray-50 rounded-xl p-4 text-sm space-y-2" aria-busy="true">
                    <div className="h-4 bg-gray-200 rounded animate-pulse w-3/4" />
                    <div className="h-4 bg-gray-200 rounded animate-pulse w-1/2" />
                    <div className="h-5 bg-gray-200 rounded animate-pulse w-2/3" />
                  </div>
                ) : !checkIn && (
                  <p className="text-xs text-amber-700 bg-amber-50 px-3 py-2 rounded-lg font-medium">
                    ⚠ Search with dates for accurate pricing.
                  </p>
                )}
              </div>

              <button
                onClick={handleBookNow}
                disabled={!selectedRatePlan}
                className="w-full bg-brand-600 hover:bg-brand-700 text-white font-bold py-4 px-8 rounded-xl shadow-lg shadow-brand-500/30 transition-all transform hover:-translate-y-0.5 text-lg disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
              >
                {checkIn && checkOut && selectedRatePlan && quote
                  ? `Book now · ${fmt(grandTotal)}`
                  : 'Book now'}
              </button>
              <p className="text-center text-sm text-gray-500 mt-4">You won&apos;t be charged yet</p>
              {/* Guests should see the cancellation terms before booking */}
              <p className="text-center text-xs text-gray-500 mt-2 flex items-center justify-center gap-1">
                <ShieldCheck size={12} className="text-green-700" />
                {CANCELLATION_TEXT[hotel.cancellationPolicy] || CANCELLATION_TEXT.FREE_CANCEL_24H}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Phones: price and Book button always in reach */}
      <div className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-gray-200 shadow-[0_-4px_16px_rgba(6,44,77,0.08)] px-4 py-3" style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
        <div className="flex items-center justify-between gap-3 max-w-7xl mx-auto">
          <div className="min-w-0">
            {checkIn && checkOut && selectedRatePlan && quote ? (
              <>
                <p className="text-lg font-bold text-gray-900 tabular-nums leading-tight">{fmt(grandTotal)}</p>
                <p className="text-xs text-gray-500 truncate">{selectedRoomType?.name} · {nights} night{nights > 1 ? 's' : ''} · incl. GST</p>
              </>
            ) : fromPrice > 0 ? (
              <>
                <p className="text-xs text-gray-500">From</p>
                <p className="text-lg font-bold text-gray-900 tabular-nums leading-tight">{fmt(fromPrice)}<span className="text-sm font-normal text-gray-500"> /night</span></p>
              </>
            ) : <p className="text-sm text-gray-600">Choose your dates</p>}
          </div>
          {selectedRatePlan && checkIn && checkOut ? (
            <button type="button" onClick={handleBookNow} className="shrink-0 px-6 py-3 rounded-lg bg-brand-600 hover:bg-brand-700 text-white font-semibold">Book now</button>
          ) : (
            <button type="button" onClick={goRooms} className="shrink-0 px-6 py-3 rounded-lg bg-brand-600 hover:bg-brand-700 text-white font-semibold">See rooms</button>
          )}
        </div>
      </div>
    </div>
  );
};

export default Detail;
