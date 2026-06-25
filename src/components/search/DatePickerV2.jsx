import React, { useState, useEffect, useRef } from 'react';
import { Calendar as CalendarIcon, ArrowRight } from 'lucide-react';
import { DayPicker } from 'react-day-picker';
import { format, addDays, startOfToday } from 'date-fns';
import 'react-day-picker/dist/style.css';
import { track } from '../../utils/analytics';

const DatePickerV2 = ({ checkIn, setCheckIn, checkOut, setCheckOut, error, isOpen, setIsOpen, onFocusNext, isMobile }) => {
  const wrapperRef = useRef(null);
  
  // Internal state to manage the range
  const [range, setRange] = useState({
    from: checkIn ? new Date(checkIn) : startOfToday(),
    to: checkOut ? new Date(checkOut) : addDays(startOfToday(), 1)
  });

  // Handle outside click
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        // Only close if we actually clicked outside. 
        // Don't auto-close immediately if they just opened it.
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, setIsOpen]);

  const handleSelect = (newRange) => {
    setRange(newRange);
    
    if (newRange?.from) {
      setCheckIn(format(newRange.from, 'yyyy-MM-dd'));
    }
    
    // Auto-advance if both dates are selected
    if (newRange?.from && newRange?.to) {
      setCheckOut(format(newRange.to, 'yyyy-MM-dd'));
      setIsOpen(false);
      track("DATES_SELECTED", { 
        checkIn: format(newRange.from, 'yyyy-MM-dd'),
        checkOut: format(newRange.to, 'yyyy-MM-dd')
      });
      // Move to Guest selector
      onFocusNext();
    }
  };

  const today = startOfToday();

  // Custom styling for the day picker to match brand
  const cssStyles = `
    .rdp {
      --rdp-cell-size: 40px;
      --rdp-accent-color: #EF4444; /* brand-500 */
      --rdp-background-color: #FEF2F2; /* brand-50 */
      margin: 0;
    }
    .rdp-day_selected, .rdp-day_selected:focus-visible, .rdp-day_selected:hover {
      background-color: var(--rdp-accent-color);
      color: white;
      font-weight: bold;
    }
    .rdp-day_selected:hover {
      background-color: #DC2626; /* brand-600 */
    }
  `;

  const toggleCalendar = (e) => {
    e.stopPropagation();
    setIsOpen(!isOpen);
  };

  return (
    <div className="flex-1 relative group" ref={wrapperRef}>
      <style>{cssStyles}</style>
      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1 ml-1">Dates</label>
      
      <div 
        className={`flex items-center border rounded-xl px-4 py-3 bg-white transition-colors cursor-pointer ${isOpen ? 'border-brand-500 ring-2 ring-brand-500/20' : 'border-gray-200 hover:border-brand-500'} ${error ? 'border-red-500 ring-2 ring-red-500/20' : ''}`}
        onClick={toggleCalendar}
      >
        <CalendarIcon className={`mr-3 h-5 w-5 ${error ? 'text-red-500' : (isOpen ? 'text-brand-500' : 'text-gray-400')}`} />
        
        <div className="flex flex-1 items-center justify-between text-sm font-medium text-gray-800 pointer-events-none">
          <span>{range.from ? format(range.from, 'MMM dd, yyyy') : 'Add Check-in'}</span>
          <ArrowRight className="h-4 w-4 text-gray-300 mx-2" />
          <span>{range.to ? format(range.to, 'MMM dd, yyyy') : 'Add Check-out'}</span>
        </div>
      </div>

      {isOpen && (
        <div className="absolute z-[9999] mt-2 bg-white rounded-xl shadow-2xl border border-gray-100 p-4 animate-fade-in origin-top left-0 md:-left-10 lg:left-0">
          <DayPicker
            mode="range"
            selected={range}
            onSelect={handleSelect}
            numberOfMonths={isMobile ? 1 : 2}
            disabled={{ before: today }}
            pagedNavigation
            showOutsideDays={false}
          />
        </div>
      )}
    </div>
  );
};

export default React.memo(DatePickerV2);
