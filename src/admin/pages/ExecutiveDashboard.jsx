import { 
  TrendingUp, IndianRupee, 
  ShieldAlert, AlertTriangle, ArrowUpRight,
  ChevronRight, Activity, Filter, Download, Zap,
  BarChart3, MousePointer2
} from 'lucide-react';
import StickyKPIStrip from '../../components/shared/StickyKPIStrip';
import AtomicCard from '../../components/shared/AtomicCard';

const ExecutiveDashboard = () => {
  const primaryMetrics = [
    { label: 'Revenue Today', value: '₹ 8.42L', delta: '+14%', deltaType: 'green' },
    { label: 'RPS (North Star)', value: '₹ 42.50', delta: '+8%', deltaType: 'green' },
    { label: 'Conversion %', value: '3.82%', delta: '-0.2%', deltaType: 'red' },
    { label: 'Avg Booking Value', value: '₹ 6,420', delta: '+2%', deltaType: 'green' },
    { label: 'Platform Margin', value: '15.4%', delta: 'STABLE', deltaType: 'gray' }
  ];

  return (
    <div className="-m-8"> {/* Negative margin to bleed to edges of padding in MasterLayout */}
      <StickyKPIStrip metrics={primaryMetrics} />

      <div className="p-10 space-y-10">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <h1 className="text-4xl font-black text-gray-900 tracking-tight">Executive Control Tower</h1>
            <p className="text-gray-500 font-medium mt-1">Real-time business intelligence and systemic risk monitor.</p>
          </div>

          <div className="flex items-center gap-3">
             <button className="flex items-center gap-2 px-6 py-3 bg-white border border-gray-100 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-gray-50 transition-all shadow-sm">
                <Filter size={16} /> Filters
             </button>
             <button className="flex items-center gap-2 px-6 py-3 bg-brand-600 text-white rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-brand-700 transition-all shadow-xl shadow-brand-600/20">
                <Download size={16} /> Export Intel
             </button>
          </div>
        </div>

        {/* Secondary Metrics / Risk Pulse */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
           <AtomicCard 
             title="Pending Payouts" 
             value="₹ 42.8L" 
             delta="14 Hotels" 
             deltaType="neutral"
             icon={IndianRupee}
             color="blue"
           />
           <AtomicCard 
             title="Wallet Liability" 
             value="₹ 1.24Cr" 
             delta="+₹ 4L" 
             deltaType="down"
             icon={IndianRupee}
             color="purple"
           />
           <AtomicCard 
             title="Credit Exposure" 
             value="₹ 24.5L" 
             delta="SAFE" 
             deltaType="neutral"
             icon={TrendingUp}
             color="orange"
           />
           <AtomicCard 
             title="Fraud Alerts" 
             value="12" 
             delta="CRITICAL" 
             deltaType="down"
             icon={ShieldAlert}
             color="red"
           />
           <div className="bg-red-600 rounded-[1.5rem] p-6 text-white shadow-xl shadow-red-600/20 group cursor-pointer hover:bg-red-700 transition-all">
              <div className="flex justify-between items-start mb-6">
                 <div className="p-3 bg-white/20 rounded-xl">
                    <Zap size={24} fill="currentColor" />
                 </div>
                 <span className="text-[10px] font-black uppercase tracking-widest bg-white/20 px-2 py-1 rounded-lg">Live Status</span>
              </div>
              <p className="text-[10px] font-black text-red-200 uppercase tracking-widest mb-1">System Mode</p>
              <h3 className="text-2xl font-black mb-1 tracking-tight">SAFE_MODE</h3>
              <p className="text-[10px] font-bold text-red-100 opacity-80 uppercase tracking-widest">Global Payout Freeze: ACTIVE</p>
           </div>
        </div>

        {/* Charts & Main Intelligence */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
           {/* Chart Row Simulation */}
           <div className="lg:col-span-2 bg-white rounded-[2.5rem] border border-gray-100 p-10 shadow-sm relative overflow-hidden group">
              <div className="flex justify-between items-center mb-10">
                 <div>
                    <h3 className="text-2xl font-black text-gray-900 leading-tight">Revenue Dynamics</h3>
                    <p className="text-gray-400 text-xs font-bold mt-1 uppercase tracking-widest">vs Last 30 Days Portfolio</p>
                 </div>
                 <div className="flex bg-gray-50 p-1 rounded-xl">
                    <button className="px-4 py-2 bg-white text-gray-900 rounded-lg text-[10px] font-black uppercase tracking-widest shadow-sm">Revenue</button>
                    <button className="px-4 py-2 text-gray-400 rounded-lg text-[10px] font-black uppercase tracking-widest hover:text-gray-600">RPS</button>
                 </div>
              </div>

              {/* Placeholder for Chart */}
              <div className="h-64 flex items-end gap-2 px-4 relative">
                 {[40, 60, 45, 70, 55, 80, 65, 90, 75, 100, 85, 110, 95, 120].map((h, i) => (
                   <div key={i} className="flex-1 bg-brand-50 group-hover:bg-brand-100 transition-all rounded-t-xl relative group/bar" style={{ height: `${h}%` }}>
                      <div className="absolute inset-0 bg-brand-500 opacity-0 group-hover/bar:opacity-100 transition-opacity rounded-t-xl"></div>
                   </div>
                 ))}
                 
                 {/* Floating Tooltip Simulation */}
                 <div className="absolute top-10 left-1/2 -translate-x-1/2 bg-gray-900 text-white px-4 py-2 rounded-xl text-[10px] font-bold shadow-2xl opacity-0 group-hover:opacity-100 transition-opacity">
                    PEAK REVENUE: ₹ 1.24L (12 May)
                 </div>
              </div>
           </div>

           {/* Alert Panel */}
           <div className="bg-white rounded-[2.5rem] border border-gray-100 p-10 shadow-sm">
              <h3 className="text-xl font-black text-gray-900 mb-8 flex items-center gap-3">
                 <AlertTriangle className="text-orange-500" size={24} />
                 Anomaly Signals
              </h3>
              
              <div className="space-y-6">
                 {[
                   { title: 'Fraud Velocity Spike', location: 'New Delhi Cluster', type: 'CRITICAL', color: 'red' },
                   { title: 'Refund Rate Abnormality', location: 'Hotel Taj Palace', type: 'WARNING', color: 'orange' },
                   { title: 'Payout Queue Delay', location: 'HDFC Node AP-1', type: 'INFO', color: 'blue' }
                 ].map((a, i) => (
                   <div key={i} className="flex items-center gap-4 group cursor-pointer">
                      <div className={`w-2 h-12 rounded-full bg-${a.color}-500 opacity-20 group-hover:opacity-100 transition-opacity`}></div>
                      <div className="flex-1">
                         <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">{a.type}</p>
                         <h4 className="text-sm font-black text-gray-900 group-hover:text-brand-600 transition-colors">{a.title}</h4>
                         <p className="text-[10px] text-gray-400 font-bold">{a.location}</p>
                      </div>
                      <ChevronRight size={16} className="text-gray-300 group-hover:text-brand-500 transition-all" />
                   </div>
                 ))}
              </div>

              <button className="w-full mt-10 py-4 bg-gray-50 border border-gray-100 rounded-2xl text-[10px] font-black uppercase tracking-widest text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-all">
                 View All Incidents
              </button>
           </div>
        </div>

        {/* Top Lists Section */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
           {/* Top Cities */}
           <div className="bg-white rounded-[2rem] border border-gray-100 p-8 shadow-sm">
              <h3 className="text-lg font-black text-gray-900 mb-6 flex items-center gap-2">
                 <BarChart3 className="text-brand-500" size={20} />
                 Top Performing Cities
              </h3>
              <div className="space-y-4">
                 {[
                   { name: 'New Delhi', rps: '₹ 84.20', revenue: '₹ 12.4L', growth: '+12%' },
                   { name: 'Mumbai', rps: '₹ 72.15', revenue: '₹ 9.8L', growth: '+8%' },
                   { name: 'Bengaluru', rps: '₹ 68.40', revenue: '₹ 8.2L', growth: '+15%' }
                 ].map((c, i) => (
                   <div key={i} className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl group hover:bg-white hover:shadow-lg transition-all border border-transparent hover:border-gray-100">
                      <div>
                         <p className="text-xs font-black text-gray-900">{c.name}</p>
                         <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest">RPS: {c.rps}</p>
                      </div>
                      <div className="text-right">
                         <p className="text-xs font-black text-brand-600">{c.growth}</p>
                         <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest">{c.revenue}</p>
                      </div>
                   </div>
                 ))}
              </div>
           </div>

           {/* Risky Hotels */}
           <div className="bg-white rounded-[2rem] border border-gray-100 p-8 shadow-sm">
              <h3 className="text-lg font-black text-gray-900 mb-6 flex items-center gap-2">
                 <ShieldAlert className="text-red-500" size={20} />
                 Risk Performance Monitor
              </h3>
              <div className="space-y-4">
                 {[
                   { name: 'Grand Heritage Inn', score: '82', issue: 'Refund Spike', color: 'red' },
                   { name: 'Urban Stay Suites', score: '64', issue: 'Failed Payouts', color: 'orange' },
                   { name: 'Blue Pearl Residency', score: '42', issue: 'Auth Failures', color: 'yellow' }
                 ].map((h, i) => (
                   <div key={i} className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl">
                      <div className="flex items-center gap-3">
                         <div className={`w-8 h-8 rounded-lg bg-${h.color}-500/10 flex items-center justify-center text-${h.color}-600 font-black text-[10px]`}>
                            {h.score}
                         </div>
                         <div>
                            <p className="text-xs font-black text-gray-900">{h.name}</p>
                            <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest">{h.issue}</p>
                         </div>
                      </div>
                      <button className="p-2 text-gray-300 hover:text-gray-600 hover:bg-white rounded-lg transition-all shadow-sm">
                         <ArrowUpRight size={14} />
                      </button>
                   </div>
                 ))}
              </div>
           </div>

           {/* Quick Funnel Stats */}
           <div className="bg-gray-900 rounded-[2rem] p-8 text-white shadow-2xl relative overflow-hidden">
              <div className="absolute bottom-0 right-0 p-8 opacity-10">
                 <MousePointer2 size={120} />
              </div>
              <h3 className="text-lg font-black mb-8 flex items-center gap-2">
                 <Activity className="text-brand-500" size={20} />
                 Real-Time Funnel
              </h3>
              
              <div className="space-y-8 relative z-10">
                 <div>
                    <div className="flex justify-between items-center mb-2">
                       <span className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">Search → View</span>
                       <span className="text-xs font-bold text-green-400">42.5%</span>
                    </div>
                    <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
                       <div className="bg-green-500 h-full w-[42.5%]"></div>
                    </div>
                 </div>
                 <div>
                    <div className="flex justify-between items-center mb-2">
                       <span className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">View → Booking</span>
                       <span className="text-xs font-bold text-brand-500">3.8%</span>
                    </div>
                    <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
                       <div className="bg-brand-500 h-full w-[3.8%]"></div>
                    </div>
                 </div>
              </div>

              <div className="mt-12 p-6 bg-white/5 rounded-3xl border border-white/10">
                 <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest mb-2">Top Drop-off Point</p>
                 <p className="text-xs font-black text-red-400">Payment Selection Page (18% Drop)</p>
                 <button className="mt-4 text-[9px] font-black text-brand-500 uppercase tracking-widest hover:underline">
                    Investigate Checkout UX
                 </button>
              </div>
           </div>
        </div>
      </div>
    </div>
  );
};

export default ExecutiveDashboard;
