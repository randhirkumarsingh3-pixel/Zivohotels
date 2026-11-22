import { useState, useEffect, useCallback, useMemo } from 'react';
import { hourlyFromQuery, timeLabel } from '../utils/hourly';
import { useLocation } from 'react-router-dom';
import { useBooking } from '../context/BookingContext';
import { getHotels, trackEvent, searchHourlyHotels } from '../services/api';
import { defaultStay } from '../components/home/searchLinks';
import { occupancyOf, occParams, occToParam } from '../utils/occupancy';

const NEAR_ME = 'Hotels near me';
import { useAllExperiments } from '../context/ExperimentContext';
import SmartSearchBar from '../components/search/SmartSearchBar';
import HotelCard from '../components/HotelCard';
import ShowInBatches from '../components/search/ShowInBatches';
import { amenityLabels } from '../utils/amenityLabels';
import usePageTitle from '../hooks/usePageTitle';
import ResultsMap from '../components/search/ResultsMap';
import { SlidersHorizontal, X, Star, ChevronDown, List, Map as MapIcon, SearchX } from 'lucide-react';

/**
 * Search results: filters (price, star category, guest rating, free cancellation, deals, property
 * type, area, amenities), sort, and a list or map view. The server applies the stay dates, price
 * and star filters and ranks the results; the other filters narrow the returned list here, so they
 * respond instantly. Filter options (types, areas, amenities) come from the results themselves.
 */
const SORT_OPTIONS = [
  { value: 'recommended', label: 'Recommended' },
  { value: 'price_asc', label: 'Price: low to high' },
  { value: 'price_desc', label: 'Price: high to low' },
  { value: 'rating', label: 'Guest rating' },
];
const SCORE_OPTIONS = [[4.5, 'Exceptional: 4.5+'], [4, 'Very good: 4+'], [3.5, 'Good: 3.5+']];
const priceOf = (h) => (h.offer ? h.offer.nightlyPriceAfter : (h.startingPrice || h.price || 0));
const titleCase = (s) => String(s || '').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

const Check = ({ checked, onChange, children, count }) => (
  <label className="flex items-center gap-3 py-1 cursor-pointer text-sm text-gray-700 hover:text-gray-900">
    <input type="checkbox" checked={checked} onChange={onChange} className="w-4 h-4 rounded border-gray-300 text-navy-700 focus:ring-navy-500" />
    <span className="flex-1 flex items-center gap-1">{children}</span>
    {count != null && <span className="text-xs text-gray-500 tabular-nums">{count}</span>}
  </label>
);

const Group = ({ title, children }) => (
  <fieldset className="py-4 border-b border-gray-100 last:border-0">
    <legend className="text-sm font-bold text-gray-900 mb-2">{title}</legend>
    {children}
  </fieldset>
);

const EMPTY = { maxPrice: null, stars: [], score: null, freeCancel: false, deals: false, types: [], areas: [], amenities: [] };

const Listing = ({ place = null }) => {
  const { searchParams, updateSearchParams } = useBooking();
  const allExperiments = useAllExperiments();
  const location = useLocation();
  // City / area landing pages (/hotels-in-bengaluru) search that place unless the address says otherwise
  const search = useMemo(() => {
    if (!place) return location.search;
    const p = new URLSearchParams(location.search);
    if (!p.get('city') && !p.get('lat')) p.set('city', place.city);
    if (place.area && !p.get('area')) p.set('area', place.area);
    return `?${p.toString()}`;
  }, [place, location.search]);

  const [hotels, setHotels] = useState([]);
  const [loading, setLoading] = useState(true);
  // ?area=Kurla West (from "Explore hotels" links) turns that area filter on
  const urlArea = new URLSearchParams(search).get('area');
  const [f, setF] = useState(() => (urlArea ? { ...EMPTY, areas: [urlArea] } : EMPTY));
  useEffect(() => { if (urlArea) setF((p) => (p.areas.includes(urlArea) ? p : { ...p, areas: [urlArea] })); }, [urlArea]);
  const [sortBy, setSortBy] = useState('recommended');
  const [view, setView] = useState('list');
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // The search comes from the URL (shareable), falling back to the last search in this session
  const activeSearchParams = useMemo(() => {
    const params = new URLSearchParams(search);
    const city = params.get('city');
    const lat = parseFloat(params.get('lat'));
    const lng = parseFloat(params.get('lng'));
    const near = Number.isFinite(lat) && Number.isFinite(lng);
    if (city !== null || near) {
      // A link without dates (shared, typed) searches tonight. Without dates every hotel in every
      // city used to be listed.
      const stay = defaultStay();
      return {
        destination: near ? NEAR_ME : city,
        ...(near ? { lat, lng } : {}),
        checkIn: params.get('checkin') || stay.checkin,
        checkOut: params.get('checkout') || stay.checkout,
        guests: parseInt(params.get('guests')) || 2,
        rooms: parseInt(params.get('rooms')) || 1,
        // Who stays in each room (occ=2-0,1-1); older links only have guests and rooms
        occupancy: occupancyOf({ occ: params.get('occ'), guests: params.get('guests'), rooms: params.get('rooms') }),
      };
    }
    return searchParams;
  }, [search, searchParams]);

  useEffect(() => {
    const params = new URLSearchParams(search);
    if (params.get('city') === null && params.get('lat') === null) return;
    const { lat: _lat, lng: _lng, ...a } = activeSearchParams;
    // (Near me isn't kept as a place name: searching for "Hotels near me" as a city finds nothing)
    const next = { ...a, destination: _lat != null ? '' : a.destination };
    if (next.destination !== searchParams.destination || next.checkIn !== searchParams.checkIn || next.checkOut !== searchParams.checkOut || next.guests !== searchParams.guests || next.rooms !== searchParams.rooms || occToParam(next.occupancy) !== occToParam(searchParams.occupancy)) {
      updateSearchParams(next);
    }
  }, [search, activeSearchParams, searchParams.destination, searchParams.checkIn, searchParams.checkOut, searchParams.guests, searchParams.rooms, searchParams.occupancy, updateSearchParams]);

  const isNear = activeSearchParams.lat != null;
  const searchBarInitial = useMemo(() => (isNear
    ? { ...activeSearchParams, destination: { type: 'near', label: NEAR_ME, value: 'near', lat: activeSearchParams.lat, lng: activeSearchParams.lng } }
    : activeSearchParams), [isNear, activeSearchParams]);
  const placeName = isNear ? '' : activeSearchParams.destination;
  const hourlyQ = hourlyFromQuery(search);
  const heading = place && !hourlyQ
    ? `Hotels in ${place.area ? `${place.area}, ` : ''}${place.city}`
    : hourlyQ
      ? `Hourly stays${hourlyQ.city ? ` in ${hourlyQ.city}` : ''}`
      : isNear ? 'Hotels near you' : placeName ? `Hotels in ${placeName}` : 'All hotels';
  usePageTitle(heading,
    placeName ? `Compare hotels in ${placeName} on ZivoPlus: prices with GST, guest ratings, free cancellation and member prices.` : undefined);

  const minStars = f.stars.length ? Math.min(...f.stars) : null;
  const serverFilters = useMemo(() => ({
    ...(minStars ? { stars: minStars } : {}),
    sortBy: { recommended: 'RECOMMENDED', price_asc: 'PRICE_LOW_HIGH', price_desc: 'PRICE_HIGH_LOW', rating: 'RATING_HIGH_LOW' }[sortBy] || 'RECOMMENDED',
    includeSoldOut: true,
  }), [minStars, sortBy]);

  // Hourly search (?stay=hourly&date=&start=&hours=&guests=)
  const hourly = useMemo(() => hourlyFromQuery(search), [search]);

  const fetchHotels = useCallback(async () => {
    setLoading(true);
    try {
      const data = hourly ? await searchHourlyHotels(hourly) : await getHotels(activeSearchParams, serverFilters);
      setHotels(data?.hotels || data || []);
    } catch (err) {
      console.error('Failed to fetch hotels:', err);
      setHotels([]);
    } finally {
      setLoading(false);
    }
  }, [activeSearchParams, serverFilters, hourly]);

  // Track once per search (not when the analytics context object changes)
  useEffect(() => {
    window.scrollTo(0, 0);
    fetchHotels();
    trackEvent('SEARCH_STARTED', { filters: serverFilters }, null, isNear ? 'near-me' : activeSearchParams.destination, allExperiments);
  }, [fetchHotels]); // eslint-disable-line react-hooks/exhaustive-deps

  // Options for the filters, from the results
  const options = useMemo(() => {
    const count = (vals) => { const m = new Map(); vals.flat().filter(Boolean).forEach((v) => m.set(v, (m.get(v) || 0) + 1)); return [...m.entries()].sort((a, b) => b[1] - a[1]); };
    const prices = hotels.map(priceOf).filter((p) => p > 0);
    return {
      types: count(hotels.map((h) => (h.type ? titleCase(h.type) : null))),
      areas: count(hotels.map((h) => h.area || null)),
      amenities: count(hotels.map((h) => amenityLabels(h.amenities))).slice(0, 10),
      maxPrice: prices.length ? Math.ceil(Math.max(...prices) / 500) * 500 : 0,
      minPrice: prices.length ? Math.floor(Math.min(...prices) / 500) * 500 : 0,
    };
  }, [hotels]);

  const shown = useMemo(() => hotels.filter((h) => {
    if (f.maxPrice && priceOf(h) > f.maxPrice) return false;
    if (minStars && (Number(h.starRating) || 0) < minStars) return false;
    if (f.score && !((h.reviewCount || 0) > 0 && Number(h.rating ?? h.reviewScore) >= f.score)) return false;
    if (f.freeCancel && !(h.freeCancellation || h.badges?.isFreeCancellation)) return false;
    if (f.deals && !(h.offer || h.memberDiscountPercent > 0)) return false;
    if (f.types.length && !f.types.includes(titleCase(h.type))) return false;
    if (f.areas.length && !f.areas.includes(h.area)) return false;
    if (f.amenities.length) { const a = amenityLabels(h.amenities); if (!f.amenities.every((x) => a.includes(x))) return false; }
    return true;
  }), [hotels, f, minStars]);

  const toggleIn = (key, val) => setF((p) => ({ ...p, [key]: p[key].includes(val) ? p[key].filter((v) => v !== val) : [...p[key], val] }));
  const chips = [
    f.maxPrice && { label: `Up to ₹${f.maxPrice.toLocaleString('en-IN')}`, clear: () => setF((p) => ({ ...p, maxPrice: null })) },
    ...f.stars.map((s) => ({ label: `${s}★`, clear: () => toggleIn('stars', s) })),
    f.score && { label: `Rated ${f.score}+`, clear: () => setF((p) => ({ ...p, score: null })) },
    f.freeCancel && { label: 'Free cancellation', clear: () => setF((p) => ({ ...p, freeCancel: false })) },
    f.deals && { label: 'Deals', clear: () => setF((p) => ({ ...p, deals: false })) },
    ...f.types.map((t) => ({ label: t, clear: () => toggleIn('types', t) })),
    ...f.areas.map((a) => ({ label: a, clear: () => toggleIn('areas', a) })),
    ...f.amenities.map((a) => ({ label: a, clear: () => toggleIn('amenities', a) })),
  ].filter(Boolean);

  const detailQuery = activeSearchParams.checkIn && activeSearchParams.checkOut
    ? `?${new URLSearchParams({ checkin: activeSearchParams.checkIn, checkout: activeSearchParams.checkOut, ...occParams(activeSearchParams.occupancy) })}`
    : '';

  const filterPanel = (
    <div>
      <div className="flex items-center justify-between pb-3 border-b border-gray-100">
        <h2 className="text-base font-bold text-gray-900">Filter by</h2>
        {chips.length > 0 && <button type="button" onClick={() => setF(EMPTY)} className="text-sm text-navy-700 font-semibold hover:underline">Clear all</button>}
      </div>
      {options.maxPrice > 0 && (
        <Group title="Price per night">
          <input type="range" aria-label="Maximum price per night" min={options.minPrice} max={options.maxPrice} step={500}
            value={f.maxPrice ?? options.maxPrice} onChange={(e) => { const v = Number(e.target.value); setF((p) => ({ ...p, maxPrice: v >= options.maxPrice ? null : v })); }}
            className="w-full accent-navy-700" />
          <p className="text-sm text-gray-700 mt-1">Up to <strong className="tabular-nums">₹{(f.maxPrice ?? options.maxPrice).toLocaleString('en-IN')}</strong></p>
        </Group>
      )}
      <Group title="Popular">
        <Check checked={f.freeCancel} onChange={() => setF((p) => ({ ...p, freeCancel: !p.freeCancel }))} count={hotels.filter((h) => h.freeCancellation).length}>Free cancellation</Check>
        <Check checked={f.deals} onChange={() => setF((p) => ({ ...p, deals: !p.deals }))} count={hotels.filter((h) => h.offer || h.memberDiscountPercent > 0).length}>Deals and member prices</Check>
      </Group>
      <Group title="Guest rating">
        {SCORE_OPTIONS.map(([v, label]) => (
          <label key={v} className="flex items-center gap-3 py-1 cursor-pointer text-sm text-gray-700">
            <input type="radio" name="score" checked={f.score === v} onChange={() => setF((p) => ({ ...p, score: v }))} className="w-4 h-4 border-gray-300 text-navy-700 focus:ring-navy-500" />
            {label}
          </label>
        ))}
        {f.score && <button type="button" onClick={() => setF((p) => ({ ...p, score: null }))} className="text-xs text-navy-700 font-semibold mt-1">Any rating</button>}
      </Group>
      <Group title="Star category">
        {[5, 4, 3].map((s) => (
          <Check key={s} checked={f.stars.includes(s)} onChange={() => toggleIn('stars', s)}>
            {Array.from({ length: s }, (_, i) => <Star key={i} size={12} className="fill-amber-400 text-amber-400" aria-hidden="true" />)}
            <span className="ml-1">{s} stars{s < 5 ? ' & up' : ''}</span>
          </Check>
        ))}
      </Group>
      {options.types.length > 1 && (
        <Group title="Property type">
          {options.types.map(([t, n]) => <Check key={t} checked={f.types.includes(t)} onChange={() => toggleIn('types', t)} count={n}>{t}</Check>)}
        </Group>
      )}
      {options.areas.length > 0 && (
        <Group title="Area">
          {options.areas.slice(0, 8).map(([a, n]) => <Check key={a} checked={f.areas.includes(a)} onChange={() => toggleIn('areas', a)} count={n}>{a}</Check>)}
        </Group>
      )}
      {options.amenities.length > 0 && (
        <Group title="Facilities">
          {options.amenities.map(([a, n]) => <Check key={a} checked={f.amenities.includes(a)} onChange={() => toggleIn('amenities', a)} count={n}>{a}</Check>)}
        </Group>
      )}
    </div>
  );

  return (
    <div className="pt-16 pb-20 bg-gray-50 min-h-screen">
      <div className="bg-navy-900 pb-8 pt-8 px-4 sm:px-6 lg:px-8 mb-6">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-2xl md:text-3xl font-bold text-white mb-5">
            {heading}
          </h1>
          {place?.intro && <p className="-mt-3 mb-5 text-navy-100 max-w-3xl">{place.intro}</p>}
          <SmartSearchBar isMobile={isMobile} initial={hourly ? { destination: hourly.city, hourly } : searchBarInitial} />
          {hourly && <p className="mt-3 text-sm text-navy-100">{`${hourly.hours}-hour stays from ${timeLabel(hourly.start)} on ${new Date(`${hourly.date}T06:00:00Z`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}. Prices before GST.`}</p>}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col lg:flex-row gap-6">
        <aside className="hidden lg:block w-64 shrink-0" aria-label="Filters">
          <div className="bg-white p-5 rounded-card border border-gray-200 sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto">{filterPanel}</div>
        </aside>

        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
            <h2 className="text-lg font-bold text-gray-900" aria-live="polite">
              {loading ? 'Searching…' : `${shown.length} ${shown.length === 1 ? 'hotel' : 'hotels'}${shown.length !== hotels.length ? ` of ${hotels.length}` : ''}`}
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => setMobileFiltersOpen(true)} className="lg:hidden flex items-center gap-1.5 text-sm font-semibold text-gray-700 bg-white px-3 py-2 rounded-lg border border-gray-300">
                <SlidersHorizontal size={16} aria-hidden="true" /> Filters{chips.length > 0 && <span className="bg-navy-800 text-white text-xs rounded-full min-w-[20px] h-5 px-1 flex items-center justify-center">{chips.length}</span>}
              </button>
              <div className="relative">
                <select aria-label="Sort hotels" value={sortBy} onChange={(e) => setSortBy(e.target.value)}
                  className="appearance-none bg-white pl-3 pr-8 py-2 rounded-lg border border-gray-300 text-sm font-semibold text-gray-700 outline-none focus:border-navy-500 cursor-pointer">
                  {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" aria-hidden="true" />
              </div>
              <div className="flex rounded-lg border border-gray-300 overflow-hidden bg-white" role="group" aria-label="View">
                <button type="button" onClick={() => setView('list')} aria-pressed={view === 'list'} className={`flex items-center gap-1.5 px-3 py-2 text-sm font-semibold ${view === 'list' ? 'bg-navy-800 text-white' : 'text-gray-700'}`}><List size={16} aria-hidden="true" /> List</button>
                <button type="button" onClick={() => setView('map')} aria-pressed={view === 'map'} className={`flex items-center gap-1.5 px-3 py-2 text-sm font-semibold ${view === 'map' ? 'bg-navy-800 text-white' : 'text-gray-700'}`}><MapIcon size={16} aria-hidden="true" /> Map</button>
              </div>
            </div>
          </div>

          {chips.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-4">
              {chips.map((c) => (
                <button key={c.label} type="button" onClick={c.clear} className="inline-flex items-center gap-1 bg-navy-50 text-navy-800 text-sm font-medium px-3 py-1 rounded-full border border-navy-100 hover:bg-navy-100">
                  {c.label} <X size={14} aria-label={`Remove ${c.label}`} />
                </button>
              ))}
            </div>
          )}

          {loading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => <div key={i} className="bg-white rounded-card h-56 animate-pulse border border-gray-200" />)}
            </div>
          ) : shown.length === 0 ? (
            <div className="bg-white rounded-card p-12 text-center border border-gray-200">
              <SearchX className="mx-auto text-gray-400 mb-3" size={40} aria-hidden="true" />
              <h3 className="text-xl font-bold text-gray-900 mb-2">{hotels.length ? 'No hotels match these filters' : 'No hotels found'}</h3>
              <p className="text-gray-600 mb-4">{hotels.length ? 'Remove a filter to see more.' : (isNear ? 'No ZivoPlus hotels within 50 km of you yet. Search for a city instead.' : 'Try another destination or different dates.')}</p>
              {chips.length > 0 && <button type="button" onClick={() => setF(EMPTY)} className="text-navy-700 font-semibold underline">Clear all filters</button>}
            </div>
          ) : view === 'map' ? (
            <ResultsMap hotels={shown} detailQuery={detailQuery} className="h-[70vh] min-h-[420px]" />
          ) : (
            <div className="space-y-4">
              <ShowInBatches items={shown} resetKey={`${search}|${sortBy}|${JSON.stringify(f)}`} render={(hotel) => <HotelCard key={hotel.id} hotel={hotel} layout="row" />} />
            </div>
          )}
        </div>
      </div>

      {place?.faqs?.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-12" aria-labelledby="place-faq">
          <h2 id="place-faq" className="text-xl font-bold text-gray-900">Questions about {heading.toLowerCase().replace(/^hotels/, 'hotels')}</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {place.faqs.map((q) => (
              <details key={q.q} className="bg-white rounded-xl border border-gray-200 p-4">
                <summary className="font-semibold text-gray-900 cursor-pointer">{q.q}</summary>
                <p className="mt-2 text-sm text-gray-700">{q.a}</p>
              </details>
            ))}
          </div>
        </section>
      )}

      {mobileFiltersOpen && (
        <div className="fixed inset-0 z-[60] flex lg:hidden" role="dialog" aria-modal="true" aria-label="Filters">
          <div className="absolute inset-0 bg-navy-950/50" onClick={() => setMobileFiltersOpen(false)} />
          <div className="relative ml-auto w-[min(22rem,100%)] bg-white h-full flex flex-col shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900">Filters</h2>
              <button type="button" onClick={() => setMobileFiltersOpen(false)} aria-label="Close filters" className="p-2 rounded-full hover:bg-gray-100"><X size={20} /></button>
            </div>
            <div className="flex-1 overflow-y-auto px-5">{filterPanel}</div>
            <div className="p-4 border-t border-gray-100">
              <button type="button" onClick={() => setMobileFiltersOpen(false)} className="w-full bg-brand-600 text-white py-3 rounded-lg font-semibold hover:bg-brand-700">
                Show {shown.length} {shown.length === 1 ? 'hotel' : 'hotels'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Listing;
