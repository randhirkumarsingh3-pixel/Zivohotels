import { useState } from 'react';
import { 
  Zap, ShieldAlert, Activity, FlaskConical, 
  Search, Filter, Clock, ArrowRight,
  ShieldCheck, AlertTriangle, PlayCircle,
  RotateCcw, Pause, Edit3, MessageSquare
} from 'lucide-react';

const DecisionItem = ({ id, type, action, reason, signals, timestamp, status, onOverride }) => {
  const icons = {
    SAFE_MODE: <ShieldAlert className="text-red-500" />,
    THROTTLE_TRAFFIC: <Activity className="text-orange-500" />,
    EXPERIMENT: <FlaskConical className="text-purple-500" />,
    PRICING: <Zap className="text-brand-500" />,
    FREEZE_PAYOUTS: <Pause className="text-red-600" />
  };

  return (
    <div className="flex gap-6 p-8 bg-white rounded-3xl border border-gray-100 hover:shadow-xl transition-all group relative overflow-hidden">
      {status === 'REVERTED' && (
        <div className="absolute top-0 right-0 p-4">
           <span className="flex items-center gap-1 text-[9px] font-black text-gray-400 uppercase tracking-widest bg-gray-50 px-2 py-1 rounded-lg">
             <RotateCcw size={10} /> REVERTED BY ADMIN
           </span>
        </div>
      )}

      <div className="flex flex-col items-center gap-2">
         <div className="p-4 rounded-2xl bg-gray-50 group-hover:bg-white group-hover:scale-110 transition-all border border-gray-100 shadow-sm">
           {icons[type] || icons.PRICING}
         </div>
         <div className="w-px h-full bg-gray-100 mt-2"></div>
      </div>
      
      <div className="flex-1">
        <div className="flex justify-between items-start mb-4">
           <div>
             <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">{timestamp}</span>
             <h4 className="text-xl font-black text-gray-900 leading-tight">{action}</h4>
           </div>
           <div className="flex items-center gap-2">
              {status === 'ACTIVE' && (
                <button 
                  onClick={() => onOverride(id)}
                  className="px-4 py-2 bg-red-50 text-red-600 border border-red-100 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-red-600 hover:text-white transition-all flex items-center gap-2"
                >
                  <RotateCcw size={12} /> Override
                </button>
              )}
              <button className="p-2 text-gray-300 hover:text-gray-600 hover:bg-gray-50 rounded-xl transition-all">
                <MessageSquare size={16} />
              </button>
           </div>
        </div>

        <p className="text-sm text-gray-500 font-medium leading-relaxed mb-6">
          <strong className="text-gray-900">Reason:</strong> {reason}
        </p>

        <div className="bg-gray-50 rounded-2xl p-6 border border-gray-100 grid grid-cols-2 md:grid-cols-4 gap-6">
           {Object.entries(signals).map(([key, val]) => (
             <div key={key}>
               <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">{key.replace(/_/g, ' ')}</p>
               <p className="text-sm font-black text-gray-900">{val}</p>
             </div>
           ))}
        </div>
      </div>
    </div>
  );
};

const OperatorDecisionCenter = () => {
  const [decisions, setDecisions] = useState([
    {
      id: 'SYS-8271',
      type: 'SAFE_MODE',
      action: 'Global Payout Freeze Activated',
      reason: 'Refund velocity spike detected in South Delhi ( +24% in 30m ). Auto-guard engaged to prevent liquidity drainage.',
      signals: { refund_rate: '24%', geo_cluster: 'DELHI_S', velocity: 'HIGH', impact: '₹ 4.2L' },
      timestamp: '03 May 2026 · 14:24',
      status: 'ACTIVE'
    },
    {
      id: 'SYS-8275',
      type: 'THROTTLE_TRAFFIC',
      action: '20% Traffic Throttling Engaged',
      reason: 'Database write latency exceeded 500ms. Throttling initiated to stabilize core services.',
      signals: { latency: '542ms', cpu_load: '88%', db_queue: '142', cluster: 'AWS-AP-1' },
      timestamp: '03 May 2026 · 12:15',
      status: 'REVERTED'
    }
  ]);

  const handleOverride = (id) => {
    setDecisions(prev => prev.map(d => d.id === id ? { ...d, status: 'REVERTED' } : d));
  };

  return (
    <div className="space-y-10 pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="w-2 h-2 rounded-full bg-brand-500 animate-pulse"></span>
            <span className="text-[10px] font-black text-brand-600 uppercase tracking-[0.2em]">Operational Governance</span>
          </div>
          <h1 className="text-4xl font-black text-gray-900 tracking-tight">Operator Decision Center</h1>
          <p className="text-gray-500 font-medium mt-1">Audit and override autonomous system behaviors.</p>
        </div>

        <div className="flex items-center gap-3">
          <button className="flex items-center gap-2 px-6 py-3 bg-red-600 text-white rounded-2xl text-xs font-black uppercase tracking-widest shadow-xl shadow-red-600/20 hover:bg-red-700 transition-all">
             <Edit3 size={16} /> Manual Safe Mode
          </button>
        </div>
      </div>

      {/* Decision Feed */}
      <div className="space-y-8">
        <h3 className="text-xs font-black text-gray-400 uppercase tracking-[0.3em] border-b border-gray-100 pb-4">Live Governance Feed</h3>
        {decisions.map(d => (
          <DecisionItem 
            key={d.id}
            {...d}
            onOverride={handleOverride}
          />
        ))}
      </div>
    </div>
  );
};

export default OperatorDecisionCenter;
