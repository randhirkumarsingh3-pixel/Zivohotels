import React, { useState, useEffect, useRef, useMemo } from 'react';
import { MapPin, Search, Navigation, History, Map as MapIcon, Building, AlertCircle } from 'lucide-react';
import { track } from '../../utils/analytics';

const BASE_URL = import.meta.env.VITE_API_URL || '/api/v1';

// Global memory cache for autocomplete
const searchCache = new Map();

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

const DestinationAutocomplete = ({ destination, setDestination, error, onFocusNext, isMobile }) => {
  const [query, setQuery] = useState(destination?.label || '');
  const [isOpen, setIsOpen] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [popularCities, setPopularCities] = useState([]);
  const [recentSearches, setRecentSearches] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [fetchError, setFetchError] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const wrapperRef = useRef(null);

  // Load recent searches and popular cities on mount
  useEffect(() => {
    const saved = localStorage.getItem('zivo_recent_searches');
    if (saved) {
      try {
        setRecentSearches(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to parse recent searches');
      }
    }

    const fetchPopular = async () => {
      try {
        const res = await fetch(`${BASE_URL}/public/search/popular`);
        if (res.ok) {
          const data = await res.json();
          setPopularCities(data);
        }
      } catch (error) {
        console.error('Failed to fetch popular cities', error);
      }
    };
    fetchPopular();
  }, []);

  // Handle outside click
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Smart Search API with Debounce & AbortController
  useEffect(() => {
    if (!query || query.length < 2) {
      setSuggestions([]);
      return;
    }

    // Check Cache
    if (searchCache.has(query)) {
      const { data, timestamp } = searchCache.get(query);
      if (Date.now() - timestamp < CACHE_TTL) {
        setSuggestions(data);
        setFetchError(false);
        return;
      } else {
        searchCache.delete(query);
      }
    }

    const controller = new AbortController();
    setIsLoading(true);
    setFetchError(false);

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`${BASE_URL}/public/search?q=${encodeURIComponent(query)}`, {
          signal: controller.signal
        });
        
        if (!res.ok) throw new Error('Network error');
        
        const data = await res.json();
        searchCache.set(query, { data, timestamp: Date.now() });
        setSuggestions(data);
      } catch (err) {
        if (err.name !== 'AbortError') {
          console.error('Search API Error:', err);
          setFetchError(true);
        }
      } finally {
        setIsLoading(false);
      }
    }, 300); // 300ms debounce

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const handleSelect = (item) => {
    setQuery(item.label);
    setDestination(item);
    setIsOpen(false);
    track("DESTINATION_SELECTED", { type: item.type, label: item.label });

    // Update Recent Searches
    const getUniqueKey = (x) => x.id || x.value || x.label;
    const updatedRecent = [item, ...recentSearches.filter(r => getUniqueKey(r) !== getUniqueKey(item))].slice(0, 3);
    setRecentSearches(updatedRecent);
    localStorage.setItem('zivo_recent_searches', JSON.stringify(updatedRecent));

    // Adaptive Focus Tunneling
    onFocusNext();
  };

  const handleNearMe = () => {
    if (!navigator.geolocation) return;
    
    setIsLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const res = await fetch(`${BASE_URL}/public/search/nearby?lat=${pos.coords.latitude}&lng=${pos.coords.longitude}`);
          if (res.ok) {
            const data = await res.json();
            if (data.length > 0) {
              handleSelect(data[0]); // Select first nearby result
            }
          }
        } catch (error) {
          console.error("Geolocation search failed", error);
        } finally {
          setIsLoading(false);
        }
      },
      (error) => {
        console.error("Geolocation denied", error);
        setIsLoading(false);
      }
    );
  };

  const getIcon = (type) => {
    switch(type) {
      case 'city': return <MapIcon className="h-4 w-4 text-brand-500" />;
      case 'hotel': return <Building className="h-4 w-4 text-brand-500" />;
      case 'area': return <MapPin className="h-4 w-4 text-brand-500" />;
      default: return <MapPin className="h-4 w-4 text-gray-400" />;
    }
  };

  // Determine what to show in dropdown
  const showEmptyState = query.length < 2 && !isLoading;
  const hasResults = suggestions.length > 0;

  return (
    <div className="flex-1 relative group" ref={wrapperRef}>
      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1 ml-1">Destination</label>
      <div 
        className={`flex items-center border rounded-xl px-4 py-3 bg-white transition-colors focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-500/20 cursor-text ${error ? 'border-red-500 ring-2 ring-red-500/20' : 'border-gray-200 hover:border-brand-500'}`}
        onClick={() => setIsOpen(true)}
      >
        <Search className={`mr-3 h-5 w-5 ${error ? 'text-red-500' : 'text-brand-500'}`} />
        <input 
          type="text" 
          placeholder="City, Hotel, or Area" 
          className="w-full bg-transparent border-none outline-none text-gray-800 placeholder-gray-400 font-medium text-base"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            if (!isOpen) setIsOpen(true);
          }}
          onFocus={() => {
            setIsOpen(true);
            track("SEARCH_STARTED");
          }}
        />
      </div>

      {isOpen && (
        <div className="absolute z-[9999] w-full mt-2 bg-white rounded-xl shadow-2xl border border-gray-100 overflow-hidden animate-fade-in origin-top">
          
          {/* Near Me Option (Always Top) */}
          <div 
            onClick={handleNearMe}
            className="flex items-center px-4 py-3 cursor-pointer hover:bg-gray-50 border-b border-gray-100 transition-colors"
          >
            <div className="bg-blue-50 p-2 rounded-lg mr-3">
              <Navigation className="h-4 w-4 text-blue-600" />
            </div>
            <span className="font-semibold text-blue-600 text-sm">Use Current Location</span>
          </div>

          <div className="max-h-[300px] overflow-y-auto overscroll-contain">
            {/* Loading State: Skeletons */}
            {isLoading && (
              <div className="py-2">
                {[1, 2, 3].map(i => (
                  <div key={i} className="flex items-center px-4 py-3">
                    <div className="bg-gray-200 rounded-lg h-8 w-8 mr-3 animate-pulse"></div>
                    <div className="space-y-2 flex-1">
                      <div className="h-4 bg-gray-200 rounded w-1/3 animate-pulse"></div>
                      <div className="h-3 bg-gray-100 rounded w-1/4 animate-pulse"></div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Error State */}
            {!isLoading && fetchError && (
              <div className="flex flex-col items-center justify-center p-6 text-gray-500">
                <AlertCircle className="h-8 w-8 text-red-400 mb-2" />
                <p className="text-sm font-medium">Network error. Please try again.</p>
              </div>
            )}

            {/* Empty State: Recent & Popular */}
            {showEmptyState && !isLoading && !fetchError && (
              <div className="py-2">
                {recentSearches.length > 0 && (
                  <div className="mb-2">
                    <div className="px-4 py-1 text-xs font-bold text-gray-400 uppercase tracking-wider">Recent Searches</div>
                    {recentSearches.map((loc, idx) => (
                      <div 
                        key={`recent-${idx}`} 
                        onClick={() => handleSelect(loc)}
                        className="flex items-center px-4 py-2.5 cursor-pointer hover:bg-gray-50 group"
                      >
                        <History className="h-4 w-4 text-gray-400 mr-3 group-hover:text-brand-500 transition-colors" />
                        <span className="text-gray-700 font-medium text-sm">{loc.label}</span>
                      </div>
                    ))}
                  </div>
                )}
                
                {popularCities.length > 0 && (
                  <div>
                    <div className="px-4 py-1 text-xs font-bold text-gray-400 uppercase tracking-wider">Popular Destinations</div>
                    {popularCities.map((loc, idx) => (
                      <div 
                        key={`pop-${idx}`} 
                        onClick={() => handleSelect(loc)}
                        className="flex items-center px-4 py-2.5 cursor-pointer hover:bg-gray-50 group"
                      >
                        <div className="bg-gray-100 p-1.5 rounded mr-3 group-hover:bg-brand-50 transition-colors">
                          <MapIcon className="h-4 w-4 text-gray-500 group-hover:text-brand-600" />
                        </div>
                        <span className="text-gray-700 font-medium text-sm">{loc.label}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Results State */}
            {!showEmptyState && !isLoading && hasResults && (
              <ul className="py-2">
                {suggestions.map((loc, index) => (
                  <li 
                    key={loc.id || loc.value}
                    onClick={() => handleSelect(loc)}
                    className="px-4 py-3 cursor-pointer flex items-center hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-0"
                  >
                    <div className="bg-brand-50 p-2 rounded-lg mr-3">
                      {getIcon(loc.type)}
                    </div>
                    <div className="flex flex-col">
                      <span className="font-semibold text-gray-900 text-sm">{loc.label}</span>
                      <span className="text-xs text-gray-500 capitalize">{loc.type}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {/* No Results */}
            {!showEmptyState && !isLoading && !hasResults && !fetchError && (
              <div className="p-6 text-center text-gray-500">
                <MapPin className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                <p className="text-sm font-medium">No destinations found matching "{query}"</p>
                <p className="text-xs mt-1">Try a different city, area, or hotel name.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default React.memo(DestinationAutocomplete);
