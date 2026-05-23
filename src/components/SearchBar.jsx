import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { useBooking } from '../context/BookingContext';

import DestinationSearch from './search/DestinationSearch';
import DatePicker from './search/DatePicker';
import GuestSelector from './search/GuestSelector';

const SearchBar = ({ inline = false }) => {
  const navigate = useNavigate();
  const { searchParams, updateSearchParams } = useBooking();
  
  // Local state for the search bar, initialized from global context
  const [destination, setDestination] = useState(searchParams.destination || '');
  const [checkIn, setCheckIn] = useState(searchParams.checkIn || '');
  const [checkOut, setCheckOut] = useState(searchParams.checkOut || '');
  const [guests, setGuests] = useState(searchParams.guests || 2);
  const [rooms, setRooms] = useState(searchParams.rooms || 1);

  // Validation state
  const [errors, setErrors] = useState({ destination: false, dates: false });

  // Sync back if context changes externally
  useEffect(() => {
    setDestination(searchParams.destination || '');
    setCheckIn(searchParams.checkIn || '');
    setCheckOut(searchParams.checkOut || '');
    setGuests(searchParams.guests || 2);
    setRooms(searchParams.rooms || 1);
  }, [searchParams]);

  const handleSearch = () => {
    // Validate
    const newErrors = {
      destination: !destination.trim(),
      dates: !checkIn || !checkOut,
    };
    
    setErrors(newErrors);

    if (newErrors.destination || newErrors.dates) {
      // Shake animation or toast could be added here
      return;
    }

    // Update global context
    updateSearchParams({ 
      destination, 
      checkIn, 
      checkOut, 
      guests, 
      rooms 
    });

    // Navigate with URL params for sharing/refreshing
    const queryParams = new URLSearchParams({
      city: destination,
      checkin: checkIn,
      checkout: checkOut,
      guests: guests.toString()
    }).toString();

    navigate(`/hotels?${queryParams}`);
  };

  return (
    <div className={`glass-panel rounded-2xl p-4 md:p-6 w-full ${inline ? '' : 'mx-4 mt-8 lg:mx-0 max-w-5xl relative z-10 animate-fade-in-up'}`}>
      <div className={`flex flex-col ${inline ? 'lg:flex-row' : 'md:flex-row'} gap-4`}>
        
        <DestinationSearch 
          destination={destination} 
          setDestination={setDestination} 
          error={errors.destination} 
        />
        
        <DatePicker 
          checkIn={checkIn} 
          setCheckIn={setCheckIn} 
          checkOut={checkOut} 
          setCheckOut={setCheckOut} 
          error={errors.dates} 
        />
        
        <GuestSelector 
          guests={guests} 
          setGuests={setGuests} 
          rooms={rooms} 
          setRooms={setRooms} 
        />
        
        <div className={`flex items-end mt-2 ${inline ? 'lg:mt-0' : 'md:mt-0'}`}>
          <button 
            onClick={handleSearch}
            className="w-full md:w-auto bg-brand-600 hover:bg-brand-700 text-white font-bold py-3.5 px-8 rounded-xl shadow-lg shadow-brand-500/40 transition-all transform hover:-translate-y-0.5 flex items-center justify-center h-[50px] md:h-auto"
          >
            <Search className="h-5 w-5 mr-2" />
            Search
          </button>
        </div>
      </div>
      
      {/* Error Messages */}
      {(errors.destination || errors.dates) && (
        <div className="mt-3 text-red-500 text-sm font-medium animate-fade-in">
          {errors.destination && <span>• Please select a destination. </span>}
          {errors.dates && <span>• Please select check-in and check-out dates.</span>}
        </div>
      )}
    </div>
  );
};

export default SearchBar;
