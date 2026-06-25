import { NavLink } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Building2, 
  CalendarDays, 
  ClipboardList, 
  Users, 
  Network, 
  BarChart3, 
  Settings,
  LogOut,
  FileSignature,
  ShieldCheck
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

const Sidebar = () => {
  const { user, logout } = useAuth();

  const navItems = [
    { name: 'Dashboard', path: '/admin', icon: <LayoutDashboard size={20} />, exact: true },
    { name: 'Properties', path: '/admin/properties', icon: <Building2 size={20} /> },
    { name: 'Room Type & Rate Configuration', path: '/admin/configuration', icon: <Settings size={20} /> },
    { name: 'Inventory & Pricing', path: '/admin/inventory-pricing', icon: <CalendarDays size={20} /> },
    { name: 'Agreements', path: '/admin/agreements', icon: <FileSignature size={20} /> },
    { name: 'Bookings', path: '/admin/bookings', icon: <ClipboardList size={20} /> },
    { name: 'Channel Manager', path: '/admin/channel-manager', icon: <Network size={20} /> },
    { name: 'Users & Roles', path: '/admin/users', icon: <Users size={20} />, adminOnly: true },
    { name: 'Reports', path: '/admin/reports', icon: <BarChart3 size={20} /> },
    { name: 'Control Center', path: '/admin/control-center', icon: <ShieldCheck size={20} />, adminOnly: true },
    { name: 'Settings', path: '/admin/settings', icon: <Settings size={20} /> },
  ];

  return (
    <aside className="w-64 bg-gray-900 text-white flex flex-col h-screen sticky top-0">
      <div className="p-6 border-b border-gray-800">
        <div className="flex items-center space-x-2">
          <div className="bg-brand-600 p-2 rounded-lg">
            <Building2 className="h-6 w-6 text-white" />
          </div>
          <span className="text-xl font-bold tracking-tight">
            Zivo<span className="text-brand-500">Admin</span>
          </span>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto py-4">
        <ul className="space-y-1 px-3">
          {navItems.map((item) => {
            if (item.adminOnly && user?.role !== 'ADMIN') return null;
            return (
              <li key={item.name}>
                <NavLink
                  to={item.path}
                  end={item.exact}
                  className={({ isActive }) =>
                    `flex items-center space-x-3 px-3 py-2.5 rounded-lg transition-colors ${
                      isActive 
                        ? 'bg-brand-600 text-white font-medium shadow-md shadow-brand-500/20' 
                        : 'text-gray-400 hover:bg-gray-800 hover:text-gray-100'
                    }`
                  }
                >
                  {item.icon}
                  <span>{item.name}</span>
                </NavLink>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="p-4 border-t border-gray-800">
        <div className="flex items-center mb-4 px-2">
          <div className="h-8 w-8 rounded-full bg-brand-700 flex items-center justify-center text-sm font-bold mr-3">
            {user?.name?.charAt(0) || 'U'}
          </div>
          <div>
            <div className="text-sm font-medium text-gray-200 line-clamp-1">{user?.name}</div>
            <div className="text-xs text-gray-500 capitalize">{user?.role?.toLowerCase()}</div>
          </div>
        </div>
        <button 
          onClick={logout}
          className="flex items-center space-x-3 px-3 py-2 w-full rounded-lg text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-colors"
        >
          <LogOut size={20} />
          <span>Logout</span>
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
