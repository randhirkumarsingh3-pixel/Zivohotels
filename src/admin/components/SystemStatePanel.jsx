import { ShieldAlert, Activity, FlaskConical, Zap, Clock } from 'lucide-react';

const StateIndicator = ({ icon: Icon, label, status, color, active }) => (
  <div className={`flex flex-col border-r border-gray-100 last:border-0 px-6 ${active ? 'opacity-100' : 'opacity-40'}`}>
     <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">{label}</span>
     <div className="flex items-center gap-2">
        <Icon size={12} className={`text-${color}-500`} fill={active ? 'currentColor' : 'none'} />
        <span className={`text-xs font-black ${active ? `text-${color}-600` : 'text-gray-400'}`}>{status}</span>
     </div>
  </div>
);

const SystemStatePanel = () => {
  return (
    <div className="bg-white border-y border-gray-100 py-3 flex items-center overflow-x-auto no-scrollbar shadow-sm">
       <div className="container mx-auto px-6 flex items-center">
          <StateIndicator 
            icon={ShieldAlert} 
            label="Safe Mode" 
            status="OFF" 
            color="red" 
            active={false} 
          />
          <StateIndicator 
            icon={Activity} 
            label="Throttle" 
            status="NORMAL" 
            color="orange" 
            active={false} 
          />
          <StateIndicator 
            icon={FlaskConical} 
            label="Experiments" 
            status="04 ACTIVE" 
            color="purple" 
            active={true} 
          />
          <StateIndicator 
            icon={Zap} 
            label="AI Pricing" 
            status="ENABLED" 
            color="brand" 
            active={true} 
          />
          <StateIndicator 
            icon={Clock} 
            label="Payout Queue" 
            status="HEALTHY" 
            color="green" 
            active={true} 
          />
          
          <div className="ml-auto flex items-center gap-4">
             <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Global Sync: 12ms</span>
             </div>
          </div>
       </div>
    </div>
  );
};

export default SystemStatePanel;
