import React, { useState, useEffect, useRef } from 'react';
import { MapPin, Navigation, Search, Info, Loader2 } from 'lucide-react';

const LocationStep = ({ formData, updateForm }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [searching, setSearching] = useState(false);
  const [leafletLoaded, setLeafletLoaded] = useState(false);
  
  const mapRef = useRef(null);
  const markerRef = useRef(null);

  // Load Leaflet dynamically
  useEffect(() => {
    if (window.L) {
      setLeafletLoaded(true);
      return;
    }

    const cssId = 'leaflet-css';
    if (!document.getElementById(cssId)) {
      const link = document.createElement('link');
      link.id = cssId;
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
    }

    const jsId = 'leaflet-js';
    if (!document.getElementById(jsId)) {
      const script = document.createElement('script');
      script.id = jsId;
      script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      script.async = true;
      script.onload = () => {
        setLeafletLoaded(true);
      };
      document.body.appendChild(script);
    } else {
      const interval = setInterval(() => {
        if (window.L) {
          setLeafletLoaded(true);
          clearInterval(interval);
        }
      }, 100);
      return () => clearInterval(interval);
    }
  }, []);

  // Initialize Map
  useEffect(() => {
    if (!leafletLoaded) return;
    
    const mapElement = document.getElementById('onboarding-map');
    if (!mapElement) return;

    // Use current or default lat/lng
    const initialLat = parseFloat(formData.latitude) || 28.6139; // Delhi
    const initialLng = parseFloat(formData.longitude) || 77.2090;

    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
    }

    const map = window.L.map('onboarding-map', {
      zoomControl: false
    }).setView([initialLat, initialLng], 14);

    window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    const customIcon = window.L.divIcon({
      html: `
        <div class="relative flex items-center justify-center">
          <div class="absolute w-8 h-8 bg-blue-500/30 rounded-full animate-ping"></div>
          <svg class="w-8 h-8 text-blue-600 drop-shadow-md relative z-10" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
          </svg>
        </div>
      `,
      className: 'custom-leaflet-marker',
      iconSize: [32, 32],
      iconAnchor: [16, 32]
    });

    const marker = window.L.marker([initialLat, initialLng], {
      draggable: true,
      icon: customIcon
    }).addTo(map);

    mapRef.current = map;
    markerRef.current = marker;

    window.L.control.zoom({
      position: 'bottomright'
    }).addTo(map);

    // Coordinate / Reverse geocode handler
    const handleLocationUpdate = (lat, lng) => {
      updateForm('latitude', lat.toFixed(6));
      updateForm('longitude', lng.toFixed(6));
      reverseGeocode(lat, lng);
    };

    marker.on('dragend', () => {
      const position = marker.getLatLng();
      handleLocationUpdate(position.lat, position.lng);
    });

    map.on('click', (e) => {
      const { lat, lng } = e.latlng;
      marker.setLatLng([lat, lng]);
      handleLocationUpdate(lat, lng);
    });

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [leafletLoaded]);

  // Sync coords from inputs to map pin
  useEffect(() => {
    if (!mapRef.current || !markerRef.current) return;

    const lat = parseFloat(formData.latitude);
    const lng = parseFloat(formData.longitude);

    if (!isNaN(lat) && !isNaN(lng)) {
      const currentPos = markerRef.current.getLatLng();
      if (Math.abs(currentPos.lat - lat) > 0.0001 || Math.abs(currentPos.lng - lng) > 0.0001) {
        markerRef.current.setLatLng([lat, lng]);
        mapRef.current.setView([lat, lng], mapRef.current.getZoom());
      }
    }
  }, [formData.latitude, formData.longitude]);

  // Build combined address string from pieces for legacy backend structure
  useEffect(() => {
    const parts = [
      formData.houseNo,
      formData.area,
      formData.city,
      formData.state,
      formData.pincode,
      formData.country
    ].filter(Boolean);
    
    const combinedAddress = parts.join(', ');
    if (formData.address !== combinedAddress && parts.length > 0) {
      updateForm('address', combinedAddress);
    }
  }, [formData.houseNo, formData.area, formData.city, formData.state, formData.pincode, formData.country]);

  // Search Autocomplete Nominatim
  useEffect(() => {
    if (!searchQuery || searchQuery.trim().length < 3) {
      setSuggestions([]);
      return;
    }

    const timer = setTimeout(() => {
      fetchSuggestions();
    }, 500);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const fetchSuggestions = async () => {
    setSearching(true);
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&addressdetails=1&limit=5`
      );
      if (response.ok) {
        const data = await response.json();
        setSuggestions(data || []);
      }
    } catch (error) {
      console.error('Error fetching suggestions:', error);
    } finally {
      setSearching(false);
    }
  };

  const handleSelectSuggestion = (item) => {
    const lat = parseFloat(item.lat);
    const lng = parseFloat(item.lon);
    
    updateForm('latitude', lat.toFixed(6));
    updateForm('longitude', lng.toFixed(6));

    if (mapRef.current && markerRef.current) {
      markerRef.current.setLatLng([lat, lng]);
      mapRef.current.setView([lat, lng], 15);
    }

    const addr = item.address || {};
    
    const houseNo = addr.house_number || addr.building || addr.amenity || '';
    const area = addr.road || addr.suburb || addr.neighbourhood || addr.state_district || '';
    const pincode = addr.postcode || '';
    const country = addr.country || 'India';
    const state = addr.state || '';
    const city = addr.city || addr.town || addr.village || addr.municipality || '';
    
    updateForm('houseNo', houseNo);
    updateForm('area', area);
    updateForm('pincode', pincode);
    updateForm('country', country);
    updateForm('state', state);
    updateForm('city', city);
    updateForm('address', item.display_name || '');

    setSearchQuery(item.display_name || '');
    setSuggestions([]);
  };

  // Reverse Geocoding
  const reverseGeocode = async (lat, lng) => {
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&addressdetails=1`
      );
      if (response.ok) {
        const data = await response.json();
        if (data && data.address) {
          const addr = data.address;
          
          const houseNo = addr.house_number || addr.building || addr.amenity || '';
          const area = addr.road || addr.suburb || addr.neighbourhood || addr.state_district || '';
          const pincode = addr.postcode || '';
          const country = addr.country || 'India';
          const state = addr.state || '';
          const city = addr.city || addr.town || addr.village || addr.municipality || '';
          
          updateForm('houseNo', houseNo);
          updateForm('area', area);
          updateForm('pincode', pincode);
          updateForm('country', country);
          updateForm('state', state);
          updateForm('city', city);
          updateForm('address', data.display_name || '');
        }
      }
    } catch (error) {
      console.error('Error reverse geocoding:', error);
    }
  };

  // Current Location
  const handleUseCurrentLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          updateForm('latitude', latitude.toFixed(6));
          updateForm('longitude', longitude.toFixed(6));
          
          if (mapRef.current && markerRef.current) {
            markerRef.current.setLatLng([latitude, longitude]);
            mapRef.current.setView([latitude, longitude], 15);
          }
          
          reverseGeocode(latitude, longitude);
        },
        (error) => {
          console.error('Error getting location:', error);
          alert('Could not access your location. Please search for a location or pin it manually.');
        }
      );
    } else {
      alert('Geolocation is not supported by your browser.');
    }
  };

  return (
    <div className="p-4 sm:p-8 animate-fade-in bg-gray-50/50">
      <h1 className="text-2xl font-extrabold text-black mb-1">Property Location Details</h1>
      <p className="text-sm text-gray-500 mb-6">Please fill in the location details of your property.</p>

      {/* Info Warning Alert */}
      <div className="flex items-start gap-3 bg-blue-50 border border-blue-200 text-blue-900 p-4 rounded-lg mb-6 shadow-sm">
        <Info className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
        <p className="text-sm">
          Please enter the same address as on your address proof document (to be uploaded in the next step), to avoid rejections due to mismatch.
        </p>
      </div>

      <div className="flex flex-col lg:flex-row gap-8">
        {/* Left Side: Inputs Form */}
        <div className="w-full lg:w-[55%] space-y-5">
          {/* Search bar */}
          <div className="relative">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search here"
                className="w-full pl-10 pr-10 py-2.5 border border-gray-300 rounded-md focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none text-sm shadow-sm bg-white text-gray-900"
              />
              {searching && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4 animate-spin" />
              )}
            </div>
            
            {/* Search Suggestions Dropdown */}
            {suggestions.length > 0 && (
              <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-y-auto z-[9999]">
                {suggestions.map((item) => (
                  <button
                    key={item.place_id}
                    type="button"
                    onClick={() => handleSelectSuggestion(item)}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 border-b border-gray-100 last:border-0 flex items-start gap-2"
                  >
                    <MapPin className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />
                    <span>{item.display_name}</span>
                  </button>
                ))}
              </div>
            )}

            <button
              type="button"
              onClick={handleUseCurrentLocation}
              className="text-sm font-semibold text-blue-600 hover:text-blue-800 mt-2 flex items-center gap-1 cursor-pointer transition-colors"
            >
              Or Use My Current Location
            </button>
          </div>

          {/* House No */}
          <div>
            <label className="block text-sm font-semibold text-gray-800 mb-1.5">
              House/Building/Apartment No.
            </label>
            <input
              type="text"
              value={formData.houseNo || ''}
              onChange={(e) => updateForm('houseNo', e.target.value)}
              placeholder="e.g. A-102, Shanti Apartments"
              className="w-full px-3 py-2.5 border border-gray-300 rounded-md focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none text-sm shadow-sm bg-white text-gray-900"
            />
          </div>

          {/* Area */}
          <div>
            <label className="block text-sm font-semibold text-gray-800 mb-1.5">
              Locality/Area/Street/Sector
            </label>
            <input
              type="text"
              value={formData.area || ''}
              onChange={(e) => updateForm('area', e.target.value)}
              placeholder="e.g. Sector 62, Sadar Bazaar"
              className="w-full px-3 py-2.5 border border-gray-300 rounded-md focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none text-sm shadow-sm bg-white text-gray-900"
            />
          </div>

          {/* Pincode & Country */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-800 mb-1.5">
                Pincode
              </label>
              <input
                type="text"
                value={formData.pincode || ''}
                onChange={(e) => updateForm('pincode', e.target.value)}
                placeholder="e.g. 110006"
                className="w-full px-3 py-2.5 border border-gray-300 rounded-md focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none text-sm shadow-sm bg-white text-gray-900"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-800 mb-1.5">
                Country
              </label>
              <input
                type="text"
                value={formData.country || 'India'}
                onChange={(e) => updateForm('country', e.target.value)}
                placeholder="e.g. India"
                className="w-full px-3 py-2.5 border border-gray-300 rounded-md focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none text-sm shadow-sm bg-white text-gray-900"
              />
            </div>
          </div>

          {/* State */}
          <div>
            <label className="block text-sm font-semibold text-gray-800 mb-1.5">
              State
            </label>
            <input
              type="text"
              value={formData.state || ''}
              onChange={(e) => updateForm('state', e.target.value)}
              placeholder="e.g. Delhi"
              className="w-full px-3 py-2.5 border border-gray-300 rounded-md focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none text-sm shadow-sm bg-white text-gray-900"
            />
          </div>

          {/* City */}
          <div>
            <label className="block text-sm font-semibold text-gray-800 mb-1.5">
              City
            </label>
            <input
              type="text"
              value={formData.city || ''}
              onChange={(e) => updateForm('city', e.target.value)}
              placeholder="e.g. Delhi"
              className="w-full px-3 py-2.5 border border-gray-300 rounded-md focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none text-sm shadow-sm bg-white text-gray-900"
            />
          </div>

          {/* Latitude & Longitude */}
          <div className="grid grid-cols-2 gap-4 p-4 bg-gray-100 rounded-lg border border-gray-200">
            <div className="col-span-2 text-xs font-bold text-gray-700 uppercase tracking-wider mb-1 flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-blue-600" />
              <span>Map Coordinates (Latitude & Longitude)</span>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">
                Latitude
              </label>
              <input
                type="number"
                step="any"
                value={formData.latitude || ''}
                onChange={(e) => updateForm('latitude', e.target.value)}
                placeholder="e.g. 28.6139"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:border-blue-500 outline-none text-xs font-mono bg-white text-gray-900 shadow-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">
                Longitude
              </label>
              <input
                type="number"
                step="any"
                value={formData.longitude || ''}
                onChange={(e) => updateForm('longitude', e.target.value)}
                placeholder="e.g. 77.2090"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:border-blue-500 outline-none text-xs font-mono bg-white text-gray-900 shadow-sm"
              />
            </div>
          </div>

          {/* Checkbox agreement */}
          <label className="flex items-start gap-2.5 text-sm text-gray-700 mt-4 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={formData.agreeAddress === true}
              onChange={(e) => updateForm('agreeAddress', e.target.checked)}
              className="mt-1 w-4 h-4 rounded text-blue-600 border-gray-300 focus:ring-blue-500"
            />
            <span className="leading-snug">
              I agree to the <span className="text-blue-600 font-semibold hover:underline">terms and conditions</span> and confirm the address provided here is as per the registration or lease document.
            </span>
          </label>
        </div>

        {/* Right Side: Map Container */}
        <div className="w-full lg:w-[45%] flex flex-col">
          <div className="border border-gray-300 rounded-lg overflow-hidden shadow-sm h-[480px] lg:h-[500px] xl:h-[600px] sticky top-4 relative bg-gray-100 flex flex-col justify-center items-center">
            {leafletLoaded ? (
              <div id="onboarding-map" className="w-full h-full z-0"></div>
            ) : (
              <div className="text-center text-gray-500 flex flex-col items-center gap-2">
                <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                <span>Loading Interactive Map...</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default LocationStep;
