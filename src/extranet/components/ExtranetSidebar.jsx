import { NavLink } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Building2, 
  CalendarDays, 
  IndianRupee, 
  ClipboardList, 
  Settings,
  LogOut,
  Star,
  Tag,
  BarChart3,
  BedDouble,
  CircleDot,
  Plus
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

const NavItem = ({ name, path, icon, exact, state }) => (
  <li>
    <NavLink
      to={path}
      state={state}
      end={exact}
      className={({ isActive }) =>
        `flex items-center space-x-3 px-3 py-2.5 rounded-lg transition-all ${
          isActive 
            ? 'bg-brand-50 text-brand-600 font-bold' 
            : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
        }`
      }
    >
      <span className="shrink-0">{icon}</span>
      <span className="text-sm">{name}</span>
    </NavLink>
  </li>
);

const ExtranetSidebar = () => {
  const { user, logout } = useAuth();

  return (
    <aside className="w-64 bg-white border-r border-gray-200 flex flex-col h-screen sticky top-0">
      <div className="p-6 border-b border-gray-100 bg-[#FBFBFF]">
        <div className="flex items-center space-x-2">
          <div className="bg-brand-600 p-2 rounded-lg shadow-brand-200 shadow-md">
            <Building2 className="h-5 w-5 text-white" />
          </div>
          <div className="flex flex-col">
            <span className="text-lg font-bold tracking-tight leading-none text-gray-900">
              Hotel<span className="text-brand-600">Partner</span>
            </span>
            <span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">
              Extranet Console
            </span>
          </div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto py-6 px-3">
        <ul className="space-y-1">
          <NavItem name="Dashboard" path="/extranet" icon={<LayoutDashboard size={18} />} exact />
          
          <div className="pt-4 pb-2 px-3">
            <span className="text-[10px] font-black text-gray-300 uppercase tracking-widest">Management</span>
          </div>
          <NavItem name="Property Info" path="/extranet/property" icon={<Building2 size={18} />} />
          <NavItem name="Add New Property" path="/extranet/onboarding" state={{ resetDraft: true }} icon={<Plus size={18} />} />
          <NavItem name="Rooms & Rate Plans" path="/extranet/rooms" icon={<BedDouble size={18} />} />
          <NavItem name="Inventory Calendar" path="/extranet/inventory" icon={<CalendarDays size={18} />} />
          <NavItem name="Dynamic Pricing" path="/extranet/pricing" icon={<IndianRupee size={18} />} />
          
          <div className="pt-4 pb-2 px-3">
            <span className="text-[10px] font-black text-gray-300 uppercase tracking-widest">Operations</span>
          </div>
          <NavItem name="Bookings" path="/extranet/bookings" icon={<ClipboardList size={18} />} />
          <NavItem name="Finance Hub" path="/extranet/finance" icon={<IndianRupee size={18} />} />
          <NavItem name="Guest Reviews" path="/extranet/reviews" icon={<Star size={18} />} />
          <NavItem name="Promotions" path="/extranet/promotions" icon={<Tag size={18} />} />
          
          <div className="pt-4 pb-2 px-3">
            <span className="text-[10px] font-black text-gray-300 uppercase tracking-widest">Growth</span>
          </div>
          <NavItem name="Performance" path="/extranet/performance" icon={<BarChart3 size={18} />} />
          <NavItem name="Settings" path="/extranet/settings" icon={<Settings size={18} />} />
        </ul>

        {/* Ranking Tip Card */}
        <div className="mt-8 mx-2 p-4 bg-brand-50 rounded-xl border border-brand-100">
          <div className="flex items-center gap-2 mb-2">
            <CircleDot className="text-brand-600" size={14} />
            <span className="text-xs font-bold text-brand-800 uppercase tracking-tight">Ranking Health</span>
          </div>
          <p className="text-[11px] text-brand-700 leading-relaxed">
            Your property is in the <strong className="font-black underline">Top 15%</strong> in New Delhi.
          </p>
          <button className="mt-3 w-full py-1.5 bg-white border border-brand-200 rounded-lg text-[10px] font-bold text-brand-600 hover:bg-brand-600 hover:text-white transition-all shadow-sm">
            Improve Rank
          </button>
        </div>
      </nav>

      <div className="p-4 border-t border-gray-100 bg-[#FBFBFF]">
        <div className="flex items-center mb-4 px-2">
          <div className="h-9 w-9 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-sm font-black mr-3 border border-brand-200">
            {user?.name?.charAt(0) || 'P'}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold text-gray-800 truncate leading-none mb-1">{user?.name}</div>
            <div className="text-[10px] text-gray-400 font-bold truncate">Partner Account</div>
          </div>
        </div>
        <button 
          onClick={logout}
          className="flex items-center space-x-3 px-3 py-2 w-full rounded-lg text-gray-400 hover:bg-gray-50 hover:text-gray-600 transition-all"
        >
          <LogOut size={18} />
          <span className="text-sm font-medium">Log out</span>
        </button>
      </div>
    </aside>
  );
};

export default ExtranetSidebar;
