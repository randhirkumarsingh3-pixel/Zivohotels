import { useEffect, useState } from 'react';
import DatePickerV2 from '../search/DatePickerV2';
import GuestSelectorV2 from '../search/GuestSelectorV2';

/**
 * The stay under the photos: dates and guests & rooms, changeable right here on every screen
 * size (on phones the booking box sits at the bottom of the page, too far down to use).
 * Prices and availability on the page follow the change.
 */
const useNarrow = () => {
  const q = '(max-width: 767px)';
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches);
  useEffect(() => {
    const m = window.matchMedia(q);
    const on = () => setNarrow(m.matches);
    m.addEventListener?.('change', on);
    return () => m.removeEventListener?.('change', on);
  }, []);
  return narrow;
};

const StayBar = ({ checkIn, checkOut, occupancy, onChange, openPicker, onToggle, pickerKey }) => {
  const narrow = useNarrow();
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-2 flex flex-col md:flex-row md:items-stretch gap-1 md:gap-0">
      <DatePickerV2
        key={pickerKey}
        checkIn={checkIn}
        setCheckIn={(v) => onChange({ checkIn: v })}
        checkOut={checkOut}
        setCheckOut={(v) => onChange({ checkOut: v })}
        isOpen={openPicker === 'dates'}
        setIsOpen={(o) => onToggle('dates', o)}
        onFocusNext={() => {}}
        isMobile={narrow}
      />
      <div className="h-px md:h-auto md:w-px bg-gray-200 mx-3 md:mx-1 md:my-3" aria-hidden="true" />
      <GuestSelectorV2
        occupancy={occupancy}
        setOccupancy={(occ) => onChange({ occupancy: occ })}
        isOpen={openPicker === 'guests'}
        setIsOpen={(o) => onToggle('guests', o)}
      />
    </div>
  );
};

export default StayBar;
