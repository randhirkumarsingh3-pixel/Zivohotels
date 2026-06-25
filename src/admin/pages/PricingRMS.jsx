import { useState } from 'react';
import { 
  TrendingUp, Activity, Zap, 
  Search, Filter, Info, Clock,
  Lock
} from 'lucide-react';
import FactorBreakdownDrawer from '../../components/shared/FactorBreakdownDrawer';

const PricingRMS = () => {
  const [selectedDecision, setSelectedDecision] = useState(null);

  const pricingData = [
    { 
      hotel: 'Taj Palace', 
      room: 'Deluxe Suite', 
      base: 12000, 
      final: 13440, 
      multiplier: '1.12x', 
      demand: 'HIGH', 
      inventory: '2/15', 
      holiday: 'NO', 
      ers: 84,
      explanation: {
        summary: "High demand velocity in Delhi cluster + low inventory pressure.",
        factors: {
          demand: { weight: "+12%", signal: "SEARCH_VELOCITY" },
          inventory: { weight: "+8%", signal: "AVAILABILITY_CRUNCH" },
          competition: { weight: "-3%", signal: "PARITY_MATCH" }
        },
        confidence: "HIGH",
        winningLayer: "AI_OPTIMIZER",
        priority: 300,
        version: "ai_bandit_v2.1"
      }
    },
    { 
      hotel: 'Hyatt Regency', 
      room: 'Executive Room', 
      base: 8500, 
      final: 8500, 
      multiplier: '1.00x', 
      demand: 'NORMAL', 
      inventory: '12/40', 
      holiday: 'NO', 
      ers: 72,
      explanation: {
        summary: "Market parity reached. No AI delta applied.",
        factors: {
          demand: { weight: "0%", signal: "STABLE" },
          inventory: { weight: "0%", signal: "OPTIMAL" }
        },
        confidence: "MEDIUM",
        winningLayer: "BASE_LOGIC",
        priority: 100,
        version: "stable_v1"
      }
    }
  ];

  return (
    <div className="space-y-8 pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="w-2 h-2 rounded-full bg-brand-500 animate-pulse"></span>
            <span className="text-[10px] font-black text-brand-600 uppercase tracking-[0.2em]">Live Intelligence Engine</span>
          </div>
          <h1 className="text-4xl font-black text-gray-900 tracking-tight">Pricing & RMS Engine</h1>
          <p className="text-gray-500 font-medium mt-1">Global yield optimization and autonomous ranking control.</p>
        </div>

        <div className="flex items-center gap-3">
           <button className="flex items-center gap-2 px-6 py-3 bg-white border border-gray-100 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-gray-50 transition-all shadow-sm">
              <Clock size={16} /> Strategy History
           </button>
           <button className="flex items-center gap-2 px-6 py-3 bg-gray-900 text-white rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-black transition-all shadow-xl shadow-gray-900/10">
              <Zap size={16} fill="currentColor" /> Global AI Toggle
           </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm flex flex-wrap items-center gap-6">
         <div className="flex items-center gap-3 px-4 py-2 bg-gray-50 rounded-xl flex-1 min-w-[200px]">
            <Search size={16} className="text-gray-400" />
            <input type="text" placeholder="Search Hotel, City or Room..." className="bg-transparent border-none outline-none text-sm w-full font-medium" />
         </div>
         <select className="px-6 py-2.5 bg-white border border-gray-100 rounded-xl text-xs font-black uppercase tracking-widest outline-none cursor-pointer">
            <option>All Cities</option>
            <option>New Delhi</option>
            <option>Mumbai</option>
         </select>
         <select className="px-6 py-2.5 bg-white border border-gray-100 rounded-xl text-xs font-black uppercase tracking-widest outline-none cursor-pointer">
            <option>All Segments</option>
            <option>B2C (Retail)</option>
            <option>B2B (Agents)</option>
         </select>
         <button className="p-3 bg-brand-50 text-brand-600 rounded-xl hover:bg-brand-100 transition-all">
            <Filter size={18} />
         </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-10">
        {/* Main Price Table */}
        <div className="lg:col-span-3 bg-white rounded-[2.5rem] border border-gray-100 shadow-sm overflow-hidden">
           <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                 <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                       <th className="px-8 py-5 text-[10px] font-black text-gray-400 uppercase tracking-widest">Hotel & Room</th>
                       <th className="px-8 py-5 text-[10px] font-black text-gray-400 uppercase tracking-widest">Base Rate</th>
                       <th className="px-8 py-5 text-[10px] font-black text-gray-400 uppercase tracking-widest text-brand-500 bg-brand-50/30">AI Final</th>
                       <th className="px-8 py-5 text-[10px] font-black text-gray-400 uppercase tracking-widest">Multiplier</th>
                       <th className="px-8 py-5 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">Signals</th>
                       <th className="px-8 py-5 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">ERS</th>
                       <th className="px-8 py-5 text-[10px] font-black text-gray-400 uppercase tracking-widest">Action</th>
                    </tr>
                 </thead>
                 <tbody className="divide-y divide-gray-50">
                    {pricingData.map((row, i) => (
                      <tr key={i} className="group hover:bg-gray-50/50 transition-all">
                         <td className="px-8 py-6">
                            <div>
                               <p className="text-sm font-black text-gray-900 leading-tight">{row.hotel}</p>
                               <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">{row.room}</p>
                            </div>
                         </td>
                         <td className="px-8 py-6">
                            <p className="text-sm font-bold text-gray-500 tracking-tighter">₹ {row.base.toLocaleString()}</p>
                         </td>
                         <td className="px-8 py-6 bg-brand-50/20">
                            <p className="text-sm font-black text-brand-600 tracking-tighter">₹ {row.final.toLocaleString()}</p>
                         </td>
                         <td className="px-8 py-6">
                            <span className="px-3 py-1 bg-green-50 text-green-600 rounded-lg text-[10px] font-black">{row.multiplier}</span>
                         </td>
                         <td className="px-8 py-6">
                            <div className="flex items-center justify-center gap-3">
                               <div className={`w-2 h-2 rounded-full ${row.demand === 'HIGH' ? 'bg-red-500' : 'bg-green-500'}`}></div>
                               <span className="text-[10px] font-black text-gray-700 uppercase tracking-widest">{row.inventory}</span>
                            </div>
                         </td>
                         <td className="px-8 py-6 text-center">
                            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-900 text-white rounded-xl text-[10px] font-black">
                               {row.ers}
                            </div>
                         </td>
                         <td className="px-8 py-6">
                            <button 
                              onClick={() => setSelectedDecision({
                                entityId: `${row.hotel} - ${row.room}`,
                                type: 'DYNAMIC_PRICING',
                                output: row.final,
                                explanation: row.explanation
                              })}
                              className="p-2 text-gray-300 hover:text-brand-600 hover:bg-brand-50 rounded-xl transition-all"
                            >
                               <Info size={20} />
                            </button>
                         </td>
                      </tr>
                    ))}
                 </tbody>
              </table>
           </div>
        </div>

        {/* Right Intelligence Panel */}
        <div className="space-y-8">
           <div className="bg-gray-900 rounded-[2.5rem] p-8 text-white shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 right-0 p-8 opacity-10">
                 <Activity size={100} />
              </div>
              <h3 className="text-xl font-black mb-10 flex items-center gap-3">
                 <TrendingUp className="text-brand-500" size={24} />
                 Forecast Intel
              </h3>
              
              <div className="space-y-8 relative z-10">
                 <div>
                    <p className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] mb-3">Predicted Demand (7d)</p>
                    <div className="flex items-end gap-1 h-20">
                       {[30, 45, 60, 40, 80, 95, 70].map((h, i) => (
                         <div key={i} className={`flex-1 ${i === 5 ? 'bg-brand-500' : 'bg-white/10'} rounded-t-lg`} style={{ height: `${h}%` }}></div>
                       ))}
                    </div>
                    <div className="flex justify-between mt-2 text-[9px] font-black text-gray-500 uppercase">
                       <span>Mon</span>
                       <span className="text-brand-500">Sat</span>
                       <span>Sun</span>
                    </div>
                 </div>

                 <div className="bg-white/5 rounded-3xl p-6 border border-white/10">
                    <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">Commission Impact</p>
                    <div className="flex justify-between items-center">
                       <h4 className="text-2xl font-black text-brand-500">+ ₹ 1,420</h4>
                       <span className="text-[10px] text-green-400 font-bold">PER BOOKING</span>
                    </div>
                 </div>
              </div>
           </div>

           <div className="bg-white rounded-[2rem] border border-gray-100 p-8 shadow-sm">
              <h3 className="text-lg font-black text-gray-900 mb-6 flex items-center gap-2">
                 <Lock className="text-orange-500" size={20} />
                 System Clamps
              </h3>
              <div className="space-y-4">
                 <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Price Floor</p>
                    <p className="text-sm font-black text-gray-900">₹ 4,200 <span className="text-[10px] font-bold text-gray-400">(GLOBAL)</span></p>
                 </div>
                 <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Max AI Delta</p>
                    <p className="text-sm font-black text-gray-900">+35% <span className="text-[10px] font-bold text-gray-400">(HARD LIMIT)</span></p>
                 </div>
              </div>
           </div>
        </div>
      </div>

      {/* Decision Intelligence Drawer */}
      <FactorBreakdownDrawer 
        isOpen={!!selectedDecision} 
        onClose={() => setSelectedDecision(null)} 
        decision={selectedDecision} 
      />
    </div>
  );
};

export default PricingRMS;
