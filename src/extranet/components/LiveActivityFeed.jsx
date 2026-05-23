import { useState, useEffect } from 'react';
import { Activity, Clock, Zap, AlertCircle, CheckCircle2, ChevronRight, X } from 'lucide-react';
import { useSocketEvent } from '../../context/SocketContext';

const LiveActivityFeed = ({ hotelId }) => {
  const [activities, setActivities] = useState([]);
  const [isVisible, setIsVisible] = useState(true);

  // Listen to ALL operational events
  useSocketEvent('*', (event) => {
    // Filter for this hotel or global governance
    if (event.hotelId === hotelId || !event.hotelId) {
       setActivities(prev => [{
         id: Math.random().toString(36).substr(2, 9),
         ...event
       }, ...prev].slice(0, 20)); // Keep last 20
    }
  });

  if (!isVisible) return (
    <button 
      onClick={() => setIsVisible(true)}
      className="fixed bottom-8 right-8 w-14 h-14 bg-slate-900 text-white rounded-full flex items-center justify-center shadow-2xl hover:scale-110 transition-all z-50"
    >
      <Activity size={24} />
    </button>
  );

  return (
    <div className="fixed bottom-8 right-8 w-80 bg-white rounded-[2.5rem] shadow-2xl border border-slate-200 overflow-hidden flex flex-col z-50 animate-in slide-in-from-bottom-10 duration-300">
      <div className="bg-slate-900 p-6 text-white flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Zap className="text-blue-400" size={18} fill="currentColor" />
          <h3 className="text-sm font-black uppercase tracking-widest">Live Ops Feed</h3>
        </div>
        <button onClick={() => setIsVisible(false)} className="text-slate-400 hover:text-white transition-colors">
          <X size={18} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto max-h-[400px] p-4 space-y-4 bg-slate-50/50">
        {activities.length === 0 && (
          <div className="py-12 text-center">
            <Activity className="mx-auto text-slate-200 mb-2" size={32} />
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Waiting for events...</p>
          </div>
        )}

        {activities.map((act) => (
          <div key={act.id} className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm animate-in slide-in-from-right-5 duration-200">
            <div className="flex justify-between items-start mb-2">
              <span className={`text-[8px] font-black px-2 py-0.5 rounded-full border ${
                act.severity === 'CRITICAL' ? 'bg-red-50 text-red-600 border-red-100' :
                act.severity === 'WARNING' ? 'bg-orange-50 text-orange-600 border-orange-100' :
                'bg-blue-50 text-blue-600 border-blue-100'
              }`}>
                {act.event.replace(/_/g, ' ')}
              </span>
              <span className="text-[8px] text-slate-400 font-black">{new Date(act.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
            </div>
            
            <p className="text-[11px] font-bold text-slate-700 leading-relaxed">
              {act.data.message || act.data.bookingRef || act.data.payoutId || 'Operational Event'}
            </p>
            
            {act.data.amount && (
              <p className="text-sm font-black text-slate-900 mt-1">₹ {act.data.amount.toLocaleString()}</p>
            )}
          </div>
        ))}
      </div>

      <div className="p-4 bg-white border-t border-slate-100 text-center">
        <button className="text-[10px] font-black text-blue-600 uppercase tracking-widest hover:underline flex items-center gap-2 mx-auto">
          Full Audit Log <ChevronRight size={12} />
        </button>
      </div>
    </div>
  );
};

export default LiveActivityFeed;
