import { useState } from 'react';
import { 
  Calendar, ChevronLeft, ChevronRight, Lock, 
  RefreshCw, Save, Info, Zap
} from 'lucide-react';

const ExtranetInventory = () => {
  const [isChannelManagerActive, setIsChannelManagerActive] = useState(true); // Simulation
  const [selectedRoom, setSelectedRoom] = useState('Deluxe Room');

  const days = Array.from({ length: 14 }).map((_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    return d;
  });

  return (
    <div className="space-y-8 pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight">Inventory & Rates</h1>
          <p className="text-gray-500 font-medium mt-1">Manage your room availability and base rates.</p>
        </div>

        <div className="flex items-center gap-3">
          {isChannelManagerActive && (
            <div className="flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-700 rounded-xl border border-blue-100 animate-pulse">
              <RefreshCw size={14} className="animate-spin-slow" />
              <span className="text-[10px] font-black uppercase tracking-widest">Syncing with STAAH</span>
            </div>
          )}
          <button className="flex items-center gap-2 px-6 py-2.5 bg-gray-900 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-black transition-all">
            <Save size={16} /> Save Changes
          </button>
        </div>
      </div>

      {/* CM Alert */}
      {isChannelManagerActive && (
        <div className="bg-amber-50 border border-amber-200 p-6 rounded-3xl flex items-start gap-4">
          <div className="p-3 bg-amber-100 text-amber-700 rounded-2xl shrink-0">
            <Lock size={24} />
          </div>
          <div>
            <h3 className="text-sm font-black text-amber-900 uppercase tracking-tight">Inventory is Locked</h3>
            <p className="text-sm text-amber-800 leading-relaxed mt-1">
              Your property is currently connected to a <strong>Channel Manager</strong>. Manual updates are disabled to prevent overbookings. Please update your rates and inventory in your STAAH dashboard.
            </p>
          </div>
        </div>
      )}

      {/* Inventory Grid */}
      <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
          <div className="flex items-center gap-4">
            <div className="flex bg-white rounded-xl border border-gray-200 p-1">
              {['Deluxe Room', 'Super Deluxe'].map(room => (
                <button 
                  key={room}
                  onClick={() => setSelectedRoom(room)}
                  className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${selectedRoom === room ? 'bg-brand-600 text-white shadow-md shadow-brand-500/20' : 'text-gray-500 hover:text-gray-900'}`}
                >
                  {room}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button className="p-2 border border-gray-200 rounded-lg hover:bg-white text-gray-400"><ChevronLeft size={18} /></button>
            <span className="text-sm font-bold px-4">May 02 - May 16, 2026</span>
            <button className="p-2 border border-gray-200 rounded-lg hover:bg-white text-gray-400"><ChevronRight size={18} /></button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="p-4 border-r border-gray-100 min-w-[120px]"></th>
                {days.map((d, i) => (
                  <th key={i} className="p-4 text-center min-w-[100px]">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{d.toLocaleDateString('en-US', { weekday: 'short' })}</p>
                    <p className="text-sm font-black text-gray-900">{d.getDate()}</p>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              <tr className={isChannelManagerActive ? 'opacity-60 grayscale' : ''}>
                <td className="p-4 border-r border-gray-100 bg-gray-50/50">
                  <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Base Rate</span>
                </td>
                {days.map((_, i) => (
                  <td key={i} className="p-4">
                    <div className="relative group">
                      <input 
                        type="text" 
                        defaultValue="4,500" 
                        disabled={isChannelManagerActive}
                        className="w-full bg-white border-gray-200 border rounded-xl py-2 px-3 text-sm font-black text-center focus:ring-2 focus:ring-brand-500/20 outline-none transition-all disabled:bg-gray-50 disabled:cursor-not-allowed" 
                      />
                    </div>
                  </td>
                ))}
              </tr>
              <tr className={isChannelManagerActive ? 'opacity-60 grayscale' : ''}>
                <td className="p-4 border-r border-gray-100 bg-gray-50/50">
                  <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Available</span>
                </td>
                {days.map((_, i) => (
                  <td key={i} className="p-4">
                    <input 
                      type="text" 
                      defaultValue={i === 2 ? '0' : '4'} 
                      disabled={isChannelManagerActive}
                      className={`w-full bg-white border-gray-200 border rounded-xl py-2 px-3 text-sm font-black text-center focus:ring-2 focus:ring-brand-500/20 outline-none transition-all disabled:bg-gray-50 disabled:cursor-not-allowed ${i === 2 ? 'text-red-600 bg-red-50 border-red-100' : 'text-gray-900'}`} 
                    />
                  </td>
                ))}
              </tr>
              {/* Demand Visualization */}
              <tr>
                <td className="p-4 border-r border-gray-100 bg-gray-50/50">
                  <span className="text-[10px] font-black text-brand-600 uppercase tracking-widest flex items-center gap-1">
                    <Zap size={10} fill="currentColor" /> Market
                  </span>
                </td>
                {days.map((_, i) => (
                  <td key={i} className="p-4">
                    <div className="flex flex-col items-center gap-1">
                      <div className={`w-full h-1 rounded-full ${i % 3 === 0 ? 'bg-red-500' : i % 2 === 0 ? 'bg-orange-500' : 'bg-brand-500'}`}></div>
                      <span className="text-[8px] font-black text-gray-400 uppercase tracking-tighter">{i % 3 === 0 ? 'HIGH' : 'NORMAL'}</span>
                    </div>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="bg-white rounded-3xl border border-gray-100 p-8 shadow-sm">
          <h3 className="text-lg font-black text-gray-900 mb-4 flex items-center gap-2">
            <Info className="text-blue-500" size={20} />
            Pricing Intelligence
          </h3>
          <p className="text-sm text-gray-500 leading-relaxed font-medium">
            Your current rates are <strong className="text-brand-600">5% higher</strong> than properties with similar ratings in your area. Consider a "Last Minute" promotion for the upcoming weekend to boost occupancy.
          </p>
          <button className="mt-6 px-6 py-2.5 border border-brand-200 rounded-xl text-xs font-black uppercase tracking-widest text-brand-600 hover:bg-brand-600 hover:text-white transition-all">
            Create Promotion
          </button>
        </div>

        <div className="bg-gray-900 rounded-3xl p-8 text-white shadow-xl">
          <h3 className="text-lg font-black mb-4 flex items-center gap-2">
            <RefreshCw className="text-brand-500" size={20} />
            Channel Sync Status
          </h3>
          <div className="space-y-4">
            <div className="flex justify-between items-center text-sm font-bold">
              <span className="text-gray-400">Connection Status</span>
              <span className="text-green-400">ACTIVE</span>
            </div>
            <div className="flex justify-between items-center text-sm font-bold">
              <span className="text-gray-400">Last Sync</span>
              <span>2 mins ago</span>
            </div>
            <div className="flex justify-between items-center text-sm font-bold">
              <span className="text-gray-400">Pending Updates</span>
              <span>0</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ExtranetInventory;
