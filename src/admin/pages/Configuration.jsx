import { useState, useEffect } from 'react';
import { Building2 } from 'lucide-react';
import RoomsManager from '../../components/rooms/RoomsManager';

const BASE_URL = import.meta.env.VITE_API_URL || '/api/v1';

/** Admin -> Room Config: room types and rate plans of any property (owners: their own). */
const Configuration = () => {
  const [properties, setProperties] = useState([]);
  const [selectedPropertyId, setSelectedPropertyId] = useState('');

  useEffect(() => {
    const token = localStorage.getItem('jwt_token');
    fetch(`${BASE_URL}/admin/hotels`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then((res) => res.json())
      .then((json) => { if (json.success) setProperties(json.data); })
      .catch((err) => console.error(err));
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4 bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Room Type &amp; Rate Configuration</h1>
          <p className="text-gray-500 mt-1">Room types, room counts and rate plans with their base prices. Prices by date are set in Inventory &amp; Rates.</p>
        </div>
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Building2 className="h-5 w-5 text-gray-400" />
          </div>
          <select
            aria-label="Property"
            value={selectedPropertyId}
            onChange={(e) => setSelectedPropertyId(e.target.value)}
            className="pl-10 pr-10 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none text-gray-800 font-medium bg-gray-50 appearance-none w-full md:w-64"
          >
            <option value="">Select Property</option>
            {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
      </div>

      {selectedPropertyId ? (
        <RoomsManager key={selectedPropertyId} hotelId={selectedPropertyId} />
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl p-10 text-center shadow-sm">
          <Building2 size={48} className="mx-auto text-gray-300 mb-3" />
          <h3 className="text-lg font-medium text-gray-900">No Property Selected</h3>
          <p className="text-gray-500 mt-1">Select a property above to manage its rooms.</p>
        </div>
      )}
    </div>
  );
};

export default Configuration;
