import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { User, KeyRound, ChevronRight, Smartphone, LogOut, CheckCircle2 } from 'lucide-react';
import PhoneVerifyForm from '../components/account/PhoneVerifyForm';
import { logoutAllApi } from '../services/api';
import { useAuth } from '../context/AuthContext';
import ChangePasswordForm from '../components/account/ChangePasswordForm';
import usePageTitle from '../hooks/usePageTitle';

/** My account (any signed-in user): who's signed in, change password, and quick links. */
const Account = () => {
  usePageTitle('My account');
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [changingPhone, setChangingPhone] = useState(false);
  const [outBusy, setOutBusy] = useState(false);
  const signOutEverywhere = async () => {
    if (!window.confirm('Sign out on every device, including this one?')) return;
    setOutBusy(true);
    await logoutAllApi().catch(() => {});
    // The sign-in page shows this once (this protected page redirects there by itself)
    try { sessionStorage.setItem('zivo_login_notice', 'You were signed out on all devices.'); } catch { /* ignore */ }
    logout();
    navigate('/login', { replace: true });
  };
  const links = [
    ['/my-bookings', 'My bookings'],
    user?.role === 'CUSTOMER' && ['/wallet', 'Zivo Cash'],
    ['/rewards', 'Zivo Rewards'],
    ['/membership', 'Membership'],
    user?.role === 'OWNER' && ['/extranet', 'Extranet'],
    user?.role === 'ADMIN' && ['/admin', 'Admin'],
  ].filter(Boolean);

  return (
    <div className="pt-28 pb-20 bg-gray-50 min-h-screen">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-navy-900">My account</h1>
          <p className="text-gray-600 mt-1">Signed in as {user?.email}</p>
        </div>

        <section className="bg-white border border-gray-200 rounded-card p-6">
          <h2 className="flex items-center gap-2 text-lg font-bold text-gray-900 mb-4"><User size={20} className="text-navy-700" aria-hidden="true" /> Profile</h2>
          <dl className="grid sm:grid-cols-2 gap-4 text-sm">
            <div><dt className="text-gray-500">Name</dt><dd className="font-semibold text-gray-900">{user?.name}</dd></div>
            <div><dt className="text-gray-500">Email</dt><dd className="font-semibold text-gray-900 break-all">{user?.email} {user?.emailVerified && <span className="ml-1 text-xs font-semibold text-green-700">Confirmed</span>}</dd></div>
          </dl>
        </section>

        <section className="bg-white border border-gray-200 rounded-card p-6">
          <h2 className="flex items-center gap-2 text-lg font-bold text-gray-900 mb-1"><Smartphone size={20} className="text-navy-700" aria-hidden="true" /> Mobile number</h2>
          {user?.phone && user?.phoneVerified && !changingPhone ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-gray-900 font-semibold flex items-center gap-2">{user.phone} <span className="flex items-center gap-1 text-xs text-green-700"><CheckCircle2 size={14} aria-hidden="true" /> Confirmed</span></p>
              <button type="button" onClick={() => setChangingPhone(true)} className="text-sm font-semibold text-navy-700 hover:text-navy-900">Change</button>
            </div>
          ) : (
            <>
              <p className="text-sm text-gray-500 mb-4">{user?.phone ? `${user.phone} is not confirmed yet. ` : ''}{"We'll send a code by SMS to confirm your number. You can also sign in with it."}</p>
              <div className="max-w-sm"><PhoneVerifyForm onDone={() => setChangingPhone(false)} /></div>
            </>
          )}
        </section>

        <section className="bg-white border border-gray-200 rounded-card p-6">
          <h2 className="flex items-center gap-2 text-lg font-bold text-gray-900 mb-1"><KeyRound size={20} className="text-navy-700" aria-hidden="true" /> Password</h2>
          <p className="text-sm text-gray-500 mb-4">Changing it signs you out on your other devices.</p>
          <ChangePasswordForm />
          {user?.google && <p className="mt-3 text-xs text-gray-500">{'You joined with Google, so you have no ZivoPlus password yet. Use "Forgot password" on the sign-in page to set one, or keep signing in with Google or a code.'}</p>}
        </section>

        <section className="bg-white border border-gray-200 rounded-card p-6">
          <h2 className="flex items-center gap-2 text-lg font-bold text-gray-900 mb-1"><LogOut size={20} className="text-navy-700" aria-hidden="true" /> Devices</h2>
          <p className="text-sm text-gray-500 mb-4">{"Lost a phone, or signed in on someone else's computer? Sign out everywhere at once."}</p>
          <button type="button" disabled={outBusy} onClick={signOutEverywhere} className="px-4 py-2.5 rounded-lg border border-gray-300 text-sm font-semibold text-gray-800 hover:bg-gray-50 disabled:opacity-60">{outBusy ? 'Signing out…' : 'Sign out of all devices'}</button>
        </section>

        <nav aria-label="Account links" className="bg-white border border-gray-200 rounded-card divide-y divide-gray-100">
          {links.map(([to, label]) => (
            <Link key={to} to={to} className="flex items-center justify-between px-6 py-4 text-gray-800 font-medium hover:bg-gray-50">{label} <ChevronRight size={18} className="text-gray-400" aria-hidden="true" /></Link>
          ))}
        </nav>
      </div>
    </div>
  );
};

export default Account;
