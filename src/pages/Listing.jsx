import { useState, useEffect, useCallback, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { useBooking } from '../context/BookingContext';
import { getHotels, trackEvent } from '../services/api';
import { useAllExperiments } from '../context/ExperimentContext';
import SearchBar from '../components/SearchBar';
import HotelCard from '../components/HotelCard';
import { Filter, SlidersHorizontal, X, Star, ChevronDown } from 'lucide-react';

// Price ranges config
const PRICE_RANGES = [
  { label: 'Under ₹2,000',      min: 0,     max: 2000  },
  { label: '₹2,000 – ₹5,000',  min: 2000,  max: 5000  },
  { label: '₹5,000 – ₹10,000', min: 5000,  max: 10000 },
  { label: '₹10,000+',          min: 10000, max: null  },
];

const SORT_OPTIONS = [
  { value: 'recommended', label: 'Recommended' },
  { value: 'price_asc',   label: 'Price: Low to High' },
  { value: 'price_desc',  label: 'Price: High to Low' },
  { value: 'rating',      label: 'Top Rated' },
];

const Listing = () => {
  const { searchParams, updateSearchParams } = useBooking();
  const allExperiments = useAllExperiments();
  const location = useLocation();

  const [hotels, setHotels]   = useState([]);
  const [loading, setLoading] = useState(true);

  // Filter state
  const [selectedPrice, setSelectedPrice] = useState(null); // index into PRICE_RANGES
  const [selectedStars, setSelectedStars] = useState([]);   // array of star values
  const [sortBy, setSortBy]               = useState('recommended');
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  // Parse URL query params, falling back to BookingContext if empty
  const activeSearchParams = useMemo(() => {
    const params = new URLSearchParams(location.search);
    const city = params.get('city');
    if (city !== null) {
      return {
        destination: city,
        checkIn: params.get('checkin') || '',
        checkOut: params.get('checkout') || '',
        guests: parseInt(params.get('guests')) || 2,
        rooms: parseInt(params.get('rooms')) || 1,
      };
    }
    return searchParams;
  }, [location.search, searchParams]);

  // Sync URL query params back to BookingContext if present
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const city = params.get('city');
    if (city !== null) {
      const checkin = params.get('checkin') || '';
      const checkout = params.get('checkout') || '';
      const guests = parseInt(params.get('guests')) || 2;
      const rooms = parseInt(params.get('rooms')) || 1;

      if (
        city !== searchParams.destination ||
        checkin !== searchParams.checkIn ||
        checkout !== searchParams.checkOut ||
        guests !== searchParams.guests ||
        rooms !== searchParams.rooms
      ) {
        updateSearchParams({
          destination: city,
          checkIn: checkin,
          checkOut: checkout,
          guests,
          rooms
        });
      }
    }
  }, [location.search, searchParams.destination, searchParams.checkIn, searchParams.checkOut, searchParams.guests, searchParams.rooms, updateSearchParams]);

  // Build the active filters object to pass to API
  const buildFilters = useCallback(() => {
    const f = {};
    if (selectedPrice !== null) {
      const range = PRICE_RANGES[selectedPrice];
      if (range.min)  f.priceMin = range.min;
      if (range.max)  f.priceMax = range.max;
    }
    if (selectedStars.length > 0) {
      f.stars = Math.min(...selectedStars); // Use lowest selected star as gte threshold
    }
    
    // Map sortBy UI options to backend constants
    const sortMapping = {
      'recommended': 'RECOMMENDED',
      'price_asc': 'PRICE_LOW_HIGH',
      'price_desc': 'PRICE_HIGH_LOW', // Note: rankingService might not support desc natively, we can just use rating or recommended
      'rating': 'RATING_HIGH_LOW'
    };
    f.sortBy = sortMapping[sortBy] || 'RECOMMENDED';
    f.includeSoldOut = true; // Phase 3.5 requirement: sold out at bottom
    
    return f;
  }, [selectedPrice, selectedStars, sortBy]);

  const fetchHotels = useCallback(async () => {
    setLoading(true);
    try {
      const responseData = await getHotels(activeSearchParams, buildFilters());
      setHotels(responseData.hotels || responseData || []);
    } catch (err) {
      console.error('Failed to fetch hotels:', err);
      setHotels([]);
    } finally {
      setLoading(false);
    }
  }, [activeSearchParams, buildFilters]);

  useEffect(() => {
    window.scrollTo(0, 0);
    fetchHotels();
    
    // Analytics
    trackEvent('SEARCH_STARTED', { filters: buildFilters() }, null, activeSearchParams.destination, allExperiments);
  }, [fetchHotels]);

  const clearFilters = () => {
    setSelectedPrice(null);
    setSelectedStars([]);
    setSortBy('recommended');
  };

  const toggleStar = (star) => {
    setSelectedStars(prev =>
      prev.includes(star) ? prev.filter(s => s !== star) : [...prev, star]
    );
  };

  const activeFilterCount = (selectedPrice !== null ? 1 : 0) + selectedStars.length;

  // Filter Sidebar Component (shared between desktop and mobile)
  const FilterPanel = () => (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-gray-100">
        <h2 className="text-base font-bold flex items-center gap-2 text-gray-900">
          <Filter className="h-4 w-4 text-brand-600" /> Filters
          {activeFilterCount > 0 && (
            <span className="bg-brand-600 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
              {activeFilterCount}
            </span>
          )}
        </h2>
        {activeFilterCount > 0 && (
          <button onClick={clearFilters} className="text-sm text-red-500 font-medium hover:text-red-600 flex items-center gap-1">
            <X size={13} /> Clear All
          </button>
        )}
      </div>

      {/* Price Range */}
      <div>
        <h3 className="text-sm font-bold text-gray-700 mb-3">Price Per Night</h3>
        <div className="space-y-2.5">
          {PRICE_RANGES.map((range, i) => (
            <label key={i} className="flex items-center cursor-pointer group">
              <div
                className={`w-4 h-4 rounded border-2 mr-3 flex items-center justify-center transition-colors ${
                  selectedPrice === i ? 'bg-brand-600 border-brand-600' : 'border-gray-300 group-hover:border-brand-400'
                }`}
                onClick={() => setSelectedPrice(selectedPrice === i ? null : i)}
              >
                {selectedPrice === i && <div className="w-2 h-2 bg-white rounded-sm" />}
              </div>
              <span className="text-sm text-gray-600 group-hover:text-gray-900 transition-colors">{range.label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Star Rating */}
      <div>
        <h3 className="text-sm font-bold text-gray-700 mb-3">Star Rating</h3>
        <div className="space-y-2.5">
          {[5, 4, 3].map((star) => (
            <label key={star} className="flex items-center cursor-pointer group" onClick={() => toggleStar(star)}>
              <div
                className={`w-4 h-4 rounded border-2 mr-3 flex items-center justify-center transition-colors ${
                  selectedStars.includes(star) ? 'bg-brand-600 border-brand-600' : 'border-gray-300 group-hover:border-brand-400'
                }`}
              >
                {selectedStars.includes(star) && <div className="w-2 h-2 bg-white rounded-sm" />}
              </div>
              <span className="text-sm text-gray-600 group-hover:text-gray-900 flex items-center gap-1 transition-colors">
                {Array.from({ length: star }).map((_, i) => (
                  <Star key={i} size={12} className="fill-amber-400 text-amber-400" />
                ))}
                <span className="ml-1">{star} Stars & Above</span>
              </span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <div className="pt-24 pb-20 bg-gray-50 min-h-screen">
      {/* Search Header */}
      <div className="bg-brand-900 pb-12 pt-8 px-4 sm:px-6 lg:px-8 mb-8">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-2xl md:text-3xl font-bold text-white mb-6">
            {activeSearchParams.destination ? `Hotels in ${activeSearchParams.destination}` : 'Explore All Hotels'}
          </h1>
          <SearchBar inline={true} />
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col lg:flex-row gap-8">
        {/* Desktop Filters Sidebar */}
        <div className="hidden lg:block w-64 shrink-0">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 sticky top-24">
            <FilterPanel />
          </div>
        </div>

        {/* Results */}
        <div className="flex-1">
          {/* Toolbar */}
          <div className="flex justify-between items-center mb-6">
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-bold text-gray-900">
                {loading ? 'Searching...' : `${hotels.length} Properties Found`}
              </h2>
              {/* Mobile Filter Toggle */}
              <button
                onClick={() => setMobileFiltersOpen(true)}
                className="lg:hidden flex items-center gap-1.5 text-sm text-gray-600 bg-white px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50"
              >
                <Filter size={14} />
                Filters
                {activeFilterCount > 0 && (
                  <span className="bg-brand-600 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-bold ml-0.5">
                    {activeFilterCount}
                  </span>
                )}
              </button>
            </div>

            {/* Sort Dropdown */}
            <div className="relative">
              <select
                value={sortBy}
                onChange={e => setSortBy(e.target.value)}
                className="appearance-none bg-white px-4 pr-8 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 outline-none focus:border-brand-400 cursor-pointer"
              >
                {SORT_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
          </div>

          {/* Active filter chips */}
          {activeFilterCount > 0 && (
            <div className="flex flex-wrap gap-2 mb-4">
              {selectedPrice !== null && (
                <span className="inline-flex items-center gap-1 bg-brand-50 text-brand-700 text-xs font-medium px-3 py-1.5 rounded-full border border-brand-200">
                  {PRICE_RANGES[selectedPrice].label}
                  <X size={12} className="cursor-pointer" onClick={() => setSelectedPrice(null)} />
                </span>
              )}
              {selectedStars.sort((a, b) => b - a).map(star => (
                <span key={star} className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 text-xs font-medium px-3 py-1.5 rounded-full border border-amber-200">
                  {star}★ & above
                  <X size={12} className="cursor-pointer" onClick={() => toggleStar(star)} />
                </span>
              ))}
            </div>
          )}

          {/* Hotel Grid */}
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {[1, 2, 3, 4, 5, 6].map(i => (
                <div key={i} className="bg-white rounded-2xl h-96 animate-pulse">
                  <div className="h-48 bg-gray-200 rounded-t-2xl" />
                  <div className="p-5 space-y-4">
                    <div className="h-6 bg-gray-200 rounded w-3/4" />
                    <div className="h-4 bg-gray-200 rounded w-1/2" />
                    <div className="h-10 bg-gray-200 rounded mt-auto" />
                  </div>
                </div>
              ))}
            </div>
          ) : hotels.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {hotels.map(hotel => <HotelCard key={hotel.id} hotel={hotel} />)}
            </div>
          ) : (
            <div className="bg-white rounded-2xl p-12 text-center shadow-sm border border-gray-100">
              <div className="text-5xl mb-4">🔍</div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">No hotels found</h3>
              <p className="text-gray-500 mb-4">Try adjusting your destination or clearing some filters.</p>
              {activeFilterCount > 0 && (
                <button onClick={clearFilters} className="text-brand-600 font-medium hover:text-brand-700 underline">
                  Clear all filters
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Mobile Filters Drawer */}
      {mobileFiltersOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileFiltersOpen(false)} />
          <div className="relative ml-auto w-80 bg-white h-full p-6 overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-gray-900">Filters</h2>
              <button onClick={() => setMobileFiltersOpen(false)} className="p-2 rounded-full hover:bg-gray-100 transition-colors">
                <X size={18} />
              </button>
            </div>
            <FilterPanel />
            <button
              onClick={() => setMobileFiltersOpen(false)}
              className="mt-8 w-full bg-brand-600 text-white py-3 rounded-xl font-bold hover:bg-brand-700 transition-colors"
            >
              Show {hotels.length} Results
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Listing;
