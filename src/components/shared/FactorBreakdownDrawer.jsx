import { X, ShieldCheck, Zap, Info, Layers, Activity } from 'lucide-react';

/**
 * FactorBreakdownDrawer
 * Visualizes structured explainability data from the Orchestrator.
 */

const FactorBreakdownDrawer = ({ isOpen, onClose, decision }) => {
  if (!isOpen || !decision) return null;

  const { output, explanation, type, entityId } = decision;

  return (
    <div className={`fixed inset-0 z-[100] ${isOpen ? 'visible' : 'invisible'}`}>
      {/* Backdrop */}
      <div 
        className={`absolute inset-0 bg-gray-900/40 backdrop-blur-sm transition-opacity duration-500 ${isOpen ? 'opacity-100' : 'opacity-0'}`}
        onClick={onClose}
      />
      
      {/* Drawer */}
      <div className={`absolute top-0 right-0 h-full w-full max-w-md bg-white shadow-2xl transition-transform duration-500 ease-out transform ${isOpen ? 'translate-x-0' : 'translate-x-full'} overflow-y-auto`}>
        <div className="p-8">
          {/* Header */}
          <div className="flex justify-between items-start mb-10">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="w-2 h-2 rounded-full bg-brand-500 animate-pulse"></span>
                <span className="text-[10px] font-black text-brand-600 uppercase tracking-widest">Decision Intelligence</span>
              </div>
              <h2 className="text-3xl font-black text-gray-900 tracking-tight">Factor Breakdown</h2>
              <p className="text-gray-400 text-xs font-bold mt-1">{type} • {entityId}</p>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-gray-50 rounded-xl transition-all">
              <X size={20} className="text-gray-400" />
            </button>
          </div>

          {/* Main Output */}
          <div className="bg-gray-900 rounded-[2rem] p-8 text-white mb-10 relative overflow-hidden shadow-2xl shadow-brand-500/10">
             <div className="absolute top-0 right-0 p-8 opacity-10">
                <Zap size={120} />
             </div>
             <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">Final System Output</p>
             <h3 className="text-4xl font-black mb-2">{typeof output === 'number' ? `₹ ${output.toLocaleString()}` : output}</h3>
             <div className="flex items-center gap-2">
                <ShieldCheck size={14} className="text-brand-500" />
                <span className="text-[10px] font-black text-brand-400 uppercase tracking-widest">Confidence: {explanation.confidence}</span>
             </div>
          </div>

          {/* Winning Layer */}
          <div className="mb-10">
             <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4 border-b border-gray-50 pb-2">Winning Source</h4>
             <div className="flex items-center gap-4 p-4 bg-brand-50 rounded-2xl border border-brand-100">
                <div className="p-3 bg-brand-500 text-white rounded-xl">
                   <Layers size={20} />
                </div>
                <div>
                   <p className="text-sm font-black text-gray-900">{explanation.winningLayer.replace(/_/g, ' ')}</p>
                   <p className="text-[10px] text-brand-600 font-bold uppercase tracking-widest">Priority Score: {explanation.priority}</p>
                </div>
             </div>
          </div>

          {/* Factors */}
          <div className="mb-10">
             <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4 border-b border-gray-50 pb-2">Contribution Factors</h4>
             <div className="space-y-4">
                {Object.entries(explanation.factors).map(([name, data]) => (
                  <div key={name} className="flex justify-between items-center p-4 hover:bg-gray-50 rounded-2xl transition-all group">
                     <div className="flex items-center gap-3">
                        <Activity size={16} className="text-gray-300 group-hover:text-brand-500 transition-colors" />
                        <div>
                           <p className="text-xs font-black text-gray-900 uppercase tracking-tighter">{name}</p>
                           <p className="text-[10px] text-gray-400 font-medium">{data.signal || 'System Signal'}</p>
                        </div>
                     </div>
                     <span className="text-sm font-black text-brand-600">{data.weight}</span>
                  </div>
                ))}
             </div>
          </div>

          {/* Version Info */}
          <div className="pt-8 border-t border-gray-100">
             <div className="flex items-center justify-between text-gray-400">
                <div className="flex items-center gap-2">
                   <Info size={14} />
                   <span className="text-[10px] font-bold uppercase tracking-widest">Model Version</span>
                </div>
                <span className="text-[10px] font-black text-gray-900 uppercase tracking-widest">{explanation.version}</span>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FactorBreakdownDrawer;
