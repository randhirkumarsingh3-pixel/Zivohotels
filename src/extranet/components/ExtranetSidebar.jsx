import { NavLink } from 'react-router-dom';
import { 
  Clock,
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
  Plus,
  Wallet,
  Crown,
  Users,
  Gauge,
  X
, FileSignature, Briefcase, FileText } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useExtranet } from '../context/ExtranetContext';
import useAccess from '../../hooks/useAccess';
import Logo from '../../components/brand/Logo';

const NavItem = ({ name, path, icon, exact, state }) => (
  <li>
    <NavLink
      to={path}
      state={state}
      end={exact}
      className={({ isActive }) =>
        `relative flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
          isActive
            ? 'bg-white/10 text-white font-semibold before:absolute before:left-0 before:top-2 before:bottom-2 before:w-1 before:rounded-r before:bg-brand-500'
            : 'text-navy-100 hover:bg-white/5 hover:text-white'
        }`
      }
    >
      <span className="shrink-0">{icon}</span>
      <span className="text-sm">{name}</span>
    </NavLink>
  </li>
);

const SectionLabel = ({ children }) => (
  <li className="pt-5 pb-2 px-3 list-none"><span className="text-xs font-semibold text-navy-300 uppercase tracking-wider">{children}</span></li>
);

// Each item names the permission it needs at the active property (staff roles); hidden otherwise.
// owner: only for the property's owner.
const MENU = [
  { items: [{ name: 'Dashboard', path: '/extranet', icon: <LayoutDashboard size={18} />, exact: true, perm: 'dashboard.view' }] },
  {
    label: 'Property',
    items: [
      { name: 'Property Info', path: '/extranet/property', icon: <Building2 size={18} />, exact: true, perm: 'property.edit' },
      { name: 'Content Score', path: '/extranet/property/score', icon: <Gauge size={18} />, perm: 'dashboard.view' },
      { name: 'Add New Property', path: '/extranet/onboarding', state: { resetDraft: true }, icon: <Plus size={18} />, owner: true },
      { name: 'Rooms & Rate Plans', path: '/extranet/rooms', icon: <BedDouble size={18} />, perm: 'rates.view' },
      { name: 'Inventory Calendar', path: '/extranet/inventory', icon: <CalendarDays size={18} />, perm: 'rates.view' },
      { name: 'Hourly Stays', path: '/extranet/hourly', icon: <Clock size={18} />, perm: 'rates.view' },
      { name: 'Dynamic Pricing', path: '/extranet/pricing', icon: <IndianRupee size={18} />, perm: 'rates.view' },
    ],
  },
  {
    label: 'Operations',
    items: [
      { name: 'Bookings', path: '/extranet/bookings', icon: <ClipboardList size={18} />, perm: 'bookings.view' },
      { name: 'GST Invoices', path: '/extranet/gst-invoices', icon: <FileText size={18} />, perm: 'bookings.view' },
      { name: 'Finance Hub', path: '/extranet/finance', icon: <IndianRupee size={18} />, perm: 'finance.view' },
      { name: 'Wallet', path: '/extranet/wallet', icon: <Wallet size={18} />, perm: 'finance.view' },
      { name: 'Agreement', path: '/extranet/agreement', icon: <FileSignature size={18} />, perm: 'dashboard.view' },
      { name: 'Member Prices', path: '/extranet/member-prices', icon: <Crown size={18} />, perm: 'membership.manage' },
      { name: 'Business Rates', path: '/extranet/business-rates', icon: <Briefcase size={18} />, perm: 'rates.view' },
      { name: 'Guest Reviews', path: '/extranet/reviews', icon: <Star size={18} />, perm: 'reviews.reply' },
      { name: 'Promotions', path: '/extranet/promotions', icon: <Tag size={18} />, perm: 'promotions.manage' },
    ],
  },
  {
    label: 'Growth',
    items: [
      { name: 'Performance', path: '/extranet/performance', icon: <BarChart3 size={18} />, perm: 'dashboard.view' },
      { name: 'Team', path: '/extranet/team', icon: <Users size={18} />, perm: 'team.manage' },
      { name: 'Settings', path: '/extranet/settings', icon: <Settings size={18} />, perm: 'dashboard.view' },
    ],
  },
];

/** Extranet menu: fixed column on large screens, slide-in drawer on phones and tablets. */
const ExtranetSidebar = ({ open = false, onClose = () => {} }) => {
  const { user, logout } = useAuth();
  const { hotelId } = useExtranet();
  const { access, canAtHotel } = useAccess();
  const here = access?.hotels?.[hotelId];
  // Until the property and permissions are known, show the owner's full menu (an owner is the common case)
  const show = (item) => {
    if (!access || !hotelId) return true;
    if (item.owner) return Boolean(here?.owner) || !Object.keys(access.hotels || {}).length;
    return canAtHotel(hotelId, item.perm);
  };

  return (
    <>
    {open && <div className="fixed inset-0 bg-navy-950/50 z-40 lg:hidden" onClick={onClose} aria-hidden="true" />}
    <aside className={`fixed inset-y-0 left-0 z-50 w-72 lg:w-64 bg-navy-900 text-white flex flex-col h-screen transition-transform duration-200 lg:sticky lg:top-0 lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`} aria-label="Extranet menu">
      <div className="px-5 py-5 border-b border-white/10 flex items-center justify-between">
        <Logo size="sm" onDark label="Extranet" />
        <button type="button" onClick={onClose} aria-label="Close menu" className="lg:hidden p-2 rounded-lg text-navy-100 hover:bg-white/10"><X size={20} /></button>
      </div>

      <nav className="flex-1 overflow-y-auto py-4 px-3">
        <ul className="space-y-1">
          {MENU.map((section) => {
            const items = section.items.filter((i) => show(i));
            if (!items.length) return null;
            return (
              <li key={section.label || 'top'} className="list-none">
                <ul className="space-y-1">
                  {section.label && <SectionLabel>{section.label}</SectionLabel>}
                  {items.map((i) => <NavItem key={i.path} name={i.name} path={i.path} icon={i.icon} exact={i.exact} state={i.state} />)}
                </ul>
              </li>
            );
          })}
        </ul>

      </nav>

      <div className="p-4 border-t border-white/10">
        <div className="flex items-center mb-3 px-2">
          <div className="h-9 w-9 rounded-full bg-white/10 text-white flex items-center justify-center text-sm font-bold mr-3">
            {user?.name?.charAt(0) || 'P'}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-white truncate leading-none mb-1">{user?.name}</div>
            <div className="text-xs text-navy-200 truncate">{here?.role || 'Property partner'}</div>
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

export default ExtranetSidebar;
