import { 
  Search, Filter, Activity, ChevronRight,
  ArrowRight, User
} from 'lucide-react';

const SessionRow = ({ id, user, path, revenue, status, duration }) => (
  <tr className="hover:bg-gray-50/50 transition-all cursor-pointer group">
    <td className="px-8 py-5">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center text-gray-500">
          <Activity size={16} />
        </div>
        <div>
          <p className="text-xs font-bold text-gray-900">{id}</p>
          <p className="text-[10px] text-gray-400 font-medium">03 May 2026 · 15:20</p>
        </div>
      </div>
    </td>
    <td className="px-8 py-5">
      <div className="flex items-center gap-2">
        <User size={14} className="text-gray-400" />
        <p className="text-xs font-bold text-gray-700">{user}</p>
      </div>
    </td>
    <td className="px-8 py-5">
      <div className="flex items-center gap-2">
        {path.map((step, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className={`text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded ${i === path.length - 1 ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-400'}`}>
              {step}
            </span>
            {i < path.length - 1 && <ChevronRight size={10} className="text-gray-300" />}
          </div>
        ))}
      </div>
    </td>
    <td className="px-8 py-5">
      <p className="text-xs font-black text-gray-900">{duration}</p>
    </td>
    <td className="px-8 py-5 text-right">
      <p className={`text-sm font-black ${revenue > 0 ? 'text-green-600' : 'text-gray-400'}`}>
        ₹ {revenue.toLocaleString()}
      </p>
    </td>
    <td className="px-8 py-5 text-center">
      <div className="flex justify-center">
         <ArrowRight size={16} className="text-gray-300 group-hover:text-brand-600 group-hover:translate-x-1 transition-all" />
      </div>
    </td>
  </tr>
);

const SessionExplorer = () => {
  return (
    <div className="space-y-8 pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight">Session Explorer</h1>
          <p className="text-gray-500 font-medium mt-1">Deep-dive into search-to-booking funnels and drop-off points.</p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <input type="text" placeholder="Search Session ID / User..." className="pl-10 pr-4 py-2.5 bg-white border-gray-100 border rounded-xl text-xs outline-none focus:ring-2 focus:ring-brand-500/20 w-64" />
          </div>
        </div>
      </div>

      {/* Funnel Pulse */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm">
           <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Live Sessions</p>
           <h4 className="text-2xl font-black text-gray-900">1,242</h4>
        </div>
        <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm">
           <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Avg. Path Length</p>
           <h4 className="text-2xl font-black text-gray-900">4.2 steps</h4>
        </div>
        <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm">
           <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Conv. Rate (Live)</p>
           <h4 className="text-2xl font-black text-green-600">3.8%</h4>
        </div>
        <div className="bg-gray-900 rounded-3xl p-6 text-white shadow-xl">
           <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">Abnormal Drop-offs</p>
           <h4 className="text-2xl font-black text-red-500">12%</h4>
        </div>
      </div>

      {/* Session Table */}
      <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-8 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
          <div className="flex items-center gap-4">
             <div className="flex bg-white rounded-xl border border-gray-200 p-1">
                <button className="px-4 py-2 bg-gray-900 text-white rounded-lg text-xs font-black uppercase tracking-widest">Live</button>
                <button className="px-4 py-2 text-gray-400 text-xs font-black uppercase tracking-widest hover:text-gray-600">Converted</button>
                <button className="px-4 py-2 text-gray-400 text-xs font-black uppercase tracking-widest hover:text-gray-600">Dropped</button>
             </div>
          </div>
          <button className="flex items-center gap-2 px-6 py-2.5 bg-white border border-gray-100 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-gray-50 transition-all">
            <Filter size={16} /> Filters
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="px-8 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Session ID / Time</th>
                <th className="px-8 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">User Context</th>
                <th className="px-8 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Path Journey</th>
                <th className="px-8 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Duration</th>
                <th className="px-8 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Value</th>
                <th className="px-8 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              <SessionRow 
                id="SES-48291" 
                user="Arjun (Delhi)" 
                path={['SEARCH', 'CLICK', 'PREVIEW', 'BOOKING']} 
                revenue={8420} 
                duration="4m 12s"
              />
              <SessionRow 
                id="SES-48302" 
                user="Anonymous (Mumbai)" 
                path={['SEARCH', 'CLICK', 'DROPPED']} 
                revenue={0} 
                duration="1m 05s"
              />
              <SessionRow 
                id="SES-48315" 
                user="Priya (Bengaluru)" 
                path={['SEARCH', 'CLICK', 'PREVIEW', 'BOOKING']} 
                revenue={12400} 
                duration="8m 45s"
              />
              <SessionRow 
                id="SES-48328" 
                user="Anonymous (Jaipur)" 
                path={['SEARCH', 'DROPPED']} 
                revenue={0} 
                duration="0m 15s"
              />
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default SessionExplorer;
