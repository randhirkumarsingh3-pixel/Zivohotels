import { useState, useEffect, useCallback } from 'react';
import { 
  BedDouble, Plus, Edit3, AlertCircle, Save, Eye, X, Loader2
} from 'lucide-react';
import { fetchRooms, updateRoom } from '../../services/extranetApi';
import { useExtranet } from '../context/ExtranetContext';
import { useForm } from 'react-hook-form';

const RoomDrawer = ({ room, isOpen, onClose, onSave, isLocked }) => {
  const { register, handleSubmit, reset, formState: { isDirty } } = useForm();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (room) {
      reset({
        name: room.name,
        totalInventory: room.totalInventory,
        baseOccupancy: room.baseOccupancy || 2,
        maxOccupancy: room.maxOccupancy || 2,
      });
    }
  }, [room, reset]);

  if (!isOpen) return null;

  const onSubmit = async (data) => {
    setLoading(true);
    await onSave(room.id, data);
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-xl bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
        <div className="p-6 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="text-xl font-black text-gray-900 tracking-tight">Edit Room Type</h3>
            <p className="text-xs text-gray-500 font-medium uppercase tracking-widest mt-1">{room.name}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-all">
            <X size={20} className="text-gray-400" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-8">
          {isLocked && (
            <div className="mb-8 p-4 bg-orange-50 border border-orange-100 rounded-2xl flex gap-3">
              <AlertCircle className="text-orange-600 shrink-0" size={20} />
              <div>
                <p className="text-sm font-black text-orange-900 uppercase tracking-tight">Editing Restricted</p>
                <p className="text-xs text-orange-700 font-medium leading-relaxed mt-1">
                  Inventory and base rate editing is locked because your property is connected to an external Channel Manager.
                </p>
              </div>
            </div>
          )}

          <form id="room-form" onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <div>
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Room Name</label>
              <input 
                {...register('name')}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl py-3 px-4 text-sm font-bold text-gray-900 focus:ring-2 focus:ring-brand-500/20 outline-none transition-all"
              />
            </div>

            <div className="grid grid-cols-2 gap-6">
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Total Inventory</label>
                <input 
                  type="number"
                  disabled={isLocked}
                  {...register('totalInventory')}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl py-3 px-4 text-sm font-bold text-gray-900 disabled:opacity-50"
                />
              </div>
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Max Occupancy</label>
                <input 
                  type="number"
                  {...register('maxOccupancy')}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl py-3 px-4 text-sm font-bold text-gray-900"
                />
              </div>
            </div>
          </form>
        </div>

        <div className="p-6 border-t border-gray-100 flex gap-3 bg-gray-50/50">
          <button 
            onClick={onClose}
            className="flex-1 py-3 bg-white border border-gray-200 text-gray-600 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-gray-50 transition-all"
          >
            Cancel
          </button>
          <button 
            form="room-form"
            type="submit"
            disabled={loading || !isDirty}
            className="flex-1 py-3 bg-gray-900 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-black transition-all disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
};

const ExtranetRooms = () => {
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const { addToast } = useExtranet();

  const loadRooms = useCallback(async () => {
    try {
      setLoading(true);
      const data = await fetchRooms();
      setRooms(data);
    } catch (error) {
      addToast(error.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    loadRooms();
  }, [loadRooms]);

  const handleSaveRoom = async (roomId, data) => {
    try {
      await updateRoom(roomId, data);
      addToast('Room updated successfully', 'success');
      setIsDrawerOpen(false);
      loadRooms();
    } catch (error) {
      addToast(error.message, 'error');
    }
  };

  if (loading && rooms.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="animate-spin text-brand-600" size={32} />
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-12">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight">Rooms & Rate Plans</h1>
          <p className="text-gray-500 font-medium mt-1">Define your room categories and manage rate plans.</p>
        </div>
        <div className="flex items-center gap-3">
          <button className="flex items-center gap-2 px-6 py-2.5 bg-gray-900 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-black transition-all">
            <Plus size={16} /> Add Room Type
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {rooms.map(room => (
          <div key={room.id} className="bg-white rounded-[2.5rem] border border-gray-100 shadow-sm overflow-hidden flex flex-col">
            <div className="p-8 flex-1">
              <div className="flex items-center justify-between mb-4">
                <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl">
                  <BedDouble size={24} />
                </div>
                <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest ${room.isActive ? 'bg-green-50 text-green-600 border border-green-100' : 'bg-orange-50 text-orange-600 border border-orange-100'}`}>
                  {room.isActive ? 'Active' : 'Inactive'}
                </span>
              </div>
              <h3 className="text-lg font-black text-gray-900 mb-1">{room.name}</h3>
              <p className="text-xs text-gray-400 font-medium uppercase tracking-widest mb-4">{room.code}</p>
              
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="p-3 bg-gray-50 rounded-xl">
                  <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1">Inventory</p>
                  <p className="text-sm font-black text-gray-900">{room.totalInventory} Rooms</p>
                </div>
                <div className="p-3 bg-gray-50 rounded-xl">
                  <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1">Occupancy</p>
                  <p className="text-sm font-black text-gray-900">{room.maxOccupancy} Guests</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 mb-6">
                {Array.isArray(room.amenities) && room.amenities.slice(0, 3).map((a, i) => (
                  <span key={i} className="px-2 py-1 bg-white border border-gray-100 rounded-lg text-[10px] font-bold text-gray-500">
                    {a}
                  </span>
                ))}
                {Array.isArray(room.amenities) && room.amenities.length > 3 && (
                  <span className="px-2 py-1 bg-white border border-gray-100 rounded-lg text-[10px] font-bold text-gray-400">
                    +{room.amenities.length - 3} More
                  </span>
                )}
              </div>
            </div>

            <div className="p-6 bg-gray-50/50 border-t border-gray-100 flex gap-2">
              <button 
                onClick={() => {
                  setSelectedRoom(room);
                  setIsDrawerOpen(true);
                }}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-white border border-gray-200 text-gray-900 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-gray-50 transition-all"
              >
                <Edit3 size={14} /> Edit Room
              </button>
              <button className="p-2.5 bg-white border border-gray-200 text-gray-400 rounded-xl hover:text-brand-600 transition-all">
                <Eye size={16} />
              </button>
            </div>
          </div>
        ))}
      </div>

      <RoomDrawer 
        room={selectedRoom}
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        onSave={handleSaveRoom}
        isLocked={false} // This will be driven by Feature Gate logic in future
      />
    </div>
  );
};

export default ExtranetRooms;
