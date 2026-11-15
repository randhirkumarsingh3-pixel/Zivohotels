import { Link } from 'react-router-dom';
import { CalendarDays } from 'lucide-react';
import RoomsManager from '../../components/rooms/RoomsManager';
import { useExtranet } from '../context/ExtranetContext';

/**
 * Extranet -> Rooms & Rate Plans for the active property: add and edit room types (photos,
 * occupancy, number of rooms), their rate plans and base prices, and switch either off or on.
 * (The old page could only edit a room's name and counts, its "Add Room Type" button did nothing,
 * and its save sent the form straight into the database.)
 */
const ExtranetRooms = () => {
  const { hotelId, property } = useExtranet();
  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight">Rooms &amp; Rate Plans</h1>
          <p className="text-gray-500 font-medium mt-1">
            Room types, number of rooms and rate plans for {property?.name || 'your property'}.
          </p>
        </div>
        <Link to="/extranet/inventory" className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 bg-white text-sm font-semibold text-gray-700 hover:border-brand-300 hover:text-brand-700">
          <CalendarDays size={16} /> Prices &amp; availability by date
        </Link>
      </div>
      {hotelId ? <RoomsManager key={hotelId} hotelId={hotelId} inventoryLink="/extranet/inventory" /> : <p className="text-gray-400">Loading…</p>}
    </div>
  );
};

export default ExtranetRooms;
