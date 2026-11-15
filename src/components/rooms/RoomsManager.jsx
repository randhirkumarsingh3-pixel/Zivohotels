import { useState, useEffect, useCallback } from 'react';
import { Plus, Settings2, Tag, ChevronDown, ChevronUp, Power, Network, BedDouble, Users, CheckCircle2, AlertTriangle, X } from 'lucide-react';
import RoomTypeModal from '../../admin/components/RoomTypeModal';
import RatePlanModal from '../../admin/components/RatePlanModal';
import { getImageUrl } from '../../utils/image';

/**
 * Room types and their rate plans for one property: add, edit, switch off / on. Shared by
 * Admin -> Room Config and Extranet -> Rooms & Rate Plans; owners are limited to their own
 * properties by the API (/admin/rooms, /admin/rate-plans). Nightly prices per date, rooms to sell
 * and stop-sell are set in Inventory & Rates.
 */
const BASE_URL = import.meta.env.VITE_API_URL || '/api/v1';
const API_URL = `${BASE_URL}/admin`;
const authHeaders = () => {
  const token = localStorage.getItem('jwt_token');
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
};

const MEAL_LABEL = { NONE: 'Room only', EP: 'Room only', CP: 'Breakfast', MAP: 'Breakfast + 1 meal', AP: 'All meals' };
const inr = (n) => `₹${Number(n).toLocaleString('en-IN')}`;

/** Turns an API error into one readable line (field errors from validation included). */
const errorMessage = (json, fallback) => {
  const fieldErrors = json?.errors?.fieldErrors;
  if (fieldErrors && Object.keys(fieldErrors).length) {
    const field = Object.keys(fieldErrors)[0];
    return `${field.charAt(0).toUpperCase() + field.slice(1)}: ${fieldErrors[field][0]}`;
  }
  return json?.message || fallback;
};

const RoomsManager = ({ hotelId, inventoryLink }) => {
  const [roomTypes, setRoomTypes] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [notice, setNotice] = useState(null); // { type: 'success' | 'error', text }
  const [showInactive, setShowInactive] = useState(false);

  const [isRoomModalOpen, setIsRoomModalOpen] = useState(false);
  const [editingRoomType, setEditingRoomType] = useState(null);
  const [isRatePlanModalOpen, setIsRatePlanModalOpen] = useState(false);
  const [activeRoomTypeId, setActiveRoomTypeId] = useState(null);
  const [editingRatePlan, setEditingRatePlan] = useState(null);
  const [expandedRooms, setExpandedRooms] = useState({});

  const flash = (type, text) => {
    setNotice({ type, text });
    if (type === 'success') setTimeout(() => setNotice((n) => (n?.text === text ? null : n)), 4000);
  };

  const fetchRoomTypes = useCallback(async () => {
    if (!hotelId) { setRoomTypes([]); return; }
    setIsLoading(true);
    setLoadError('');
    try {
      const res = await fetch(`${API_URL}/rooms?propertyId=${hotelId}&includeInactive=true`, { headers: authHeaders() });
      const json = await res.json();
      if (json.success) setRoomTypes(json.data);
      else setLoadError(json.message || 'Could not load room types');
    } catch {
      setLoadError('Could not load room types. Check your connection and try again.');
    } finally {
      setIsLoading(false);
    }
  }, [hotelId]);

  useEffect(() => { fetchRoomTypes(); }, [fetchRoomTypes]);

  const send = async (url, method, body) => {
    try {
      const res = await fetch(url, { method, headers: authHeaders(), ...(body ? { body: JSON.stringify(body) } : {}) });
      const json = await res.json().catch(() => ({}));
      return res.ok && json.success !== false ? { ok: true, json } : { ok: false, message: errorMessage(json, 'Could not save. Please try again.') };
    } catch {
      return { ok: false, message: 'Network error. Check your connection and try again.' };
    }
  };

  // ROOM TYPES
  const handleRoomSubmit = async (payload) => {
    const editing = editingRoomType;
    const result = editing
      ? await send(`${API_URL}/rooms/${editing.id}`, 'PATCH', payload)
      : await send(`${API_URL}/rooms`, 'POST', { ...payload, hotelId });
    if (result.ok) {
      flash('success', editing ? `${payload.name} saved` : `${payload.name} added with a room-only rate plan. Set dates and prices in Inventory & Rates.`);
      if (!editing && result.json?.data?.id) setExpandedRooms((p) => ({ ...p, [result.json.data.id]: true }));
      fetchRoomTypes();
    }
    return result;
  };

  const toggleRoomActive = async (room) => {
    if (room.isActive) {
      if (!confirm(`Switch off "${room.name}"? Guests won't be able to book it. Existing bookings are kept, and you can switch it back on at any time.`)) return;
      const result = await send(`${API_URL}/rooms/${room.id}`, 'DELETE');
      if (result.ok) flash('success', result.json?.message || `${room.name} switched off`);
      else flash('error', result.message);
    } else {
      const result = await send(`${API_URL}/rooms/${room.id}`, 'PATCH', { isActive: true });
      if (result.ok) flash('success', `${room.name} is on sale again`);
      else flash('error', result.message);
    }
    fetchRoomTypes();
  };

  // RATE PLANS
  const openRatePlanModal = (roomTypeId, ratePlan = null) => {
    setActiveRoomTypeId(roomTypeId);
    setEditingRatePlan(ratePlan);
    setIsRatePlanModalOpen(true);
  };

  const handleRatePlanSubmit = async (payload) => {
    const editing = editingRatePlan;
    const result = editing
      ? await send(`${API_URL}/rate-plans/${editing.id}`, 'PATCH', payload)
      : await send(`${API_URL}/rate-plans`, 'POST', { ...payload, roomTypeId: activeRoomTypeId });
    if (result.ok) {
      flash('success', `Rate plan "${payload.name}" saved`);
      fetchRoomTypes();
    }
    return result;
  };

  const toggleRatePlanActive = async (rp) => {
    if (rp.isActive) {
      if (!confirm(`Take the rate plan "${rp.name}" off sale? Existing bookings are kept.`)) return;
      const result = await send(`${API_URL}/rate-plans/${rp.id}`, 'DELETE');
      if (result.ok) flash('success', `${rp.name} taken off sale`);
      else flash('error', result.message);
    } else {
      const result = await send(`${API_URL}/rate-plans/${rp.id}`, 'PATCH', { isActive: true });
      if (result.ok) flash('success', `${rp.name} is on sale again`);
      else flash('error', result.message);
    }
    fetchRoomTypes();
  };

  if (!hotelId) return null;

  const visibleRooms = roomTypes.filter((r) => showInactive || r.isActive);
  const inactiveCount = roomTypes.filter((r) => !r.isActive).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-bold text-gray-800">Room types</h2>
          {inactiveCount > 0 && (
            <label className="flex items-center gap-2 text-xs font-medium text-gray-500 cursor-pointer">
              <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} className="rounded border-gray-300" />
              Show {inactiveCount} switched off
            </label>
          )}
        </div>
        <button
          type="button"
          onClick={() => { setEditingRoomType(null); setIsRoomModalOpen(true); }}
          className="bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-lg font-medium flex items-center transition-colors shadow-sm text-sm"
        >
          <Plus size={18} className="mr-1.5" /> Add Room Type
        </button>
      </div>

      {notice && (
        <div role={notice.type === 'error' ? 'alert' : 'status'} className={`flex items-start gap-2 p-3 rounded-lg text-sm border ${notice.type === 'error' ? 'bg-red-50 border-red-200 text-red-700' : 'bg-green-50 border-green-200 text-green-800'}`}>
          {notice.type === 'error' ? <AlertTriangle size={16} className="mt-0.5 shrink-0" /> : <CheckCircle2 size={16} className="mt-0.5 shrink-0" />}
          <span className="flex-1">{notice.text}</span>
          <button type="button" aria-label="Dismiss" onClick={() => setNotice(null)} className="opacity-60 hover:opacity-100"><X size={14} /></button>
        </div>
      )}

      {loadError && <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg text-sm">{loadError}</div>}

      {isLoading && roomTypes.length === 0 ? (
        <div className="p-8 text-center text-gray-500">Loading rooms…</div>
      ) : visibleRooms.length === 0 && !loadError ? (
        <div className="bg-white border border-gray-200 rounded-xl p-10 text-center shadow-sm">
          <BedDouble className="mx-auto text-gray-300 mb-3" size={36} />
          <h3 className="text-lg font-medium text-gray-900">No room types yet</h3>
          <p className="text-gray-500 mt-1">Add your first room type: its name, how many rooms you have and a starting price.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {visibleRooms.map((room) => {
            const primary = room.images?.find((img) => img.isPrimary) || room.images?.[0];
            const plansOnSale = (room.ratePlans || []).filter((rp) => rp.isActive);
            const expanded = expandedRooms[room.id];
            return (
              <div key={room.id} className={`bg-white border rounded-xl shadow-sm overflow-hidden ${room.isActive ? 'border-gray-200' : 'border-dashed border-gray-300 opacity-75'}`}>
                <div className="p-5 flex flex-wrap items-center justify-between gap-3 hover:bg-gray-50 transition-colors">
                  <button type="button" className="flex items-center gap-4 text-left" onClick={() => setExpandedRooms((p) => ({ ...p, [room.id]: !p[room.id] }))}>
                    <div className="w-16 h-12 bg-gray-100 rounded-lg overflow-hidden border border-gray-200 flex-shrink-0">
                      {primary?.image?.url ? (
                        <img src={getImageUrl(primary.image.url)} className="w-full h-full object-cover" alt="" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-300"><Tag size={16} /></div>
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-lg font-bold text-gray-900">{room.name}</h3>
                        {room.code && <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs font-semibold rounded">{room.code}</span>}
                      </div>
                      <p className="text-sm text-gray-500 mt-0.5 flex items-center gap-3">
                        <span className="flex items-center gap-1"><BedDouble size={14} /> {room.totalInventory} room{room.totalInventory === 1 ? '' : 's'}</span>
                        <span className="flex items-center gap-1"><Users size={14} /> up to {room.maxOccupancy} guests</span>
                        <span>{plansOnSale.length} rate plan{plansOnSale.length === 1 ? '' : 's'}</span>
                      </p>
                    </div>
                  </button>

                  <div className="flex items-center gap-2">
                    <span className={`px-2.5 py-1 rounded-md text-xs font-medium ${room.isActive ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                      {room.isActive ? 'On sale' : 'Switched off'}
                    </span>
                    <button type="button" title="Edit room type" aria-label={`Edit ${room.name}`} onClick={() => { setEditingRoomType(room); setIsRoomModalOpen(true); }} className="text-gray-400 hover:text-brand-600 p-1.5 transition-colors">
                      <Settings2 size={18} />
                    </button>
                    <button type="button" title={room.isActive ? 'Switch off' : 'Switch back on'} aria-label={room.isActive ? `Switch off ${room.name}` : `Switch on ${room.name}`} onClick={() => toggleRoomActive(room)} className={`p-1.5 transition-colors ${room.isActive ? 'text-gray-400 hover:text-red-600' : 'text-green-600 hover:text-green-700'}`}>
                      <Power size={18} />
                    </button>
                    <button type="button" aria-label={expanded ? 'Hide rate plans' : 'Show rate plans'} onClick={() => setExpandedRooms((p) => ({ ...p, [room.id]: !p[room.id] }))} className="text-gray-400 hover:text-gray-800 p-1.5 transition-colors">
                      {expanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                    </button>
                  </div>
                </div>

                {expanded && (
                  <div className="border-t border-gray-100 bg-gray-50 p-5">
                    <div className="flex flex-wrap justify-between items-center gap-2 mb-4">
                      <h4 className="font-semibold text-gray-800 text-sm flex items-center gap-2">
                        <Network size={16} className="text-brand-500" /> Rate plans
                      </h4>
                      <div className="flex items-center gap-3">
                        {inventoryLink && <a href={inventoryLink} className="text-xs font-medium text-gray-500 hover:text-brand-600">Prices by date →</a>}
                        <button type="button" onClick={() => openRatePlanModal(room.id)} className="text-xs font-medium text-brand-600 bg-brand-50 hover:bg-brand-100 px-3 py-1.5 rounded-md transition-colors">
                          + Add Rate Plan
                        </button>
                      </div>
                    </div>

                    {room.ratePlans?.length ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {room.ratePlans.map((rp) => (
                          <div key={rp.id} className={`bg-white border rounded-lg p-4 shadow-sm ${rp.isActive ? 'border-gray-200' : 'border-dashed border-gray-300 opacity-70'}`}>
                            <div className="flex justify-between items-start gap-2 mb-2">
                              <h5 className="font-bold text-gray-900">{rp.name}</h5>
                              <div className="flex gap-1 items-center shrink-0">
                                {!(Number(rp.basePrice) > 0) && (
                                  <span className="px-2 py-0.5 bg-orange-100 text-orange-700 rounded text-[10px] font-bold" title="Guests can't book a plan without a price">NO PRICE</span>
                                )}
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${rp.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'}`}>
                                  {rp.isActive ? 'ON SALE' : 'OFF SALE'}
                                </span>
                              </div>
                            </div>
                            <p className={`text-xl font-extrabold mb-2 ${Number(rp.basePrice) > 0 ? 'text-brand-600' : 'text-gray-400 italic'}`}>
                              {Number(rp.basePrice) > 0 ? inr(rp.basePrice) : '₹—'}
                              {Number(rp.basePrice) > 0 && <span className="text-xs font-medium text-gray-400"> base / night</span>}
                            </p>
                            <div className="flex flex-wrap gap-1 mb-3">
                              <span className="px-1.5 py-0.5 bg-gray-100 text-gray-600 text-[10px] font-medium rounded border border-gray-200">{MEAL_LABEL[rp.mealPlan] || rp.mealPlan}</span>
                              {rp.occupancyPricing?.length > 0 && (
                                <span className="px-1.5 py-0.5 bg-amber-50 text-amber-700 text-[10px] font-medium rounded border border-amber-200">Per-guest prices</span>
                              )}
                              {Number(rp.extraBedPrice) > 0 && (
                                <span className="px-1.5 py-0.5 bg-purple-50 text-purple-700 text-[10px] font-medium rounded border border-purple-200">
                                  Extra bed {rp.extraBedIncluded ? '(included)' : inr(rp.extraBedPrice)}
                                </span>
                              )}
                            </div>
                            <div className="flex gap-2 border-t border-gray-100 pt-2">
                              <button type="button" onClick={() => openRatePlanModal(room.id, rp)} className="text-xs font-semibold text-gray-600 hover:text-brand-600 flex items-center gap-1"><Settings2 size={13} /> Edit</button>
                              <button type="button" onClick={() => toggleRatePlanActive(rp)} className={`text-xs font-semibold flex items-center gap-1 ${rp.isActive ? 'text-gray-500 hover:text-red-600' : 'text-green-600 hover:text-green-700'}`}>
                                <Power size={13} /> {rp.isActive ? 'Take off sale' : 'Put on sale'}
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500 italic">No rate plans yet. Add one so guests can book this room.</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {isRoomModalOpen && (
        <RoomTypeModal
          isOpen={isRoomModalOpen}
          onClose={() => setIsRoomModalOpen(false)}
          onSubmit={handleRoomSubmit}
          initialData={editingRoomType}
          hotelId={hotelId}
        />
      )}

      {isRatePlanModalOpen && (
        <RatePlanModal
          isOpen={isRatePlanModalOpen}
          onClose={() => setIsRatePlanModalOpen(false)}
          onSubmit={handleRatePlanSubmit}
          initialData={editingRatePlan}
          parentRoomType={roomTypes.find((r) => r.id === activeRoomTypeId)}
        />
      )}
    </div>
  );
};

export default RoomsManager;
