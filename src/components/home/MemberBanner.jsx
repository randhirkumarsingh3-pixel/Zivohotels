import { Link } from 'react-router-dom';
import { Crown, Gift } from 'lucide-react';

/**
 * Below the hero. Signed-out visitors: why to sign up (free membership, Rewards points, the
 * sign-up bonus if one is set). Signed-in guests: Zivo Prime's benefits and price. Everything comes
 * from the live programme settings; nothing is shown that the platform doesn't give.
 */
const inr = (n) => `₹${Math.round(Number(n) || 0).toLocaleString('en-IN')}`;

const MemberBanner = ({ signup, membership, isAuthenticated, role }) => {
  const prime = membership?.paidPlan;
  if (isAuthenticated && (role !== 'CUSTOMER' || !prime)) return null;

  const signedOut = !isAuthenticated;
  const points = [
    signedOut && signup?.points > 0 && `${signup.points.toLocaleString('en-IN')} bonus Rewards points (worth ${inr(signup.worth)}) when you join`,
    signedOut && membership?.memberHotels > 0 && `Member prices at ${membership.memberHotels} hotel${membership.memberHotels === 1 ? '' : 's'}`,
    signedOut && 'Zivo Rewards points on every stay',
    !signedOut && prime.zivoDiscountPercent > 0 && `Extra ${prime.zivoDiscountPercent}% off every stay${prime.zivoDiscountMax ? ` (up to ${inr(prime.zivoDiscountMax)})` : ''}`,
    !signedOut && prime.pointsMultiplier > 1 && `${prime.pointsMultiplier}× Rewards points`,
    !signedOut && prime.freeCancelExtraHours > 0 && `${prime.freeCancelExtraHours} hours more free cancellation`,
  ].filter(Boolean);

  return (
    <section className="bg-white" aria-label={signedOut ? 'Join ZivoHotels' : 'Zivo Prime'}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8">
        <div className="flex flex-col md:flex-row md:items-center gap-4 justify-between rounded-card border border-navy-100 bg-navy-50 px-5 py-4">
          <div className="flex items-start gap-3">
            <span className="w-10 h-10 rounded-full bg-white text-brand-600 flex items-center justify-center shrink-0 border border-navy-100">
              {signedOut ? <Gift size={20} aria-hidden="true" /> : <Crown size={20} aria-hidden="true" />}
            </span>
            <div>
              <h2 className="font-bold text-navy-900">{signedOut ? 'Sign up free and save on every stay' : `Get ${prime.name} for ${inr(prime.price)} a year`}</h2>
              <p className="text-sm text-gray-700 mt-0.5">{points.join(' · ')}</p>
            </div>
          </div>
          <Link to={signedOut ? '/signup' : '/membership'} className="shrink-0 text-center px-5 py-2.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white font-semibold">
            {signedOut ? 'Sign up free' : `See ${prime.name}`}
          </Link>
        </div>
      </div>
    </section>
  );
};

export default MemberBanner;
