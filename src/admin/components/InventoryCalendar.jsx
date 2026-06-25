import { useState, useEffect } from 'react';
import { Calendar, ChevronLeft, ChevronRight, AlertTriangle, Check, RefreshCw } from 'lucide-react';
import Modal from './Modal';

const InventoryCalendar = ({ roomTypes }) => {
  const [startDate, setStartDate] = useState(new Date());
  const [daysToShow, _setDaysToShow] = useState(14); // 14-day view
  const [dates, setDates] = useState([]);
  
  // Cell State: { [roomId_dateString]: { available: number, isSynced: boolean } }
  const [inventory, setInventory] = useState({});
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [bulkForm, setBulkForm] = useState({ roomTypeId: '', startDate: '', endDate: '', available: 0 });

  // Generate date headers based on startDate
  useEffect(() => {
    const newDates = [];
    for (let i = 0; i < daysToShow; i++) {
      const d = new Date(startDate);
      d.setDate(d.getDate() + i);
      newDates.push(d);
    }
    setDates(newDates);

    // Mock initial data fetch (e.g., GET /api/v1/inventory)
    const mockData = {};
    roomTypes.forEach(room => {
      newDates.forEach(d => {
        const dateStr = d.toISOString().split('T')[0];
        const key = `${room.id}_${dateStr}`;
        // Randomly set some as synced for UI demonstration
        mockData[key] = { 
          available: room.totalRooms, 
          isSynced: Math.random() > 0.7 
        };
      });
    });
    setInventory(mockData);
  }, [startDate, daysToShow, roomTypes]);

  const handleNextDays = () => {
    const next = new Date(startDate);
    next.setDate(next.getDate() + daysToShow);
    setStartDate(next);
  };

  const handlePrevDays = () => {
    const prev = new Date(startDate);
    prev.setDate(prev.getDate() - daysToShow);
    setStartDate(prev);
  };

  const handleCellChange = (roomId, dateStr, newValue, maxRooms) => {
    let val = parseInt(newValue, 10);
    if (isNaN(val) || val < 0) val = 0;
    if (val > maxRooms) {
      alert(`Cannot exceed total physical rooms (${maxRooms})`);
      val = maxRooms;
    }

    const key = `${roomId}_${dateStr}`;
    setInventory(prev => ({
      ...prev,
      [key]: { ...prev[key], available: val }
    }));
    // Real implementation would trigger a debounced POST /api/v1/inventory here
  };

  const handleBulkSubmit = (e) => {
    e.preventDefault();
    console.log("Bulk updating:", bulkForm);
    alert("Bulk update applied! (Mock)");
    setIsBulkModalOpen(false);
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
      {/* Calendar Header */}
      <div className="p-4 border-b border-gray-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-gray-50">
        <div className="flex items-center space-x-4">
          <h3 className="text-lg font-bold text-gray-800 flex items-center">
            <Calendar className="mr-2 h-5 w-5 text-brand-600" />
            Inventory Grid
          </h3>
          <div className="flex items-center space-x-1 bg-white border border-gray-300 rounded-lg p-1 shadow-sm">
            <button onClick={handlePrevDays} className="p-1 hover:bg-gray-100 rounded text-gray-600"><ChevronLeft size={18} /></button>
            <span className="text-sm font-medium px-2 text-gray-700">
              {startDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} - 
              {dates.length > 0 && dates[dates.length-1].toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
            </span>
            <button onClick={handleNextDays} className="p-1 hover:bg-gray-100 rounded text-gray-600"><ChevronRight size={18} /></button>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <div className="text-xs text-gray-500 flex items-center mr-2">
            <RefreshCw size={12} className="text-blue-500 mr-1" /> = OTA Synced
          </div>
          <button 
            onClick={() => setIsBulkModalOpen(true)}
            className="text-sm font-medium text-brand-600 bg-brand-50 hover:bg-brand-100 px-4 py-2 rounded-lg transition-colors border border-brand-200"
          >
            Bulk Update
          </button>
        </div>
      </div>

      {/* Interactive Grid */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm text-left">
          <thead>
            <tr>
              <th className="bg-gray-100 border-b border-r border-gray-200 p-3 min-w-[200px] sticky left-0 z-10 shadow-[1px_0_0_0_#e5e7eb]">
                Room Type
              </th>
              {dates.map((date, i) => (
                <th key={i} className="bg-gray-100 border-b border-r border-gray-200 p-2 text-center min-w-[80px]">
                  <div className="font-semibold text-gray-800">{date.toLocaleDateString('en-GB', { weekday: 'short' })}</div>
                  <div className="text-gray-500 text-xs">{date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {roomTypes.map(room => (
              <tr key={room.id} className="hover:bg-gray-50/50">
                <td className="border-b border-r border-gray-200 p-3 sticky left-0 bg-white z-10 shadow-[1px_0_0_0_#e5e7eb]">
                  <div className="font-semibold text-gray-900">{room.name}</div>
                  <div className="text-xs text-gray-500 mt-0.5 flex justify-between">
                    <span>{room.code}</span>
                    <span className="font-medium">Total: {room.totalRooms}</span>
                  </div>
                </td>
                
                {dates.map((date, i) => {
                  const dateStr = date.toISOString().split('T')[0];
                  const key = `${room.id}_${dateStr}`;
                  const cellData = inventory[key] || { available: 0, isSynced: false };
                  const isSoldOut = cellData.available === 0;

                  return (
                    <td key={i} className="border-b border-r border-gray-200 p-1 relative group">
                      <div className="flex flex-col items-center">
                        <input 
                          type="number"
                          min="0"
                          max={room.totalRooms}
                          value={cellData.available}
                          onChange={(e) => handleCellChange(room.id, dateStr, e.target.value, room.totalRooms)}
                          className={`w-14 text-center py-1.5 rounded outline-none border focus:ring-2 focus:ring-brand-500 transition-colors ${
                            isSoldOut ? 'bg-red-50 text-red-700 border-red-200 font-bold' : 'bg-white border-gray-300 font-medium'
                          }`}
                        />
                        {cellData.isSynced && (
                          <div className="absolute top-1.5 right-1.5 text-blue-500" title="Synced with Channel Manager">
                            <RefreshCw size={10} />
                          </div>
                        )}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
            {roomTypes.length === 0 && (
              <tr>
                <td colSpan={dates.length + 1} className="p-8 text-center text-gray-500">
                  No room types configured for this property.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Bulk Update Modal */}
      <Modal isOpen={isBulkModalOpen} onClose={() => setIsBulkModalOpen(false)} title="Bulk Update Inventory">
        <form onSubmit={handleBulkSubmit} className="space-y-5">
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-start">
            <AlertTriangle className="text-yellow-600 mr-3 h-5 w-5 shrink-0 mt-0.5" />
            <div className="text-sm text-yellow-800">
              <span className="font-bold">Warning:</span> Bulk updates will immediately sync with connected OTAs (MakeMyTrip, Booking.com, etc) and overwrite any existing manual overrides for the selected date range.
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Select Room Type</label>
            <select 
              value={bulkForm.roomTypeId} 
              onChange={e => setBulkForm({...bulkForm, roomTypeId: e.target.value})} 
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none" 
              required
            >
              <option value="">-- Choose Room Type --</option>
              <option value="ALL">All Room Types</option>
              {roomTypes.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">From Date</label>
              <input type="date" value={bulkForm.startDate} onChange={e => setBulkForm({...bulkForm, startDate: e.target.value})} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">To Date</label>
              <input type="date" value={bulkForm.endDate} onChange={e => setBulkForm({...bulkForm, endDate: e.target.value})} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none" required />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Set Availability To</label>
            <input type="number" min="0" value={bulkForm.available} onChange={e => setBulkForm({...bulkForm, available: e.target.value})} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none" required />
            <p className="text-xs text-gray-500 mt-1">Number of rooms to make available across the date range.</p>
          </div>

          <div className="pt-4 flex justify-end space-x-3 border-t border-gray-100">
            <button type="button" onClick={() => setIsBulkModalOpen(false)} className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
            <button type="submit" className="px-4 py-2 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 flex items-center">
              <Check size={16} className="mr-1.5" /> Apply Bulk Update
            </button>
          </div>
        </form>
      </Modal>

    </div>
  );
};

export default InventoryCalendar;
