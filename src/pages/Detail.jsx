import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getHotelById, trackEvent } from '../services/api';
import { useBooking } from '../context/BookingContext';
import {
  MapPin, Star, Wifi, Coffee, Car, Dumbbell, Waves, CheckCircle2,
  CalendarDays, Users, BedDouble, Utensils, ShieldCheck, ChevronDown, ChevronUp, Flame, CreditCard
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
  HALF_BOARD: { label: 'Half Board (MAP)', icon: '🍽️', color: 'bg-orange-50 border-orange-200 text-orange-800' },
  FULL_BOARD: { label: 'Full Board (AP)', icon: '🍴', color: 'bg-green-50 border-green-200 text-green-800' },
};

// ─── Rate Plan Card ───────────────────────────────────────────────────────────
const RatePlanCard = ({ plan, nights, rooms, isSelected, onSelect }) => {
  const meal = MEAL_LABELS[plan.mealPlan] || MEAL_LABELS.NONE;
  const totalPerNight = plan.basePrice;
  const total = plan.basePrice * nights * rooms;

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
          <p className="text-lg font-extrabold text-gray-900">{fmt(totalPerNight)}<span className="text-xs text-gray-400 font-normal">/night</span></p>
          {nights > 1 && (
            <p className="text-xs text-brand-600 font-medium mt-0.5">{fmt(total)} total</p>
          )}
        </div>
      </div>

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
              From {fmt(roomType.ratePlans?.[0]?.basePrice || 0)} / night
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
  const { searchParams, setSelectedHotel } = useBooking();
  const { checkIn, checkOut, guests, rooms } = searchParams;

  const [hotel,   setHotel]   = useState(null);
  const [loading, setLoading] = useState(true);

  // Selection state
  const [selectedRoomType, setSelectedRoomType] = useState(null);
  const [selectedRatePlan, setSelectedRatePlan] = useState(null);

  // A/B Experiments
  const badgeVariant = useExperiment('badge_urgency');
  const allExperiments = useAllExperiments();

  useEffect(() => {
    const fetchHotel = async () => {
      try {
        const data = await getHotelById(id);
        setHotel(data);
        // Pre-select first room type + cheapest rate plan
        if (data.roomTypes?.length > 0) {
          const firstRoom = data.roomTypes[0];
          setSelectedRoomType(firstRoom);
          if (firstRoom.ratePlans?.length > 0) setSelectedRatePlan(firstRoom.ratePlans[0]);
        }
        
        // Analytics
        trackEvent('HOTEL_VIEWED', { hotelName: data.name }, data.id, data.city, allExperiments);
      } catch {
        console.error('Hotel not found');
      } finally {
        setLoading(false);
      }
    };
    window.scrollTo(0, 0);
    fetchHotel();
  }, [id]);

  const handleRoomSelect = (roomType, ratePlan) => {
    setSelectedRoomType(roomType);
    setSelectedRatePlan(ratePlan || null);
  };

  const handleBookNow = () => {
    if (!selectedRoomType || !selectedRatePlan) {
      alert('Please select a room type and rate plan to continue.');
      return;
    }
    // Pass full booking context including ratePlanId
    setSelectedHotel({
      ...hotel,
      price: selectedRatePlan.basePrice,
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

  const nights    = getNights(checkIn, checkOut);
  const nightsN   = rooms || 1;
  const pricePerNight = selectedRatePlan?.basePrice || 0;
  const baseTotal = pricePerNight * nights * nightsN;
  const taxRate   = pricePerNight <= 7500 ? 0.05 : 0.18;
  const taxes     = Math.round(baseTotal * taxRate);
  const grandTotal= baseTotal + taxes;

  return (
    <div className="pt-20 pb-20 bg-gray-50">
      {/* Image Gallery */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 h-[40vh] md:h-[60vh] rounded-2xl overflow-hidden">
          <div className="md:col-span-2 h-full">
            <img src={hotel.images?.[0]?.url || hotel.image} alt={hotel.name}
              className="w-full h-full object-cover hover:scale-105 transition-transform duration-700" />
          </div>
          <div className="hidden md:grid col-span-2 grid-cols-2 gap-4 h-full">
            {[
              hotel.images?.[1]?.url || 'https://images.unsplash.com/photo-1582719508461-905c673771fd?w=800',
              hotel.images?.[2]?.url || 'https://images.unsplash.com/photo-1542314831-c6a4d14d8c53?w=800',
              'https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?w=800',
              'https://images.unsplash.com/photo-1414235077428-33898ed1e814?w=800',
            ].map((src, i) => (
              <img key={i} src={src} alt="Hotel" className="w-full h-full object-cover hover:scale-105 transition-transform duration-700" />
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col lg:flex-row gap-8">

          {/* Left: Info + Room Selection */}
          <div className="flex-1 space-y-6">
            {/* Hotel Info */}
            <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
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
                  <div className="flex items-center text-gray-600"><Wifi className="h-5 w-5 mr-3 text-brand-500" /> Free WiFi</div>
                  <div className="flex items-center text-gray-600"><Coffee className="h-5 w-5 mr-3 text-brand-500" /> Breakfast</div>
                  <div className="flex items-center text-gray-600"><Waves className="h-5 w-5 mr-3 text-brand-500" /> Swimming Pool</div>
                  <div className="flex items-center text-gray-600"><Dumbbell className="h-5 w-5 mr-3 text-brand-500" /> Fitness Center</div>
                  <div className="flex items-center text-gray-600"><Car className="h-5 w-5 mr-3 text-brand-500" /> Free Parking</div>
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
                    <span className="text-3xl font-extrabold text-gray-900">{fmt(selectedRatePlan.basePrice)}</span>
                    <span className="text-gray-500 ml-1 font-medium">/ night</span>
                  </div>
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
              <p className="text-center text-sm text-gray-500 mt-4">You won't be charged yet</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Detail;
