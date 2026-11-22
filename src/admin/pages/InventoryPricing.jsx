import { useState, useEffect } from 'react';
import { Building2, Calendar } from 'lucide-react';
import AriCalendar from '../../components/ari/AriCalendar';

const BASE_URL = import.meta.env.VITE_API_URL || '/api/v1';
const getAuthHeaders = () => {
  const token = localStorage.getItem('jwt_token');
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
};

/**
 * Admin -> Inventory & Rates: per-day rooms to sell, stop-sell and price per rate plan for any
 * property. (It used to show room counts only, and its bulk update could never run: it required a
 * rate plan the form didn't offer.)
 */
const InventoryPricing = () => {
  const [properties, setProperties] = useState([]);
  const [selectedPropertyId, setSelectedPropertyId] = useState('');

  useEffect(() => {
    fetch(`${BASE_URL}/admin/hotels?limit=100`, { headers: getAuthHeaders() })
      .then(r => r.json())
      .then(json => setProperties(json.data || []))
      .catch(console.error);
  }, []);

  return (
    <div className="space-y-6 pb-12">
      <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex flex-col md:flex-row md:justify-between md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-black text-gray-900 tracking-tight">Inventory &amp; Rates</h2>
          <p className="text-gray-500 mt-0.5 text-sm">Rooms to sell, stop-sell and nightly prices per rate plan. Guests see these on ZivoPlus straight away.</p>
        </div>
        <div className="relative">
          <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
          <select
            aria-label="Property"
            value={selectedPropertyId}
            onChange={(e) => setSelectedPropertyId(e.target.value)}
            className="pl-9 pr-8 py-2.5 border border-gray-300 rounded-lg text-sm font-medium outline-none appearance-none bg-white min-w-[240px]"
          >
            <option value="">— Select property —</option>
            {properties.map(p => <option key={p.id} value={p.id}>{p.name}{p.city ? ` · ${p.city}` : ''}</option>)}
          </select>
        </div>
      </div>

      {!selectedPropertyId ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center shadow-sm">
          <Calendar className="h-10 w-10 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-bold text-gray-900">Select a property</h3>
          <p className="text-gray-500 text-sm">Its room types and rate plans appear as a calendar you can edit.</p>
        </div>
      ) : (
        // Admins may edit even when a channel manager is connected (with a warning)
        <AriCalendar hotelId={selectedPropertyId} canEditWhenChannelManager />
      )}
    </div>
  );
};

export default InventoryPricing;
