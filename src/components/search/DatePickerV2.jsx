import React, { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { Calendar as CalendarIcon } from 'lucide-react';
// Small date helpers (the date library is only loaded with the calendar)
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (n) => String(n).padStart(2, '0');
const toYmd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const startOfToday = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); };
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const differenceInCalendarDays = (a, b) => Math.round((new Date(a.getFullYear(), a.getMonth(), a.getDate()) - new Date(b.getFullYear(), b.getMonth(), b.getDate())) / 86400000);
import { track } from '../../utils/analytics';

const RangeCalendar = lazy(() => import('./RangeCalendar'));
// Start loading the calendar as soon as the guest points at or focuses the dates
const preloadCalendar = () => { import('./RangeCalendar'); };

// "2026-12-10" -> local date (new Date("2026-12-10") is UTC midnight: the day before in the Americas)
const parseYmd = (s) => { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, m - 1, d); };
const thisYear = (d) => d.getFullYear() === new Date().getFullYear();
const label = (d) => (d ? `${DAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}${thisYear(d) ? '' : ` ${d.getFullYear()}`}` : null);
// Phones: "20 Dec" (with the weekday the dates were cut off as "Sun, 20 …")
const shortLabel = (d) => (d ? `${d.getDate()} ${MONTHS[d.getMonth()]}${thisYear(d) ? '' : ` ${String(d.getFullYear()).slice(2)}`}` : null);

const DatePickerV2 = ({ checkIn, setCheckIn, checkOut, setCheckOut, error, isOpen, setIsOpen, onFocusNext, isMobile }) => {
  const wrapperRef = useRef(null);

  // Internal state to manage the range
  const [range, setRange] = useState({
    from: checkIn ? parseYmd(checkIn) : startOfToday(),
    to: checkOut ? parseYmd(checkOut) : addDays(startOfToday(), 1)
  });

  // The dates shown are the dates searched: with none chosen yet, tonight is filled in (it used to be
  // shown but not set, so Search said "choose dates"). Later changes from outside (a prefilled bar on
  // the results page) are shown too.
  useEffect(() => {
    if (!checkIn && range.from) setCheckIn(toYmd(range.from));
    if (!checkOut && !checkIn && range.to) setCheckOut(toYmd(range.to));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!checkIn) return;
    const from = parseYmd(checkIn);
    const to = checkOut ? parseYmd(checkOut) : undefined;
    setRange((r) => (r?.from?.getTime() === from.getTime() && r?.to?.getTime() === to?.getTime() ? r : { from, to }));
  }, [checkIn, checkOut]);
  const nights = range?.from && range?.to ? differenceInCalendarDays(range.to, range.from) : 0;

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

  const handleSelect = (pickedRange, clickedDay) => {
    // The picker starts with a full range (today -> tomorrow). By default a click then EXTENDS that
    // range, so choosing 18 Dec as check-in produced "today -> 18 Dec" and closed the calendar.
    // Instead: a click on a complete range starts a new stay on that day; the next click (after
    // it) sets check-out.
    let newRange = pickedRange;
    if (clickedDay) {
      const hadFullRange = range?.from && range?.to;
      if (hadFullRange || !range?.from || clickedDay <= range.from) {
        newRange = { from: clickedDay, to: undefined };
      } else {
        newRange = { from: range.from, to: clickedDay };
      }
    }
    setRange(newRange);
    
    if (newRange?.from) {
      setCheckIn(toYmd(newRange.from));
    }
    if (newRange?.from && !newRange?.to) {
      // Don't keep an old check-out that may now be before the new check-in
      setCheckOut('');
    }
    
    // Auto-advance if both dates are selected
    if (newRange?.from && newRange?.to) {
      setCheckOut(toYmd(newRange.to));
      setIsOpen(false);
      track("DATES_SELECTED", { 
        checkIn: toYmd(newRange.from),
        checkOut: toYmd(newRange.to)
      });
      // Move to Guest selector
      onFocusNext();
    }
  };

  const today = startOfToday();

  // Custom styling for the day picker to match brand
  // Brand colours for the calendar (doubled class so it wins over the library's own stylesheet,
  // which loads after this one)
  const cssStyles = `
    .rdp-root.rdp-root {
      --rdp-accent-color: #e7194a; /* brand-600 */
      --rdp-accent-background-color: #fde3e9; /* brand-100 */
      --rdp-day-width: 40px;
      --rdp-day-height: 40px;
      --rdp-day_button-width: 38px;
      --rdp-day_button-height: 38px;
      margin: 0;
    }
  `;

  const toggleCalendar = (e) => {
    e.stopPropagation();
    setIsOpen(!isOpen);
  };

  return (
    <div className="md:flex-[1.7] relative min-w-0" ref={wrapperRef}>
      <style>{cssStyles}</style>
      <button
        type="button"
        onClick={toggleCalendar}
        onPointerEnter={preloadCalendar}
        onFocus={preloadCalendar}
        aria-expanded={isOpen}
        aria-label={`Dates: ${label(range.from) || 'choose check-in'} to ${label(range.to) || 'choose check-out'}`}
        className={`w-full h-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-colors ${isOpen ? 'bg-navy-50 ring-2 ring-navy-500/30' : 'hover:bg-gray-50'} ${error ? 'bg-red-50 ring-2 ring-red-500/40' : ''}`}
      >
        <CalendarIcon className={`h-5 w-5 shrink-0 ${error ? 'text-red-600' : 'text-brand-600'}`} aria-hidden="true" />
        <span className="flex-1 min-w-0 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <span className="min-w-0">
            <span className="block text-xs font-semibold text-gray-500">Check-in</span>
            <span className={`block text-base font-semibold whitespace-nowrap truncate ${range.from ? 'text-gray-900' : 'text-gray-400 font-normal'}`}>{range.from ? <><span className="sm:hidden">{shortLabel(range.from)}</span><span className="hidden sm:inline">{label(range.from)}</span></> : 'Add date'}</span>
          </span>
          <span className={`text-xs font-semibold rounded-full px-2 py-0.5 whitespace-nowrap ${nights ? 'bg-navy-50 text-navy-800' : 'text-gray-400'}`}>{nights ? `${nights} night${nights === 1 ? '' : 's'}` : '→'}</span>
          <span className="min-w-0">
            <span className="block text-xs font-semibold text-gray-500">Check-out</span>
            <span className={`block text-base font-semibold whitespace-nowrap truncate ${range.to ? 'text-gray-900' : 'text-gray-400 font-normal'}`}>{range.to ? <><span className="sm:hidden">{shortLabel(range.to)}</span><span className="hidden sm:inline">{label(range.to)}</span></> : 'Add date'}</span>
          </span>
        </span>
      </button>

      {isOpen && (
        <div className="absolute z-[9999] mt-2 bg-white rounded-xl shadow-2xl border border-gray-100 p-4 animate-fade-in origin-top left-0 md:-left-10 lg:left-0">
          <p className="text-sm font-semibold text-gray-700 mb-2 px-1">{range?.from && !range?.to ? 'Now choose your check-out date' : 'Choose your check-in date'}</p>
          <Suspense fallback={<div className={`${isMobile ? 'w-[280px]' : 'w-[560px]'} h-[300px] flex items-center justify-center text-sm text-gray-400`}>Loading calendar…</div>}>
            <RangeCalendar
              selected={range}
              onSelect={handleSelect}
              numberOfMonths={isMobile ? 1 : 2}
              defaultMonth={range?.from}
              disabled={{ before: today }}
            />
          </Suspense>
        </div>
      )}
    </div>
  );
};

export default React.memo(DatePickerV2);
