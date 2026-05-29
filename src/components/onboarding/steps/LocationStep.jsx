import React, { useState, useEffect, useRef } from 'react';
import { MapPin, Navigation, Search, Info, Loader2 } from 'lucide-react';

const LocationStep = ({ formData, updateForm }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [searching, setSearching] = useState(false);
  
  // Detect if Google Maps Key is defined and not a placeholder
  const hasGoogleKey = Boolean(
    import.meta.env.VITE_GOOGLE_MAPS_API_KEY && 
    import.meta.env.VITE_GOOGLE_MAPS_API_KEY.trim() !== '' && 
    !import.meta.env.VITE_GOOGLE_MAPS_API_KEY.includes('REPLACE_ME')
  );

  const [useGoogle, setUseGoogle] = useState(hasGoogleKey);
  const [googleLoaded, setGoogleLoaded] = useState(false);
  const [leafletLoaded, setLeafletLoaded] = useState(false);

  // Map and Marker references
  const googleMapRef = useRef(null);
  const googleMarkerRef = useRef(null);
  const autocompleteRef = useRef(null);

  const leafletMapRef = useRef(null);
  const leafletMarkerRef = useRef(null);

  // Handle Google Maps Auth Failure globally
  useEffect(() => {
    window.gm_authFailure = () => {
      console.warn("Google Maps Authentication Failed. Falling back to OpenStreetMap.");
      setUseGoogle(false);
    };
    return () => {
      window.gm_authFailure = null;
    };
  }, []);

  // Parse Google Address Components
  const parseGoogleAddressComponents = (components) => {
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

  // Load Map Libraries dynamically
  useEffect(() => {
    if (useGoogle) {
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
        script.onerror = () => {
          console.warn("Failed to load Google Maps script. Falling back to Leaflet.");
          setUseGoogle(false);
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
    } else {
      // Load Leaflet Fallback
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
    }
  }, [useGoogle]);

  // Initialize Map
  useEffect(() => {
    const mapElement = document.getElementById('onboarding-map');
    const inputElement = document.getElementById('search-input');
    if (!mapElement) return;

    const initialLat = parseFloat(formData.latitude) || 28.6139;
    const initialLng = parseFloat(formData.longitude) || 77.2090;

    if (useGoogle && googleLoaded) {
      // Initialize Google Map
      const map = new window.google.maps.Map(mapElement, {
        center: { lat: initialLat, lng: initialLng },
        zoom: 14,
        disableDefaultUI: true,
        zoomControl: true,
        zoomControlOptions: {
          position: window.google.maps.ControlPosition.RIGHT_BOTTOM
        }
      });

      const marker = new window.google.maps.Marker({
        position: { lat: initialLat, lng: initialLng },
        map: map,
        draggable: true
      });

      googleMapRef.current = map;
      googleMarkerRef.current = marker;

      // Initialize Places Autocomplete if input is ready
      if (inputElement) {
        const autocomplete = new window.google.maps.places.Autocomplete(inputElement, {
          types: ['geocode', 'establishment']
        });

        window.google.maps.event.addDomListener(inputElement, 'keydown', (e) => {
          if (e.keyCode === 13) e.preventDefault();
        });

        autocomplete.addListener('place_changed', () => {
          const place = autocomplete.getPlace();
          if (!place.geometry || !place.geometry.location) return;

          const lat = place.geometry.location.lat();
          const lng = place.geometry.location.lng();

          marker.setPosition({ lat, lng });
          map.setCenter({ lat, lng });
          map.setZoom(16);

          const bulkUpdate = {
            latitude: lat.toFixed(6),
            longitude: lng.toFixed(6)
          };

          if (place.address_components) {
            const parsed = parseGoogleAddressComponents(place.address_components);
            bulkUpdate.houseNo = parsed.houseNo;
            bulkUpdate.area = parsed.area;
            bulkUpdate.pincode = parsed.pincode;
            bulkUpdate.country = parsed.country;
            bulkUpdate.state = parsed.state;
            bulkUpdate.city = parsed.city;
            bulkUpdate.address = place.formatted_address || '';
          }

          updateForm(bulkUpdate);
          setSearchQuery(place.formatted_address || place.name || '');
        });

        autocompleteRef.current = autocomplete;
      }

      // Drag handler
      marker.addListener('dragend', () => {
        const pos = marker.getPosition();
        const lat = pos.lat();
        const lng = pos.lng();
        updateForm({
          latitude: lat.toFixed(6),
          longitude: lng.toFixed(6)
        });
        googleReverseGeocode(lat, lng);
      });

      // Click handler
      map.addListener('click', (e) => {
        const lat = e.latLng.lat();
        const lng = e.latLng.lng();
        marker.setPosition({ lat, lng });
        updateForm({
          latitude: lat.toFixed(6),
          longitude: lng.toFixed(6)
        });
        googleReverseGeocode(lat, lng);
      });

      if (formData.address) {
        setSearchQuery(formData.address);
      }

      return () => {
        window.google.maps.event.clearInstanceListeners(marker);
        window.google.maps.event.clearInstanceListeners(map);
      };
    } else if (!useGoogle && leafletLoaded) {
      // Initialize Leaflet Map
      if (leafletMapRef.current) {
        leafletMapRef.current.remove();
        leafletMapRef.current = null;
      }

      const map = window.L.map('onboarding-map', {
        zoomControl: false
      }).setView([initialLat, initialLng], 14);

      window.L.tileLayer('https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
        attribution: 'Map data © Google'
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

      leafletMapRef.current = map;
      leafletMarkerRef.current = marker;

      window.L.control.zoom({
        position: 'bottomright'
      }).addTo(map);

      const handleLocationUpdate = (lat, lng) => {
        updateForm({
          latitude: lat.toFixed(6),
          longitude: lng.toFixed(6)
        });
        osmReverseGeocode(lat, lng);
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

      if (formData.address) {
        setSearchQuery(formData.address);
      }

      return () => {
        if (leafletMapRef.current) {
          leafletMapRef.current.remove();
          leafletMapRef.current = null;
        }
      };
    }
  }, [useGoogle, googleLoaded, leafletLoaded]);

  // Sync coords from manual inputs to map pin
  useEffect(() => {
    const lat = parseFloat(formData.latitude);
    const lng = parseFloat(formData.longitude);
    if (isNaN(lat) || isNaN(lng)) return;

    if (useGoogle && googleLoaded && googleMarkerRef.current && googleMapRef.current) {
      const currentPos = googleMarkerRef.current.getPosition();
      if (currentPos) {
        const currLat = currentPos.lat();
        const currLng = currentPos.lng();
        if (Math.abs(currLat - lat) > 0.0001 || Math.abs(currLng - lng) > 0.0001) {
          googleMarkerRef.current.setPosition({ lat, lng });
          googleMapRef.current.setCenter({ lat, lng });
        }
      }
    } else if (!useGoogle && leafletLoaded && leafletMarkerRef.current && leafletMapRef.current) {
      const currentPos = leafletMarkerRef.current.getLatLng();
      if (Math.abs(currentPos.lat - lat) > 0.0001 || Math.abs(currentPos.lng - lng) > 0.0001) {
        leafletMarkerRef.current.setLatLng([lat, lng]);
        leafletMapRef.current.setView([lat, lng], leafletMapRef.current.getZoom());
      }
    }
  }, [formData.latitude, formData.longitude, useGoogle, googleLoaded, leafletLoaded]);

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

  // OpenStreetMap Nominatim Search Autocomplete (Only active in Leaflet mode)
  useEffect(() => {
    if (useGoogle || !searchQuery || searchQuery.trim().length < 3) {
      setSuggestions([]);
      return;
    }

    const timer = setTimeout(() => {
      fetchOSMSuggestions();
    }, 500);

    return () => clearTimeout(timer);
  }, [searchQuery, useGoogle]);

  const fetchOSMSuggestions = async () => {
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
      console.error('Error fetching OSM suggestions:', error);
    } finally {
      setSearching(false);
    }
  };

  const handleSelectOSMSuggestion = (item) => {
    const lat = parseFloat(item.lat);
    const lng = parseFloat(item.lon);
    
    if (leafletMapRef.current && leafletMarkerRef.current) {
      leafletMarkerRef.current.setLatLng([lat, lng]);
      leafletMapRef.current.setView([lat, lng], 15);
    }

    const addr = item.address || {};
    const houseNo = addr.house_number || addr.building || addr.amenity || '';
    const area = addr.suburb || addr.neighbourhood || addr.road || addr.residential || '';
    const pincode = addr.postcode || '';
    const country = addr.country || 'India';
    const state = addr.state || addr.province || addr.region || '';
    const city = addr.city || addr.town || addr.municipality || addr.village || addr.state_district || addr.county || '';
    
    updateForm({
      latitude: lat.toFixed(6),
      longitude: lng.toFixed(6),
      houseNo,
      area,
      pincode,
      country,
      state,
      city,
      address: item.display_name || ''
    });

    setSearchQuery(item.display_name || '');
    setSuggestions([]);
  };

  // Google Reverse Geocoding
  const googleReverseGeocode = (lat, lng) => {
    if (!window.google || !window.google.maps) return;
    const geocoder = new window.google.maps.Geocoder();
    geocoder.geocode({ location: { lat, lng } }, (results, status) => {
      if (status === 'OK' && results[0]) {
        const place = results[0];
        const parsed = parseGoogleAddressComponents(place.address_components);
        
        updateForm({
          houseNo: parsed.houseNo,
          area: parsed.area,
          pincode: parsed.pincode,
          country: parsed.country,
          state: parsed.state,
          city: parsed.city,
          address: place.formatted_address || ''
        });
        setSearchQuery(place.formatted_address || '');
      } else {
        console.warn('Google Geocoder failed due to status:', status, '- Attempting OSM Fallback.');
        osmReverseGeocode(lat, lng);
      }
    });
  };

  // OSM Nominatim Reverse Geocoding
  const osmReverseGeocode = async (lat, lng) => {
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&addressdetails=1`
      );
      if (response.ok) {
        const data = await response.json();
        if (data && data.address) {
          const addr = data.address;
          const houseNo = addr.house_number || addr.building || addr.amenity || '';
          const area = addr.suburb || addr.neighbourhood || addr.road || addr.residential || '';
          const pincode = addr.postcode || '';
          const country = addr.country || 'India';
          const state = addr.state || addr.province || addr.region || '';
          const city = addr.city || addr.town || addr.municipality || addr.village || addr.state_district || addr.county || '';
          
          updateForm({
            houseNo,
            area,
            pincode,
            country,
            state,
            city,
            address: data.display_name || ''
          });
          setSearchQuery(data.display_name || '');
        }
      }
    } catch (error) {
      console.error('Error in OSM reverse geocoding:', error);
    }
  };

  // Current Location
  const handleUseCurrentLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          updateForm({
            latitude: latitude.toFixed(6),
            longitude: longitude.toFixed(6)
          });
          
          if (useGoogle && googleLoaded && googleMarkerRef.current && googleMapRef.current) {
            googleMarkerRef.current.setPosition({ lat: latitude, lng: longitude });
            googleMapRef.current.setCenter({ lat: latitude, lng: longitude });
            googleMapRef.current.setZoom(16);
            googleReverseGeocode(latitude, longitude);
          } else if (!useGoogle && leafletLoaded && leafletMarkerRef.current && leafletMapRef.current) {
            leafletMarkerRef.current.setLatLng([latitude, longitude]);
            leafletMapRef.current.setView([latitude, longitude], 15);
            osmReverseGeocode(latitude, longitude);
          }
        },
        (error) => {
          console.error('Error getting geolocation:', error);
          alert('Could not access your location. Please type search term or pin manually.');
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
              {!useGoogle && searching && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4 animate-spin" />
              )}
            </div>
            
            {/* Search Suggestions Dropdown (Only rendered in OpenStreetMap/Leaflet fallback mode) */}
            {!useGoogle && suggestions.length > 0 && (
              <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-y-auto z-[9999]">
                {suggestions.map((item) => (
                  <button
                    key={item.place_id}
                    type="button"
                    onClick={() => handleSelectOSMSuggestion(item)}
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
              House/Building/Apartment No. <span className="text-red-500">*</span>
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
              Locality/Area/Street/Sector <span className="text-red-500">*</span>
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
                Pincode <span className="text-red-500">*</span>
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
                Country <span className="text-red-500">*</span>
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
              State <span className="text-red-500">*</span>
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
              City <span className="text-red-500">*</span>
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
            {(useGoogle && googleLoaded) || (!useGoogle && leafletLoaded) ? (
              <div id="onboarding-map" className="w-full h-full z-0"></div>
            ) : (
              <div className="text-center text-gray-500 flex flex-col items-center gap-2">
                <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                <span>Loading Map...</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default LocationStep;
