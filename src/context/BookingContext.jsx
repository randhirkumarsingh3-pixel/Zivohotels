import { createContext, useContext, useEffect, useState } from 'react';

// The search (dates, guests, rooms) survives a reload of any page in this tab
const STORAGE_KEY = 'zivo_search';
const DEFAULT_SEARCH = { destination: '', checkIn: '', checkOut: '', guests: 2, rooms: 1 };
const todayYmd = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const loadSearch = () => {
  try {
    const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || 'null');
    if (!saved || typeof saved !== 'object') return DEFAULT_SEARCH;
    // Dates in the past are dropped
    if (saved.checkIn && saved.checkIn < todayYmd()) { saved.checkIn = ''; saved.checkOut = ''; }
    return { ...DEFAULT_SEARCH, ...saved };
  } catch { return DEFAULT_SEARCH; }
};

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
  const [searchParams, setSearchParams] = useState(loadSearch);
  useEffect(() => {
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(searchParams)); } catch { /* storage unavailable */ }
  }, [searchParams]);

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
