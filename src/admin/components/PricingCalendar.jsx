import { useState, useEffect } from 'react';
import { Calendar, ChevronLeft, ChevronRight, RefreshCw, Check, IndianRupee, AlertTriangle } from 'lucide-react';
import Modal from './Modal';

const PricingCalendar = ({ roomTypes }) => {
  const [startDate, setStartDate] = useState(new Date());
  const [daysToShow] = useState(14);
  const [dates, setDates] = useState([]);
  
  // Cell State: { [roomId_dateString]: { price: number, isSynced: boolean } }
  const [pricing, setPricing] = useState({});
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [bulkForm, setBulkForm] = useState({ roomTypeId: '', startDate: '', endDate: '', price: '' });

  useEffect(() => {
    const newDates = [];
    for (let i = 0; i < daysToShow; i++) {
      const d = new Date(startDate);
      d.setDate(d.getDate() + i);
      newDates.push(d);
    }
    setDates(newDates);

    const mockData = {};
    roomTypes.forEach(room => {
      // Clean basePrice (e.g. "₹8,500" -> 8500)
      const numericPrice = parseInt(room.basePrice.replace(/[^\d]/g, ''), 10) || 5000;
      
      newDates.forEach(d => {
        const dateStr = d.toISOString().split('T')[0];
        const key = `${room.id}_${dateStr}`;
        mockData[key] = { 
          price: numericPrice, 
          isSynced: Math.random() > 0.6 
        };
      });
    });
    setPricing(mockData);
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

  const handleCellChange = (roomId, dateStr, newValue) => {
    let val = parseInt(newValue, 10);
    if (isNaN(val) || val < 0) val = 0;

    const key = `${roomId}_${dateStr}`;
    setPricing(prev => ({
      ...prev,
      [key]: { ...prev[key], price: val }
    }));
  };

  const handleBulkSubmit = (e) => {
    e.preventDefault();
    console.log("Bulk updating prices:", bulkForm);
    alert("Bulk price update applied! (Mock)");
    setIsBulkModalOpen(false);
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
      <div className="p-4 border-b border-gray-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-gray-50">
        <div className="flex items-center space-x-4">
          <h3 className="text-lg font-bold text-gray-800 flex items-center">
            <IndianRupee className="mr-2 h-5 w-5 text-brand-600" />
            Pricing Grid
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

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm text-left">
          <thead>
            <tr>
              <th className="bg-gray-100 border-b border-r border-gray-200 p-3 min-w-[200px] sticky left-0 z-10 shadow-[1px_0_0_0_#e5e7eb]">
                Room Type
              </th>
              {dates.map((date, i) => (
                <th key={i} className="bg-gray-100 border-b border-r border-gray-200 p-2 text-center min-w-[90px]">
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
                  <div className="text-xs text-gray-500 mt-0.5">Base: {room.basePrice}</div>
                </td>
                
                {dates.map((date, i) => {
                  const dateStr = date.toISOString().split('T')[0];
                  const key = `${room.id}_${dateStr}`;
                  const cellData = pricing[key] || { price: 0, isSynced: false };

                  return (
                    <td key={i} className="border-b border-r border-gray-200 p-1 relative group">
                      <div className="flex flex-col items-center">
                        <input 
                          type="number"
                          min="0"
                          value={cellData.price}
                          onChange={(e) => handleCellChange(room.id, dateStr, e.target.value)}
                          className="w-16 text-center py-1.5 rounded outline-none border border-gray-300 focus:ring-2 focus:ring-brand-500 transition-colors bg-white font-medium"
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

      <Modal isOpen={isBulkModalOpen} onClose={() => setIsBulkModalOpen(false)} title="Bulk Update Pricing">
        <form onSubmit={handleBulkSubmit} className="space-y-5">
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-start">
            <AlertTriangle className="text-yellow-600 mr-3 h-5 w-5 shrink-0 mt-0.5" />
            <div className="text-sm text-yellow-800">
              <span className="font-bold">Warning:</span> Bulk updates will immediately sync with connected OTAs and overwrite existing manual overrides.
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
            <label className="block text-sm font-medium text-gray-700 mb-1">Set Price To (₹)</label>
            <input type="number" min="0" value={bulkForm.price} onChange={e => setBulkForm({...bulkForm, price: e.target.value})} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none" required />
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

export default PricingCalendar;
