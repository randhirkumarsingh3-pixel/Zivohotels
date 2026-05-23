import { useState } from 'react';
import { 
  History, ChevronRight, ChevronDown, 
  Search, ShieldAlert, Cpu, Database, 
  ArrowDownCircle, Play, StepForward
} from 'lucide-react';

const IncidentForensicTimeline = ({ incidentId, events }) => {
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [expandedGroups, setExpandedGroups] = useState(new Set(['cause']));

  const toggleGroup = (group) => {
    const next = new Set(expandedGroups);
    if (next.has(group)) next.delete(group);
    else next.add(group);
    setExpandedGroups(next);
  };

  // Group events by phase
  const phases = {
    cause: events.filter(e => e.severity === 'WARNING' || e.event.includes('FAILURE')),
    trigger: events.filter(e => e.event === 'AUTONOMOUS_DECISION' || e.event === 'SAFE_MODE_TOGGLED'),
    propagation: events.filter(e => e.source === 'SOCKET_SERVICE' || e.source === 'ORCHESTRATION_SERVICE'),
    mitigation: events.filter(e => e.severity === 'SUCCESS')
  };

  return (
    <div className="bg-slate-900 rounded-[2.5rem] border border-white/10 overflow-hidden flex flex-col h-[600px] shadow-2xl">
      <div className="p-8 border-b border-white/5 bg-white/[0.02] flex justify-between items-center">
         <div className="flex items-center gap-4">
            <History className="text-blue-400" size={24} />
            <div>
               <h3 className="text-xl font-black">Forensic Replay</h3>
               <p className="text-[10px] text-white/40 font-black uppercase tracking-widest">Incident Root Cause Analysis • ID: {incidentId?.slice(0, 8)}</p>
            </div>
         </div>
         <div className="flex items-center gap-2">
            <button className="p-3 bg-white/5 rounded-xl hover:bg-white/10 transition-all"><Play size={16} /></button>
            <button className="p-3 bg-white/5 rounded-xl hover:bg-white/10 transition-all"><StepForward size={16} /></button>
         </div>
      </div>

      <div className="flex-1 overflow-y-auto p-8 space-y-8 scrollbar-hide">
         {Object.entries(phases).map(([phase, phaseEvents]) => phaseEvents.length > 0 && (
           <div key={phase} className="space-y-4">
              <button 
                onClick={() => toggleGroup(phase)}
                className="flex items-center gap-3 w-full text-left group"
              >
                 {expandedGroups.has(phase) ? <ChevronDown size={16} className="text-white/20" /> : <ChevronRight size={16} className="text-white/20" />}
                 <span className={`text-[10px] font-black uppercase tracking-[0.2em] ${
                   phase === 'cause' ? 'text-red-400' :
                   phase === 'trigger' ? 'text-orange-400' :
                   'text-blue-400'
                 }`}>
                    {phase}
                 </span>
                 <div className="h-px bg-white/5 flex-1" />
              </button>

              {expandedGroups.has(phase) && (
                <div className="space-y-3 ml-4 border-l-2 border-white/5 pl-8">
                   {phaseEvents.map((ev, i) => (
                     <div 
                       key={i} 
                       onClick={() => setSelectedEvent(ev)}
                       className={`p-4 rounded-2xl border cursor-pointer transition-all ${
                         selectedEvent === ev ? 'bg-white/10 border-blue-500 shadow-lg shadow-blue-500/10' : 'bg-white/5 border-white/5 hover:border-white/10'
                       }`}
                     >
                        <div className="flex justify-between items-start mb-1">
                           <span className="text-xs font-bold text-white">{ev.event}</span>
                           <span className="text-[9px] text-white/40">{new Date(ev.timestamp).toLocaleTimeString()}</span>
                        </div>
                        <p className="text-[10px] text-white/60 font-medium truncate">{JSON.stringify(ev.data)}</p>
                     </div>
                   ))}
                </div>
              )}
           </div>
         ))}
      </div>

      {selectedEvent && (
        <div className="p-8 bg-white/5 border-t border-white/10 animate-in slide-in-from-bottom-5">
           <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center text-blue-400 shrink-0">
                 <Cpu size={20} />
              </div>
              <div className="flex-1">
                 <h4 className="text-sm font-black mb-1">Autonomous Reasoning</h4>
                 <p className="text-[11px] text-white/60 leading-relaxed italic">
                   "Model detected anomalous {selectedEvent.event} pattern. Confidence {selectedEvent.data.confidence || 0.85}. Executed automated {selectedEvent.data.action || 'escalation'} per policy POL_SYS_001."
                 </p>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default IncidentForensicTimeline;
