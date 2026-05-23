import { useState, useRef, useEffect } from 'react';
import { Users, ChevronDown, Minus, Plus } from 'lucide-react';

const GuestSelector = ({ guests, setGuests, rooms, setRooms }) => {
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef(null);

  // We maintain local state for Adults and Children to calculate total guests
  const [adults, setAdults] = useState(guests || 2);
  const [children, setChildren] = useState(0);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Update parent state whenever local state changes
  useEffect(() => {
    setGuests(adults + children);
  }, [adults, children, setGuests]);

  const Counter = ({ label, desc, value, min, max, onChange }) => (
    <div className="flex justify-between items-center py-4 border-b border-gray-100 last:border-0">
      <div>
        <div className="font-semibold text-gray-800">{label}</div>
        {desc && <div className="text-xs text-gray-500">{desc}</div>}
      </div>
      <div className="flex items-center space-x-3">
        <button 
          onClick={() => onChange(value - 1)} 
          disabled={value <= min}
          className="h-8 w-8 rounded-full border border-gray-300 flex items-center justify-center text-gray-500 hover:border-brand-500 hover:text-brand-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <Minus className="h-4 w-4" />
        </button>
        <span className="w-4 text-center font-medium text-gray-800">{value}</span>
        <button 
          onClick={() => onChange(value + 1)} 
          disabled={value >= max}
          className="h-8 w-8 rounded-full border border-gray-300 flex items-center justify-center text-gray-500 hover:border-brand-500 hover:text-brand-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex-1 relative group" ref={wrapperRef}>
      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1 ml-1">Guests & Rooms</label>
      <div 
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center border border-gray-200 rounded-xl px-4 py-3 bg-white hover:border-brand-500 transition-colors cursor-pointer"
      >
        <Users className="text-brand-500 mr-3 h-5 w-5" />
        <div className="w-full flex justify-between items-center">
          <span className="text-gray-800 font-medium text-sm sm:text-base">
            {guests} Guest{guests > 1 ? 's' : ''}, {rooms} Room{rooms > 1 ? 's' : ''}
          </span>
          <ChevronDown className={`text-gray-400 h-4 w-4 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
        </div>
      </div>

      {isOpen && (
        <div className="absolute z-50 w-full md:w-80 right-0 mt-2 bg-white rounded-xl shadow-xl border border-gray-100 p-4 animate-fade-in cursor-default">
          <Counter 
            label="Adults" 
            desc="Ages 13 or above" 
            value={adults} 
            min={1} 
            max={10} 
            onChange={setAdults} 
          />
          <Counter 
            label="Children" 
            desc="Ages 0-12" 
            value={children} 
            min={0} 
            max={6} 
            onChange={setChildren} 
          />
          <Counter 
            label="Rooms" 
            value={rooms} 
            min={1} 
            max={5} 
            onChange={setRooms} 
          />
          <button 
            onClick={() => setIsOpen(false)}
            className="w-full mt-4 bg-gray-900 text-white font-medium py-2 rounded-lg hover:bg-gray-800 transition-colors"
          >
            Done
          </button>
        </div>
      )}
    </div>
  );
};

export default GuestSelector;
