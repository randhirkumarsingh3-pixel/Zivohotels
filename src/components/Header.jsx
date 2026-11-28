import { useState, useEffect } from 'react';
import NotificationBell from './shared/NotificationBell';
import { Link, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { Menu, X, User, LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import Logo from './brand/Logo';

/**
 * Guest site header: white bar, navy links, red for the one main action (Sign up). On phones the
 * menu button opens a panel with the same links (it used to do nothing).
 */
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

          <div className="hidden lg:flex items-center gap-7">
            {links.map((l) => <NavLink key={l.to} to={l.to} className={linkCls}>{l.label}</NavLink>)}
            <div className="flex items-center gap-3 ml-2 border-l pl-6 border-gray-200">
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

          <div className="lg:hidden flex items-center gap-1">
            {isAuthenticated && <NotificationBell />}
            <button type="button" onClick={() => setMenuOpen((o) => !o)} aria-label={menuOpen ? 'Close menu' : 'Open menu'} aria-expanded={menuOpen}
              className="p-2 -mr-2 rounded-lg text-navy-800 hover:bg-gray-100">
              {menuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </div>
      </div>

      {menuOpen && (
        <div className="lg:hidden border-t border-gray-200 bg-white shadow-lg">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex flex-col">
            {isAuthenticated && <p className="px-2 py-2 text-sm text-gray-500">Signed in as <span className="font-semibold text-gray-800">{user?.name}</span></p>}
            {links.map((l) => (
              <NavLink key={l.to} to={l.to} className={({ isActive }) => `px-2 py-3 rounded-lg text-base font-medium ${isActive ? 'text-navy-800 bg-navy-50' : 'text-gray-700 hover:bg-gray-50'}`}>{l.label}</NavLink>
            ))}
            {isAuthenticated && <NavLink to="/account" className={({ isActive }) => `px-2 py-3 rounded-lg text-base font-medium ${isActive ? 'text-navy-800 bg-navy-50' : 'text-gray-700 hover:bg-gray-50'}`}>My account</NavLink>}
            <Link to="/help" className="px-2 py-3 rounded-lg text-base font-medium text-gray-700 hover:bg-gray-50">Help</Link>
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
