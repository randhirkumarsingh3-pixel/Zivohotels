import React, { useState } from 'react';
import { Plus, Trash2, Bed } from 'lucide-react';

const ROOM_TYPES = ['Deluxe Room', 'Standard Room', 'Suite', 'Executive Room', 'Family Room', 'Villa', 'Studio'];
const BED_TYPES = ['King Bed', 'Queen Bed', 'Twin Bed', 'Double Bed', 'Single Bed'];

const RoomsStep = ({ formData, updateForm }) => {
  const rooms = formData.rooms || [];
  
  const [newRoom, setNewRoom] = useState({
    name: 'Deluxe Room',
    basePrice: '',
    capacity: 2,
    bedType: 'King Bed',
    count: 1
  });

  const handleAddRoom = () => {
    if (!newRoom.basePrice) {
      alert("Please enter a base price.");
      return;
    }
    updateForm('rooms', [...rooms, { ...newRoom, id: Date.now().toString() }]);
    setNewRoom({ ...newRoom, basePrice: '' }); // reset form slightly
  };

  const removeRoom = (id) => {
    updateForm('rooms', rooms.filter(r => r.id !== id));
  };

  return (
    <div className="p-8 animate-fade-in">
      <h2 className="text-xl font-bold text-gray-900 mb-2 border-b pb-4">Room Configurations</h2>
      <p className="text-sm text-gray-500 mb-8">Add the different types of rooms available at your property.</p>

      {/* Existing Rooms List */}
      <div className="space-y-4 mb-8">
        {rooms.length === 0 ? (
          <div className="text-center py-8 bg-gray-50 border border-dashed border-gray-300 rounded-lg">
            <Bed size={32} className="mx-auto text-gray-400 mb-2" />
            <p className="text-gray-500 text-sm">No rooms added yet. Add your first room below.</p>
          </div>
        ) : (
          rooms.map((room) => (
            <div key={room.id} className="flex items-center justify-between p-4 bg-white border border-gray-200 rounded-lg shadow-sm">
              <div className="flex items-center gap-4">
                <div className="bg-blue-50 p-3 rounded-md">
                  <Bed size={24} className="text-blue-600" />
                </div>
                <div>
                  <h4 className="font-bold text-gray-900">{room.name} <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full ml-2">{room.count} Unit(s)</span></h4>
                  <p className="text-sm text-gray-500">{room.bedType} • Up to {room.capacity} Guests</p>
                </div>
              </div>
              <div className="flex items-center gap-6">
                <div className="text-right">
                  <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Base Price</p>
                  <p className="font-bold text-gray-900">₹{room.basePrice}</p>
                </div>
                <button 
                  onClick={() => removeRoom(room.id)}
                  className="text-gray-400 hover:text-red-500 transition-colors p-2"
                  title="Remove Room"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Add New Room Form */}
      <div className="bg-gray-50 p-6 rounded-lg border border-gray-200">
        <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
          <Plus size={18} className="text-blue-600" />
          Add New Room
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Room Category</label>
            <select 
              value={newRoom.name}
              onChange={e => setNewRoom({...newRoom, name: e.target.value})}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm outline-none focus:border-blue-500"
            >
              {ROOM_TYPES.map(rt => <option key={rt}>{rt}</option>)}
            </select>
          </div>
          
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Bed Type</label>
            <select 
              value={newRoom.bedType}
              onChange={e => setNewRoom({...newRoom, bedType: e.target.value})}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm outline-none focus:border-blue-500"
            >
              {BED_TYPES.map(bt => <option key={bt}>{bt}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Number of Rooms</label>
            <input 
              type="number" 
              min="1"
              value={newRoom.count}
              onChange={e => setNewRoom({...newRoom, count: parseInt(e.target.value) || 1})}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Max Guests</label>
            <input 
              type="number" 
              min="1"
              value={newRoom.capacity}
              onChange={e => setNewRoom({...newRoom, capacity: parseInt(e.target.value) || 1})}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm outline-none focus:border-blue-500"
            />
          </div>
          
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Base Price (₹) <span className="text-red-500">*</span></label>
            <input 
              type="number" 
              min="0"
              value={newRoom.basePrice}
              onChange={e => setNewRoom({...newRoom, basePrice: e.target.value})}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm outline-none focus:border-blue-500"
              placeholder="e.g. 2500"
            />
          </div>
        </div>

        <button 
          onClick={handleAddRoom}
          className="bg-white border border-gray-300 text-gray-700 hover:bg-gray-100 hover:text-gray-900 font-semibold text-sm px-4 py-2 rounded-md transition-colors"
        >
          Save Room
        </button>
      </div>

    </div>
  );
};

export default RoomsStep;
