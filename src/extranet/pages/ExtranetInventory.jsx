import AriCalendar from '../../components/ari/AriCalendar';
import { useExtranet } from '../context/ExtranetContext';

/**
 * Extranet -> Inventory & Rates for the active property. (This page was a mock: it always showed
 * "Syncing with STAAH" and fixed sample rooms, and saved nothing.) If the property is connected to
 * a channel manager, the calendar is read-only and says where to update.
 */
const ExtranetInventory = () => {
  const { hotelId, property } = useExtranet();
  return (
    <div className="space-y-6 pb-12">
      <div>
        <h1 className="text-3xl font-black text-gray-900 tracking-tight">Inventory &amp; Rates</h1>
        <p className="text-gray-500 font-medium mt-1">
          Rooms to sell, stop-sell and nightly prices for {property?.name || 'your property'}. Click any day to change it.
        </p>
      </div>
      {hotelId ? <AriCalendar hotelId={hotelId} /> : <p className="text-gray-400">Loading…</p>}
    </div>
  );
};

export default ExtranetInventory;
