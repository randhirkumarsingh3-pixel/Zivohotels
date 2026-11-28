import { useState, useEffect, useRef } from 'react';
import NotificationBell from './shared/NotificationBell';
import { Link, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { Menu, X, User, LogOut, ChevronDown, ArrowRight } from 'lucide-react';
import { FOR_BUSINESS } from '../constants/forBusiness';
import { useAuth } from '../context/AuthContext';
import Logo from './brand/Logo';

/**
 * Guest site header: white bar, navy links, red for the one main action (Sign up). "For business"
 * opens a menu with ZivoPlus for Business, ZivoPlus Partner Hub and List your property. On phones
 * the menu button opens a panel with the same links.
 */

/** Desktop "For business" menu: opens on click, closes on Escape, outside click or navigation. */
const BusinessMenu = () => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const location = useLocation();
  const active = ['/business', '/partners', '/list-your-property'].some((p) => location.pathname.startsWith(p));
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
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls="for-business-menu"
        className={`flex items-center gap-1 font-medium transition-colors ${active || open ? 'text-navy-800' : 'text-gray-600 hover:text-navy-800'}`}>
        For business <ChevronDown size={16} className={`transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {open && (
        <div id="for-business-menu" className="absolute right-0 xl:left-1/2 xl:-translate-x-1/2 xl:right-auto top-full mt-4 w-[min(92vw,640px)] bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden">
          <div className="grid sm:grid-cols-3">
            {FOR_BUSINESS.map(({ to, name, Icon, short, line }, i) => (
              <Link key={to} to={to} className={`group p-5 flex flex-col hover:bg-gray-50 transition-colors ${i ? 'sm:border-l border-gray-100' : ''}`}>
                <span className={`w-10 h-10 rounded-xl flex items-center justify-center ${i === 2 ? 'bg-brand-50 text-brand-600' : 'bg-navy-50 text-navy-800'}`}><Icon size={20} aria-hidden="true" /></span>
                <span className="block mt-3 text-xs font-bold uppercase tracking-wider text-gray-500">{short}</span>
                <span className="block mt-0.5 font-bold text-gray-900 group-hover:text-navy-800">{name}</span>
                <span className="block mt-1 text-sm text-gray-600 leading-snug">{line}</span>
                <span className="mt-auto pt-3 inline-flex items-center gap-1 text-sm font-semibold text-brand-600">Learn more <ArrowRight size={14} className="group-hover:translate-x-0.5 transition-transform" aria-hidden="true" /></span>
              </Link>
            ))}
          </div>
          <div className="bg-navy-950 text-white px-5 py-3 flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="text-gray-300">Already work with us?</span>
            <span className="flex flex-wrap gap-x-4 gap-y-1 font-semibold">
              <Link to="/business" className="hover:text-brand-300">Company log in</Link>
              <Link to="/partners" className="hover:text-brand-300">Agent log in</Link>
              <Link to="/extranet/login" className="hover:text-brand-300">Hotel log in</Link>
            </span>
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

  useEffect(() => { setMenuOpen(false); }, [location.pathname]);
  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleLogout = () => { logout(); navigate('/'); };

  const links = [
    { to: '/hotels', label: 'Hotels' },
    { to: '/rewards', label: 'Zivo Rewards' },
    { to: '/membership', label: 'Membership' },
    isAuthenticated && { to: '/my-bookings', label: 'My Bookings' },
    isAuthenticated && user?.role === 'CUSTOMER' && { to: '/saved', label: 'Saved' },
    isAuthenticated && user?.role === 'CUSTOMER' && { to: '/wallet', label: 'Zivo Cash' },
    isAuthenticated && (user?.role === 'ADMIN' || user?.role === 'OWNER') && { to: user.role === 'ADMIN' ? '/admin' : '/extranet', label: user.role === 'ADMIN' ? 'Admin' : 'Extranet' },
  ].filter(Boolean);
  const linkCls = ({ isActive }) => `font-medium transition-colors ${isActive ? 'text-navy-800' : 'text-gray-600 hover:text-navy-800'}`;

  return (
    <nav className={`fixed w-full z-50 bg-white transition-shadow duration-300 ${scrolled ? 'shadow-md' : 'border-b border-gray-200'}`} aria-label="Main">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <Link to="/" className="flex-shrink-0" aria-label="ZivoPlus home">
            <Logo size="md" />
          </Link>

          <div className="hidden xl:flex items-center gap-6 whitespace-nowrap">
            {links.map((l) => <NavLink key={l.to} to={l.to} className={linkCls}>{l.label}</NavLink>)}
            <BusinessMenu />
            <div className="flex items-center gap-3 ml-1 border-l pl-5 border-gray-200">
              {isAuthenticated ? (
                <>
                  <NotificationBell />
                  <Link to="/account" className="flex items-center text-gray-700 font-medium bg-gray-50 hover:bg-gray-100 px-3 py-1.5 rounded-full border border-gray-200" title="My account">
                    <User className="h-4 w-4 mr-2 text-navy-700" aria-hidden="true" />
                    Hi, {user?.name?.split(' ')[0]}
                  </Link>
                  <button type="button" onClick={handleLogout} className="flex items-center font-medium px-3 py-2 rounded-lg transition-colors text-gray-600 hover:text-navy-800 hover:bg-gray-50">
                    <LogOut className="h-4 w-4 mr-2" aria-hidden="true" />
                    Log out
                  </button>
                </>
              ) : (
                <>
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
            {links.map((l) => (
              <NavLink key={l.to} to={l.to} className={({ isActive }) => `px-2 py-3 rounded-lg text-base font-medium ${isActive ? 'text-navy-800 bg-navy-50' : 'text-gray-700 hover:bg-gray-50'}`}>{l.label}</NavLink>
            ))}
            {isAuthenticated && <NavLink to="/account" className={({ isActive }) => `px-2 py-3 rounded-lg text-base font-medium ${isActive ? 'text-navy-800 bg-navy-50' : 'text-gray-700 hover:bg-gray-50'}`}>My account</NavLink>}
            <Link to="/help" className="px-2 py-3 rounded-lg text-base font-medium text-gray-700 hover:bg-gray-50">Help</Link>
            <p className="px-2 pt-4 pb-1 text-xs font-bold uppercase tracking-wider text-gray-500">For business</p>
            {FOR_BUSINESS.map(({ to, name, Icon, short }) => (
              <NavLink key={to} to={to} className={({ isActive }) => `px-2 py-2.5 rounded-lg flex items-center gap-3 ${isActive ? 'bg-navy-50' : 'hover:bg-gray-50'}`}>
                <span className="w-9 h-9 rounded-lg bg-navy-50 text-navy-800 flex items-center justify-center shrink-0"><Icon size={18} aria-hidden="true" /></span>
                <span><span className="block text-base font-medium text-gray-900">{name}</span><span className="block text-xs text-gray-500">{short}</span></span>
              </NavLink>
            ))}
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
