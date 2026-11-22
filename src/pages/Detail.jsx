import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { getHotelById, trackEvent, getMyMembership, previewBookingApi, getHotelHourly } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { Link as RouterLink } from 'react-router-dom';
import { useBooking } from '../context/BookingContext';
import { MapPin, Star, BedDouble, ShieldCheck, Flame, CreditCard, CalendarDays, Users } from 'lucide-react';
import { useExperiment, useAllExperiments } from '../context/ExperimentContext';
import PhotoGallery from '../components/hotel/PhotoGallery';
import usePageTitle from '../hooks/usePageTitle';
import { galleryPhotos } from '../components/hotel/galleryPhotos';
import ReviewsSection from '../components/hotel/ReviewsSection';
import { occupancyOf, occParams, occToParam, occTotals, parseOcc, roomGuestsLabel } from '../utils/occupancy';
import { Section, Highlights, AmenitiesSection, PoliciesSection, LocationSection } from '../components/hotel/HotelSections';
import RoomCard from '../components/hotel/RoomCard';
import { nightlyPrice, offerPrice, offerDiscount } from '../components/hotel/ratePlans';
import StayBar from '../components/hotel/StayBar';
import SectionTabs from '../components/hotel/SectionTabs';
import OverviewSection from '../components/hotel/OverviewSection';
import SimilarHotels from '../components/hotel/SimilarHotels';
import HourlyBooking from '../components/hotel/HourlyBooking';
import { hourlyFromQuery, defaultHourly, hourlyQuery } from '../utils/hourly';

// Rooms first: they're what guests act on
const SECTIONS = [['rooms', 'Rooms'], ['overview', 'Overview'], ['amenities', 'Amenities'], ['reviews', 'Reviews'], ['policies', 'Policies'], ['location', 'Location']];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const getNights = (checkIn, checkOut) => {
  if (!checkIn || !checkOut) return 1;
  const diff = new Date(checkOut) - new Date(checkIn);
  const n = Math.ceil(diff / 86400000);
  return n > 0 ? n : 1;
};

const fmt = (v) => `₹${Number(v).toLocaleString('en-IN')}`;

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
/** schema.org Hotel data for search engines (name, address, stars, rating, price range). */
const hotelJsonLd = (hotel, stars, fromPrice) => ({
  '@context': 'https://schema.org',
  '@type': 'Hotel',
  name: hotel.name,
  description: hotel.description ? String(hotel.description).slice(0, 300) : undefined,
  url: typeof window !== 'undefined' ? window.location.origin + window.location.pathname : undefined,
  address: { '@type': 'PostalAddress', streetAddress: hotel.location || undefined, addressLocality: hotel.city, addressRegion: hotel.state || undefined, postalCode: hotel.pincode || undefined, addressCountry: 'IN' },
  ...(Number.isFinite(Number(hotel.latitude)) && Number(hotel.latitude) ? { geo: { '@type': 'GeoCoordinates', latitude: Number(hotel.latitude), longitude: Number(hotel.longitude) } } : {}),
  ...(stars ? { starRating: { '@type': 'Rating', ratingValue: stars } } : {}),
  ...(hotel.reviewCount > 0 && hotel.reviewScore ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: hotel.reviewScore, bestRating: 5, reviewCount: hotel.reviewCount } } : {}),
  ...(fromPrice > 0 ? { priceRange: `From ₹${Math.round(fromPrice)} per night` } : {}),
  checkinTime: hotel.checkInTime || undefined,
  checkoutTime: hotel.checkOutTime || undefined,
  amenityFeature: (hotel.amenities || []).slice(0, 20).map((a) => ({ '@type': 'LocationFeatureSpecification', name: String(a).split(':')[0], value: true })),
});

// ─── Rooms of the stay ───────────────────────────────────────────────────────
const guestsIn = (r) => (r?.adults || 0) + (r?.children || 0);
const fitsRoom = (rt, r) => (rt?.maxOccupancy || 2) >= guestsIn(r);
const bookable = (rt) => rt && rt.availableForStay !== 0 && rt.ratePlans?.length > 0;

/**
 * A room type and plan for every room of the stay: [{ roomTypeId, ratePlanId } | null].
 * Keeps each room's current choice while it still exists and fits; a new room takes room 1's
 * choice when it fits, else the first room type big enough.
 */
const chooseRooms = (roomTypes = [], occupancy, current = []) => occupancy.map((r, i) => {
  const valid = (c) => {
    const rt = c && roomTypes.find((t) => t.id === c.roomTypeId);
    const plan = rt?.ratePlans?.find((p) => p.id === c.ratePlanId);
    return rt && plan && fitsRoom(rt, r) ? c : null;
  };
  const kept = valid(current[i]) || valid(current[0]);
  if (kept) return kept;
  const rt = roomTypes.find((t) => bookable(t) && fitsRoom(t, r)) || roomTypes.find((t) => fitsRoom(t, r) && t.ratePlans?.length);
  return rt ? { roomTypeId: rt.id, ratePlanId: rt.ratePlans[0].id } : null;
});

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

  // The link (search results, a reload or a shared link) carries the search: dates, guests, rooms
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    const linked = {};
    if (q.get('checkin') && q.get('checkout')) { linked.checkIn = q.get('checkin'); linked.checkOut = q.get('checkout'); }
    if (parseInt(q.get('guests')) > 0) linked.guests = parseInt(q.get('guests'));
    if (parseInt(q.get('rooms')) > 0) linked.rooms = parseInt(q.get('rooms'));
    const occ = parseOcc(q.get('occ'));
    if (occ) Object.assign(linked, { occupancy: occ, ...occTotals(occ) });
    else if (linked.guests || linked.rooms) {
      // An older link with totals only: keep the rooms already chosen when the totals agree
      const cur = occupancyOf(searchParams);
      const t = occTotals(cur);
      const same = (linked.guests || t.guests) === t.guests && (linked.rooms || t.rooms) === t.rooms;
      linked.occupancy = same ? cur : occupancyOf({ guests: linked.guests || guests, rooms: linked.rooms || rooms });
    }
    delete linked.adults; delete linked.children;
    const differs = ([k, v]) => (k === 'occupancy' ? occToParam(v) !== occToParam(occupancyOf(searchParams)) : searchParams[k] !== v);
    if (Object.entries(linked).some(differs)) updateSearchParams(linked);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);

  // Changes made in the booking panel: kept in the search and in the link (so a reload keeps them).
  // A new check-in waits for its check-out before it is applied.
  const [openPicker, setOpenPicker] = useState(null);
  const [datePickerKey, setDatePickerKey] = useState(0);
  const pendingCheckIn = useRef(null);
  const togglePicker = (name, open) => {
    setOpenPicker(open ? name : null);
    // Closed after choosing only a check-in: show the stay's dates again
    if (name === 'dates' && !open && pendingCheckIn.current) { pendingCheckIn.current = null; setDatePickerKey((k) => k + 1); }
  };
  // Latest values, so two changes in one click (rooms, then guests) both reach the link
  const stay = useRef({});
  stay.current = { checkIn, checkOut, occupancy: occupancyOf(searchParams) };
  const changeStay = (change) => {
    let next = change;
    if ('checkIn' in change) { pendingCheckIn.current = change.checkIn; return; }
    if ('checkOut' in change) {
      if (!change.checkOut) return;
      next = { checkIn: pendingCheckIn.current || stay.current.checkIn, checkOut: change.checkOut };
      pendingCheckIn.current = null;
    }
    // Rooms and guests: the list per room, with its totals for older code
    if (next.occupancy) next = { ...next, guests: occTotals(next.occupancy).guests, rooms: next.occupancy.length };
    const merged = { ...stay.current, ...next };
    stay.current = merged;
    updateSearchParams(next);
    if (merged.checkIn && merged.checkOut) {
      const q = new URLSearchParams(location.search);
      q.set('checkin', merged.checkIn); q.set('checkout', merged.checkOut);
      Object.entries(occParams(merged.occupancy)).forEach(([k, v]) => q.set(k, v));
      navigate({ search: `?${q}` }, { replace: true });
    }
  };

  const [hotel,   setHotel]   = useState(null);
  const [loading, setLoading] = useState(true);

  // Hourly stays: shown as a second way to book when the hotel offers them (?stay=hourly opens it)
  const hourlyInit = useRef(hourlyFromQuery(location.search) || defaultHourly()).current;
  const [mode, setMode] = useState(hourlyFromQuery(location.search) ? 'HOURLY' : 'NIGHTLY');
  const [hourlyOffered, setHourlyOffered] = useState(false);
  useEffect(() => {
    let live = true;
    getHotelHourly(id, hourlyInit.date, hourlyInit.hours)
      .then((o) => { if (live) setHourlyOffered(Boolean(o && (o.roomTypes || []).length)); })
      .catch(() => {});
    return () => { live = false; };
  }, [id, hourlyInit]);
  const switchMode = (m) => {
    setMode(m);
    const q = new URLSearchParams(location.search);
    if (m === 'HOURLY') navigate({ search: `?${hourlyQuery(hourlyInit)}` }, { replace: true });
    else { ['stay', 'date', 'start', 'hours'].forEach((k) => q.delete(k)); navigate({ search: q.toString() ? `?${q}` : '' }, { replace: true }); }
  };
  // The hourly choice stays in the link, so a reload or a shared link keeps it
  const onHourlySlot = useCallback((slot) => {
    const next = `?${hourlyQuery(slot)}`;
    if (window.location.search !== next) navigate({ search: next }, { replace: true });
  }, [navigate]);

  // Selection: a room type and plan for each room of the stay (rooms can differ). The room being
  // chosen for is "active"; the list on the left picks for it.
  const occupancy = occupancyOf(searchParams);
  const occKey = occToParam(occupancy);
  const [roomChoices, setRoomChoices] = useState([]);
  const [activeRoom, setActiveRoom] = useState(0);
  const touchedRooms = useRef(new Set());
  const [error, setError] = useState(null);
  const typeById = (tid) => hotel?.roomTypes?.find((t) => t.id === tid) || null;
  const activeIdx = Math.min(activeRoom, occupancy.length - 1);
  const activeChoice = roomChoices[activeIdx] || null;
  const selectedRoomType = activeChoice ? typeById(activeChoice.roomTypeId) : null;
  const selectedRatePlan = selectedRoomType?.ratePlans?.find((p) => p.id === activeChoice.ratePlanId) || null;
  const chosenRooms = occupancy.map((r, i) => {
    const c = roomChoices[i];
    const rt = c ? typeById(c.roomTypeId) : null;
    return { ...r, roomType: rt, ratePlan: rt?.ratePlans?.find((p) => p.id === c.ratePlanId) || null };
  });

  // A/B Experiments
  const badgeVariant = useExperiment('badge_urgency');
  const allExperiments = useAllExperiments();

  // Re-fetched when the stay dates change (prices and availability depend on them). Intentionally
  // not on experiment changes, to avoid loops.
  const selectionRef = useRef([]);
  selectionRef.current = roomChoices;
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
        // Old links (/hotel/<id>) and renamed hotels move to the readable address, keeping the dates
        if (data?.slug && id !== data.slug) {
          window.history.replaceState(window.history.state, '', `/hotel/${data.slug}${window.location.search}${window.location.hash}`);
        }
        // Keep the current choices (date change), or the ones made before checkout ("Change room
        // or meal plan"); otherwise the first room type that fits each room
        const previous = previousSelection?.id === data.id
          ? (previousSelection.roomSelections || [{ roomType: previousSelection.selectedRoomType, ratePlan: previousSelection.selectedRatePlan }])
            .map((r) => (r.roomType && r.ratePlan ? { roomTypeId: r.roomType.id, ratePlanId: r.ratePlan.id } : null))
          : [];
        setRoomChoices(chooseRooms(data.roomTypes, occupancyOf(searchParams), selectionRef.current.length ? selectionRef.current : previous));
        
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

  // Rooms added, removed or with other guests: keep what still fits
  useEffect(() => {
    if (!hotel?.roomTypes) return;
    setRoomChoices((prev) => chooseRooms(hotel.roomTypes, occupancy, prev));
    setActiveRoom((a) => Math.min(a, occupancy.length - 1));
    touchedRooms.current = new Set([...touchedRooms.current].filter((i) => i < occupancy.length));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [occKey, hotel?.roomTypes]);

  // The price shown here comes from the same server calculation as checkout (offers, member
  // prices, pay-now saving, GST), so the total doesn't change between this page and checkout.
  // The local estimate below is only shown until it arrives, or if it fails.
  usePageTitle(hotel ? [hotel.name, hotel.city].filter(Boolean).join(', ') : 'Hotel', hotel?.description ? String(hotel.description).slice(0, 155) : undefined);
  const [quote, setQuote] = useState(null);
  const [quoteError, setQuoteError] = useState('');
  const roomLines = chosenRooms.every((r) => r.roomType && r.ratePlan)
    ? chosenRooms.map((r) => ({ roomTypeId: r.roomType.id, ratePlanId: r.ratePlan.id, adults: r.adults, children: r.children || 0 }))
    : null;
  const linesKey = roomLines ? JSON.stringify(roomLines) : '';
  useEffect(() => {
    setQuote(null);
    setQuoteError('');
    if (!hotel?.id || !roomLines || !checkIn || !checkOut) return undefined;
    let live = true;
    const t = setTimeout(() => {
      const totals = occTotals(roomLines);
      previewBookingApi({
        hotelId: hotel.id, roomTypeId: roomLines[0].roomTypeId, ratePlanId: roomLines[0].ratePlanId, checkIn, checkOut,
        adults: totals.adults, children: totals.children, extraBeds: 0, rooms: roomLines.length, roomLines, paymentType: 'PREPAID',
      }).then((r) => { if (live) setQuote(r?.data || null); })
        .catch((e) => { if (live) { setQuote(null); setQuoteError(e?.message || ''); } });
    }, 250);
    return () => { live = false; clearTimeout(t); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hotel?.id, linesKey, checkIn, checkOut, isAuthenticated]);

  // Picks the room type and plan for the room being chosen for. The first pick with several rooms
  // also goes to the rooms not chosen yet (when it fits them), so the usual case is one click.
  const handleRoomSelect = (roomType, ratePlan) => {
    if (!roomType || !ratePlan) return;
    const idx = activeIdx;
    if (!fitsRoom(roomType, occupancy[idx])) return;
    setError(null);
    setRoomChoices((prev) => occupancy.map((r, i) => {
      const choice = { roomTypeId: roomType.id, ratePlanId: ratePlan.id };
      if (i === idx) return choice;
      if (!touchedRooms.current.has(i) && fitsRoom(roomType, r)) return choice;
      return prev[i] || null;
    }));
    touchedRooms.current.add(idx);
  };
  const chooseFor = (i) => {
    setActiveRoom(i);
    document.getElementById('rooms')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleBookNow = () => {
    setError(null);
    const missing = chosenRooms.findIndex((r) => !r.roomType || !r.ratePlan);
    if (missing >= 0) {
      setError(occupancy.length > 1 ? `Choose a room and plan for room ${missing + 1}.` : 'Please select a room type and rate plan to continue.');
      return;
    }
    const tooSmall = chosenRooms.findIndex((r) => !fitsRoom(r.roomType, r));
    if (tooSmall >= 0) {
      setError(`${chosenRooms[tooSmall].roomType.name} fits up to ${chosenRooms[tooSmall].roomType.maxOccupancy || 2} guests. Choose a bigger room for room ${tooSmall + 1}.`);
      return;
    }
    // Enough rooms of each type left for the dates
    const perType = new Map();
    chosenRooms.forEach((r) => perType.set(r.roomType.id, (perType.get(r.roomType.id) || 0) + 1));
    for (const [tid, n] of perType) {
      const rt = typeById(tid);
      if (rt.availableForStay === 0) {
        setError(`${rt.name} is sold out for these dates. Choose another room or other dates.`);
        return;
      }
      if (rt.availableForStay != null && rt.availableForStay < n) {
        setError(`Only ${rt.availableForStay} ${rt.name} left for your dates. Choose another room type for the other room${n - rt.availableForStay > 1 ? 's' : ''}.`);
        return;
      }
    }
    // Without dates the checkout showed "Invalid Date" and a ₹0 total
    if (!checkIn || !checkOut) {
      setError('Please choose your check-in and check-out dates first.');
      return;
    }
    // Pass full booking context including ratePlanId
    const first = chosenRooms[0];
    setSelectedHotel({
      ...hotel,
      price: nightlyPrice(first.ratePlan),
      defaultRoomTypeId: first.roomType.id,
      defaultRatePlanId: first.ratePlan.id,
      selectedRoomType: first.roomType,
      selectedRatePlan: first.ratePlan,
      // Every room: its type, plan and guests (checkout asks a lead guest for each)
      roomSelections: chosenRooms.map((r) => ({ roomType: r.roomType, ratePlan: r.ratePlan, adults: r.adults, children: r.children || 0 })),
    });
    navigate('/checkout');
  };

  // While the hotel loads: the page's shape (photos, name, rooms, price box), not a spinner, so it
  // feels ready sooner and nothing jumps when the details arrive
  if (loading) return (
    <div className="min-h-screen bg-gray-50 pt-20 md:pt-24" aria-busy="true" aria-label="Loading hotel">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 animate-pulse">
        <div className="h-4 w-48 bg-gray-200 rounded mb-4" />
        <div className="grid grid-cols-4 grid-rows-2 gap-2 h-64 md:h-[420px] rounded-xl overflow-hidden">
          <div className="col-span-4 md:col-span-2 row-span-2 bg-gray-200" />
          <div className="hidden md:block bg-gray-200" /><div className="hidden md:block bg-gray-200" />
          <div className="hidden md:block bg-gray-200" /><div className="hidden md:block bg-gray-200" />
        </div>
        <div className="mt-6 grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <div className="h-8 w-2/3 bg-gray-200 rounded" />
            <div className="h-4 w-1/2 bg-gray-200 rounded" />
            <div className="flex gap-2">{[1, 2, 3, 4].map((i) => <div key={i} className="h-8 w-24 bg-gray-200 rounded-full" />)}</div>
            {[1, 2].map((i) => <div key={i} className="h-48 bg-white border border-gray-200 rounded-xl" />)}
          </div>
          <div className="hidden lg:block h-80 bg-white border border-gray-200 rounded-xl" />
        </div>
      </div>
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
  const nightsN   = occupancy.length;
  const multiRoom = nightsN > 1;
  const pricePerNight = selectedRatePlan ? nightlyPrice(selectedRatePlan) : 0;
  // Estimate until the server price arrives: each room's plan for the nights
  const baseTotal = chosenRooms.reduce((t, r) => t + (r.ratePlan ? nightlyPrice(r.ratePlan) : 0), 0) * nights;
  const allChosen = chosenRooms.every((r) => r.ratePlan);
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
  const extraGuests = chosenRooms.reduce((n, r) => n + Math.max(0, guestsIn(r) - (r.roomType?.baseOccupancy || 2)), 0);
  // Lowest nightly price across rooms (after automatic offers), for the summary at the top
  const allPlans = (hotel.roomTypes || []).filter((rt) => rt.availableForStay !== 0).flatMap((rt) => rt.ratePlans || []);
  const fromPrice = allPlans.length ? Math.min(...allPlans.map(offerPrice).filter((n) => n > 0)) : 0;
  const placeText = placeLine(hotel.area || hotel.location, hotel.city);
  const goRooms = () => document.getElementById('rooms')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const fmtDay = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }) : '');
  const stayGuests = occTotals(occupancy).guests;
  const stayLabel = checkIn && checkOut ? `${fmtDay(checkIn)} – ${fmtDay(checkOut)} · ${nights} night${nights > 1 ? 's' : ''}` : 'Choose dates';
  const guestsLabel = `${stayGuests} guest${stayGuests > 1 ? 's' : ''} · ${nightsN} room${nightsN > 1 ? 's' : ''}`;
  const typeLabel = hotel.type ? String(hotel.type).replace(/[_-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : '';
  const openStay = (which) => { document.getElementById('stay')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); setTimeout(() => togglePicker(which, true), 350); };

  return (
    <div className="pt-16 pb-28 lg:pb-20 bg-gray-50">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(hotelJsonLd(hotel, stars, fromPrice)).replace(/</g, '\\u003c') }} />

      {/* 1. Name, star category, type, review score, place, and the price for your dates */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-4">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1.5 text-sm">
              {stars > 0 && (
                <span className="inline-flex items-center gap-1" role="img" aria-label={`${stars}-star ${typeLabel || 'property'}`}>
                  <span className="inline-flex">{Array.from({ length: stars }, (_, i) => <Star key={i} size={14} className="text-amber-400 fill-current" aria-hidden="true" />)}</span>
                  <span className="text-gray-600 font-medium">{stars}-star</span>
                </span>
              )}
              {typeLabel && <span className="text-gray-600 font-medium">{stars > 0 ? '· ' : ''}{typeLabel}</span>}
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
              ) : <span className="text-gray-500">New on ZivoPlus</span>}
            </div>
            {/* The essentials at a glance, before the rooms (the full overview is further down) */}
            <div className="mt-3"><Highlights hotel={hotel} /></div>
          </div>
          {fromPrice > 0 && (
            <div className="hidden md:flex items-center gap-4 shrink-0">
              <div className="text-right">
                <p className="text-xs text-gray-500">{checkIn && checkOut ? 'From, for your dates' : 'From'}</p>
                <p className="text-2xl font-bold text-gray-900 tabular-nums">{fmt(fromPrice)}<span className="text-sm font-normal text-gray-500"> /night</span></p>
              </div>
              <button type="button" onClick={goRooms} className="px-5 py-3 rounded-lg bg-brand-600 hover:bg-brand-700 text-white font-semibold">See rooms</button>
            </div>
          )}
        </div>
      </div>

      {/* 2. Photos */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-4">
        <PhotoGallery hotelName={hotel.name} photos={photos} />
      </div>

      {/* Nightly or hourly (only for hotels offering hourly stays) */}
      {(hourlyOffered || mode === 'HOURLY') && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-3">
          <div role="tablist" aria-label="Type of stay" className="inline-flex rounded-xl bg-white border border-gray-200 p-1 gap-1">
            {[['NIGHTLY', 'Nightly stay'], ['HOURLY', 'Hourly stay']].map(([k, l]) => (
              <button key={k} type="button" role="tab" aria-selected={mode === k} onClick={() => switchMode(k)}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${mode === k ? 'bg-navy-900 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>{l}</button>
            ))}
          </div>
        </div>
      )}

      {/* 3. Your stay: dates and guests, changeable here on every screen size */}
      {mode === 'HOURLY' ? (
        <HourlyBooking hotel={hotel} initial={hourlyInit} onSlotChange={onHourlySlot} />
      ) : (
        <div id="stay" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-6 relative z-30">
          <StayBar
            checkIn={checkIn} checkOut={checkOut} occupancy={occupancy}
            onChange={changeStay} openPicker={openPicker} onToggle={togglePicker} pickerKey={datePickerKey}
          />
        </div>
      )}

      <SectionTabs sections={SECTIONS} />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-6">
        <div className="flex flex-col lg:flex-row gap-8">
          <div className="flex-1 min-w-0 space-y-6">

            {/* 4. Rooms and rates */}
            {mode !== 'HOURLY' && <section id="rooms" className="scroll-mt-32">
              <div className="flex flex-wrap items-end justify-between gap-2 mb-4">
                <div>
                  <h2 className="text-xl font-bold text-gray-900">Choose your room</h2>
                  <p className="text-sm text-gray-500 mt-0.5">{stayLabel} · {guestsLabel}. Prices per night before GST.{multiRoom && ' Each room can be a different type.'}</p>
                </div>
                {/* Urgency badges (A/B tested) */}
                {badgeVariant === 'variantA' && (hotel.viewsToday >= 10 || hotel.bookingsToday >= 3) && (
                  <div className="flex flex-wrap gap-2">
                    {hotel.viewsToday >= 10 && <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-50 text-red-700 text-xs font-bold border border-red-100"><Flame size={14} className="fill-current" aria-hidden="true" /> {hotel.viewsToday} people viewed today</span>}
                    {hotel.bookingsToday >= 3 && <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-green-50 text-green-700 text-xs font-bold border border-green-100"><CreditCard size={14} aria-hidden="true" /> {hotel.bookingsToday} bookings today</span>}
                  </div>
                )}
              </div>
              {!checkIn && <p className="mb-4 text-sm text-amber-800 bg-amber-50 px-3 py-2 rounded-lg">Choose your dates above for prices and availability.</p>}
              {error && <p role="alert" className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">{error}</p>}
              {multiRoom && (
                <div className="mb-4 bg-white rounded-xl border border-gray-200 p-3" role="group" aria-label="Room you are choosing for">
                  <div className="flex flex-wrap gap-2">
                    {occupancy.map((r, i) => (
                      <button key={i} type="button" onClick={() => setActiveRoom(i)} aria-pressed={i === activeIdx}
                        className={`px-3 py-2 rounded-lg border text-left text-sm transition-colors ${i === activeIdx ? 'border-brand-600 bg-brand-50 text-brand-800' : 'border-gray-200 hover:border-gray-300 text-gray-700'}`}>
                        <span className="block font-bold">Room {i + 1}{chosenRooms[i]?.roomType ? ' ✓' : ''}</span>
                        <span className="block text-xs">{roomGuestsLabel(r)}</span>
                      </button>
                    ))}
                  </div>
                  <p className="mt-2 text-sm font-semibold text-navy-800">Choosing for room {activeIdx + 1} ({roomGuestsLabel(occupancy[activeIdx])})</p>
                </div>
              )}
              {hotel.roomTypes?.length > 0 ? (
                <div className="space-y-4">
                  {hotel.roomTypes.map((rt) => (
                    <RoomCard
                      key={rt.id}
                      roomType={rt}
                      nights={nights}
                      selectedRatePlanId={selectedRoomType?.id === rt.id ? selectedRatePlan?.id : null}
                      tooSmallFor={fitsRoom(rt, occupancy[activeIdx]) ? null : { room: activeIdx + 1, guests: guestsIn(occupancy[activeIdx]), multi: multiRoom }}
                      onSelect={handleRoomSelect}
                    />
                  ))}
                </div>
              ) : (
                <div className="text-center py-10 text-gray-400 bg-white rounded-xl border border-gray-200">
                  <BedDouble size={32} className="mx-auto mb-3 opacity-40" aria-hidden="true" />
                  <p className="text-sm">No rooms are open for booking yet.</p>
                </div>
              )}
            </section>}

            {/* 5. Overview */}
            <Section id="overview" title="Overview">
              <OverviewSection hotel={hotel} stars={stars} />
            </Section>

            {/* 6–9 */}
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

          {/* Booking summary: your stay, your rooms, the price from checkout's own calculation */}
          {mode !== 'HOURLY' && <aside className="w-full lg:w-[380px]" aria-label="Your booking">
            <div id="summary" className="bg-white p-6 rounded-2xl shadow-xl border border-gray-100 lg:sticky lg:top-32 scroll-mt-32">
              <h2 className="text-lg font-bold text-gray-900">Your booking</h2>
              <div className="mt-3 rounded-xl border border-gray-200 divide-y divide-gray-200 text-sm">
                <button type="button" onClick={() => openStay('dates')} className="w-full flex items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-gray-50">
                  <span className="flex items-center gap-2 text-gray-800"><CalendarDays size={16} className="text-brand-700" aria-hidden="true" /> {stayLabel}</span>
                  <span className="text-xs font-semibold text-navy-700">Change</span>
                </button>
                <button type="button" onClick={() => openStay('guests')} className="w-full flex items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-gray-50">
                  <span className="flex items-center gap-2 text-gray-800"><Users size={16} className="text-brand-700" aria-hidden="true" /> {guestsLabel}</span>
                  <span className="text-xs font-semibold text-navy-700">Change</span>
                </button>
              </div>

              <div className="mt-4">
                {multiRoom ? (
                  <ol className="space-y-2">
                    {chosenRooms.map((r, i) => {
                      const line = quote?.roomsBreakdown?.[i];
                      return (
                        <li key={i} className={`rounded-lg border px-3 py-2 ${i === activeIdx ? 'border-brand-300 bg-brand-50' : 'border-gray-200'}`}>
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-sm font-bold text-gray-900">Room {i + 1} <span className="font-normal text-gray-500">· {roomGuestsLabel(r)}</span></p>
                              <p className="text-sm text-gray-700 truncate">{r.roomType ? `${r.roomType.name} · ${r.ratePlan?.name || ''}` : <span className="text-amber-700">Not chosen yet</span>}</p>
                            </div>
                            <div className="text-right shrink-0">
                              {line && <p className="text-sm font-semibold text-gray-900 tabular-nums">{fmt(line.subtotal)}</p>}
                              {i !== activeIdx
                                ? <button type="button" onClick={() => chooseFor(i)} className="text-xs font-semibold text-navy-700 hover:underline">Change</button>
                                : <span className="text-xs font-semibold text-brand-700">Choosing</span>}
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                ) : selectedRatePlan ? (
                  <div>
                    <p className="font-semibold text-gray-900">{selectedRoomType?.name}</p>
                    <p className="text-sm text-gray-600">{selectedRatePlan.name}</p>
                    <div className="flex items-baseline mt-1">
                      {offer && <span className="text-sm text-gray-400 line-through mr-2 tabular-nums">{fmt(nightlyPrice(selectedRatePlan))}</span>}
                      <span className="text-2xl font-extrabold text-gray-900 tabular-nums">{fmt(offerPrice(selectedRatePlan))}</span>
                      <span className="text-gray-500 ml-1 text-sm">/ night</span>
                    </div>
                    {offer && <p className="mt-1 text-xs font-bold text-green-700">{offer.label} · {offer.name}, applied at checkout</p>}
                    <button type="button" onClick={goRooms} className="mt-1 text-xs font-semibold text-navy-700 hover:underline">Change room or plan</button>
                  </div>
                ) : (
                  <p className="text-sm text-amber-800 bg-amber-50 px-3 py-2 rounded-lg">Select a room and plan.</p>
                )}
              </div>

              {/* Price: the same server calculation as checkout */}
              <div className="mt-4">
                {checkIn && checkOut && allChosen && quote ? (
                  <div className="bg-gray-50 rounded-xl p-4 text-sm space-y-2 tabular-nums">
                    {/* Room price, then each extra charge on its own line */}
                    <div className="flex justify-between text-gray-600">
                      <span>{multiRoom ? `${nightsN} rooms × ${nights} night${nights > 1 ? 's' : ''}` : `${fmt(pricePerNight)} × ${nights} night${nights > 1 ? 's' : ''}`}</span>
                      <span>{fmt(quote.roomPrice || 0)}</span>
                    </div>
                    {quote.extraGuestCharges > 0 && (
                      <div className="flex justify-between text-gray-600">
                        <span>Extra guest charge{extraGuests > 0 ? ` (${extraGuests} guest${extraGuests > 1 ? 's' : ''} × ${nights} night${nights > 1 ? 's' : ''})` : ''}</span>
                        <span>{fmt(quote.extraGuestCharges)}</span>
                      </div>
                    )}
                    {quote.extraBedCharges > 0 && <div className="flex justify-between text-gray-600"><span>Extra bed</span><span>{fmt(quote.extraBedCharges)}</span></div>}
                    {quote.mealCharges > 0 && <div className="flex justify-between text-gray-600"><span>Meals</span><span>{fmt(quote.mealCharges)}</span></div>}
                    {quote.promotionDiscountAmount > 0 && <div className="flex justify-between text-green-700 font-medium"><span>{quote.promotion?.name || 'Offer'}</span><span>− {fmt(quote.promotionDiscountAmount)}</span></div>}
                    {quote.memberDiscountAmount > 0 && <div className="flex justify-between text-green-700 font-medium"><span>Member price</span><span>− {fmt(quote.memberDiscountAmount)}</span></div>}
                    {quote.prepaidDiscountAmount > 0 && <div className="flex justify-between text-green-700 font-medium"><span>Pay-now saving</span><span>− {fmt(quote.prepaidDiscountAmount)}</span></div>}
                    {memberPct > 0 && !membership && (
                      <p className="text-xs text-navy-800 bg-navy-50 rounded-lg px-2 py-1.5">
                        {memberPct}% off for members. {isAuthenticated ? 'Member prices are for guest accounts.' : <><RouterLink to="/login" className="font-bold underline">Log in</RouterLink> or <RouterLink to="/signup" className="font-bold underline">sign up free</RouterLink> to get it.</>}
                      </p>
                    )}
                    <div className="flex justify-between text-gray-600">
                      <span>GST {quote.taxBreakdown?.length > 1 ? `(${quote.taxBreakdown.map((t) => `${t.percentage}%`).join(' + ')})` : `(${quote.taxPercentage ?? Math.round(taxRate * 100)}%)`}</span>
                      <span>{fmt(quote.taxAmount || 0)}</span>
                    </div>
                    <div className="flex justify-between font-bold text-gray-900 pt-2 border-t border-gray-200"><span>Total if you pay now</span><span>{fmt(quote.totalAmount)}</span></div>
                    <p className="text-xs text-gray-500">Part-payment and pay-later options are at checkout.</p>
                  </div>
                ) : checkIn && checkOut && allChosen && quoteError ? (
                  <p className="text-sm text-red-700 bg-red-50 px-3 py-2 rounded-lg" role="alert">{quoteError}</p>
                ) : checkIn && checkOut && allChosen ? (
                  <div className="bg-gray-50 rounded-xl p-4 text-sm space-y-2" aria-busy="true">
                    <div className="h-4 bg-gray-200 rounded animate-pulse w-3/4" />
                    <div className="h-4 bg-gray-200 rounded animate-pulse w-1/2" />
                    <div className="h-5 bg-gray-200 rounded animate-pulse w-2/3" />
                  </div>
                ) : null}
              </div>

              {error && <p role="alert" className="mt-3 text-sm text-red-700 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
              <button
                onClick={handleBookNow}
                disabled={!allChosen}
                className="mt-4 w-full bg-brand-600 hover:bg-brand-700 text-white font-bold py-4 px-8 rounded-xl shadow-lg shadow-brand-500/30 transition-colors text-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {checkIn && checkOut && allChosen && quote ? `Book now · ${fmt(grandTotal)}` : 'Book now'}
              </button>
              <p className="text-center text-sm text-gray-500 mt-3">You won&apos;t be charged yet</p>
              {!isAuthenticated && <p className="text-center text-xs text-gray-600 mt-1">You&apos;ll sign in, or create a free account, before paying. Your choices are kept.</p>}
              <p className="text-center text-xs text-gray-500 mt-2 flex items-center justify-center gap-1">
                <ShieldCheck size={12} className="text-green-700" aria-hidden="true" />
                {CANCELLATION_TEXT[hotel.cancellationPolicy] || CANCELLATION_TEXT.FREE_CANCEL_24H}
              </p>
            </div>
          </aside>}
        </div>
      </div>

      {/* 12. Similar hotels nearby */}
      <SimilarHotels hotel={hotel} searchParams={searchParams} />

      {/* Phones: price and the next step always in reach */}
      <div className={`${mode === 'HOURLY' ? 'hidden' : ''} lg:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-gray-200 shadow-[0_-4px_16px_rgba(6,44,77,0.08)] px-4 py-3`} style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
        <div className="flex items-center justify-between gap-3 max-w-7xl mx-auto">
          <div className="min-w-0">
            {checkIn && checkOut && allChosen && quote ? (
              <button type="button" onClick={() => document.getElementById('summary')?.scrollIntoView({ behavior: 'smooth', block: 'start' })} className="text-left">
                <p className="text-lg font-bold text-gray-900 tabular-nums leading-tight">{fmt(grandTotal)}</p>
                <p className="text-xs text-gray-500 truncate underline decoration-dotted">{multiRoom ? `${nightsN} rooms` : selectedRoomType?.name} · {nights} night{nights > 1 ? 's' : ''} · incl. GST</p>
              </button>
            ) : fromPrice > 0 ? (
              <>
                <p className="text-xs text-gray-500">From</p>
                <p className="text-lg font-bold text-gray-900 tabular-nums leading-tight">{fmt(fromPrice)}<span className="text-sm font-normal text-gray-500"> /night</span></p>
              </>
            ) : <p className="text-sm text-gray-600">Choose your dates</p>}
          </div>
          {allChosen && checkIn && checkOut ? (
            <button type="button" onClick={handleBookNow} className="shrink-0 px-6 py-3 rounded-lg bg-brand-600 hover:bg-brand-700 text-white font-semibold">Book now</button>
          ) : (
            <button type="button" onClick={goRooms} className="shrink-0 px-6 py-3 rounded-lg bg-brand-600 hover:bg-brand-700 text-white font-semibold">Select rooms</button>
          )}
        </div>
      </div>
    </div>
  );
};

export default Detail;
