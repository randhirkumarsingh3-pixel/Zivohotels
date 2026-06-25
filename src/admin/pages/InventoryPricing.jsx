import { useState, useEffect, useCallback } from 'react';
import { Building2, Calendar, RefreshCw, CheckCircle2 } from 'lucide-react';

const BASE_URL = import.meta.env.VITE_API_URL || '/api/v1';
const API_URL = `${BASE_URL}/admin`;
const getAuthHeaders = () => {
  const token = localStorage.getItem('jwt_token');
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
};

const formatDateLocal = (d) => {
  const date = new Date(d);
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
};

const toISO = (d) => new Date(d).toISOString().split('T')[0];

const InventoryPricing = () => {
  const today = new Date();
  const thirtyDays = new Date(); thirtyDays.setDate(today.getDate() + 14);

  const [properties, setProperties] = useState([]);
  const [selectedPropertyId, setSelectedPropertyId] = useState('');
  
  const [startDate, setStartDate] = useState(toISO(today));
  const [endDate, setEndDate]     = useState(toISO(thirtyDays));
  
  const [inventoryGrid, setInventoryGrid] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Bulk update modal/form state
  const [bulkForm, setBulkForm] = useState({
    roomTypeId: '',
    startDate: toISO(today),
    endDate: toISO(thirtyDays),
    totalRooms: ''
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Load properties
  useEffect(() => {
    const fetchProperties = async () => {
      try {
        const res  = await fetch(`${API_URL}/hotels`, { headers: getAuthHeaders() });
        const data = await res.json();
        if (res.ok) setProperties(data.data || []);
      } catch (e) {
        console.error(e);
      }
    };
    fetchProperties();
  }, []);

  const fetchInventory = useCallback(async () => {
    if (!selectedPropertyId) return;
    setLoading(true); setError('');
    try {
      const res = await fetch(`${API_URL}/inventory?propertyId=${selectedPropertyId}&startDate=${startDate}&endDate=${endDate}`, { headers: getAuthHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to load inventory');
      
      // Transform flat inventory into hierarchical grid: RoomType -> Dates
      const map = {};
      
      // 1. Initialize map with all property room types to ensure they show up even if no inventory rows exist
      if (data.roomTypes) {
        data.roomTypes.forEach(rt => {
          map[rt.id] = {
            roomTypeId: rt.id,
            roomTypeName: rt.name,
            totalInventory: rt.totalInventory,
            dates: {}
          };
        });
      }

      (data.data || []).forEach(inv => {
        const rtId = inv.roomTypeId;
        if (!map[rtId]) return;
        map[rtId].dates[toISO(inv.date)] = inv;
      });

      setInventoryGrid(Object.values(map));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [selectedPropertyId, startDate, endDate]);

  useEffect(() => {
    if (selectedPropertyId) fetchInventory();
    else setInventoryGrid([]);
  }, [selectedPropertyId, fetchInventory]);

  const handleBulkUpdate = async (e) => {
    e.preventDefault();
    if (!bulkForm.roomTypeId || !bulkForm.ratePlanId) {
      return alert("Select Room Type and Rate Plan for bulk update");
    }
    
    setSaving(true); setSaved(false);
    try {
      const payload = {
        roomTypeId: bulkForm.roomTypeId,
        startDate: bulkForm.startDate,
        endDate: bulkForm.endDate,
        ...(bulkForm.totalRooms !== '' && { totalRooms: Number(bulkForm.totalRooms) }),
      };
      
      const res = await fetch(`${API_URL}/inventory/bulk-update`, {
        method: 'POST', headers: getAuthHeaders(), body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Bulk update failed');
      
      setSaved(true);
      await fetchInventory();
      setTimeout(() => setSaved(false), 3000);
      setBulkForm(p => ({...p, totalRooms: '', price: ''})); // reset
    } catch (e) {
      alert(e.message);
    } finally {
      setSaving(false);
    }
  };

  // Generate date columns
  const dateCols = [];
  let cur = new Date(startDate);
  const end = new Date(endDate);
  while (cur <= end) {
    dateCols.push(toISO(cur));
    cur.setDate(cur.getDate() + 1);
  }

  // Extract unique roomtypes for the bulk update dropdown
  const uniqueRoomTypes = inventoryGrid.map(g => ({
    label: g.roomTypeName,
    id: g.roomTypeId
  }));

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex flex-col md:flex-row md:justify-between md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-black text-gray-900 tracking-tight">Physical Inventory</h2>
          <p className="text-gray-500 mt-0.5 text-sm">Manage real-time room availability and allocations across all channels.</p>
        </div>
        
        <div className="flex gap-3 items-center">
          <div className="relative">
            <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
            <select
              value={selectedPropertyId}
              onChange={(e) => setSelectedPropertyId(e.target.value)}
              className="pl-9 pr-8 py-2.5 border border-gray-300 rounded-lg text-sm font-medium outline-none appearance-none bg-white min-w-[220px]"
            >
              <option value="">— Select Property —</option>
              {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        </div>
      </div>

      {!selectedPropertyId ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center shadow-sm">
          <Calendar className="h-10 w-10 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-bold text-gray-900">Select a Property</h3>
          <p className="text-gray-500 text-sm">Select a property to load its active Room Types and Rate Plans.</p>
        </div>
      ) : (
        <>
          {/* Controls */}
          <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex flex-wrap gap-4 items-end justify-between">
            <div className="flex gap-3 items-center">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">View From</label>
                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="px-3 py-2 border rounded-lg text-sm" />
              </div>
              <span className="text-gray-400 mt-5">→</span>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">View Until</label>
                <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="px-3 py-2 border rounded-lg text-sm" />
              </div>
              <button onClick={fetchInventory} disabled={loading} className="mt-5 flex items-center gap-2 px-4 py-2 border rounded-lg hover:bg-gray-50 transition-colors text-sm font-semibold">
                <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
              </button>
            </div>
          </div>

          {error && <div className="p-4 bg-red-50 text-red-600 rounded-lg border border-red-200 text-sm">{error}</div>}

          {/* Bulk Update Tool */}
          {inventoryGrid.length > 0 && (
            <form onSubmit={handleBulkUpdate} className="bg-brand-50 p-5 rounded-xl border border-brand-100 shadow-sm grid grid-cols-2 md:grid-cols-6 gap-4 items-end">
              <div className="col-span-2">
                <label className="block text-xs font-semibold text-gray-600 mb-1">Target Room Type</label>
                <select 
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                  value={bulkForm.roomTypeId}
                  onChange={e => setBulkForm(p => ({ ...p, roomTypeId: e.target.value }))}
                  required
                >
                  <option value="">— Select Room —</option>
                  {uniqueRoomTypes.map((c, i) => (
                    <option key={i} value={c.id}>{c.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">From</label>
                <input type="date" value={bulkForm.startDate} onChange={e => setBulkForm(p => ({...p, startDate: e.target.value}))} className="w-full px-3 py-2 border rounded-lg text-sm" required />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">To</label>
                <input type="date" value={bulkForm.endDate} onChange={e => setBulkForm(p => ({...p, endDate: e.target.value}))} className="w-full px-3 py-2 border rounded-lg text-sm" required />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Total Room Limit</label>
                <input type="number" min={0} value={bulkForm.totalRooms} onChange={e => setBulkForm(p => ({...p, totalRooms: e.target.value}))} placeholder="Override" className="w-full px-3 py-2 border rounded-lg text-sm" />
              </div>
              <div className="col-span-2 md:col-span-6 flex justify-end">
                <button type="submit" disabled={saving} className="bg-brand-600 hover:bg-brand-700 text-white px-6 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-colors">
                  {saving ? <span className="animate-spin"><RefreshCw size={16} /></span> : saved ? <><CheckCircle2 size={16} /> Applied</> : 'Apply Bulk Update'}
                </button>
              </div>
            </form>
          )}

          {/* Data Grid */}
          {loading ? (
            <div className="py-12 text-center text-gray-400">Loading Calendar...</div>
          ) : inventoryGrid.length === 0 ? (
             <div className="py-12 text-center text-gray-400 bg-white rounded-xl border border-gray-200">
                No active Rate Plans found for this property&apos;s rooms. Ensure you configure rooms first.
             </div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto shadow-sm">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="px-4 py-3 text-left font-bold text-gray-700 min-w-[250px] sticky left-0 bg-gray-50 z-10 border-r border-gray-200">Room / Rate Plan</th>
                    {dateCols.map(d => (
                      <th key={d} className="px-4 py-3 text-center border-r border-gray-200 min-w-[100px]">
                        <div className="text-xs text-gray-400 font-semibold">{new Date(d).toLocaleDateString('en-IN', { weekday: 'short' })}</div>
                        <div className="font-bold text-gray-800">{formatDateLocal(d)}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {inventoryGrid.map((row, i) => (
                    <tr key={i} className="hover:bg-gray-50/50">
                      <td className="px-4 py-4 sticky left-0 bg-white group-hover:bg-gray-50/50 border-r border-gray-200 z-10 align-top">
                        <div className="font-bold text-gray-900 text-base">{row.roomTypeName}</div>
                        <div className="text-xs text-gray-500 mb-2">Physical: {row.totalInventory} units</div>
                        <div className="text-[10px] font-bold text-gray-400 uppercase">Physical Sync Active</div>
                      </td>
                      
                      {dateCols.map(d => {
                        const cell = row.dates[d];
                        const isSoldOut = cell && cell.availableRooms <= 0;
                        return (
                          <td key={d} className={`px-2 py-3 border-r border-gray-100 align-top ${isSoldOut ? 'bg-red-50/30' : ''}`}>
                            {cell ? (
                              <div className="flex flex-col gap-2">
                                <div className={`text-center py-1 rounded text-xs font-bold ${isSoldOut ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                                  {cell.availableRooms} / {cell.totalRooms}
                                </div>
                                {cell.bookedRooms > 0 && (
                                  <div className="text-[10px] text-center text-orange-600 font-bold uppercase tracking-wider">
                                    {cell.bookedRooms} Sold
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className="text-center text-gray-300 text-xs py-4 italic">No Entry<br/>(Defaults to base)</div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default InventoryPricing;
