import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Building2, Menu, User, LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const Header = () => {
  const [scrolled, setScrolled] = useState(false);
  const { isAuthenticated, user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <nav className={`fixed w-full z-50 transition-all duration-300 ${scrolled ? 'bg-white/95 backdrop-blur-md shadow-md py-2' : 'bg-white/90 backdrop-blur-md shadow-sm py-4'}`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-14">
          <Link to="/" className="flex-shrink-0 flex items-center cursor-pointer group">
            <div className="bg-brand-700 p-2 rounded-lg mr-2 group-hover:bg-brand-800 transition-colors shadow-lg shadow-brand-700/30">
              <Building2 className="h-6 w-6 text-white" />
            </div>
            <span className={`text-2xl font-bold tracking-tight text-gray-900`}>
              Zivo<span className="text-brand-700">Hotels</span>
            </span>
          </Link>

          <div className="hidden md:flex items-center space-x-8">
            <Link to="/hotels" className="font-medium transition-colors hover:text-brand-700 text-gray-600">All Hotels</Link>
            
            {/* Role-Based Links */}
            {isAuthenticated && (
              <Link to="/my-bookings" className="font-medium transition-colors hover:text-brand-700 text-gray-600">
                My Bookings
              </Link>
            )}

            {isAuthenticated && (user?.role === 'ADMIN' || user?.role === 'OWNER') && (
              <Link 
                to={user.role === 'ADMIN' ? '/admin' : '/extranet'} 
                className="font-bold transition-colors text-brand-700 hover:text-brand-800"
              >
                {user.role === 'ADMIN' ? 'Admin Panel' : 'Owner Dashboard'}
              </Link>
            )}

            <div className={`flex items-center space-x-4 ml-4 border-l pl-4 border-gray-200`}>
              {isAuthenticated ? (
                <div className="flex items-center space-x-4">
                  <div className="flex items-center text-gray-700 font-medium bg-gray-50 px-3 py-1.5 rounded-full border border-gray-200">
                    <User className="h-4 w-4 mr-2" />
                    Hi, {user?.name?.split(' ')[0]}
                  </div>
                  <button 
                    onClick={handleLogout}
                    className="flex items-center font-medium px-4 py-2 rounded-full transition-colors text-red-600 hover:bg-red-50"
                  >
                    <LogOut className="h-4 w-4 mr-2" />
                    Logout
                  </button>
                </div>
              ) : (
                <>
                  <Link to="/login" className="font-medium px-4 py-2 rounded-full transition-colors text-gray-700 hover:text-brand-700 hover:bg-gray-50">
                    Log in
                  </Link>
                  <Link to="/signup" className="font-medium px-6 py-2 rounded-full transition-all shadow-md transform hover:-translate-y-0.5 bg-brand-700 hover:bg-brand-800 text-white shadow-brand-700/25">
                    Sign up
                  </Link>
                </>
              )}
            </div>
          </div>

          <div className="md:hidden flex items-center">
            <button className="p-2 rounded-md focus:outline-none text-gray-600">
              <Menu className="h-6 w-6" />
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Header;
