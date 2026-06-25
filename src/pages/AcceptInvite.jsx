import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { CheckCircle2, Eye, EyeOff, AlertTriangle, KeyRound } from 'lucide-react';

const AcceptInvite = () => {
  const [searchParams] = useSearchParams();
  const _navigate = useNavigate();
  const token = searchParams.get('token');

  const [form, setForm] = useState({ password: '', confirm: '' });
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) setError('Invalid invite link. No token found.');
  }, [token]);

  const handleChange = (e) => setForm(p => ({ ...p, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (form.password !== form.confirm) {
      setError('Passwords do not match.');
      return;
    }
    if (form.password.length < 8 || !/[a-zA-Z]/.test(form.password) || !/[0-9]/.test(form.password)) {
      setError('Password must be at least 8 characters with at least 1 letter and 1 number.');
      return;
    }

    setLoading(true);
    const BASE_URL = import.meta.env.VITE_API_URL || '/api/v1';
    try {
      const res = await fetch(`${BASE_URL}/users/accept-invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password: form.password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to activate account');
      setSuccess(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="bg-white rounded-2xl shadow-xl p-10 max-w-md w-full text-center border border-gray-100">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-5">
            <CheckCircle2 className="h-8 w-8 text-green-600" />
          </div>
          <h2 className="text-2xl font-extrabold text-gray-900 mb-2">Account Activated!</h2>
          <p className="text-gray-500 mb-8 text-sm">Your password has been set. You can now sign in to your account.</p>
          <Link to="/login"
            className="w-full inline-block bg-brand-600 hover:bg-brand-700 text-white font-bold py-3 px-6 rounded-xl transition-colors text-sm">
            Go to Login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full border border-gray-100">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-brand-50 rounded-xl flex items-center justify-center">
            <KeyRound size={20} className="text-brand-600" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold text-gray-900">Set Your Password</h1>
            <p className="text-xs text-gray-500">You&apos;ve been invited to ZivoHotels. Set a password to activate your account.</p>
          </div>
        </div>

        {error && (
          <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl mb-4">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />{error}
          </div>
        )}

        {!token ? (
          <p className="text-sm text-gray-500 text-center py-6">This invite link appears to be invalid.</p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">New Password</label>
              <div className="relative">
                <input required type={showPw ? 'text' : 'password'} name="password" value={form.password} onChange={handleChange}
                  className="w-full px-3 py-2.5 pr-10 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                  placeholder="Min 8 chars, 1 letter + 1 number" />
                <button type="button" onClick={() => setShowPw(p => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              <ul className="mt-1.5 text-[10px] text-gray-400 space-y-0.5 list-disc list-inside">
                <li>At least 8 characters</li>
                <li>At least 1 letter and 1 number</li>
              </ul>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Confirm Password</label>
              <input required type={showPw ? 'text' : 'password'} name="confirm" value={form.confirm} onChange={handleChange}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                placeholder="Re-enter your password" />
            </div>

            <button type="submit" disabled={loading || !token}
              className="w-full bg-brand-600 hover:bg-brand-700 text-white text-sm font-bold py-2.5 rounded-xl transition-colors disabled:opacity-60 flex items-center justify-center gap-2 mt-2">
              {loading
                ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : 'Activate Account'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

export default AcceptInvite;
