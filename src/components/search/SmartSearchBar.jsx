import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import DestinationAutocomplete from './DestinationAutocomplete';
import DatePickerV2 from './DatePickerV2';
import GuestSelectorV2 from './GuestSelectorV2';
import { track } from '../../utils/analytics';
import { occupancyOf, occParams, occTotals, occToParam } from '../../utils/occupancy';

// `initial` prefills the bar with the current search (results page); the home page starts empty
const SmartSearchBar = ({ isMobile, initial = null }) => {
  const navigate = useNavigate();
  const asDest = (d) => (!d ? null : typeof d === 'object' ? d : { label: d, value: d });

  // Form State
  const [destination, setDestination] = useState(asDest(initial?.destination));
  const [checkIn, setCheckIn] = useState(initial?.checkIn || '');
  const [checkOut, setCheckOut] = useState(initial?.checkOut || '');
  // Rooms and who stays in each: [{ adults, children }]
  const [occupancy, setOccupancy] = useState(() => occupancyOf(initial || {}));
  const { guests, rooms } = occTotals(occupancy);
  const [error, setError] = useState(null);
  const initKey = initial ? [initial.destination?.label || initial.destination, initial.checkIn, initial.checkOut, initial.guests, initial.rooms, occToParam(initial.occupancy)].join('|') : '';
  useEffect(() => {
    if (!initial) return;
    setDestination(asDest(initial.destination));
    setCheckIn(initial.checkIn || '');
    setCheckOut(initial.checkOut || '');
    setOccupancy(occupancyOf(initial));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initKey]);

  // Sequential Flow Control
  const [openSection, setOpenSection] = useState(null); // 'destination', 'dates', 'guests', or null

  const handleFocusNext = (currentSection) => {
    if (isMobile) {
      // Wizard flow: force open next step
      if (currentSection === 'destination') setOpenSection('dates');
      if (currentSection === 'dates') setOpenSection('guests');
      if (currentSection === 'guests') setOpenSection(null);
    } else {
      // Desktop flow: Subtle guide. We don't force open the dropdowns, 
      // but we could highlight them or let the user click them naturally.
      // For now, we will gently open the calendar if it's completely empty.
      if (currentSection === 'destination' && !checkIn) {
        setOpenSection('dates');
      } else {
        setOpenSection(null);
      }
    }
  };

  const handleSearch = () => {
    if (!destination) {
      setError('destination');
      return;
    }
    if (!checkIn || !checkOut) {
      setError('dates');
      setOpenSection('dates');
      return;
    }

    setError(null);
    track("SEARCH_SUBMITTED", { 
      destination: destination.label, 
      checkIn, 
      checkOut, 
      guests, 
      rooms 
    });

    if (destination.type === 'hotel') {
      const detailParams = new URLSearchParams({
        checkin: checkIn,
        checkout: checkOut,
        ...occParams(occupancy)
      });
      navigate(`/hotel/${destination.id}?${detailParams.toString()}`);
      return;
    }

    // Near me: the location instead of a place name
    const where = destination.type === 'near' && destination.lat != null
      ? { lat: String(destination.lat), lng: String(destination.lng) }
      : { city: destination.value || destination.label };
    const params = new URLSearchParams({
      ...where,
      checkin: checkIn,
      checkout: checkOut,
      ...occParams(occupancy)
    });

    navigate(`/hotels?${params.toString()}`);
  };

  return (
    <div className="w-full max-w-5xl mx-auto relative z-20 text-left">
      <div className="bg-white rounded-2xl shadow-[0_16px_48px_rgba(3,27,49,0.35)] p-2 flex flex-col md:flex-row md:items-stretch gap-1 md:gap-0">
        <DestinationAutocomplete
          destination={destination}
          setDestination={setDestination}
          error={error === 'destination'}
          onFocusNext={() => handleFocusNext('destination')}
          isMobile={isMobile}
        />

        <div className="h-px md:h-auto md:w-px bg-gray-200 mx-3 md:mx-1 md:my-3" aria-hidden="true" />

        <DatePickerV2
          checkIn={checkIn}
          setCheckIn={setCheckIn}
          checkOut={checkOut}
          setCheckOut={setCheckOut}
          error={error === 'dates'}
          isOpen={openSection === 'dates'}
          setIsOpen={(val) => setOpenSection(val ? 'dates' : null)}
          onFocusNext={() => handleFocusNext('dates')}
          isMobile={isMobile}
        />

        <div className="h-px md:h-auto md:w-px bg-gray-200 mx-3 md:mx-1 md:my-3" aria-hidden="true" />

        <GuestSelectorV2
          occupancy={occupancy}
          setOccupancy={setOccupancy}
          isOpen={openSection === 'guests'}
          setIsOpen={(val) => setOpenSection(val ? 'guests' : null)}
        />

        <button
          type="button"
          onClick={handleSearch}
          className="mt-1 md:mt-0 md:ml-2 min-h-[56px] px-7 rounded-xl font-bold text-lg flex items-center justify-center gap-2 transition-colors bg-brand-600 hover:bg-brand-700 active:bg-brand-800 text-white shrink-0"
        >
          <Search className="h-5 w-5" aria-hidden="true" />
          Search
        </button>
      </div>

      {error && (
        <p role="alert" className="mt-3 inline-flex items-center gap-2 bg-white text-red-700 text-sm font-semibold px-4 py-1.5 rounded-full shadow">
          {error === 'destination' ? 'Choose where you want to stay' : 'Choose your check-in and check-out dates'}
        </p>
      )}
    </div>
  );
};

export default React.memo(SmartSearchBar);
