import { useState, useEffect } from 'react';
import { Plus, Settings2, Building2, Tag, ChevronDown, ChevronUp, Trash2, Network } from 'lucide-react';
import RoomTypeModal from '../components/RoomTypeModal';
import RatePlanModal from '../components/RatePlanModal';

const API_URL = '/api/v1/admin';
const getAuthHeaders = () => {
  const token = localStorage.getItem('jwt_token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
  };
};

const Configuration = () => {
  const [properties, setProperties] = useState([]);
  const [selectedPropertyId, setSelectedPropertyId] = useState('');
  
  const [roomTypes, setRoomTypes] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  // Modals
  const [isRoomModalOpen, setIsRoomModalOpen] = useState(false);
  const [editingRoomType, setEditingRoomType] = useState(null);

  const [isRatePlanModalOpen, setIsRatePlanModalOpen] = useState(false);
  const [activeRoomTypeId, setActiveRoomTypeId] = useState(null);
  const [editingRatePlan, setEditingRatePlan] = useState(null);

  const [expandedRooms, setExpandedRooms] = useState({});

  useEffect(() => {
    fetchProperties();
  }, []);

  useEffect(() => {
    if (selectedPropertyId) {
      fetchRoomTypes();
    } else {
      setRoomTypes([]);
    }
  }, [selectedPropertyId]);

  const fetchProperties = async () => {
    try {
      const res = await fetch(`${API_URL}/hotels`, { headers: getAuthHeaders() });
      const json = await res.json();
      if (json.success) setProperties(json.data);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchRoomTypes = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`${API_URL}/rooms?propertyId=${selectedPropertyId}`, { headers: getAuthHeaders() });
      const json = await res.json();
      if (json.success) {
        setRoomTypes(json.data);
      } else {
        setError(json.message);
      }
    } catch (err) {
      setError('Failed to load room types');
    } finally {
      setIsLoading(false);
    }
  };

  const toggleRoomExpand = (roomId) => {
    setExpandedRooms(prev => ({ ...prev, [roomId]: !prev[roomId] }));
  };

  // ROOM TYPE CRUD
  const handleRoomSubmit = async (payload) => {
    try {
      const method = editingRoomType ? 'PATCH' : 'POST';
      const url = editingRoomType ? `${API_URL}/rooms/${editingRoomType.id}` : `${API_URL}/rooms`;
      
      const body = { ...payload, hotelId: selectedPropertyId };

      const res = await fetch(url, {
        method,
        headers: getAuthHeaders(),
        body: JSON.stringify(body)
      });
      const json = await res.json();
      
      if (json.success) {
        fetchRoomTypes();
        setIsRoomModalOpen(false);
      } else {
        if (json.errors && json.errors.fieldErrors) {
          const errors = json.errors.fieldErrors;
          const firstField = Object.keys(errors)[0];
          const firstMsg = errors[firstField][0];
          alert(`${firstField.charAt(0).toUpperCase() + firstField.slice(1)}: ${firstMsg}`);
        } else {
          alert(json.message || 'Failed to save room type');
        }
      }
    } catch (err) {
      alert('Network error while saving room type');
    }
  };

  const handleDeleteRoom = async (roomId) => {
    if (!confirm('Are you sure you want to delete this room type?')) return;
    try {
      await fetch(`${API_URL}/rooms/${roomId}`, { method: 'DELETE', headers: getAuthHeaders() });
      fetchRoomTypes();
    } catch (err) {
      alert('Failed to delete room');
    }
  };

  // RATE PLAN CRUD
  const openRatePlanModal = (roomTypeId, ratePlan = null) => {
    setActiveRoomTypeId(roomTypeId);
    setEditingRatePlan(ratePlan);
    setIsRatePlanModalOpen(true);
  };

  const handleRatePlanSubmit = async (payload) => {
    try {
      const method = editingRatePlan ? 'PATCH' : 'POST';
      const url = editingRatePlan ? `${API_URL}/rate-plans/${editingRatePlan.id}` : `${API_URL}/rate-plans`;
      
      const body = { ...payload, roomTypeId: activeRoomTypeId };

      const res = await fetch(url, {
        method,
        headers: getAuthHeaders(),
        body: JSON.stringify(body)
      });
      const json = await res.json();
      
      if (json.success) {
        fetchRoomTypes();
        setIsRatePlanModalOpen(false);
      } else {
        alert(json.message || 'Failed to save rate plan');
      }
    } catch (err) {
      alert('Network error while saving rate plan');
    }
  };

  const handleDeleteRatePlan = async (ratePlanId) => {
    if (!confirm('Are you sure you want to delete this rate plan?')) return;
    try {
      await fetch(`${API_URL}/rate-plans/${ratePlanId}`, { method: 'DELETE', headers: getAuthHeaders() });
      fetchRoomTypes();
    } catch (err) {
      alert('Failed to delete rate plan');
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Property Selector */}
      <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4 bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Room Type & Rate Configuration</h1>
          <p className="text-gray-500 mt-1">Manage static configurations for rooms and base prices.</p>
        </div>
        
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Building2 className="h-5 w-5 text-gray-400" />
          </div>
          <select
            value={selectedPropertyId}
            onChange={(e) => setSelectedPropertyId(e.target.value)}
            className="pl-10 pr-10 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none text-gray-800 font-medium bg-gray-50 appearance-none w-full md:w-64"
          >
            <option value="">Select Property</option>
            {properties.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
      </div>

      {!selectedPropertyId ? (
        <div className="bg-white border border-gray-200 rounded-xl p-10 text-center shadow-sm">
          <Building2 size={48} className="mx-auto text-gray-300 mb-3" />
          <h3 className="text-lg font-medium text-gray-900">No Property Selected</h3>
          <p className="text-gray-500 mt-1">Please select a property from the dropdown above to manage its rooms.</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-bold text-gray-800">Rooms List</h2>
            <button 
              onClick={() => { setEditingRoomType(null); setIsRoomModalOpen(true); }}
              className="bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-lg font-medium flex items-center transition-colors shadow-sm text-sm"
            >
              <Plus size={18} className="mr-1.5" /> Add Room Type
            </button>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg font-mono text-sm break-words">
              <strong>Backend Error Details:</strong><br />
              {error}
            </div>
          )}

          {isLoading ? (
            <div className="p-8 text-center text-gray-500">Loading rooms...</div>
          ) : roomTypes.length === 0 ? (
            <div className="bg-white border border-gray-200 rounded-xl p-10 text-center shadow-sm">
              <h3 className="text-lg font-medium text-gray-900">No Rooms Configured</h3>
              <p className="text-gray-500 mt-1">Click "Add Room Type" to create your first room.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {roomTypes.map(room => (
                <div key={room.id} className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                  {/* Room Type Header */}
                  <div className="p-5 flex items-center justify-between hover:bg-gray-50 transition-colors">
                    <div className="flex items-center gap-4 cursor-pointer" onClick={() => toggleRoomExpand(room.id)}>
                      <div className="w-16 h-12 bg-gray-100 rounded-lg overflow-hidden border border-gray-200 flex-shrink-0">
                        {room.images?.find(img => img.isPrimary)?.image.url ? (
                          <img 
                            src={room.images.find(img => img.isPrimary).image.url} 
                            className="w-full h-full object-cover" 
                            alt="Primary" 
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-gray-300">
                            <Tag size={16} />
                          </div>
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-lg font-bold text-gray-900">{room.name}</h3>
                          <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs font-semibold rounded">{room.code}</span>
                        </div>
                        <p className="text-sm text-gray-500 mt-0.5">
                          Max: {room.maxOccupancy} Guests • {room.totalInventory} Units
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-3">
                      <span className={`px-2.5 py-1 rounded-md text-xs font-medium ${room.isActive ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                        {room.isActive ? 'Active' : 'Inactive'}
                      </span>
                      <button onClick={() => { setEditingRoomType(room); setIsRoomModalOpen(true); }} className="text-gray-400 hover:text-brand-600 p-1.5 transition-colors">
                        <Settings2 size={18} />
                      </button>
                      <button onClick={() => handleDeleteRoom(room.id)} className="text-gray-400 hover:text-red-600 p-1.5 transition-colors">
                        <Trash2 size={18} />
                      </button>
                      <button onClick={() => toggleRoomExpand(room.id)} className="text-gray-400 hover:text-gray-800 p-1.5 transition-colors">
                        {expandedRooms[room.id] ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                      </button>
                    </div>
                  </div>

                  {/* Nested Rate Plans */}
                  {expandedRooms[room.id] && (
                    <div className="border-t border-gray-100 bg-gray-50 p-5">
                      <div className="flex justify-between items-center mb-4">
                        <h4 className="font-semibold text-gray-800 text-sm flex items-center gap-2">
                          <Network size={16} className="text-brand-500" /> Linked Rate Plans
                        </h4>
                        <button 
                          onClick={() => openRatePlanModal(room.id)}
                          className="text-xs font-medium text-brand-600 bg-brand-50 hover:bg-brand-100 px-3 py-1.5 rounded-md transition-colors"
                        >
                          + Add Rate Plan
                        </button>
                      </div>

                      {room.ratePlans && room.ratePlans.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                          {room.ratePlans.map(rp => (
                            <div key={rp.id} className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm relative group">
                              <div className="flex justify-between items-start mb-2">
                                <h5 className="font-bold text-gray-900">{rp.name}</h5>
                                <div className="flex gap-1 items-center">
                                  {!rp.isConfigured && (
                                    <span className="px-2 py-0.5 bg-orange-100 text-orange-700 rounded text-[10px] font-bold">
                                      UNCONFIGURED
                                    </span>
                                  )}
                                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${rp.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'}`}>
                                    {rp.isActive ? 'ACTIVE' : 'INACTIVE'}
                                  </span>
                                </div>
                              </div>
                              <p className={`text-xl font-extrabold mb-2 ${!rp.isConfigured ? 'text-gray-400 italic' : 'text-brand-600'}`}>
                                {rp.isConfigured ? `₹${rp.basePrice}` : '₹—'}
                              </p>
                              
                              <div className="flex flex-wrap gap-1 mb-1">
                                <span className="px-1.5 py-0.5 bg-gray-100 text-gray-600 text-[10px] font-medium rounded border border-gray-200">
                                  {rp.mealPlan === 'NONE' ? 'EP' : rp.mealPlan}
                                </span>
                                {rp.occupancyPricing && rp.occupancyPricing.length > 0 && (
                                  <span className="px-1.5 py-0.5 bg-amber-50 text-amber-700 text-[10px] font-medium rounded border border-amber-200">
                                    Overrides
                                  </span>
                                )}
                                {rp.mealPlan !== 'NONE' && rp.mealPlan !== 'EP' && (
                                  <span className="px-1.5 py-0.5 bg-blue-50 text-blue-700 text-[10px] font-medium rounded border border-blue-200">
                                    Meals Priced
                                  </span>
                                )}
                                {rp.extraBedPrice > 0 && (
                                  <span className="px-1.5 py-0.5 bg-purple-50 text-purple-700 text-[10px] font-medium rounded border border-purple-200">
                                    Extra Bed {rp.extraBedIncluded ? '(Inc)' : `(₹${rp.extraBedPrice})`}
                                  </span>
                                )}
                              </div>
                              <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1 bg-white shadow-sm rounded-md border border-gray-100">
                                <button onClick={() => openRatePlanModal(room.id, rp)} className="p-1.5 text-gray-500 hover:text-brand-600"><Settings2 size={14} /></button>
                                <button onClick={() => handleDeleteRatePlan(rp.id)} className="p-1.5 text-gray-500 hover:text-red-600"><Trash2 size={14} /></button>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-gray-500 italic">No rate plans configured yet.</p>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {isRoomModalOpen && (
        <RoomTypeModal 
          isOpen={isRoomModalOpen}
          onClose={() => setIsRoomModalOpen(false)}
          onSubmit={handleRoomSubmit}
          initialData={editingRoomType}
          hotelId={selectedPropertyId}
        />
      )}

      {isRatePlanModalOpen && (
        <RatePlanModal
          isOpen={isRatePlanModalOpen}
          onClose={() => setIsRatePlanModalOpen(false)}
          onSubmit={handleRatePlanSubmit}
          initialData={editingRatePlan}
        />
      )}
    </div>
  );
};

export default Configuration;
