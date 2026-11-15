import { Link } from 'react-router-dom';
import { MapPinOff } from 'lucide-react';
import usePageTitle from '../hooks/usePageTitle';

/** Shown for any address that doesn't exist (it used to silently send people to the home page). */
const NotFound = () => {
  usePageTitle('Page not found');
  return (
    <div className="pt-32 pb-24 bg-gray-50 min-h-[70vh] px-4">
      <div className="max-w-lg mx-auto text-center">
        <MapPinOff className="mx-auto text-navy-700" size={48} aria-hidden="true" />
        <h1 className="mt-4 text-3xl font-bold text-navy-900">We couldn&apos;t find that page</h1>
        <p className="mt-2 text-gray-600">The link may be old or mistyped. Try searching for a hotel instead.</p>
        <div className="mt-6 flex flex-wrap gap-3 justify-center">
          <Link to="/" className="px-5 py-3 rounded-lg bg-brand-600 hover:bg-brand-700 text-white font-semibold">Search hotels</Link>
          <Link to="/help" className="px-5 py-3 rounded-lg border border-navy-200 text-navy-800 font-semibold bg-white">Help centre</Link>
        </div>
      </div>
    </div>
  );
};

export default NotFound;
