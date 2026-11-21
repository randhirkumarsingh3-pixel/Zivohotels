import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Lock, Mail, ArrowRight, AlertCircle, ShieldCheck } from 'lucide-react';
import Logo from '../../components/brand/Logo';
import usePageTitle from '../../hooks/usePageTitle';

const ExtranetLogin = () => {
  usePageTitle('Extranet log in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const location = useLocation();
  const [error, setError] = useState(
    location.state?.wrongAccount ? 'Your account does not have partner access. Sign in with a hotel partner account.' : ''
  );
  const [loading, setLoading] = useState(false);
  
  const { login } = useAuth();
  const navigate = useNavigate();
  
  const from = location.state?.from?.pathname || "/extranet";

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const result = await login(email, password, {
      allowedRoles: ['OWNER', 'ADMIN'], // same as the /extranet routes
      wrongRoleMessage: 'This is the hotel partner login. Guests sign in on the main website.',
    });
    
    if (result.success) {
      navigate(from, { replace: true });
    } else {
      setError(result.message || 'Invalid credentials for Partner Portal');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F0F2F5] flex flex-col items-center justify-center p-4">
      
      <div className="mb-10 text-center">
         <div className="flex justify-center mb-4">
            <h1><Logo size="lg" label="Extranet" /></h1>
         </div>
         <p className="text-gray-500 font-medium">Manage your property, inventory, and bookings.</p>
      </div>

      <div className="w-full max-w-[450px]">
        <div className="bg-white rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.05)] border border-gray-100 overflow-hidden">
          <div className="h-1.5 bg-navy-800"></div>
          
          <div className="p-10">
            <div className="mb-8">
               <h2 className="text-2xl font-black text-gray-900 mb-2">Partner Login</h2>
               <p className="text-sm text-gray-500">Access your property dashboard</p>
            </div>

            <form className="space-y-6" onSubmit={handleSubmit}>
              {error && (
                <div className="bg-red-50 p-4 rounded-2xl flex items-start border border-red-100">
                  <AlertCircle className="h-5 w-5 text-red-500 mr-3 shrink-0 mt-0.5" />
                  <p className="text-xs font-bold text-red-800 leading-relaxed">{error}</p>
                </div>
              )}

              <div className="space-y-2">
                <label className="text-xs font-black text-gray-400 uppercase tracking-widest ml-1">Email ID / Username</label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none transition-colors group-focus-within:text-blue-600">
                    <Mail className="h-5 w-5 text-gray-400 group-focus-within:text-blue-600 transition-colors" />
                  </div>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-12 block w-full bg-gray-50 border-2 border-transparent rounded-2xl px-4 py-4 focus:bg-white focus:border-blue-600 outline-none transition-all font-bold text-gray-900 placeholder:text-gray-400"
                    placeholder="Enter your registered email"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-center ml-1">
                   <label className="text-xs font-black text-gray-400 uppercase tracking-widest">Password</label>
                   <a href="/forgot-password" className="text-xs font-semibold text-navy-700 hover:underline">Forgot password?</a>
                </div>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none transition-colors group-focus-within:text-blue-600">
                    <Lock className="h-5 w-5 text-gray-400 group-focus-within:text-blue-600 transition-colors" />
                  </div>
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-12 block w-full bg-gray-50 border-2 border-transparent rounded-2xl px-4 py-4 focus:bg-white focus:border-blue-600 outline-none transition-all font-bold text-gray-900 placeholder:text-gray-400"
                    placeholder="••••••••"
                  />
                </div>
              </div>

              <div className="flex items-center gap-3 py-2">
                <input 
                  id="remember" 
                  type="checkbox" 
                  className="w-5 h-5 rounded-lg border-2 border-gray-200 text-blue-600 focus:ring-blue-500" 
                />
                <label htmlFor="remember" className="text-sm font-bold text-gray-600 cursor-pointer">Stay signed in on this device</label>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full flex justify-center items-center py-5 px-6 border border-transparent rounded-2xl shadow-xl shadow-blue-600/20 text-sm font-black text-white bg-blue-600 hover:bg-blue-700 focus:outline-none transition-all transform hover:-translate-y-1 active:scale-95 disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <span className="animate-spin rounded-full h-6 w-6 border-4 border-white/20 border-t-white"></span>
                ) : (
                  <span className="flex items-center gap-2">
                     LOGIN TO EXTRANET <ArrowRight size={18} />
                  </span>
                )}
              </button>
            </form>
          </div>
          
          <div className="bg-gray-50 p-6 border-t border-gray-100 flex items-center justify-center gap-3">
             <ShieldCheck className="text-green-500" size={18} />
             <span className="text-xs font-black text-gray-400 uppercase tracking-widest">Secure 256-bit SSL Encrypted Portal</span>
          </div>
        </div>
        
        <p className="mt-6 text-center text-sm text-gray-600">
          New to ZivoHotels? <a href="/list-your-property" className="font-bold text-blue-600 hover:underline">List your property</a>
        </p>
        <p className="mt-4 text-center text-xs text-gray-400 font-medium leading-relaxed">
           By logging in, you agree to Zivo&apos;s <a href="/terms" className="text-blue-600 font-bold underline">Terms of Service</a> and <a href="/privacy" className="text-blue-600 font-bold underline">Privacy Policy</a>.
           Need help? Write to <span className="text-blue-600 font-bold select-all">partners@zivohotels.com</span>.
        </p>
      </div>
    </div>
  );
};

export default ExtranetLogin;
