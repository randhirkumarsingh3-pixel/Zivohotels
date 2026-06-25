import { 
  Zap, ShieldAlert, Activity, FlaskConical, Database, Cpu,
  Layers, HardDrive, RefreshCw, History
} from 'lucide-react';

const ControlCard = ({ title, status, active, onToggle, icon: Icon, color }) => (
  <div className={`bg-white rounded-[2.5rem] p-8 border border-gray-100 shadow-sm group hover:shadow-xl transition-all duration-500`}>
    <div className="flex justify-between items-start mb-8">
      <div className={`p-4 rounded-[1.5rem] ${active ? `bg-${color}-600 text-white` : 'bg-gray-100 text-gray-400'} shadow-lg transition-all`}>
        <Icon size={24} fill={active ? 'currentColor' : 'none'} />
      </div>
      <button 
        onClick={onToggle}
        className={`w-14 h-8 rounded-full relative transition-all duration-300 p-1 ${active ? `bg-${color}-600` : 'bg-gray-200'}`}
      >
        <div className={`w-6 h-6 bg-white rounded-full shadow-md transition-transform duration-300 transform ${active ? 'translate-x-6' : 'translate-x-0'}`} />
      </button>
    </div>
    
    <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-1">{title}</p>
    <h3 className={`text-2xl font-black tracking-tight ${active ? 'text-gray-900' : 'text-gray-400'}`}>
      {status}
    </h3>
  </div>
);

const SystemControlCenter = () => {
  return (
    <div className="space-y-10 pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
            <span className="text-[10px] font-black text-red-600 uppercase tracking-[0.2em]">Platform Command Core</span>
          </div>
          <h1 className="text-4xl font-black text-gray-900 tracking-tight">System Control Center</h1>
          <p className="text-gray-500 font-medium mt-1">Global overrides, safety toggles, and systemic state management.</p>
        </div>

        <div className="flex items-center gap-3">
          <button className="flex items-center gap-2 px-8 py-3 bg-red-600 text-white rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-red-700 transition-all shadow-xl shadow-red-600/20">
             <ShieldAlert size={18} /> Global Emergency Stop
          </button>
        </div>
      </div>

      {/* Global Toggles */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
        <ControlCard 
          title="SAFE_MODE Escalation" 
          status="DISABLED" 
          active={false} 
          icon={ShieldAlert}
          color="red"
        />
        <ControlCard 
          title="Autonomous Throttling" 
          status="ACTIVE (20%)" 
          active={true} 
          icon={Activity}
          color="orange"
        />
        <ControlCard 
          title="Experiment Engine" 
          status="04 RUNNING" 
          active={true} 
          icon={FlaskConical}
          color="purple"
        />
        <ControlCard 
          title="AI Pricing Logic" 
          status="ENABLED" 
          active={true} 
          icon={Zap}
          color="brand"
        />
      </div>

      {/* System Health Pulse */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
        <div className="lg:col-span-2 bg-gray-900 rounded-[3rem] p-12 text-white shadow-2xl relative overflow-hidden">
           <div className="absolute bottom-0 right-0 p-12 opacity-5">
              <Database size={300} />
           </div>

           <div className="flex justify-between items-start mb-12 relative z-10">
              <div>
                 <h3 className="text-3xl font-black tracking-tight mb-2">Operational Integrity</h3>
                 <p className="text-gray-500 font-bold uppercase tracking-widest text-[10px]">Real-time distributed diagnostics</p>
              </div>
              <button className="p-3 bg-white/5 hover:bg-white/10 rounded-2xl transition-all">
                 <RefreshCw size={24} className="text-brand-500" />
              </button>
           </div>

           <div className="grid grid-cols-1 md:grid-cols-2 gap-12 relative z-10">
              {[
                { label: 'Ledger Variance', value: '✔ 0.00', status: 'BALANCED', icon: Layers, color: 'brand' },
                { label: 'API p99 Latency', value: '42ms', status: 'OPTIMAL', icon: Activity, color: 'green' },
                { label: 'Worker Uptime', value: '100%', status: 'HEALTHY', icon: Cpu, color: 'blue' },
                { label: 'Database I/O', value: '24%', status: 'STABLE', icon: HardDrive, color: 'purple' }
              ].map((h, i) => (
                <div key={i} className="flex items-center gap-6 group">
                   <div className={`p-5 bg-white/5 rounded-[1.5rem] text-${h.color}-500 border border-white/5 group-hover:bg-white/10 group-hover:scale-110 transition-all`}>
                      <h.icon size={32} />
                   </div>
                   <div>
                      <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">{h.label}</p>
                      <h4 className="text-2xl font-black mb-1">{h.value}</h4>
                      <div className="flex items-center gap-2">
                         <div className="w-1.5 h-1.5 rounded-full bg-green-500"></div>
                         <span className="text-[9px] font-black text-green-500 uppercase tracking-widest">{h.status}</span>
                      </div>
                   </div>
                </div>
              ))}
           </div>
        </div>

        {/* Recent Actions Feed */}
        <div className="bg-white rounded-[3rem] border border-gray-100 p-10 shadow-sm">
           <h3 className="text-xl font-black text-gray-900 mb-8 flex items-center gap-3">
              <History className="text-brand-500" size={24} />
              Command Log
           </h3>
           
           <div className="space-y-8">
              {[
                { action: 'SAFE_MODE_REVERT', admin: 'Randhir', time: '14m ago', status: 'SUCCESS' },
                { action: 'THROTTLE_INCREASE', admin: 'System_AI', time: '2h ago', status: 'AUTO' },
                { action: 'PAYOUT_FREEZE', admin: 'Fraud_Engine', time: '5h ago', status: 'AUTO' }
              ].map((l, i) => (
                <div key={i} className="flex gap-4 group">
                   <div className="flex flex-col items-center">
                      <div className="w-3 h-3 rounded-full bg-gray-200 mt-1 border-2 border-white shadow-sm group-hover:bg-brand-500 transition-colors"></div>
                      <div className="w-px h-full bg-gray-100 my-1"></div>
                   </div>
                   <div className="flex-1 pb-6">
                      <div className="flex justify-between items-start mb-1">
                         <h4 className="text-sm font-black text-gray-900 uppercase tracking-tighter">{l.action}</h4>
                         <span className="text-[9px] font-black text-gray-400">{l.time}</span>
                      </div>
                      <p className="text-[10px] text-gray-500 font-medium">Triggered by <span className="font-black text-gray-900 underline">{l.admin}</span></p>
                   </div>
                </div>
              ))}
           </div>

           <button className="w-full mt-6 py-4 bg-gray-50 text-gray-500 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-gray-900 hover:text-white transition-all shadow-sm">
              View Governance Trail
           </button>
        </div>
      </div>
    </div>
  );
};

export default SystemControlCenter;
