import { useState } from 'react';
import { Link, useNavigate, useLocation, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Lock, Mail, ArrowRight, AlertCircle, ShieldCheck } from 'lucide-react';
import usePageTitle from '../hooks/usePageTitle';

/**
 * Admin console login (/admin/login). Separate from the customer and partner logins:
 * only ADMIN accounts are accepted, and there is no sign-up link.
 */
const AdminLogin = () => {
  usePageTitle('Admin console log in');
  const { login, user, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(
    location.state?.wrongAccount ? 'Your account does not have admin access. Sign in with an admin account.' : ''
  );
  const [loading, setLoading] = useState(false);

  const from = location.state?.from?.pathname || '/admin';

  // Already signed in as an admin: go straight to the console
  if (isAuthenticated && user?.role === 'ADMIN') {
    return <Navigate to={from} replace />;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const result = await login(email, password, {
      allowedRoles: ['ADMIN'],
      wrongRoleMessage: 'This account does not have admin access.',
    });
    if (result.success) {
      navigate(from, { replace: true });
    } else {
      setError(result.message || 'Failed to sign in');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-navy-900 flex flex-col items-center justify-center px-4 pt-24 pb-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="mx-auto h-14 w-14 rounded-2xl bg-white/10 flex items-center justify-center">
            <ShieldCheck className="h-7 w-7 text-white" aria-hidden="true" />
          </div>
          <h1 className="mt-4 text-3xl font-bold text-white">ZivoHotels Admin</h1>
          <p className="mt-2 text-sm text-white/70">Staff console: authorised administrators only</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-8">
          <form className="space-y-6" onSubmit={handleSubmit}>
            {error && (
              <div role="alert" className="bg-red-50 p-4 rounded-lg flex items-start">
                <AlertCircle className="h-5 w-5 text-red-500 mr-2 shrink-0 mt-0.5" />
                <p className="text-sm text-red-800">{error}</p>
              </div>
            )}

            <div>
              <label htmlFor="admin-email" className="block text-sm font-semibold text-gray-700 mb-2">Admin email</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Mail className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  id="admin-email"
                  type="email"
                  required
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-10 block w-full border border-gray-300 rounded-xl px-4 py-3 focus:ring-2 focus:ring-navy-500 focus:border-navy-500 outline-none"
                  placeholder="you@zivohotels.com"
                />
              </div>
            </div>

            <div>
              <label htmlFor="admin-password" className="block text-sm font-semibold text-gray-700 mb-2">Password</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  id="admin-password"
                  type="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10 block w-full border border-gray-300 rounded-xl px-4 py-3 focus:ring-2 focus:ring-navy-500 focus:border-navy-500 outline-none"
                  placeholder="••••••••"
                />
              </div>
            </div>

            <div className="text-right text-sm">
              <Link to="/forgot-password" className="font-semibold text-navy-700 hover:text-navy-900">
                Forgot password?
              </Link>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex justify-center items-center py-3.5 px-4 rounded-xl text-sm font-bold text-white bg-navy-800 hover:bg-navy-900 disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {loading ? (
                <span className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-white"></span>
              ) : (
                <>Sign in to admin console <ArrowRight className="ml-2 h-5 w-5" /></>
              )}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-sm text-white/60">
          Not staff? <Link to="/login" className="text-white underline">Guest login</Link>
          {' · '}
          <Link to="/extranet/login" className="text-white underline">Hotel partner login</Link>
        </p>
      </div>
    </div>
  );
};

export default AdminLogin;
