import { Outlet } from 'react-router-dom';
import MasterSidebar from '../admin/components/master/MasterSidebar';
import { Bell, Search, Globe } from 'lucide-react';
import SystemStatePanel from '../admin/components/SystemStatePanel';

const MasterLayout = () => {
  return (
    <div className="flex min-h-screen bg-[#F8FAFC]">
      <MasterSidebar />
      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        {/* Intelligence Header */}
        <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-8 shrink-0 z-20 shadow-sm">
          <div className="flex items-center flex-1 max-w-xl">
            <div className="relative w-full group">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-brand-500 transition-colors" size={16} />
              <input 
                type="text" 
                placeholder="Search properties, transactions, or sessions..." 
                className="w-full bg-gray-50 border-gray-100 border rounded-xl py-2 pl-10 pr-4 text-sm focus:bg-white focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all outline-none"
              />
            </div>
          </div>

          <div className="flex items-center space-x-4">
             <button className="flex items-center gap-2 px-4 py-2 bg-brand-50 text-brand-700 rounded-xl border border-brand-100 transition-all hover:bg-brand-100">
               <Globe size={14} />
               <span className="text-[10px] font-black uppercase tracking-widest">Production</span>
             </button>
             <button className="p-2.5 text-gray-400 hover:bg-gray-50 hover:text-gray-600 rounded-xl transition-all relative">
                <Bell size={20} />
                <span className="absolute top-2.5 right-2.5 w-2 h-2 bg-red-500 rounded-full border-2 border-white"></span>
             </button>
             <div className="w-8 h-8 rounded-full bg-gray-100 border border-gray-200 overflow-hidden">
                <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=admin" alt="avatar" />
             </div>
          </div>
        </header>

        <SystemStatePanel />
        
        {/* Critical Alerts Banner (Only shown if SAFE_MODE or anomalies) */}
        {/* <div className="bg-red-600 text-white px-8 py-2 flex items-center justify-between text-xs font-bold uppercase tracking-widest">
          <div className="flex items-center gap-2">
            <ShieldAlert size={14} />
            <span>CRITICAL: High Refund Velocity detected in "New Delhi" cluster. Throttling active.</span>
          </div>
          <button className="underline hover:no-underline">View Incident</button>
        </div> */}
        
        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto p-8 relative scroll-smooth">
          <div className="max-w-[1600px] mx-auto">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
};

export default MasterLayout;
