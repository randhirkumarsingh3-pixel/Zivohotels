import { 
  Activity, Database, Cpu, Zap, 
  Search,
  ShieldCheck, AlertTriangle, RefreshCw, Layers
} from 'lucide-react';

const MetricCard = ({ title, value, status, icon: Icon, color }) => (
  <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm">
    <div className="flex items-center justify-between mb-4">
      <div className={`p-3 rounded-2xl bg-${color}-50 text-${color}-600`}>
        <Icon size={20} />
      </div>
      <span className={`px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest ${status === 'OPTIMAL' ? 'bg-green-50 text-green-600' : 'bg-orange-50 text-orange-600'}`}>
        {status}
      </span>
    </div>
    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">{title}</p>
    <h3 className="text-2xl font-black text-gray-900">{value}</h3>
  </div>
);

const SystemHealth = () => {
  return (
    <div className="space-y-8 pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight">System Observability</h1>
          <p className="text-gray-500 font-medium mt-1">Real-time DevOps & Operational Intelligence.</p>
        </div>

        <div className="flex items-center gap-3">
          <button className="flex items-center gap-2 px-6 py-2.5 bg-white border border-gray-100 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-gray-50 transition-all">
            <RefreshCw size={16} /> Force Sync
          </button>
          <button className="px-6 py-2.5 bg-gray-900 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-black transition-all shadow-xl shadow-gray-900/10">
            System Diagnostics
          </button>
        </div>
      </div>

      {/* Primary DevOps Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <MetricCard title="API Latency (p99)" value="42ms" status="OPTIMAL" icon={Zap} color="brand" />
        <MetricCard title="DB Write Load" value="24%" status="OPTIMAL" icon={Database} color="blue" />
        <MetricCard title="Worker Health" value="100%" status="OPTIMAL" icon={Cpu} color="green" />
        <MetricCard title="Error Rate" value="0.02%" status="OPTIMAL" icon={AlertTriangle} color="red" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Worker & Queue Status */}
        <div className="lg:col-span-2 bg-white rounded-[2.5rem] border border-gray-100 p-10 shadow-sm">
           <h3 className="text-2xl font-black text-gray-900 mb-8 flex items-center gap-4">
              <div className="p-3 bg-gray-900 rounded-2xl text-white">
                 <Layers size={24} />
              </div>
              Distributed Service Pulse
           </h3>

           <div className="space-y-6">
              {[
                { name: 'Pricing AI Worker', load: 12, status: 'RUNNING', uptime: '99.9%' },
                { name: 'Finance Ledger Engine', load: 8, status: 'RUNNING', uptime: '100%' },
                { name: 'Anomaly Monitoring', load: 5, status: 'RUNNING', uptime: '99.9%' },
                { name: 'Payout Queue Processor', load: 42, status: 'HIGH_LOAD', uptime: '99.8%' }
              ].map(s => (
                <div key={s.name} className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl border border-gray-100 group hover:bg-white hover:shadow-lg transition-all">
                   <div className="flex items-center gap-4">
                      <div className={`w-3 h-3 rounded-full ${s.status === 'RUNNING' ? 'bg-green-500' : 'bg-orange-500'} animate-pulse`}></div>
                      <div>
                         <p className="text-sm font-black text-gray-900">{s.name}</p>
                         <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Uptime: {s.uptime}</p>
                      </div>
                   </div>
                   <div className="flex items-center gap-8">
                      <div className="text-right">
                         <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Load</p>
                         <p className="text-xs font-black text-gray-900">{s.load}%</p>
                      </div>
                      <div className="w-24 bg-gray-200 h-1.5 rounded-full overflow-hidden">
                         <div className={`h-full ${s.load > 30 ? 'bg-orange-500' : 'bg-brand-500'}`} style={{ width: `${s.load}%` }}></div>
                      </div>
                   </div>
                </div>
              ))}
           </div>
        </div>

        {/* Global Traffic Heatmap / BI */}
        <div className="space-y-8">
           <div className="bg-gray-900 rounded-[2.5rem] p-8 text-white shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 right-0 p-8 opacity-20">
                 <Activity size={100} />
              </div>
              <h3 className="text-xl font-black mb-10 flex items-center gap-3">
                 <ShieldCheck className="text-brand-500" size={24} />
                 Security Posture
              </h3>
              
              <div className="space-y-6">
                 <div>
                    <div className="flex justify-between items-center mb-2">
                       <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">WAF Throttling</span>
                       <span className="text-xs font-bold">0.4%</span>
                    </div>
                    <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden">
                       <div className="bg-brand-500 h-full w-[4%]"></div>
                    </div>
                 </div>
                 <div>
                    <div className="flex justify-between items-center mb-2">
                       <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Auth Success Rate</span>
                       <span className="text-xs font-bold">99.8%</span>
                    </div>
                    <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden">
                       <div className="bg-green-500 h-full w-[99.8%]"></div>
                    </div>
                 </div>
              </div>

              <div className="mt-12 p-6 bg-white/5 rounded-3xl border border-white/10">
                 <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">Detected Threats (24h)</p>
                 <div className="flex items-center gap-3">
                    <span className="text-3xl font-black">04</span>
                    <span className="text-[10px] text-orange-400 font-bold uppercase tracking-widest bg-orange-400/10 px-2 py-1 rounded">Mitigated</span>
                 </div>
              </div>
           </div>

           <div className="bg-white rounded-3xl border border-gray-100 p-8 shadow-sm">
              <h3 className="text-lg font-black text-gray-900 mb-6 flex items-center gap-2">
                 <Search className="text-blue-600" size={20} />
                 Query Insights
              </h3>
              <div className="space-y-4">
                 <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Slowest Operation</p>
                    <p className="text-xs font-bold text-gray-900">GET /api/v1/inventory/search</p>
                    <p className="text-[10px] text-red-500 font-bold mt-1">842ms Avg</p>
                 </div>
              </div>
           </div>
        </div>
      </div>
    </div>
  );
};

export default SystemHealth;
