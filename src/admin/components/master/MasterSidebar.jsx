import { NavLink } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Building2, 
  CalendarDays, 
  IndianRupee, 
  ClipboardList, 
  Users, 
  Network, 
  BarChart3, 
  Settings,
  LogOut,
  FileSignature,
  ShieldCheck,
  ClipboardCheck,
  TrendingUp,
  Wallet,
  Zap,
  Target,
  FlaskConical,
  Activity,
  AlertTriangle
} from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';

const NavGroup = ({ title, children }) => (
  <div className="mb-6">
    <h3 className="px-4 mb-2 text-[10px] font-bold text-gray-500 uppercase tracking-widest">
      {title}
    </h3>
    <ul className="space-y-1 px-3">
      {children}
    </ul>
  </div>
);

const NavItem = ({ name, path, icon, exact, badge }) => (
  <li>
    <NavLink
      to={path}
      end={exact}
      className={({ isActive }) =>
        `flex items-center justify-between px-3 py-2 rounded-lg transition-all duration-200 group ${
          isActive 
            ? 'bg-brand-600 text-white font-medium shadow-lg shadow-brand-500/20' 
            : 'text-gray-400 hover:bg-gray-800 hover:text-gray-100'
        }`
      }
    >
      <div className="flex items-center space-x-3">
        <span className="shrink-0">{icon}</span>
        <span className="text-sm">{name}</span>
      </div>
      {badge && (
        <span className="bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold">
          {badge}
        </span>
      )}
    </NavLink>
  </li>
);

const MasterSidebar = () => {
  const { user, logout } = useAuth();

  return (
    <aside className="w-64 bg-[#0B0E14] text-white flex flex-col h-screen sticky top-0 overflow-hidden border-r border-gray-800">
      <div className="p-6 mb-2">
        <div className="flex items-center space-x-2">
          <div className="bg-brand-600 p-2 rounded-xl shadow-inner">
            <ShieldCheck className="h-6 w-6 text-white" />
          </div>
          <div className="flex flex-col">
            <span className="text-xl font-bold tracking-tight leading-none">
              Zivo<span className="text-brand-500">Master</span>
            </span>
            <span className="text-[10px] text-gray-500 font-bold uppercase tracking-tighter mt-1">
              Platform Intelligence
            </span>
          </div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto custom-scrollbar pb-6">
        <NavGroup title="Executive">
          <NavItem name="Executive Dashboard" path="/admin" icon={<LayoutDashboard size={18} />} exact />
        </NavGroup>

        <NavGroup title="Supply & Content">
          <NavItem name="Properties" path="/admin/properties" icon={<Building2 size={18} />} />
          <NavItem name="Property Review" path="/admin/properties/review" icon={<ClipboardCheck size={18} />} badge="New" />
          <NavItem name="Agreements" path="/admin/agreements" icon={<FileSignature size={18} />} />
        </NavGroup>

        <NavGroup title="Inventory & Distro">
          <NavItem name="Room Config" path="/admin/configuration" icon={<Settings size={18} />} />
          <NavItem name="Inventory & Rates" path="/admin/inventory-pricing" icon={<CalendarDays size={18} />} />
          <NavItem name="Channel Manager" path="/admin/channel-manager" icon={<Network size={18} />} />
        </NavGroup>

        <NavGroup title="Pricing & RMS">
          <NavItem name="Pricing Intelligence" path="/admin/pricing-rms" icon={<TrendingUp size={18} />} />
          <NavItem name="Demand Forecasting" path="/admin/forecasting" icon={<Activity size={18} />} />
        </NavGroup>

        <NavGroup title="Analytics">
          <NavItem name="RPS Dashboard" path="/admin/analytics/rps" icon={<Target size={18} />} />
          <NavItem name="Reports" path="/admin/reports" icon={<BarChart3 size={18} />} />
        </NavGroup>

        <NavGroup title="Experiments & AI">
          <NavItem name="AI Experiments" path="/admin/experiments" icon={<FlaskConical size={18} />} />
        </NavGroup>

        <NavGroup title="Finance Core">
          <NavItem name="Financial Ledger" path="/admin/finance/ledger" icon={<ClipboardList size={18} />} />
          <NavItem name="Payouts" path="/admin/finance/payouts" icon={<IndianRupee size={18} />} badge="3" />
        </NavGroup>

        <NavGroup title="Wallet & Credit">
          <NavItem name="Wallet Control" path="/admin/wallets" icon={<Wallet size={18} />} />
        </NavGroup>

        <NavGroup title="Risk & Fraud">
          <NavItem name="Fraud Center" path="/admin/fraud" icon={<AlertTriangle size={18} />} badge="!" />
        </NavGroup>

        <NavGroup title="Control Center">
          <NavItem name="System Control" path="/admin/control-center" icon={<Zap size={18} />} />
          <NavItem name="Users & Roles" path="/admin/users" icon={<Users size={18} />} />
          <NavItem name="Settings" path="/admin/settings" icon={<Settings size={18} />} />
        </NavGroup>
      </nav>

      <div className="p-4 bg-[#11141B] border-t border-gray-800">
        <div className="flex items-center mb-4 px-2 group cursor-pointer">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center text-sm font-bold mr-3 shadow-lg group-hover:scale-105 transition-transform">
            {user?.name?.charAt(0) || 'A'}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold text-gray-200 truncate">{user?.name}</div>
            <div className="text-[10px] text-brand-500 font-black uppercase tracking-widest flex items-center gap-1">
              <span className="w-1 h-1 rounded-full bg-brand-500 animate-pulse"></span>
              {user?.role}
            </div>
          </div>
        </div>
        <button 
          onClick={logout}
          className="flex items-center space-x-3 px-3 py-2 w-full rounded-lg text-gray-500 hover:bg-red-500/10 hover:text-red-400 transition-all duration-200"
        >
          <LogOut size={18} />
          <span className="text-sm font-medium">Exit Console</span>
        </button>
      </div>
    </aside>
  );
};

export default MasterSidebar;
