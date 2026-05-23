import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const ProtectedRoute = ({ children, allowedRoles }) => {
  const { isAuthenticated, user } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    // Redirect to login but save the attempted URL
    const loginPath = location.pathname.startsWith('/extranet') ? '/extranet/login' : '/login';
    return <Navigate to={loginPath} state={{ from: location }} replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    // Role not authorized, redirect to home
    return <Navigate to="/" replace />;
  }

  return children;
};

export default ProtectedRoute;
