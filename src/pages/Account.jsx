import { Link } from 'react-router-dom';
import { User, KeyRound, ChevronRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import ChangePasswordForm from '../components/account/ChangePasswordForm';
import usePageTitle from '../hooks/usePageTitle';

/** My account (any signed-in user): who's signed in, change password, and quick links. */
const Account = () => {
  usePageTitle('My account');
  const { user } = useAuth();
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
            <div><dt className="text-gray-500">Email</dt><dd className="font-semibold text-gray-900 break-all">{user?.email}</dd></div>
          </dl>
        </section>

        <section className="bg-white border border-gray-200 rounded-card p-6">
          <h2 className="flex items-center gap-2 text-lg font-bold text-gray-900 mb-1"><KeyRound size={20} className="text-navy-700" aria-hidden="true" /> Password</h2>
          <p className="text-sm text-gray-500 mb-4">Changing it signs you out on your other devices.</p>
          <ChangePasswordForm />
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
