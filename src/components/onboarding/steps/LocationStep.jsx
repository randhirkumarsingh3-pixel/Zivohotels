import React, { useState, useEffect, useRef } from 'react';
import { MapPin, Navigation, Search, Info, Loader2 } from 'lucide-react';

const LocationStep = ({ formData, updateForm }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [googleLoaded, setGoogleLoaded] = useState(false);
  
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const autocompleteRef = useRef(null);

  // Parse Google Address Components
  const parseAddressComponents = (components) => {
    let houseNo = '';
    let street = '';
    let sublocality = '';
    let city = '';
    let state = '';
    let country = '';
    let pincode = '';

    components.forEach(c => {
      const types = c.types;
      if (types.includes('street_number')) {
        houseNo = c.long_name;
      } else if (types.includes('premise') || types.includes('subpremise')) {
        houseNo = c.long_name;
      } else if (types.includes('route')) {
        street = c.long_name;
      } else if (types.includes('sublocality') || types.includes('sublocality_level_1') || types.includes('neighborhood')) {
        sublocality = c.long_name;
      } else if (types.includes('locality')) {
        city = c.long_name;
      } else if (types.includes('administrative_area_level_1')) {
        state = c.long_name;
      } else if (types.includes('country')) {
        country = c.long_name;
      } else if (types.includes('postal_code')) {
        pincode = c.long_name;
      }
    });

    return {
      houseNo: houseNo || '',
      area: [street, sublocality].filter(Boolean).join(', '),
      city: city || '',
      state: state || '',
      country: country || 'India',
      pincode: pincode || ''
    };
  };

  // Load Google Maps script dynamically
  useEffect(() => {
    if (window.google && window.google.maps) {
      setGoogleLoaded(true);
      return;
    }

    const scriptId = 'google-maps-script';
    if (!document.getElementById(scriptId)) {
      const script = document.createElement('script');
      script.id = scriptId;
      const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';
      script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
      script.async = true;
      script.onload = () => {
        setGoogleLoaded(true);
      };
      document.body.appendChild(script);
    } else {
      const interval = setInterval(() => {
        if (window.google && window.google.maps) {
          setGoogleLoaded(true);
          clearInterval(interval);
        }
      }, 100);
      return () => clearInterval(interval);
    }
  }, []);

  // Initialize Map & Autocomplete
  useEffect(() => {
    if (!googleLoaded) return;

    const mapElement = document.getElementById('onboarding-map');
    const inputElement = document.getElementById('search-input');
    if (!mapElement || !inputElement) return;

    // Use current coordinates or default to Delhi
    const initialLat = parseFloat(formData.latitude) || 28.6139;
    const initialLng = parseFloat(formData.longitude) || 77.2090;

    // Create Map
    const map = new window.google.maps.Map(mapElement, {
      center: { lat: initialLat, lng: initialLng },
      zoom: 14,
      disableDefaultUI: true,
      zoomControl: true,
      zoomControlOptions: {
        position: window.google.maps.ControlPosition.RIGHT_BOTTOM
      }
    });

    // Create Marker
    const marker = new window.google.maps.Marker({
      position: { lat: initialLat, lng: initialLng },
      map: map,
      draggable: true
    });

    mapRef.current = map;
    markerRef.current = marker;

    // Create Autocomplete
    const autocomplete = new window.google.maps.places.Autocomplete(inputElement, {
      types: ['geocode', 'establishment']
    });

    // Prevent form submission on Enter inside search box
    window.google.maps.event.addDomListener(inputElement, 'keydown', (e) => {
      if (e.keyCode === 13) {
        e.preventDefault();
      }
    });

    // Handle place selection
    autocomplete.addListener('place_changed', () => {
      const place = autocomplete.getPlace();
      if (!place.geometry || !place.geometry.location) {
        console.error("No geometry returned for place:", place.name);
        return;
      }

      const lat = place.geometry.location.lat();
      const lng = place.geometry.location.lng();

      updateForm('latitude', lat.toFixed(6));
      updateForm('longitude', lng.toFixed(6));

      marker.setPosition({ lat, lng });
      map.setCenter({ lat, lng });
      map.setZoom(16);

      if (place.address_components) {
        const parsed = parseAddressComponents(place.address_components);
        updateForm('houseNo', parsed.houseNo);
        updateForm('area', parsed.area);
        updateForm('pincode', parsed.pincode);
        updateForm('country', parsed.country);
        updateForm('state', parsed.state);
        updateForm('city', parsed.city);
        updateForm('address', place.formatted_address || '');
      }

      setSearchQuery(place.formatted_address || place.name || '');
    });

    autocompleteRef.current = autocomplete;

    // Marker drag handler
    marker.addListener('dragend', () => {
      const pos = marker.getPosition();
      const lat = pos.lat();
      const lng = pos.lng();
      updateForm('latitude', lat.toFixed(6));
      updateForm('longitude', lng.toFixed(6));
      reverseGeocode(lat, lng);
    });

    // Map click handler
    map.addListener('click', (e) => {
      const lat = e.latLng.lat();
      const lng = e.latLng.lng();
      marker.setPosition({ lat, lng });
      updateForm('latitude', lat.toFixed(6));
      updateForm('longitude', lng.toFixed(6));
      reverseGeocode(lat, lng);
    });

    // If address is already set (editing), prefill search input
    if (formData.address) {
      setSearchQuery(formData.address);
    }

    return () => {
      if (window.google) {
        window.google.maps.event.clearInstanceListeners(marker);
        window.google.maps.event.clearInstanceListeners(map);
      }
    };
  }, [googleLoaded]);

  // Sync coords from manual inputs to map pin
  useEffect(() => {
    if (!googleLoaded || !mapRef.current || !markerRef.current) return;

    const lat = parseFloat(formData.latitude);
    const lng = parseFloat(formData.longitude);

    if (!isNaN(lat) && !isNaN(lng)) {
      const currentPos = markerRef.current.getPosition();
      if (currentPos) {
        const currLat = currentPos.lat();
        const currLng = currentPos.lng();
        if (Math.abs(currLat - lat) > 0.0001 || Math.abs(currLng - lng) > 0.0001) {
          markerRef.current.setPosition({ lat, lng });
          mapRef.current.setCenter({ lat, lng });
        }
      }
    }
  }, [formData.latitude, formData.longitude, googleLoaded]);

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

  // Reverse Geocoding
  const reverseGeocode = (lat, lng) => {
    if (!window.google || !window.google.maps) return;
    const geocoder = new window.google.maps.Geocoder();
    geocoder.geocode({ location: { lat, lng } }, (results, status) => {
      if (status === 'OK' && results[0]) {
        const place = results[0];
        const parsed = parseAddressComponents(place.address_components);
        
        updateForm('houseNo', parsed.houseNo);
        updateForm('area', parsed.area);
        updateForm('pincode', parsed.pincode);
        updateForm('country', parsed.country);
        updateForm('state', parsed.state);
        updateForm('city', parsed.city);
        updateForm('address', place.formatted_address || '');
        setSearchQuery(place.formatted_address || '');
      } else {
        console.error('Geocoder failed due to:', status);
      }
    });
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
            markerRef.current.setPosition({ lat: latitude, lng: longitude });
            mapRef.current.setCenter({ lat: latitude, lng: longitude });
            mapRef.current.setZoom(16);
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
                id="search-input"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search here"
                className="w-full pl-10 pr-10 py-2.5 border border-gray-300 rounded-md focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none text-sm shadow-sm bg-white text-gray-900"
              />
            </div>

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
            {googleLoaded ? (
              <div id="onboarding-map" className="w-full h-full z-0"></div>
            ) : (
              <div className="text-center text-gray-500 flex flex-col items-center gap-2">
                <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                <span>Loading Google Map...</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default LocationStep;
