import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Loader2, CheckCircle2 } from 'lucide-react';
import { resetPassword } from '../services/api';
import usePageTitle from '../hooks/usePageTitle';

/** Opened from the "reset your password" email (?token=...): choose a new password. */
const inputCls = 'w-full px-3 py-3 border border-gray-300 rounded-lg text-sm focus:border-navy-500 focus:ring-2 focus:ring-navy-500/20 outline-none';

const ResetPassword = () => {
  usePageTitle('Choose a new password');
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState('');
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (pw.length < 8) return setError('Use at least 8 characters.');
    if (pw !== confirm) return setError("The passwords don't match.");
    setBusy(true);
    try {
      const res = await resetPassword(token, pw);
      setDone(res?.message || 'Password updated. Log in with your new password.');
    } catch (err) {
      setError(err.message || 'Could not reset the password.');
    } finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-start sm:justify-center pt-28 pb-12 sm:py-12 px-4">
      <div className="mx-auto w-full max-w-md">
        <img src="/brand/zivo-mark.png" alt="" aria-hidden="true" className="mx-auto h-12 w-12" />
        <h1 className="mt-4 text-center text-3xl font-bold text-navy-900">Choose a new password</h1>
        <div className="mt-8 bg-white py-8 px-6 sm:px-10 shadow-sm rounded-card border border-gray-200">
          {!token ? (
            <p className="text-gray-700">This link is missing its code. Open the link from the email again, or <Link to="/forgot-password" className="font-semibold text-navy-700 underline">ask for a new one</Link>.</p>
          ) : done ? (
            <div className="text-center space-y-4">
              <CheckCircle2 className="mx-auto text-green-700" size={40} aria-hidden="true" />
              <p role="status" className="text-gray-700">{done}</p>
              <div className="flex gap-3 justify-center">
                <Link to="/login" className="px-4 py-2.5 rounded-lg bg-brand-600 text-white font-semibold">Guest log in</Link>
                <Link to="/extranet/login" className="px-4 py-2.5 rounded-lg border border-navy-200 text-navy-800 font-semibold">Extranet log in</Link>
              </div>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-5">
              {error && (
                <p role="alert" className="text-sm bg-red-50 text-red-700 rounded-lg px-3 py-2">
                  {error} {/expired|already used/i.test(error) && <Link to="/forgot-password" className="font-semibold underline">Ask for a new link</Link>}
                </p>
              )}
              <div>
                <label htmlFor="rp-new" className="block text-sm font-medium text-gray-700 mb-1">New password</label>
                <input id="rp-new" type="password" autoComplete="new-password" required minLength={8} value={pw} onChange={(e) => setPw(e.target.value)} className={inputCls} aria-describedby="rp-hint" />
                <p id="rp-hint" className="text-xs text-gray-500 mt-1">At least 8 characters.</p>
              </div>
              <div>
                <label htmlFor="rp-confirm" className="block text-sm font-medium text-gray-700 mb-1">Confirm new password</label>
                <input id="rp-confirm" type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} className={inputCls} />
              </div>
              <button type="submit" disabled={busy || !pw || !confirm} className="w-full flex justify-center items-center gap-2 py-3 rounded-lg bg-brand-600 hover:bg-brand-700 text-white font-semibold disabled:opacity-50">
                {busy && <Loader2 size={16} className="animate-spin" aria-hidden="true" />} Save new password
              </button>
              <p className="text-xs text-gray-500">You&apos;ll be signed out on all devices.</p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default ResetPassword;
