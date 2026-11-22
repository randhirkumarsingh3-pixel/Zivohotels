import { DayPicker } from 'react-day-picker';
import 'react-day-picker/dist/style.css';

/**
 * The calendar inside the date picker. Loaded only when a guest opens the dates (it's the
 * largest part of the search bar), so the home page doesn't download it up front.
 */
const RangeCalendar = (props) => <DayPicker mode="range" pagedNavigation showOutsideDays={false} {...props} />;

export default RangeCalendar;
