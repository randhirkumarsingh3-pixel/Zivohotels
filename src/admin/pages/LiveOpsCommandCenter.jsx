import { useState, useEffect } from 'react';
import { 
  Zap, Activity, ShieldAlert, IndianRupee, 
  MapPin, Clock, ArrowUpRight, Search, 
  Filter, Radio, Loader2, Play, Pause,
  ShieldCheck, AlertTriangle, History
} from 'lucide-react';
import { useSocket } from '../../context/SocketContext';
import IncidentForensicTimeline from '../components/IncidentForensicTimeline';

const LiveOpsCommandCenter = () => {
  const { socket } = useSocket();
  const [events, setEvents] = useState([]);
  const [isPaused, setIsPaused] = useState(false);
  const [activeIncidents, setActiveIncidents] = useState([]);
  const [selectedIncident, setSelectedIncident] = useState(null);
  const [overrides, setOverrides] = useState([]);

  useEffect(() => {
    if (!socket || isPaused) return;

    const handleEvent = (event) => {
      setEvents(prev => [event, ...prev].slice(0, 50));
      
      if (event.severity === 'CRITICAL' || event.severity === 'WARNING') {
        setActiveIncidents(prev => {
          // If already exists, update. Otherwise add.
          const exists = prev.find(inc => inc.data.hotelId === event.hotelId && inc.event === event.event);
          if (exists) return prev;
          return [event, ...prev];
        });
      }
    };

    socket.on('governance_event', handleEvent);
    socket.on('operational_event', handleEvent);
    socket.on('financial_event', handleEvent);
    
    socket.on('OVERRIDE_JOURNAL_UPDATED', (data) => {
       setOverrides(prev => [data, ...prev].slice(0, 10));
    });

    return () => {
      socket.off('governance_event', handleEvent);
      socket.off('operational_event', handleEvent);
      socket.off('financial_event', handleEvent);
    };
  }, [socket, isPaused]);

  return (
    <div className="space-y-8 bg-slate-950 min-h-screen -m-8 p-12 text-white">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-8">
        <div>
           <div className="flex items-center gap-3 mb-2">
              <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse shadow-lg shadow-red-500/50" />
              <span className="text-[10px] font-black uppercase tracking-[0.3em] text-red-400">Live Infrastructure Stream</span>
           </div>
           <h1 className="text-5xl font-black tracking-tighter">Command Center</h1>
        </div>
        
        <div className="flex items-center gap-4">
           <button 
             onClick={() => setIsPaused(!isPaused)}
             className={`px-6 py-3 rounded-2xl flex items-center gap-3 text-[10px] font-black uppercase tracking-widest transition-all ${
               isPaused ? 'bg-green-600 hover:bg-green-700' : 'bg-white/10 hover:bg-white/20'
             }`}
           >
              {isPaused ? <Play size={16} fill="currentColor" /> : <Pause size={16} fill="currentColor" />}
              {isPaused ? 'Resume Stream' : 'Pause Stream'}
           </button>
           <button className="px-6 py-3 bg-red-600 hover:bg-red-700 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-red-600/20">
              Emergency Lockdown
           </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
         {/* Left Col: Real-time Event Log */}
         <div className="lg:col-span-3 space-y-6">
            <div className="bg-white/5 rounded-[2.5rem] border border-white/10 overflow-hidden flex flex-col h-[700px]">
               <div className="p-8 border-b border-white/5 flex justify-between items-center bg-white/[0.02]">
                  <div className="flex items-center gap-4">
                     <Radio className="text-blue-500 animate-pulse" size={20} />
                     <h3 className="text-xl font-black">Autonomous Decision Stream</h3>
                  </div>
                  <div className="flex items-center gap-2">
                     <span className="px-3 py-1 bg-blue-500/10 text-blue-400 rounded-full text-[10px] font-black uppercase tracking-widest border border-blue-500/20">
                        {events.length} Events Logged
                     </span>
                  </div>
               </div>

               {selectedIncident ? (
                 <div className="p-8 space-y-6">
                    <button 
                      onClick={() => setSelectedIncident(null)}
                      className="text-[10px] font-black uppercase tracking-widest text-blue-400 flex items-center gap-2 hover:underline"
                    >
                       ← Return to Live Stream
                    </button>
                    <IncidentForensicTimeline 
                      incidentId={selectedIncident.data.hotelId} 
                      events={events.filter(e => e.hotelId === selectedIncident.hotelId || !e.hotelId)} 
                    />
                 </div>
               ) : (
                 <div className="flex-1 overflow-y-auto p-4 space-y-2 font-mono scrollbar-hide">
                    {events.map((ev, i) => (
                    <div key={i} className={`p-4 rounded-2xl border transition-all animate-in slide-in-from-left-5 duration-200 ${
                      ev.severity === 'CRITICAL' ? 'bg-red-500/10 border-red-500/30' :
                      ev.severity === 'WARNING' ? 'bg-orange-500/10 border-orange-500/30' :
                      'bg-white/5 border-white/10'
                    }`}>
                       <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-3">
                             <span className={`text-[9px] font-black px-2 py-0.5 rounded uppercase tracking-widest ${
                               ev.severity === 'CRITICAL' ? 'bg-red-500 text-white' :
                               ev.severity === 'WARNING' ? 'bg-orange-500 text-white' :
                               'bg-blue-600 text-white'
                             }`}>
                                {ev.event}
                             </span>
                             <span className="text-[10px] text-white/40 font-bold tracking-widest">
                                v{ev.version} • {ev.source}
                             </span>
                          </div>
                          <span className="text-[10px] text-white/40">{new Date(ev.timestamp).toLocaleTimeString()}</span>
                       </div>
                       <p className="text-sm font-bold text-white/90">
                          {JSON.stringify(ev.data).slice(0, 150)}...
                       </p>
                    </div>
                  ))}
                  {events.length === 0 && (
                    <div className="h-full flex items-center justify-center opacity-20 flex-col gap-4">
                       <Loader2 className="animate-spin" size={48} />
                       <p className="text-[10px] font-black uppercase tracking-[0.5em]">Establishing Neural Link...</p>
                    </div>
                  )}
               </div>
               )}
            </div>
         </div>

         {/* Right Col: Active Incidents & Health */}
         <div className="space-y-8">
            {/* Active Incidents */}
            <div className="bg-red-600/10 rounded-[2.5rem] border border-red-600/30 p-8 shadow-2xl">
               <h3 className="text-lg font-black text-red-400 mb-6 flex items-center justify-between uppercase tracking-widest">
                  Critical Escalations
                  <ShieldAlert size={20} />
               </h3>
               
               <div className="space-y-4">
                  {activeIncidents.map((inc, i) => (
                    <div key={i} className="p-4 bg-red-600/20 rounded-2xl border border-red-600/30 animate-pulse cursor-pointer hover:bg-red-600/30 transition-all" onClick={() => setSelectedIncident(inc)}>
                       <p className="text-[10px] font-black text-red-300 uppercase tracking-widest mb-1">{inc.event}</p>
                       <p className="text-xs font-bold text-white mb-2">Hotel ID: #{inc.data.hotelId?.slice(0,8)}</p>
                       <button className="w-full py-2 bg-red-600 text-white rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-red-700 transition-all">
                          Enter Forensic Replay
                       </button>
                    </div>
                  ))}
                  {activeIncidents.length === 0 && (
                    <div className="py-8 text-center border-2 border-dashed border-white/10 rounded-3xl">
                       <ShieldCheck className="mx-auto text-green-500 mb-2" size={32} />
                       <p className="text-[10px] font-black text-green-500 uppercase tracking-widest">All Services Stable</p>
                    </div>
                  )}
               </div>
            </div>

            {/* Platform Metrics */}
            <div className="bg-white/5 rounded-[2.5rem] border border-white/10 p-8 shadow-sm">
               <h3 className="text-lg font-black text-white mb-6 flex items-center justify-between">
                  Live Throughput
                  <Activity className="text-blue-500" size={18} />
               </h3>
               
               <div className="space-y-6">
                  <div className="space-y-2">
                     <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-white/40">
                        <span>Event Velocity</span>
                        <span className="text-blue-400">42/sec</span>
                     </div>
                     <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-600 w-[65%]" />
                     </div>
                  </div>
                  <div className="space-y-2">
                     <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-white/40">
                        <span>Socket Connections</span>
                        <span className="text-green-400">1.2k Active</span>
                     </div>
                     <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                        <div className="h-full bg-green-500 w-[82%]" />
                     </div>
                  </div>
                  <div className="space-y-2">
                     <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-white/40">
                        <span>Ledger Hash Status</span>
                        <span className="text-blue-400">Verified</span>
                     </div>
                     <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-500 w-[100%]" />
                     </div>
                  </div>
                  <div className="space-y-2">
                     <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-white/40">
                        <span>AI Exploration Rate</span>
                        <span className="text-orange-400">15% Active</span>
                     </div>
                     <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                        <div className="h-full bg-orange-500 w-[15%]" />
                     </div>
                  </div>
               </div>
            </div>

            {/* Quick Action */}
            <div className="p-8 bg-gradient-to-br from-blue-600 to-blue-800 rounded-[2.5rem] shadow-xl">
               <AlertTriangle className="text-white/40 mb-4" size={32} />
               <h4 className="text-xl font-black mb-2">Autonomous Override</h4>
               <p className="text-[10px] text-blue-100 font-medium mb-6 leading-relaxed">
                  Manually adjust AI confidence thresholds for real-time risk mitigation.
               </p>
               <button className="w-full py-4 bg-white text-blue-900 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-50 transition-all shadow-lg">
                  Configure Policies
               </button>
            </div>

            {/* Human Override Journal */}
            <div className="bg-white/5 rounded-[2.5rem] border border-white/10 p-8 shadow-sm">
               <h3 className="text-lg font-black text-white mb-6 flex items-center justify-between uppercase tracking-widest">
                  Override Journal
                  <History className="text-orange-400" size={18} />
               </h3>
               <div className="space-y-4">
                  {overrides.map((ov, i) => (
                    <div key={i} className="p-4 bg-orange-500/5 border border-orange-500/10 rounded-2xl">
                       <p className="text-[10px] font-black text-orange-300 mb-1">{ov.action}</p>
                       <p className="text-[9px] text-white/60 mb-2">BY {ov.userId} • {ov.reason}</p>
                    </div>
                  ))}
                  {overrides.length === 0 && (
                    <p className="text-[10px] text-white/20 text-center py-4">No manual overrides recorded.</p>
                  )}
               </div>
            </div>
         </div>
      </div>
    </div>
  );
};

export default LiveOpsCommandCenter;
