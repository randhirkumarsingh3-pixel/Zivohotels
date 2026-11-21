import { Link } from 'react-router-dom';
import { BadgeIndianRupee, CalendarCheck, LayoutDashboard, ShieldCheck, Building2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import Signup from './Signup';
import { AuthShell } from '../components/auth/AuthParts';
import usePageTitle from '../hooks/usePageTitle';

/**
 * "List your property": hotels sign up as partners here, then register the property (location,
 * photos, rooms, rates, legal and bank details). ZivoHotels reviews it before it takes bookings.
 */
const BENEFITS = [
  [CalendarCheck, 'Bookings from guests across India', 'Guests book and pay online, or reserve and pay later. You get every booking by email and in the Extranet.'],
  [LayoutDashboard, 'One Extranet for everything', 'Rooms, rates, availability, promotions, guest requests, reviews and payouts, on your laptop or phone.'],
  [BadgeIndianRupee, 'Clear payouts', 'Commission agreed upfront, GST invoices, and payouts to your bank account on a fixed cycle.'],
  [ShieldCheck, 'Reviewed before going live', 'Our team checks every property, so guests can trust what they book.'],
];

const Benefits = () => (
  <div>
    <p className="text-sm font-semibold text-brand-700">ZivoHotels for partners</p>
    <h2 className="mt-2 text-3xl font-bold text-navy-900">Fill your rooms with guests who book direct to you</h2>
    <ul className="mt-6 space-y-5">
      {BENEFITS.map(([Icon, title, text]) => (
        <li key={title} className="flex gap-3">
          <span className="w-10 h-10 rounded-lg bg-navy-50 text-navy-700 flex items-center justify-center shrink-0"><Icon size={20} aria-hidden="true" /></span>
          <span><span className="block font-semibold text-gray-900">{title}</span><span className="block text-sm text-gray-600 mt-0.5">{text}</span></span>
        </li>
      ))}
    </ul>
    <ol className="mt-8 rounded-card border border-gray-200 bg-white p-5 text-sm text-gray-700 space-y-2">
      <li><b>1.</b> Create your partner account (2 minutes).</li>
      <li><b>2.</b> Register the property: location, photos, rooms, rates, policies, legal and bank details. Progress is saved.</li>
      <li><b>3.</b> Submit: we review it, usually within 2 working days, and you&apos;re live.</li>
    </ol>
    <p className="mt-4 text-sm text-gray-500">Questions? Write to <span className="font-semibold text-gray-700 select-all">partners@zivohotels.com</span></p>
  </div>
);

const ListProperty = () => {
  usePageTitle('List your property');
  const { user, logout } = useAuth();

  if (user?.role === 'OWNER' || user?.role === 'MANAGER') {
    return (
      <AuthShell title="List your property" aside={<Benefits />}>
        <p className="text-sm text-gray-700">You&apos;re signed in as a partner ({user.email}). Add a property or continue the one you started.</p>
        <div className="mt-5 space-y-3">
          <Link to="/extranet/onboarding" className="w-full flex justify-center items-center gap-2 py-3.5 rounded-xl text-sm font-bold text-white bg-brand-700 hover:bg-brand-800"><Building2 size={18} aria-hidden="true" /> Register a property</Link>
          <Link to="/extranet" className="w-full flex justify-center py-3 rounded-xl text-sm font-semibold border border-gray-300 text-gray-800 hover:bg-gray-50">Go to the Extranet</Link>
        </div>
      </AuthShell>
    );
  }
  if (user) {
    return (
      <AuthShell title="List your property" aside={<Benefits />}>
        <p className="text-sm text-gray-700">You&apos;re signed in with a guest account ({user.email}). Hotels use a separate partner account: sign out, then create one here with your work email.</p>
        <button type="button" onClick={logout} className="mt-5 w-full py-3.5 rounded-xl text-sm font-bold text-white bg-brand-700 hover:bg-brand-800">Sign out to continue</button>
      </AuthShell>
    );
  }
  return <Signup partner aside={<Benefits />} />;
};

export default ListProperty;
