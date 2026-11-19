import { NavLink } from 'react-router-dom';
import { 
  LayoutDashboard,
  Ticket,
  MessageSquareText,
  Award,
  Crown,
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
  ClipboardCheck,
  TrendingUp,
  Wallet,
  Zap,
  Target,
  FlaskConical,
  Activity,
  AlertTriangle,
  X,
  BookOpenCheck
} from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import Logo from '../../../components/brand/Logo';

const NavGroup = ({ title, children }) => (
  <div className="mb-6">
    <h3 className="px-4 mb-2 text-xs font-semibold text-navy-300 uppercase tracking-wider font-sans">
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
        `relative flex items-center justify-between px-3 py-2 rounded-lg transition-colors group ${
          isActive
            ? 'bg-white/10 text-white font-semibold before:absolute before:left-0 before:top-2 before:bottom-2 before:w-1 before:rounded-r before:bg-brand-500'
            : 'text-navy-100 hover:bg-white/5 hover:text-white'
        }`
      }
    >
      <div className="flex items-center space-x-3">
        <span className="shrink-0">{icon}</span>
        <span className="text-sm">{name}</span>
      </div>
      {badge && (
        <span className="bg-white/10 text-navy-100 text-xs px-1.5 py-0.5 rounded font-medium" title="Sample data: not connected yet">
          {badge}
        </span>
      )}
    </NavLink>
  </li>
);

/** Admin menu: fixed column on large screens, slide-in drawer on phones and tablets. */
const MasterSidebar = ({ open = false, onClose = () => {} }) => {
  const { user, logout } = useAuth();

  return (
    <>
    {open && <div className="fixed inset-0 bg-navy-950/50 z-40 lg:hidden" onClick={onClose} aria-hidden="true" />}
    <aside className={`fixed inset-y-0 left-0 z-50 w-72 lg:w-64 bg-navy-900 text-white flex flex-col h-screen overflow-hidden transition-transform duration-200 lg:sticky lg:top-0 lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`} aria-label="Admin menu">
      <div className="px-5 py-5 mb-2 border-b border-white/10 flex items-center justify-between">
        <Logo size="sm" onDark label="Admin" />
        <button type="button" onClick={onClose} aria-label="Close menu" className="lg:hidden p-2 rounded-lg text-navy-100 hover:bg-white/10"><X size={20} /></button>
      </div>

      <nav className="flex-1 overflow-y-auto custom-scrollbar pb-6">
        <NavGroup title="Overview">
          <NavItem name="Dashboard" path="/admin" icon={<LayoutDashboard size={18} />} exact />
        </NavGroup>

        <NavGroup title="Supply & Content">
          <NavItem name="Properties" path="/admin/properties" icon={<Building2 size={18} />} />
          <NavItem name="Property Review" path="/admin/properties/review" icon={<ClipboardCheck size={18} />} />
          <NavItem name="Agreements" path="/admin/agreements" icon={<FileSignature size={18} />} />
        </NavGroup>

        <NavGroup title="Bookings">
          <NavItem name="Bookings" path="/admin/bookings" icon={<BookOpenCheck size={18} />} />
        </NavGroup>

        <NavGroup title="Inventory & Distribution">
          <NavItem name="Room Config" path="/admin/configuration" icon={<Settings size={18} />} />
          <NavItem name="Inventory & Rates" path="/admin/inventory-pricing" icon={<CalendarDays size={18} />} />
          <NavItem name="Channel Manager" path="/admin/channel-manager" icon={<Network size={18} />} />
        </NavGroup>

        <NavGroup title="Pricing & RMS">
          <NavItem name="Pricing & RMS" path="/admin/pricing-rms" icon={<TrendingUp size={18} />} />
          <NavItem name="Promotions" path="/admin/promotions" icon={<Ticket size={18} />} />
          <NavItem name="Guest Reviews" path="/admin/reviews" icon={<MessageSquareText size={18} />} />
          <NavItem name="Loyalty (Zivo Rewards)" path="/admin/loyalty" icon={<Award size={18} />} />
          <NavItem name="Membership" path="/admin/membership" icon={<Crown size={18} />} />
          <NavItem name="Demand Forecasting" path="/admin/forecasting" icon={<Activity size={18} />} badge="Preview" />
        </NavGroup>

        <NavGroup title="Analytics">
          <NavItem name="Revenue per Search" path="/admin/analytics/rps" icon={<Target size={18} />} badge="Preview" />
          <NavItem name="Reports" path="/admin/reports" icon={<BarChart3 size={18} />} badge="Preview" />
        </NavGroup>

        <NavGroup title="Experiments">
          <NavItem name="Experiments" path="/admin/experiments" icon={<FlaskConical size={18} />} badge="Preview" />
        </NavGroup>

        <NavGroup title="Finance">
          <NavItem name="Financial Ledger" path="/admin/finance/ledger" icon={<ClipboardList size={18} />} badge="Preview" />
          <NavItem name="Payouts" path="/admin/finance/payouts" icon={<IndianRupee size={18} />} badge="Preview" />
        </NavGroup>

        <NavGroup title="Wallet & Credit">
          <NavItem name="Wallet Control" path="/admin/wallets" icon={<Wallet size={18} />} />
        </NavGroup>

        <NavGroup title="Risk & Fraud">
          <NavItem name="Fraud Center" path="/admin/fraud" icon={<AlertTriangle size={18} />} badge="Preview" />
        </NavGroup>

        <NavGroup title="Control Center">
          <NavItem name="System Control" path="/admin/control-center" icon={<Zap size={18} />} badge="Preview" />
          <NavItem name="Users & Roles" path="/admin/users" icon={<Users size={18} />} />
          <NavItem name="Platform Settings" path="/admin/platform-settings" icon={<Settings size={18} />} />
          <NavItem name="System Health" path="/admin/settings" icon={<Settings size={18} />} badge="Preview" />
        </NavGroup>
      </nav>

      <div className="p-4 border-t border-white/10">
        <div className="flex items-center mb-3 px-2">
          <div className="h-9 w-9 rounded-full bg-white/10 flex items-center justify-center text-sm font-bold mr-3">
            {user?.name?.charAt(0) || 'A'}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-white truncate">{user?.name}</div>
            <div className="text-xs text-navy-200 capitalize">{String(user?.role || '').toLowerCase()}</div>
          </div>
        </div>
        <button
          type="button"
          onClick={logout}
          className="flex items-center gap-3 px-3 py-2 w-full rounded-lg text-navy-100 hover:bg-white/5 hover:text-white transition-colors"
        >
          <LogOut size={18} />
          <span className="text-sm font-medium">Log out</span>
        </button>
      </div>
    </aside>
    </>
  );
};

export default MasterSidebar;
