import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, MailCheck } from 'lucide-react';
import { requestPasswordReset } from '../services/api';
import usePageTitle from '../hooks/usePageTitle';

/** "Forgot password": emails a link to choose a new password (works for guests, owners, admins). */
const ForgotPassword = () => {
  usePageTitle('Reset your password');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState('');
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const res = await requestPasswordReset(email.trim());
      setSent(res?.message || 'Check your email for a link to reset your password.');
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-start sm:justify-center pt-28 pb-12 sm:py-12 px-4">
      <div className="mx-auto w-full max-w-md">
        <img src="/brand/zivo-mark.png" alt="" aria-hidden="true" className="mx-auto h-12 w-12" />
        <h1 className="mt-4 text-center text-3xl font-bold text-navy-900">Reset your password</h1>
        <p className="mt-2 text-center text-sm text-gray-600">Enter the email you log in with and we&apos;ll send you a link.</p>

        <div className="mt-8 bg-white py-8 px-6 sm:px-10 shadow-sm rounded-card border border-gray-200">
          {sent ? (
            <div className="text-center space-y-4">
              <MailCheck className="mx-auto text-green-700" size={40} aria-hidden="true" />
              <p role="status" className="text-gray-700">{sent}</p>
              <p className="text-sm text-gray-500">Didn&apos;t get it? Check your spam folder, or <button type="button" onClick={() => setSent('')} className="font-semibold text-navy-700 underline">try again</button>.</p>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-5">
              {error && <p role="alert" className="text-sm bg-red-50 text-red-700 rounded-lg px-3 py-2">{error}</p>}
              <div>
                <label htmlFor="fp-email" className="block text-sm font-medium text-gray-700 mb-1">Email address</label>
                <input id="fp-email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com" className="w-full px-3 py-3 border border-gray-300 rounded-lg text-sm focus:border-navy-500 focus:ring-2 focus:ring-navy-500/20 outline-none" />
              </div>
              <button type="submit" disabled={busy || !email.trim()} className="w-full flex justify-center items-center gap-2 py-3 rounded-lg bg-brand-600 hover:bg-brand-700 text-white font-semibold disabled:opacity-50">
                {busy && <Loader2 size={16} className="animate-spin" aria-hidden="true" />} Send reset link
              </button>
            </form>
          )}
        </div>
        <p className="mt-6 text-center text-sm text-gray-600">Remembered it? <Link to="/login" className="font-semibold text-navy-700">Log in</Link> · <Link to="/extranet/login" className="font-semibold text-navy-700">Extranet log in</Link></p>
      </div>
    </div>
  );
};

export default ForgotPassword;
