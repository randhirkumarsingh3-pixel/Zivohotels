import React, { useState, useEffect, useRef } from 'react';
import { MapPin, Navigation, History, Map as MapIcon, Building, AlertCircle, X } from 'lucide-react';
import { trackEvent } from '../../services/api';
import { getPopularDestinations, searchDestinations, nearbyDestinations } from '../../services/api';

const DestinationAutocomplete = ({ destination, setDestination, error, onFocusNext, _isMobile }) => {
  const [query, setQuery] = useState(destination?.label || '');
  // Show the destination chosen elsewhere (e.g. the search in the URL), unless the person is typing
  const destLabel = destination?.label || '';
  useEffect(() => {
    if (document.activeElement?.dataset?.destinationInput !== 'true') setQuery(destLabel);
  }, [destLabel]);
  const [isOpen, setIsOpen] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [popularCities, setPopularCities] = useState([]);
  const [recentSearches, setRecentSearches] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [fetchError, setFetchError] = useState(false);
  // Keyboard: arrow keys move through the visible options, Enter picks one, Escape closes
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const wrapperRef = useRef(null);

  // Load recent searches and popular cities on mount
  useEffect(() => {
    const saved = localStorage.getItem('zivo_recent_searches');
    if (saved) {
      try {
        // "Hotels Near Me" entries from the old placeholder searched a city called "nearby"
        setRecentSearches((JSON.parse(saved) || []).filter((r) => r && r.value !== 'nearby' && r.type !== 'near'));
      } catch (e) {
        console.error('Failed to parse recent searches');
      }
    }

    const fetchPopular = async () => {
      try {
        const data = await getPopularDestinations();
        if (data) setPopularCities(data);
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
  useEffect(() => { setFocusedIndex(-1); }, [query]);

  useEffect(() => {
    if (!query || query.length < 2) {
      setSuggestions([]);
      return;
    }

    const controller = new AbortController();
    setIsLoading(true);
    setFetchError(false);

    const timer = setTimeout(async () => {
      try {
        const data = await searchDestinations(query, { signal: controller.signal });
        setSuggestions(data || []);
      } catch (err) {
        if (err.name !== 'AbortError' && err.code !== 'TIMEOUT') {
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
    trackEvent("DESTINATION_SELECTED", { type: item.type, label: item.label });

    // Update Recent Searches (not "near me": a location is only right for the moment it was taken)
    if (item.type === 'near') { onFocusNext(); return; }
    const getUniqueKey = (x) => x.id || x.value || x.label;
    const updatedRecent = [item, ...recentSearches.filter(r => getUniqueKey(r) !== getUniqueKey(item))].slice(0, 3);
    setRecentSearches(updatedRecent);
    localStorage.setItem('zivo_recent_searches', JSON.stringify(updatedRecent));

    // Adaptive Focus Tunneling
    onFocusNext();
  };

  // "Use current location": hotels near the guest (within 50 km), nearest first
  const [nearNote, setNearNote] = useState('');
  const handleNearMe = () => {
    setNearNote('');
    if (!navigator.geolocation) { setNearNote('Your browser can’t share your location. Type a city instead.'); return; }
    setIsLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const data = await nearbyDestinations(pos.coords.latitude, pos.coords.longitude);
          if (data?.[0]?.type === 'near') handleSelect(data[0]);
          else setNearNote('No ZivoPlus hotels within 50 km of you yet. Type a city instead.');
        } catch (error) {
          console.error('Geolocation search failed', error);
          setNearNote('Couldn’t search near you. Please try again.');
        } finally {
          setIsLoading(false);
        }
      },
      () => {
        setIsLoading(false);
        setNearNote('Allow location access in your browser to search near you.');
      },
      { timeout: 10000, maximumAge: 300000 }
    );
  };

  const getIcon = (type) => {
    switch(type) {
      case 'city': return <MapIcon className="h-4 w-4 text-brand-500" />;
      case 'hotel': return <Building className="h-4 w-4 text-brand-500" />;
      case 'area': return <MapPin className="h-4 w-4 text-brand-500" />;
      case 'near': return <Navigation className="h-4 w-4 text-brand-500" />;
      default: return <MapPin className="h-4 w-4 text-gray-400" />;
    }
  };

  // Determine what to show in dropdown
  const showEmptyState = query.length < 2 && !isLoading;
  const hasResults = suggestions.length > 0;
  // The options in the order they are shown: "Use current location", then recent and popular
  // places (before typing) or the suggestions (while typing)
  const options = [
    { key: 'near', near: true },
    ...(showEmptyState && !fetchError ? [...recentSearches, ...popularCities] : []),
    ...(!showEmptyState && !isLoading ? suggestions : []),
  ];
  const optionId = (i) => `destination-option-${i}`;
  const indexOf = (loc) => options.indexOf(loc);
  const pick = (opt) => (opt.near ? handleNearMe() : handleSelect(opt));
  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!isOpen) setIsOpen(true);
      const n = options.length;
      setFocusedIndex((i) => (e.key === 'ArrowDown' ? (i + 1) % n : (i <= 0 ? n - 1 : i - 1)));
    } else if (e.key === 'Enter' && isOpen && focusedIndex >= 0 && options[focusedIndex]) {
      e.preventDefault();
      pick(options[focusedIndex]);
      setFocusedIndex(-1);
    } else if (e.key === 'Escape') {
      setIsOpen(false);
      setFocusedIndex(-1);
    }
  };
  const optionProps = (loc, i) => ({
    id: optionId(i),
    role: 'option',
    'aria-selected': focusedIndex === i,
    onMouseEnter: () => setFocusedIndex(i),
  });
  const focusRing = (i) => (focusedIndex === i ? ' bg-gray-100' : '');

  return (
    <div className="md:flex-[1.15] relative min-w-0" ref={wrapperRef}>
      <div
        className={`h-full flex items-center gap-3 px-4 py-3 rounded-xl cursor-text transition-colors ${isOpen ? 'bg-navy-50 ring-2 ring-navy-500/30' : 'hover:bg-gray-50'} ${error ? 'bg-red-50 ring-2 ring-red-500/40' : ''}`}
        onClick={() => setIsOpen(true)}
      >
        <MapPin className={`h-5 w-5 shrink-0 ${error ? 'text-red-600' : 'text-brand-600'}`} aria-hidden="true" />
        <div className="flex-1 min-w-0">
          <label htmlFor="destination-input" className="block text-xs font-semibold text-gray-500">Where to?</label>
          <input
            id="destination-input"
            type="text"
            autoComplete="off"
            placeholder="City, area or hotel"
            data-destination-input="true"
            role="combobox"
            aria-expanded={isOpen}
            aria-controls="destination-listbox"
            aria-autocomplete="list"
            aria-activedescendant={isOpen && focusedIndex >= 0 ? optionId(focusedIndex) : undefined}
            onKeyDown={onKeyDown}
            className="w-full bg-transparent border-none outline-none p-0 text-base font-semibold text-gray-900 placeholder:text-gray-400 placeholder:font-normal truncate"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              if (!isOpen) setIsOpen(true);
            }}
            onFocus={() => {
              setIsOpen(true);
              trackEvent("SEARCH_STARTED");
            }}
          />
        </div>
        {query && (
          <button type="button" aria-label="Clear destination" onClick={(e) => { e.stopPropagation(); setQuery(''); setDestination(null); }}
            className="p-1 rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-200 shrink-0">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>

      {isOpen && (
        <div id="destination-listbox" role="listbox" aria-label="Destinations" className="absolute z-[9999] w-full mt-2 bg-white rounded-xl shadow-2xl border border-gray-100 overflow-hidden animate-fade-in origin-top">
          
          {/* Near Me Option (Always Top) */}
          <div 
            {...optionProps(options[0], 0)}
            onClick={handleNearMe}
            className={`flex items-center px-4 py-3 cursor-pointer hover:bg-gray-50 border-b border-gray-100 transition-colors${focusRing(0)}`}
          >
            <div className="bg-blue-50 p-2 rounded-lg mr-3">
              <Navigation className="h-4 w-4 text-blue-600" />
            </div>
            <span className="font-semibold text-blue-600 text-sm">Use Current Location</span>
          </div>
          {nearNote && <p role="status" className="px-4 py-2 text-xs text-amber-800 bg-amber-50 border-b border-amber-100">{nearNote}</p>}

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
                        {...optionProps(loc, indexOf(loc))}
                        onClick={() => handleSelect(loc)}
                        className={`flex items-center px-4 py-2.5 cursor-pointer hover:bg-gray-50 group${focusRing(indexOf(loc))}`}
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
                        {...optionProps(loc, indexOf(loc))}
                        onClick={() => handleSelect(loc)}
                        className={`flex items-center px-4 py-2.5 cursor-pointer hover:bg-gray-50 group${focusRing(indexOf(loc))}`}
                      >
                        <div className="bg-gray-100 p-1.5 rounded mr-3 group-hover:bg-brand-50 transition-colors">
                          <MapIcon className="h-4 w-4 text-gray-500 group-hover:text-brand-700" />
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
              <ul className="py-2" role="presentation">
                {suggestions.map((loc) => (
                  <li 
                    key={loc.id || loc.value}
                    {...optionProps(loc, indexOf(loc))}
                    onClick={() => handleSelect(loc)}
                    className={`px-4 py-3 cursor-pointer flex items-center hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-0${focusRing(indexOf(loc))}`}
                  >
                    <div className="bg-brand-50 p-2 rounded-lg mr-3">
                      {getIcon(loc.type)}
                    </div>
                    <div className="flex flex-col">
                      <span className="font-semibold text-gray-900 text-sm">{loc.label}</span>
                      <span className="text-xs text-gray-500">{loc.sublabel ? `Hotel · ${loc.sublabel}` : ({ city: 'City', area: 'Area', hotel: 'Hotel' }[loc.type] || '')}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {/* No Results */}
            {!showEmptyState && !isLoading && !hasResults && !fetchError && (
              <div className="p-6 text-center text-gray-500">
                <MapPin className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                <p className="text-sm font-medium">No destinations found matching &quot;{query}&quot;</p>
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
