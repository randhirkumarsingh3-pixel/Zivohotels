import { useState, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Menu } from 'lucide-react';
import MasterSidebar from '../admin/components/master/MasterSidebar';
import { LogoMark } from '../components/brand/Logo';
import usePageTitle from '../hooks/usePageTitle';
import { useAuth } from '../context/AuthContext';

/**
 * Admin console frame. The status strip that sat under the header (safe mode, experiments,
 * "global sync 12ms"...) showed fixed values, not live ones, so it was removed; so were the
 * "Production" button, the stock avatar and a search box that didn't search.
 */
const MasterLayout = () => {
  const { user } = useAuth();
  usePageTitle('Admin');
  const [navOpen, setNavOpen] = useState(false);
  const location = useLocation();
  useEffect(() => { setNavOpen(false); }, [location.pathname]);

  return (
    <div className="flex min-h-screen bg-gray-50">
      <MasterSidebar open={navOpen} onClose={() => setNavOpen(false)} />
      <div className="flex-1 flex flex-col h-screen overflow-hidden min-w-0">
        <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between gap-3 px-4 lg:px-8 shrink-0 z-20">
          <div className="flex items-center gap-3 flex-1 max-w-xl min-w-0">
            <button type="button" onClick={() => setNavOpen(true)} aria-label="Open menu" className="lg:hidden p-2 -ml-1 rounded-lg text-gray-700 hover:bg-gray-100"><Menu size={22} /></button>
            <LogoMark size="sm" className="lg:hidden" />
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <div className="hidden sm:flex flex-col items-end leading-tight">
              <span className="text-sm font-semibold text-gray-900">{user?.name}</span>
              <span className="text-xs text-gray-500 capitalize">{String(user?.role || '').toLowerCase()}</span>
            </div>
            <div className="w-9 h-9 rounded-full bg-navy-800 text-white flex items-center justify-center text-sm font-bold" aria-hidden="true">{user?.name?.charAt(0) || 'A'}</div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 relative scroll-smooth">
          <div className="max-w-[1600px] mx-auto">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
};

export default MasterLayout;
