import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import DestinationAutocomplete from './DestinationAutocomplete';
import DatePickerV2 from './DatePickerV2';
import GuestSelectorV2 from './GuestSelectorV2';
import { track } from '../../utils/analytics';

// `initial` prefills the bar with the current search (results page); the home page starts empty
const SmartSearchBar = ({ isMobile, initial = null }) => {
  const navigate = useNavigate();
  const asDest = (d) => (d ? { label: d, value: d } : null);

  // Form State
  const [destination, setDestination] = useState(asDest(initial?.destination));
  const [checkIn, setCheckIn] = useState(initial?.checkIn || '');
  const [checkOut, setCheckOut] = useState(initial?.checkOut || '');
  const [guests, setGuests] = useState(initial?.guests || 2);
  const [rooms, setRooms] = useState(initial?.rooms || 1);
  const [error, setError] = useState(null);
  const initKey = initial ? [initial.destination, initial.checkIn, initial.checkOut, initial.guests, initial.rooms].join('|') : '';
  useEffect(() => {
    if (!initial) return;
    setDestination(asDest(initial.destination));
    setCheckIn(initial.checkIn || '');
    setCheckOut(initial.checkOut || '');
    setGuests(initial.guests || 2);
    setRooms(initial.rooms || 1);
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
        guests: guests.toString(),
        rooms: rooms.toString()
      });
      navigate(`/hotel/${destination.id}?${detailParams.toString()}`);
      return;
    }

    const searchVal = destination.value || destination.label;
    const params = new URLSearchParams({
      city: searchVal,
      checkin: checkIn,
      checkout: checkOut,
      guests: guests.toString(),
      rooms: rooms.toString()
    });

    navigate(`/hotels?${params.toString()}`);
  };

  return (
    <div className="w-full max-w-5xl mx-auto relative z-20">
      <div className="bg-white/10 backdrop-blur-md p-2 rounded-2xl md:rounded-full shadow-[0_8px_30px_rgb(0,0,0,0.12)]">
        <div className="flex flex-col md:flex-row gap-2 bg-white p-2 rounded-xl md:rounded-full">
          
          <DestinationAutocomplete 
            destination={destination}
            setDestination={setDestination}
            error={error === 'destination'}
            onFocusNext={() => handleFocusNext('destination')}
            isMobile={isMobile}
          />

          <div className="hidden md:block w-px bg-gray-200 my-2 mx-1"></div>

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

          <div className="hidden md:block w-px bg-gray-200 my-2 mx-1"></div>

          <GuestSelectorV2 
            guests={guests}
            setGuests={setGuests}
            rooms={rooms}
            setRooms={setRooms}
            isOpen={openSection === 'guests'}
            setIsOpen={(val) => setOpenSection(val ? 'guests' : null)}
          />

          <div className="mt-2 md:mt-0 md:ml-2">
            <button 
              type="button"
              onClick={handleSearch}
              // Always the brand red: a grey button looked disabled. Missing fields are pointed out on click.
              className="w-full md:w-auto h-full min-h-[56px] px-8 rounded-lg md:rounded-full font-bold text-lg flex items-center justify-center transition-colors bg-brand-600 hover:bg-brand-700 text-white"
            >
              <Search className="h-5 w-5 mr-2" />
              Search
            </button>
          </div>
        </div>
      </div>
      
      {error === 'destination' && (
        <div className="mt-3 text-red-100 text-sm font-medium bg-red-500/80 inline-block px-4 py-1.5 rounded-full animate-fade-in">
          Please select a destination
        </div>
      )}
    </div>
  );
};

export default React.memo(SmartSearchBar);
