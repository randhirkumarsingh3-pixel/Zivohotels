import { useState, useEffect, useRef } from 'react';
import { Outlet } from 'react-router-dom';
import ExtranetSidebar from '../extranet/components/ExtranetSidebar';
import { Bell, HelpCircle, Building, ChevronDown, AlertTriangle, Check } from 'lucide-react';
import { ExtranetProvider, useExtranet } from '../extranet/context/ExtranetContext';
import { useSocketEvent } from '../context/SocketContext';
import LiveActivityFeed from '../extranet/components/LiveActivityFeed';
import PresenceAvatarStack from '../extranet/components/PresenceAvatarStack';

const LayoutContent = () => {
  const { systemStatus, setSystemStatus, property, hotelId, properties, switchProperty, isAnyDirty } = useExtranet();

  // "Active property" switcher (it was a static label: owners couldn't change property)
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  useEffect(() => {
    if (!menuOpen) return;
    const close = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setMenuOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [menuOpen]);
  const pick = (id) => {
    setMenuOpen(false);
    if (id === property?.id) return;
    if (isAnyDirty && !window.confirm('You have unsaved changes. Switch property and discard them?')) return;
    switchProperty(id);
  };
  const canSwitch = properties.length > 1;

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
        <header className="relative h-16 bg-white border-b border-gray-100 flex items-center justify-between px-8 shrink-0 z-40 shadow-sm">
          <div className="flex items-center gap-8">
            <PresenceAvatarStack />
            <div className="relative" ref={menuRef}>
              <button
                type="button"
                onClick={() => canSwitch && setMenuOpen(o => !o)}
                aria-haspopup="listbox"
                aria-expanded={menuOpen}
                className={`flex items-center gap-3 px-4 py-2 bg-gray-50 rounded-xl border border-gray-100 transition-all text-left ${canSwitch ? 'cursor-pointer hover:bg-gray-100' : 'cursor-default'}`}
              >
                <Building className="text-gray-400" size={18} />
                <div className="flex flex-col">
                  <span className="text-xs font-black text-gray-900 uppercase tracking-tight">Active Property</span>
                  <span className="text-sm font-medium text-gray-500">{property?.name || 'Loading...'}</span>
                </div>
                {canSwitch && <ChevronDown className={`text-gray-400 ml-2 transition-transform ${menuOpen ? 'rotate-180' : ''}`} size={14} />}
              </button>

              {menuOpen && (
                <ul role="listbox" aria-label="Your properties"
                  className="absolute left-0 top-full mt-2 w-80 max-h-96 overflow-y-auto bg-white border border-gray-100 rounded-xl shadow-xl z-50 py-2">
                  {properties.map(p => (
                    <li key={p.id}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={p.id === property?.id}
                        onClick={() => pick(p.id)}
                        className={`w-full flex items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-gray-50 ${p.id === property?.id ? 'bg-brand-50/50' : ''}`}
                      >
                        <span className="min-w-0">
                          <span className="block text-sm font-bold text-gray-900 truncate">{p.name}</span>
                          <span className="block text-xs text-gray-500">{p.city || '—'} · {String(p.status || '').replace(/_/g, ' ').toLowerCase()}</span>
                        </span>
                        {p.id === property?.id && <Check size={16} className="text-brand-600 shrink-0" />}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
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
