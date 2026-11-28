import { useState, useEffect, useRef } from 'react';
import NotificationBell from './shared/NotificationBell';
import { Link, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { Menu, X, User, LogOut, ChevronDown, Building2, BedDouble, CalendarDays, Heart, Wallet, Award, Crown, LayoutDashboard, LogIn, UserPlus } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { businessApi, getMyWallet, getMyRewards } from '../services/api';
import { FOR_BUSINESS } from '../constants/forBusiness';
import Logo from './brand/Logo';

/**
 * Guest site header (white bar): each item is an icon tile with a title and a short line under it,
 * separated by dotted lines; navy for structure, the logo's red for List your property, Saved and
 * the account button.
 *
 * Signed out: Hotels, ZivoPlus for Business, ZivoPlus Partner Hub, List your property, and a red
 * "Log in / Sign up" button (menu: log in, create account, hotel partner log in). Zivo Rewards and
 * Membership are on the home page and in the footer.
 * Signed in: Hotels, My Bookings, Saved, Zivo Cash (live balance), Zivo Rewards (live tier and
 * points), the person's own company / agency portal if they belong to one, and "Hi, Name" (menu:
 * My account, Membership, the three business products, Log out). Below 1280 px the menu button
 * opens the same items. The logo is unchanged.
 */
const [BUSINESS, PARTNER_HUB, LIST_PROPERTY] = FOR_BUSINESS;
const PORTAL = { CORPORATE: BUSINESS, AGENCY: PARTNER_HUB };

/** The signed-in guest's own portals (companies / agencies they are an active member of). */
const useMyPortals = (enabled) => {
  const [portals, setPortals] = useState([]);
  useEffect(() => {
    if (!enabled) { setPortals([]); return undefined; }
    let live = true;
    businessApi.mine().then((rows) => {
      if (!live) return;
      const kinds = [...new Set((rows || []).filter((m) => m.memberStatus === 'ACTIVE' && !['REJECTED'].includes(m.organisation?.status)).map((m) => m.organisation.kind))];
      setPortals(kinds.map((k) => PORTAL[k]).filter(Boolean));
    }).catch(() => {});
    return () => { live = false; };
  }, [enabled]);
  return portals;
};

/** A red button that opens a small menu (account menu; log in / sign up). */
const MenuButton = ({ id, label, children }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const location = useLocation();
  useEffect(() => { setOpen(false); }, [location.pathname]);
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown); document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);
  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls={id}
        className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white font-semibold rounded-xl pl-1.5 pr-3 py-1.5 transition-colors">
        <span className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center"><User size={17} aria-hidden="true" /></span>
        {label}
        <ChevronDown size={16} className={`transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {open && <div id={id} className="absolute right-0 top-full mt-3 w-72 bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden py-2">{children}</div>}
    </div>
  );
};
const menuItem = 'flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 w-full text-left';

/** One header item: icon tile, title and a short line. */
const NavItem = ({ to, Icon, title, sub, red = false, first = false }) => (
  <NavLink to={to} className={({ isActive }) => `group flex items-center gap-2.5 px-3 2xl:px-4 h-11 ${first ? '' : 'border-l border-dashed border-gray-300'} ${isActive ? 'active' : ''}`}>
    {({ isActive }) => (
      <>
        <span className={`w-9 h-9 rounded-[10px] flex items-center justify-center shrink-0 transition-colors ${red ? 'bg-brand-50 text-brand-600 group-hover:bg-brand-100' : 'bg-navy-50 text-navy-800 group-hover:bg-navy-100'} ${isActive ? (red ? 'ring-2 ring-brand-200' : 'ring-2 ring-navy-200') : ''}`}>
          <Icon size={18} aria-hidden="true" />
        </span>
        <span className="leading-tight">
          <span className={`block text-sm font-bold ${isActive ? 'text-brand-600' : 'text-navy-800 group-hover:text-navy-900'}`}>{title}</span>
          {sub && <span className="block text-xs text-gray-500">{sub}</span>}
        </span>
      </>
    )}
  </NavLink>
);

/** Zivo Cash balance and Zivo Rewards for a signed-in guest (the small lines under the items). */
const useGuestSummary = (enabled) => {
  const [s, setS] = useState({});
  const location = useLocation();
  useEffect(() => {
    if (!enabled) { setS({}); return undefined; }
    let live = true;
    Promise.allSettled([getMyWallet(), getMyRewards()]).then(([w, r]) => {
      if (!live) return;
      setS({ balance: w.status === 'fulfilled' ? w.value?.balance : undefined, rewards: r.status === 'fulfilled' ? r.value : undefined });
    });
    return () => { live = false; };
  }, [enabled, location.pathname]);
  return s;
};
const inr = (n) => `₹${Math.round(Number(n) || 0).toLocaleString('en-IN')}`;

const Header = () => {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const { isAuthenticated, user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const guest = isAuthenticated && user?.role === 'CUSTOMER';
  const myPortals = useMyPortals(guest);

  useEffect(() => { setMenuOpen(false); }, [location.pathname]);
  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleLogout = () => { logout(); navigate('/'); };

  const summary = useGuestSummary(guest);
  const staffLink = (user?.role === 'ADMIN' || user?.role === 'OWNER') && { to: user.role === 'ADMIN' ? '/admin' : '/extranet', Icon: LayoutDashboard, title: user.role === 'ADMIN' ? 'Admin' : 'Extranet', sub: user.role === 'ADMIN' ? 'ZivoPlus console' : 'Manage your property' };
  const items = (isAuthenticated ? [
    { to: '/hotels', Icon: BedDouble, title: 'Hotels', sub: 'Find your next stay' },
    { to: '/my-bookings', Icon: CalendarDays, title: 'My Bookings', sub: 'Trips, vouchers, changes' },
    guest && { to: '/saved', Icon: Heart, title: 'Saved', sub: 'Price-drop alerts', red: true },
    guest && { to: '/wallet', Icon: Wallet, title: 'Zivo Cash', sub: summary.balance !== undefined ? `${inr(summary.balance)} balance` : 'Your balance' },
    guest && { to: '/rewards', Icon: Award, title: 'Zivo Rewards', sub: summary.rewards ? `${summary.rewards.tier?.name ? `${summary.rewards.tier.name} · ` : ''}${Number(summary.rewards.available || 0).toLocaleString('en-IN')} points` : 'Points on every stay' },
    ...myPortals.map((p) => ({ to: p.to, Icon: p.Icon || Building2, title: p.name, sub: 'Your account' })),
    staffLink,
  ] : [
    { to: '/hotels', Icon: BedDouble, title: 'Hotels', sub: 'Stays across India' },
    { to: BUSINESS.to, Icon: BUSINESS.Icon, title: BUSINESS.name, sub: BUSINESS.short },
    { to: PARTNER_HUB.to, Icon: PARTNER_HUB.Icon, title: PARTNER_HUB.name, sub: PARTNER_HUB.short },
    { to: LIST_PROPERTY.to, Icon: LIST_PROPERTY.Icon, title: LIST_PROPERTY.name, sub: 'Grow your hotel', red: true },
  ]).filter(Boolean);
  const mobileLinkCls = ({ isActive }) => `px-2 py-2.5 rounded-lg flex items-center gap-3 ${isActive ? 'bg-navy-50' : 'hover:bg-gray-50'}`;

  return (
    <nav className={`fixed w-full z-50 bg-white transition-shadow duration-300 ${scrolled ? 'shadow-md' : 'border-b border-gray-200'}`} aria-label="Main">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <Link to="/" className="flex-shrink-0" aria-label="ZivoPlus home">
            <Logo size="md" />
          </Link>

          <div className="hidden xl:flex items-center whitespace-nowrap">
            {items.map((it, i) => <NavItem key={it.to} {...it} first={i === 0} />)}
            <div className="flex items-center gap-2 ml-3">
              {isAuthenticated ? (
                <>
                  <NotificationBell />
                  <MenuButton id="account-menu" label={`Hi, ${user?.name?.split(' ')[0] || 'there'}`}>
                    <Link to="/account" className={menuItem}><User size={17} className="text-navy-700" aria-hidden="true" /> My account</Link>
                    <Link to="/membership" className={menuItem}><Crown size={17} className="text-navy-700" aria-hidden="true" /> Membership</Link>
                    {!guest && <Link to="/my-bookings" className={menuItem}><CalendarDays size={17} className="text-navy-700" aria-hidden="true" /> My Bookings</Link>}
                    <p className="px-4 pt-3 pb-1 text-xs font-bold uppercase tracking-wider text-gray-500">Work with ZivoPlus</p>
                    {FOR_BUSINESS.map(({ to, name, Icon, short }) => (
                      <Link key={to} to={to} className={menuItem}>
                        <Icon size={17} className="text-navy-700" aria-hidden="true" />
                        <span><span className="block text-gray-900">{name}</span><span className="block text-xs text-gray-500">{short}</span></span>
                      </Link>
                    ))}
                    <div className="border-t border-gray-100 mt-2 pt-2">
                      <button type="button" onClick={handleLogout} className={menuItem}><LogOut size={17} aria-hidden="true" /> Log out</button>
                    </div>
                  </MenuButton>
                </>
              ) : (
                <MenuButton id="login-menu" label="Log in / Sign up">
                  <Link to="/login" className={menuItem}><LogIn size={17} className="text-navy-700" aria-hidden="true" /><span><span className="block text-gray-900 font-semibold">Log in</span><span className="block text-xs text-gray-500">Your bookings, Zivo Cash and points</span></span></Link>
                  <Link to="/signup" className={menuItem}><UserPlus size={17} className="text-brand-600" aria-hidden="true" /><span><span className="block text-gray-900 font-semibold">Create an account</span><span className="block text-xs text-gray-500">Member prices on every stay</span></span></Link>
                  <div className="border-t border-gray-100 mt-2 pt-2">
                    <Link to="/extranet/login" className={menuItem}><Building2 size={17} className="text-navy-700" aria-hidden="true" /> Hotel partner log in</Link>
                  </div>
                </MenuButton>
              )}
            </div>
          </div>

          <div className="xl:hidden flex items-center gap-1">
            {isAuthenticated && <NotificationBell />}
            <button type="button" onClick={() => setMenuOpen((o) => !o)} aria-label={menuOpen ? 'Close menu' : 'Open menu'} aria-expanded={menuOpen}
              className="p-2 -mr-2 rounded-lg text-navy-800 hover:bg-gray-100">
              {menuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </div>
      </div>

      {menuOpen && (
        <div className="xl:hidden border-t border-gray-200 bg-white shadow-lg max-h-[calc(100vh-4rem)] overflow-y-auto">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex flex-col">
            {isAuthenticated && <p className="px-2 py-2 text-sm text-gray-500">Signed in as <span className="font-semibold text-gray-800">{user?.name}</span></p>}
            {items.map(({ to, Icon, title, sub, red }) => (
              <NavLink key={to} to={to} className={mobileLinkCls}>
                <span className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${red ? 'bg-brand-50 text-brand-600' : 'bg-navy-50 text-navy-800'}`}><Icon size={18} aria-hidden="true" /></span>
                <span><span className="block text-base font-medium text-gray-900">{title}</span>{sub && <span className="block text-xs text-gray-500">{sub}</span>}</span>
              </NavLink>
            ))}
            {isAuthenticated && <NavLink to="/account" className="px-2 py-3 rounded-lg text-base font-medium text-gray-700 hover:bg-gray-50">My account</NavLink>}
            {isAuthenticated && <NavLink to="/membership" className="px-2 py-3 rounded-lg text-base font-medium text-gray-700 hover:bg-gray-50">Membership</NavLink>}
            <Link to="/help" className="px-2 py-3 rounded-lg text-base font-medium text-gray-700 hover:bg-gray-50">Help</Link>
            {isAuthenticated && (
              <>
                <p className="px-2 pt-4 pb-1 text-xs font-bold uppercase tracking-wider text-gray-500">Work with ZivoPlus</p>
                {FOR_BUSINESS.map(({ to, name, Icon, short }) => (
                  <NavLink key={to} to={to} className={({ isActive }) => `px-2 py-2.5 rounded-lg flex items-center gap-3 ${isActive ? 'bg-navy-50' : 'hover:bg-gray-50'}`}>
                    <span className="w-9 h-9 rounded-lg bg-navy-50 text-navy-800 flex items-center justify-center shrink-0"><Icon size={18} aria-hidden="true" /></span>
                    <span><span className="block text-base font-medium text-gray-900">{name}</span><span className="block text-xs text-gray-500">{short}</span></span>
                  </NavLink>
                ))}
              </>
            )}
            <div className="border-t border-gray-200 mt-2 pt-3 pb-1 flex gap-3">
              {isAuthenticated ? (
                <button type="button" onClick={handleLogout} className="flex-1 flex items-center justify-center gap-2 py-3 rounded-lg border border-gray-200 font-semibold text-gray-700">
                  <LogOut className="h-4 w-4" aria-hidden="true" /> Log out
                </button>
              ) : (
                <>
                  <Link to="/login" className="flex-1 text-center py-3 rounded-lg border border-navy-200 font-semibold text-navy-800">Log in</Link>
                  <Link to="/signup" className="flex-1 text-center py-3 rounded-lg bg-brand-600 font-semibold text-white">Sign up</Link>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </nav>
  );
};

export default Header;
