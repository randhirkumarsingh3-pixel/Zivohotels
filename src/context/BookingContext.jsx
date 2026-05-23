import { createContext, useContext, useState } from 'react';

const BookingContext = createContext();

export const useBooking = () => {
  const context = useContext(BookingContext);
  if (!context) {
    throw new Error('useBooking must be used within a BookingProvider');
  }
  return context;
};

export const BookingProvider = ({ children }) => {
  // Global state for search queries
  const [searchParams, setSearchParams] = useState({
    destination: '',
    checkIn: '',
    checkOut: '',
    guests: 2,
    rooms: 1,
  });

  // Global state for selected hotel
  const [selectedHotel, setSelectedHotel] = useState(null);

  const updateSearchParams = (params) => {
    setSearchParams((prev) => ({ ...prev, ...params }));
  };

  const clearBooking = () => {
    setSelectedHotel(null);
  };

  return (
    <BookingContext.Provider
      value={{
        searchParams,
        updateSearchParams,
        selectedHotel,
        setSelectedHotel,
        clearBooking,
      }}
    >
      {children}
    </BookingContext.Provider>
  );
};
