import { useState, useEffect, useRef } from 'react';
import NotificationBell from './shared/NotificationBell';
import { Link, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { Menu, X, User, LogOut, ChevronDown, Building2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { businessApi } from '../services/api';
import { FOR_BUSINESS } from '../constants/forBusiness';
import Logo from './brand/Logo';

/**
 * Guest site header: white bar, navy links, red for the one main action (Sign up).
 *
 * Signed out: Hotels, ZivoPlus for Business, ZivoPlus Partner Hub, and "List your property" as an
 * outlined button next to Log in / Sign up (Zivo Rewards and Membership are on the home page and in
 * the footer). Signed in: Hotels, My Bookings, Saved, Zivo Cash, Zivo Rewards, Membership, the
 * person's own company / agency portal if they belong to one, and an account menu ("Hi, Name")
 * that also holds ZivoPlus for Business, Partner Hub and List your property. The phone menu
 * follows the same rules.
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

/** "Hi, Name" menu: account, the business products, log out. */
const AccountMenu = ({ user, onLogout }) => {
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
  const item = 'flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50';
  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls="account-menu"
        className="flex items-center text-gray-700 font-medium bg-gray-50 hover:bg-gray-100 pl-3 pr-2 py-1.5 rounded-full border border-gray-200">
        <User className="h-4 w-4 mr-2 text-navy-700" aria-hidden="true" />
        Hi, {user?.name?.split(' ')[0]}
        <ChevronDown size={15} className={`ml-1 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {open && (
        <div id="account-menu" className="absolute right-0 top-full mt-3 w-72 bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden py-2">
          <Link to="/account" className={item}><User size={17} className="text-navy-700" aria-hidden="true" /> My account</Link>
          <p className="px-4 pt-3 pb-1 text-xs font-bold uppercase tracking-wider text-gray-500">Work with ZivoPlus</p>
          {FOR_BUSINESS.map(({ to, name, Icon, short }) => (
            <Link key={to} to={to} className={item}>
              <Icon size={17} className="text-navy-700" aria-hidden="true" />
              <span><span className="block text-gray-900">{name}</span><span className="block text-xs text-gray-500">{short}</span></span>
            </Link>
          ))}
          <div className="border-t border-gray-100 mt-2 pt-2">
            <button type="button" onClick={onLogout} className={`${item} w-full`}><LogOut size={17} aria-hidden="true" /> Log out</button>
          </div>
        </div>
      )}
    </div>
  );
};

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

  const links = (isAuthenticated ? [
    { to: '/hotels', label: 'Hotels' },
    { to: '/my-bookings', label: 'My Bookings' },
    guest && { to: '/saved', label: 'Saved' },
    guest && { to: '/wallet', label: 'Zivo Cash' },
    { to: '/rewards', label: 'Zivo Rewards' },
    { to: '/membership', label: 'Membership' },
    ...myPortals.map((p) => ({ to: p.to, label: p.name, portal: true })),
    (user?.role === 'ADMIN' || user?.role === 'OWNER') && { to: user.role === 'ADMIN' ? '/admin' : '/extranet', label: user.role === 'ADMIN' ? 'Admin' : 'Extranet' },
  ] : [
    { to: '/hotels', label: 'Hotels' },
    { to: BUSINESS.to, label: BUSINESS.name },
    { to: PARTNER_HUB.to, label: PARTNER_HUB.name },
  ]).filter(Boolean);
  const linkCls = ({ isActive }) => `font-medium transition-colors ${isActive ? 'text-navy-800' : 'text-gray-600 hover:text-navy-800'}`;
  const mobileLinkCls = ({ isActive }) => `px-2 py-3 rounded-lg text-base font-medium ${isActive ? 'text-navy-800 bg-navy-50' : 'text-gray-700 hover:bg-gray-50'}`;

  return (
    <nav className={`fixed w-full z-50 bg-white transition-shadow duration-300 ${scrolled ? 'shadow-md' : 'border-b border-gray-200'}`} aria-label="Main">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <Link to="/" className="flex-shrink-0" aria-label="ZivoPlus home">
            <Logo size="md" />
          </Link>

          <div className="hidden xl:flex items-center gap-6 whitespace-nowrap">
            {links.map((l) => (
              <NavLink key={l.to} to={l.to} className={linkCls}>
                {l.portal ? <span className="inline-flex items-center gap-1.5"><Building2 size={16} className="text-brand-600" aria-hidden="true" />{l.label}</span> : l.label}
              </NavLink>
            ))}
            <div className="flex items-center gap-3 ml-1 border-l pl-5 border-gray-200">
              {isAuthenticated ? (
                <>
                  <NotificationBell />
                  <AccountMenu user={user} onLogout={handleLogout} />
                </>
              ) : (
                <>
                  <Link to={LIST_PROPERTY.to} className="font-semibold px-4 py-2 rounded-lg border border-navy-200 text-navy-800 hover:bg-navy-50 transition-colors">{LIST_PROPERTY.name}</Link>
                  <Link to="/login" className="font-semibold px-4 py-2 rounded-lg transition-colors text-navy-800 hover:bg-navy-50">Log in</Link>
                  <Link to="/signup" className="font-semibold px-5 py-2 rounded-lg transition-colors bg-brand-600 hover:bg-brand-700 text-white">Sign up</Link>
                </>
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
            {links.map((l) => <NavLink key={l.to} to={l.to} className={mobileLinkCls}>{l.label}</NavLink>)}
            {!isAuthenticated && <NavLink to={LIST_PROPERTY.to} className={mobileLinkCls}>{LIST_PROPERTY.name}</NavLink>}
            {isAuthenticated && <NavLink to="/account" className={mobileLinkCls}>My account</NavLink>}
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
