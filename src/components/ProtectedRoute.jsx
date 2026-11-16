import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const ProtectedRoute = ({ children, allowedRoles }) => {
  const { isAuthenticated, user } = useAuth();
  const location = useLocation();

  // Each area has its own login page: admin console, partner extranet, customer site
  const loginPath = location.pathname.startsWith('/admin')
    ? '/admin/login'
    : location.pathname.startsWith('/extranet') ? '/extranet/login' : '/login';

  if (!isAuthenticated) {
    // Redirect to login but save the attempted URL
    return <Navigate to={loginPath} state={{ from: location }} replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    // Signed in with the wrong kind of account: admin/extranet show their own login with a
    // message; customer pages go home.
    if (loginPath !== '/login') {
      return <Navigate to={loginPath} state={{ from: location, wrongAccount: true }} replace />;
    }
    return <Navigate to="/" replace />;
  }

  return children;
};

export default ProtectedRoute;
