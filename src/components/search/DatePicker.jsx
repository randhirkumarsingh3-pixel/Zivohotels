import { Calendar } from 'lucide-react';

const DatePicker = ({ checkIn, setCheckIn, checkOut, setCheckOut, error }) => {
  // Get today's date in YYYY-MM-DD format for the 'min' attribute
  const today = new Date().toISOString().split('T')[0];

  // If checkIn is selected, checkOut must be AT LEAST the day after checkIn
  const minCheckOut = checkIn 
    ? new Date(new Date(checkIn).getTime() + 86400000).toISOString().split('T')[0]
    : today;

  const handleCheckInChange = (e) => {
    const val = e.target.value;
    setCheckIn(val);
    // If checkout is now before checkin, clear it
    if (checkOut && val >= checkOut) {
      setCheckOut('');
    }
  };

  return (
    <div className="flex-1 relative group">
      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1 ml-1">Dates</label>
      <div className={`flex items-center border rounded-xl px-4 py-3 bg-white transition-colors focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-500/20 ${error ? 'border-red-500' : 'border-gray-200 hover:border-brand-500'}`}>
        <Calendar className="text-brand-500 mr-3 h-5 w-5 shrink-0" />
        
        <div className="flex items-center w-full justify-between relative">
          <input 
            type="date" 
            className="w-[45%] bg-transparent border-none outline-none text-gray-800 font-medium text-sm cursor-pointer" 
            value={checkIn}
            min={today}
            onChange={handleCheckInChange}
            required
          />
          <span className="text-gray-300 px-2">-</span>
          <input 
            type="date" 
            className="w-[45%] bg-transparent border-none outline-none text-gray-800 font-medium text-sm cursor-pointer" 
            value={checkOut}
            min={minCheckOut}
            onChange={(e) => setCheckOut(e.target.value)}
            disabled={!checkIn}
            required
          />
        </div>
      </div>
      {/* Hide default calendar icon on webkit browsers to make it look cleaner, relying on our Lucide icon */}
      <style dangerouslySetInnerHTML={{__html: `
        input[type="date"]::-webkit-calendar-picker-indicator {
          background: transparent;
          bottom: 0;
          color: transparent;
          cursor: pointer;
          height: auto;
          left: 0;
          position: absolute;
          right: 0;
          top: 0;
          width: auto;
        }
      `}} />
    </div>
  );
};

export default DatePicker;
