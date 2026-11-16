import React, { useEffect, useRef } from 'react';
import { Users, Plus, Minus, Trash2 } from 'lucide-react';
import { track } from '../../utils/analytics';
import { MAX_ROOMS, MAX_ADULTS_PER_ROOM, MAX_CHILDREN_PER_ROOM, occTotals } from '../../utils/occupancy';

const Counter = ({ label, value, onMinus, onPlus, minusDisabled, plusDisabled }) => (
  <div className="flex items-center space-x-3">
    <button type="button" aria-label={`Fewer ${label}`} onClick={onMinus} disabled={minusDisabled}
      className="p-1.5 rounded-full border border-gray-200 text-gray-500 hover:border-navy-500 hover:text-navy-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
      <Minus className="h-4 w-4" />
    </button>
    <span className="w-5 text-center font-semibold text-gray-900 tabular-nums" aria-live="polite">{value}</span>
    <button type="button" aria-label={`More ${label}`} onClick={onPlus} disabled={plusDisabled}
      className="p-1.5 rounded-full border border-gray-200 text-gray-500 hover:border-navy-500 hover:text-navy-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
      <Plus className="h-4 w-4" />
    </button>
  </div>
);

/**
 * Rooms and who stays in each: adults and children per room, up to 8 rooms.
 * occupancy = [{ adults, children }]; setOccupancy gets the new list.
 */
const GuestSelectorV2 = ({ occupancy, setOccupancy, isOpen, setIsOpen, align = 'right' }) => {
  const wrapperRef = useRef(null);
  const rooms = occupancy?.length ? occupancy : [{ adults: 2, children: 0 }];
  const { guests } = occTotals(rooms);

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

  const change = (i, field, delta) => setOccupancy(rooms.map((r, k) => (k === i ? { ...r, [field]: (r[field] || 0) + delta } : r)));
  const addRoom = () => setOccupancy([...rooms, { adults: 1, children: 0 }]);
  const removeRoom = (i) => setOccupancy(rooms.filter((_, k) => k !== i));

  const handleDone = () => {
    setIsOpen(false);
    track('GUESTS_SELECTED', { guests, rooms: rooms.length });
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
            {guests} {guests === 1 ? 'guest' : 'guests'} · {rooms.length} {rooms.length === 1 ? 'room' : 'rooms'}
          </span>
        </span>
      </button>

      {isOpen && (
        <div className={`absolute z-[9999] w-80 max-w-[calc(100vw-2rem)] mt-2 bg-white rounded-xl shadow-2xl border border-gray-100 p-4 animate-fade-in origin-top ${align === 'left' ? 'left-0' : 'right-0'}`}>
          <div className="max-h-[22rem] overflow-y-auto overscroll-contain -mx-1 px-1 divide-y divide-gray-100">
            {rooms.map((r, i) => (
              <div key={i} className="py-3 first:pt-0">
                <div className="flex items-center justify-between mb-2">
                  <p className="font-bold text-gray-900 text-sm">Room {i + 1}</p>
                  {rooms.length > 1 && (
                    <button type="button" onClick={() => removeRoom(i)} aria-label={`Remove room ${i + 1}`}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-gray-500 hover:text-red-600">
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Remove
                    </button>
                  )}
                </div>
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <div className="font-semibold text-gray-900 text-sm">Adults</div>
                    <div className="text-xs text-gray-500">Ages 18 or above</div>
                  </div>
                  <Counter label={`adults in room ${i + 1}`} value={r.adults}
                    onMinus={() => change(i, 'adults', -1)} onPlus={() => change(i, 'adults', 1)}
                    minusDisabled={r.adults <= 1} plusDisabled={r.adults >= MAX_ADULTS_PER_ROOM} />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-semibold text-gray-900 text-sm">Children</div>
                    <div className="text-xs text-gray-500">Ages 0–12</div>
                  </div>
                  <Counter label={`children in room ${i + 1}`} value={r.children || 0}
                    onMinus={() => change(i, 'children', -1)} onPlus={() => change(i, 'children', 1)}
                    minusDisabled={!r.children} plusDisabled={(r.children || 0) >= MAX_CHILDREN_PER_ROOM} />
                </div>
              </div>
            ))}
          </div>

          <div className="pt-3 mt-1 border-t border-gray-100 flex items-center justify-between gap-3">
            <button type="button" onClick={addRoom} disabled={rooms.length >= MAX_ROOMS}
              className="text-sm font-semibold text-navy-700 hover:text-navy-900 disabled:text-gray-300 disabled:cursor-not-allowed">
              + Add room
            </button>
            <button type="button" onClick={handleDone}
              className="px-5 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold rounded-lg transition-colors">
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default React.memo(GuestSelectorV2);
