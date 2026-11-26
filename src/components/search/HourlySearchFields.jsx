import { CalendarDays, Clock, Hourglass, Users, ChevronDown } from 'lucide-react';
import { HOURLY_DURATIONS, HOURLY_STARTS, todayIst, timeLabel as label } from '../../utils/hourly';

/**
 * Hourly search fields: date, start time (every 30 minutes), duration and guests. Hotels set
 * their own hours; search shows which ones are free at the chosen start.
 */
const Box = ({ icon: Icon, title, children, w = 'md:w-[140px]' }) => (
  <label className={`flex-1 md:flex-none ${w} min-w-0 flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-50 cursor-pointer`}>
    <Icon className="h-5 w-5 text-brand-600 shrink-0" aria-hidden="true" />
    <span className="min-w-0 flex-1">
      <span className="block text-xs text-gray-500">{title}</span>
      {children}
    </span>
  </label>
);

const selectCls = 'w-full bg-transparent font-semibold text-gray-900 outline-none cursor-pointer -ml-1';
/** A select with its own arrow, kept clear of the text (the browser's arrow sat on top of it) */
const Select = ({ children, ...props }) => (
  <span className="relative block">
    <select {...props} className={`${selectCls} appearance-none pr-6`}>{children}</select>
    <ChevronDown className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" aria-hidden="true" />
  </span>
);

const HourlySearchFields = ({ value, onChange }) => {
  const set = (k) => (e) => onChange({ ...value, [k]: k === 'hours' || k === 'guests' ? Number(e.target.value) : e.target.value });
  return (
    <>
      <Box icon={CalendarDays} title="Date" w="md:w-[180px]">
        <input type="date" min={todayIst()} value={value.date} onChange={set('date')} className={selectCls} aria-label="Date" />
      </Box>
      <div className="h-px md:h-auto md:w-px bg-gray-200 mx-3 md:mx-1 md:my-3" aria-hidden="true" />
      <Box icon={Clock} title="Check-in time" w="md:w-[150px]">
        <Select value={value.start} onChange={set('start')} aria-label="Check-in time">
          {HOURLY_STARTS.map((t) => <option key={t} value={t}>{label(t)}</option>)}
        </Select>
      </Box>
      <div className="h-px md:h-auto md:w-px bg-gray-200 mx-3 md:mx-1 md:my-3" aria-hidden="true" />
      <Box icon={Hourglass} title="Stay for" w="md:w-[150px]">
        <Select value={value.hours} onChange={set('hours')} aria-label="Duration">
          {HOURLY_DURATIONS.map((h) => <option key={h} value={h}>{h} hours</option>)}
        </Select>
      </Box>
      <div className="h-px md:h-auto md:w-px bg-gray-200 mx-3 md:mx-1 md:my-3" aria-hidden="true" />
      <Box icon={Users} title="Guests" w="md:w-[150px]">
        <Select value={value.guests} onChange={set('guests')} aria-label="Guests">
          {[1, 2, 3, 4].map((g) => <option key={g} value={g}>{g} guest{g > 1 ? 's' : ''}</option>)}
        </Select>
      </Box>
    </>
  );
};

export default HourlySearchFields;
