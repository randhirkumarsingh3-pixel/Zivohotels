import React, { useEffect, useRef } from 'react';
import { Users, Plus, Minus } from 'lucide-react';
import { track } from '../../utils/analytics';

const GuestSelectorV2 = ({ guests, setGuests, rooms, setRooms, isOpen, setIsOpen }) => {
  const wrapperRef = useRef(null);
  
  // Handle outside click
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, setIsOpen]);

  const updateCount = (type, operation) => {
    if (type === 'guests') {
      const newVal = operation === 'add' ? guests + 1 : guests - 1;
      if (newVal >= 1 && newVal <= 20) {
        setGuests(newVal);
      }
    } else if (type === 'rooms') {
      const newVal = operation === 'add' ? rooms + 1 : rooms - 1;
      // Rule: At least 1 room, max 10 rooms
      if (newVal >= 1 && newVal <= 10) {
        setRooms(newVal);
        // Business Rule: Ensure there is at least 1 guest per room
        if (guests < newVal) {
          setGuests(newVal);
        }
      }
    }
  };

  const handleClose = () => {
    setIsOpen(false);
    track("GUESTS_SELECTED", { guests, rooms });
  };

  return (
    <div className="md:flex-1 relative min-w-0" ref={wrapperRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        className={`w-full h-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-colors ${isOpen ? 'bg-navy-50 ring-2 ring-navy-500/30' : 'hover:bg-gray-50'}`}
      >
        <Users className="h-5 w-5 shrink-0 text-brand-600" aria-hidden="true" />
        <span className="min-w-0">
          <span className="block text-xs font-semibold text-gray-500">Guests & rooms</span>
          <span className="block text-base font-semibold text-gray-900 whitespace-nowrap truncate">
            {guests} {guests === 1 ? 'guest' : 'guests'} · {rooms} {rooms === 1 ? 'room' : 'rooms'}
          </span>
        </span>
      </button>

      {isOpen && (
        <div className="absolute z-[9999] w-72 mt-2 bg-white rounded-xl shadow-2xl border border-gray-100 p-4 animate-fade-in origin-top right-0">
          
          {/* Guests Counter */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <div className="font-semibold text-gray-900 text-sm">Guests</div>
              <div className="text-xs text-gray-500">Ages 12 or above</div>
            </div>
            <div className="flex items-center space-x-3">
              <button 
                type="button"
                aria-label="Fewer guests"
                onClick={() => updateCount('guests', 'sub')}
                disabled={guests <= 1 || guests <= rooms}
                className="p-1.5 rounded-full border border-gray-200 text-gray-500 hover:border-navy-500 hover:text-navy-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Minus className="h-4 w-4" />
              </button>
              <span className="w-6 text-center font-semibold text-gray-900 tabular-nums" aria-live="polite">{guests}</span>
              <button 
                type="button"
                aria-label="More guests"
                onClick={() => updateCount('guests', 'add')}
                disabled={guests >= 20}
                className="p-1.5 rounded-full border border-gray-200 text-gray-500 hover:border-navy-500 hover:text-navy-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Rooms Counter */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <div className="font-semibold text-gray-900 text-sm">Rooms</div>
            </div>
            <div className="flex items-center space-x-3">
              <button 
                type="button"
                aria-label="Fewer rooms"
                onClick={() => updateCount('rooms', 'sub')}
                disabled={rooms <= 1}
                className="p-1.5 rounded-full border border-gray-200 text-gray-500 hover:border-navy-500 hover:text-navy-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Minus className="h-4 w-4" />
              </button>
              <span className="w-6 text-center font-semibold text-gray-900 tabular-nums" aria-live="polite">{rooms}</span>
              <button 
                type="button"
                aria-label="More rooms"
                onClick={() => updateCount('rooms', 'add')}
                disabled={rooms >= 10}
                className="p-1.5 rounded-full border border-gray-200 text-gray-500 hover:border-navy-500 hover:text-navy-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </div>

          <button 
            type="button"
            onClick={handleClose}
            className="w-full bg-navy-800 text-white font-semibold py-2.5 rounded-lg hover:bg-navy-900 transition-colors text-sm"
          >
            Done
          </button>
        </div>
      )}
    </div>
  );
};

export default React.memo(GuestSelectorV2);
