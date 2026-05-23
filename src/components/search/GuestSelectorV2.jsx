import React, { useState, useEffect, useRef } from 'react';
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
    <div className="flex-1 relative group" ref={wrapperRef}>
      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1 ml-1">Guests & Rooms</label>
      
      <div 
        className={`flex items-center border rounded-xl px-4 py-3 bg-white transition-colors cursor-pointer ${isOpen ? 'border-brand-500 ring-2 ring-brand-500/20' : 'border-gray-200 hover:border-brand-500'}`}
        onClick={() => setIsOpen(!isOpen)}
      >
        <Users className={`mr-3 h-5 w-5 ${isOpen ? 'text-brand-500' : 'text-gray-400'}`} />
        <span className="text-sm font-medium text-gray-800">
          {guests} {guests === 1 ? 'Guest' : 'Guests'}, {rooms} {rooms === 1 ? 'Room' : 'Rooms'}
        </span>
      </div>

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
                onClick={() => updateCount('guests', 'sub')}
                disabled={guests <= 1 || guests <= rooms}
                className="p-1.5 rounded-full border border-gray-200 text-gray-500 hover:border-brand-500 hover:text-brand-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Minus className="h-4 w-4" />
              </button>
              <span className="w-4 text-center font-semibold text-gray-900">{guests}</span>
              <button 
                onClick={() => updateCount('guests', 'add')}
                disabled={guests >= 20}
                className="p-1.5 rounded-full border border-gray-200 text-gray-500 hover:border-brand-500 hover:text-brand-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
                onClick={() => updateCount('rooms', 'sub')}
                disabled={rooms <= 1}
                className="p-1.5 rounded-full border border-gray-200 text-gray-500 hover:border-brand-500 hover:text-brand-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Minus className="h-4 w-4" />
              </button>
              <span className="w-4 text-center font-semibold text-gray-900">{rooms}</span>
              <button 
                onClick={() => updateCount('rooms', 'add')}
                disabled={rooms >= 10}
                className="p-1.5 rounded-full border border-gray-200 text-gray-500 hover:border-brand-500 hover:text-brand-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </div>

          <button 
            onClick={handleClose}
            className="w-full bg-brand-50 text-brand-700 font-semibold py-2 rounded-lg hover:bg-brand-100 transition-colors text-sm"
          >
            Done
          </button>
        </div>
      )}
    </div>
  );
};

export default React.memo(GuestSelectorV2);
