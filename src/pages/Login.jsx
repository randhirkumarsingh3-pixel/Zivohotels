import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Lock, Mail, ArrowRight, AlertCircle, Smartphone, KeyRound } from 'lucide-react';

const Login = () => {
  const [authMode, setAuthMode] = useState('email'); // 'email' | 'otp'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mobile, setMobile] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  
  const from = location.state?.from?.pathname || "/";

  const handleEmailSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const result = await login(email, password);
    
    if (result.success) {
      navigate(from, { replace: true });
    } else {
      setError(result.message || 'Failed to login');
      setLoading(false);
    }
  };

  const handleSendOtp = (e) => {
    e.preventDefault();
    if (!mobile || mobile.length < 10) {
      setError('Please enter a valid mobile number');
      return;
    }
    setError('');
    setLoading(true);
    // Mock OTP send
    setTimeout(() => {
      setOtpSent(true);
      setLoading(false);
    }, 1000);
  };

  const handleOtpSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    // Mock OTP verification
    setTimeout(async () => {
      if (otp === '1234') { // Fake OTP success
        const result = await login('user@zivohotels.com', 'password'); // Mock login
        if (result.success) navigate(from, { replace: true });
      } else {
        setError('Invalid OTP. Use 1234 for testing.');
        setLoading(false);
      }
    }, 1000);
  };

  const isOwnerLogin = location.pathname.includes('/owner');
  const isAdminLogin = location.pathname.includes('/admin');
  
  let portalName = "Welcome back";
  if (isAdminLogin) portalName = "Admin Portal Login";
  else if (isOwnerLogin) portalName = "Partner Portal Login";

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
          {portalName}
        </h2>
        <p className="mt-2 text-center text-sm text-gray-600">
          Or{' '}
          <Link to="/signup" className="font-medium text-brand-700 hover:text-brand-800">
            create a new account
          </Link>
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow-xl shadow-brand-500/5 sm:rounded-2xl sm:px-10 border border-gray-100">
          
          {/* Auth Tabs */}
          <div className="flex bg-gray-100 rounded-lg p-1 mb-8">
            <button
              onClick={() => { setAuthMode('email'); setError(''); }}
              className={`flex-1 py-2 text-sm font-bold rounded-md transition-all ${authMode === 'email' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Email
            </button>
            <button
              onClick={() => { setAuthMode('otp'); setError(''); }}
              className={`flex-1 py-2 text-sm font-bold rounded-md transition-all ${authMode === 'otp' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Mobile OTP
            </button>
          </div>

          {error && (
            <div className="bg-red-50 p-4 rounded-lg flex items-start mb-6">
              <AlertCircle className="h-5 w-5 text-red-500 mr-2 shrink-0 mt-0.5" />
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          {authMode === 'email' ? (
            <form className="space-y-6" onSubmit={handleEmailSubmit}>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Email address</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Mail className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-10 block w-full border border-gray-300 rounded-xl px-4 py-3 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-all"
                    placeholder="you@example.com"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Password</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Lock className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10 block w-full border border-gray-300 rounded-xl px-4 py-3 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-all"
                    placeholder="••••••••"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <input id="remember-me" type="checkbox" className="h-4 w-4 text-brand-700 focus:ring-brand-500 border-gray-300 rounded" />
                  <label htmlFor="remember-me" className="ml-2 block text-sm text-gray-900">
                    Remember me
                  </label>
                </div>
                <div className="text-sm">
                  <a href="#" className="font-medium text-brand-700 hover:text-brand-800">
                    Forgot password?
                  </a>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full flex justify-center py-3.5 px-4 border border-transparent rounded-xl shadow-lg shadow-brand-500/30 text-sm font-bold text-white bg-brand-700 hover:bg-brand-800 focus:outline-none transition-all transform hover:-translate-y-0.5 disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <span className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-white"></span>
                ) : (
                  <>Sign in <ArrowRight className="ml-2 h-5 w-5" /></>
                )}
              </button>
            </form>
          ) : (
            <form className="space-y-6" onSubmit={otpSent ? handleOtpSubmit : handleSendOtp}>
              {!otpSent ? (
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Mobile Number</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Smartphone className="h-5 w-5 text-gray-400" />
                    </div>
                    <input
                      type="tel"
                      required
                      value={mobile}
                      onChange={(e) => setMobile(e.target.value.replace(/\D/g, ''))}
                      maxLength={10}
                      className="pl-10 block w-full border border-gray-300 rounded-xl px-4 py-3 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-all tracking-widest font-medium"
                      placeholder="9876543210"
                    />
                  </div>
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Enter OTP</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <KeyRound className="h-5 w-5 text-gray-400" />
                    </div>
                    <input
                      type="text"
                      required
                      value={otp}
                      onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                      maxLength={4}
                      className="pl-10 block w-full border border-gray-300 rounded-xl px-4 py-3 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-all text-center tracking-widest text-lg font-bold"
                      placeholder="••••"
                    />
                  </div>
                  <p className="text-xs text-gray-500 mt-3 text-center">
                    OTP sent to {mobile}. <button type="button" onClick={() => setOtpSent(false)} className="text-brand-700 font-bold hover:underline">Change</button>
                  </p>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full flex justify-center py-3.5 px-4 border border-transparent rounded-xl shadow-lg shadow-brand-500/30 text-sm font-bold text-white bg-brand-700 hover:bg-brand-800 focus:outline-none transition-all transform hover:-translate-y-0.5 disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <span className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-white"></span>
                ) : otpSent ? (
                  <>Verify & Login <ArrowRight className="ml-2 h-5 w-5" /></>
                ) : (
                  <>Send OTP <ArrowRight className="ml-2 h-5 w-5" /></>
                )}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default Login;
