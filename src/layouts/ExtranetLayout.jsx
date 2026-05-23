import { Outlet } from 'react-router-dom';
import ExtranetSidebar from '../extranet/components/ExtranetSidebar';
import { Bell, HelpCircle, Building, ChevronDown, AlertTriangle } from 'lucide-react';
import { ExtranetProvider, useExtranet } from '../extranet/context/ExtranetContext';
import { useSocketEvent } from '../context/SocketContext';
import LiveActivityFeed from '../extranet/components/LiveActivityFeed';
import PresenceAvatarStack from '../extranet/components/PresenceAvatarStack';

const LayoutContent = () => {
  const { systemStatus, setSystemStatus, property, hotelId } = useExtranet();

  // Listen for real-time incident broadcasts
  useSocketEvent('SAFE_MODE_TOGGLED', (event) => {
    const newStatus = event.data.isSafeMode ? 'CRITICAL: System in SAFE_MODE' : null;
    setSystemStatus(newStatus);
  });

  return (
    <div className="flex min-h-screen bg-[#FDFDFF]">
      <ExtranetSidebar />
      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        
        {/* System Status Strip */}
        {systemStatus && (
          <div className={`h-10 border-b flex items-center justify-center px-4 shrink-0 z-20 transition-all ${
            systemStatus.includes('LOCKDOWN') ? 'bg-slate-900 border-slate-800 text-white' :
            systemStatus.includes('CRITICAL') ? 'bg-red-600 border-red-700 text-white' :
            systemStatus.includes('WARNING') ? 'bg-orange-50 border-orange-100 text-orange-700' :
            'bg-blue-50 border-blue-100 text-blue-700'
          }`}>
            <div className="flex items-center gap-2 text-sm font-bold tracking-wide">
              <AlertTriangle size={16} />
              {systemStatus}
              {systemStatus.includes('CRITICAL') && (
                <button className="ml-4 px-3 py-0.5 bg-white/20 hover:bg-white/30 rounded text-[10px] uppercase font-black tracking-widest transition-all">
                  Acknowledge Incident
                </button>
              )}
            </div>
          </div>
        )}
        {/* Partner Header */}
        <header className="h-16 bg-white border-b border-gray-100 flex items-center justify-between px-8 shrink-0 z-10 shadow-sm">
          <div className="flex items-center gap-8">
            <PresenceAvatarStack />
            <div className="flex items-center gap-3 px-4 py-2 bg-gray-50 rounded-xl border border-gray-100 cursor-pointer hover:bg-gray-100 transition-all">
              <Building className="text-gray-400" size={18} />
              <div className="flex flex-col">
                <span className="text-xs font-black text-gray-900 uppercase tracking-tight">Active Property</span>
                <span className="text-sm font-medium text-gray-500">{property?.name || 'Loading...'}</span>
              </div>
              <ChevronDown className="text-gray-400 ml-2" size={14} />
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <button className="flex items-center gap-2 px-4 py-2 text-gray-500 hover:text-brand-600 font-bold text-xs uppercase tracking-widest transition-all">
              <HelpCircle size={18} />
              Support
            </button>
            <div className="h-6 w-[1px] bg-gray-100 mx-2"></div>
            <button className="p-2 text-gray-400 hover:bg-gray-50 hover:text-brand-600 rounded-xl transition-all relative">
              <Bell size={20} />
              <span className="absolute top-2 right-2 w-2 h-2 bg-orange-500 rounded-full border-2 border-white"></span>
            </button>
          </div>
        </header>
        
        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto p-8 relative">
          <div className="max-w-7xl mx-auto">
            <Outlet />
          </div>
          
          {/* Live Ops Nervous System */}
          {hotelId && <LiveActivityFeed hotelId={hotelId} />}
        </main>
      </div>
    </div>
  );
};

const ExtranetLayout = () => {
  return (
    <ExtranetProvider>
      <LayoutContent />
    </ExtranetProvider>
  );
};

export default ExtranetLayout;
