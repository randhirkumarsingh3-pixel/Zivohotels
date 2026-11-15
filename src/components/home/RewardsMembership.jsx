import { Link } from 'react-router-dom';
import { Award, Crown, Check } from 'lucide-react';

/**
 * Zivo Rewards and Zivo Prime side by side, with the live programme rules (points per ₹100, what a
 * point is worth, tiers) and the paid plan's price and benefits. Hidden if neither is running.
 */
const inr = (n) => `₹${Math.round(Number(n) || 0).toLocaleString('en-IN')}`;

const RewardsMembership = ({ rewards, membership }) => {
  const prime = membership?.paidPlan;
  if (!rewards && !prime) return null;

  return (
    <section className="py-14 bg-white" aria-labelledby="loyalty-heading">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <h2 id="loyalty-heading" className="text-2xl md:text-3xl font-bold text-navy-900 mb-1">Save more every time you stay</h2>
        <p className="text-gray-600 mb-6">Free Rewards on every booking, and Prime for frequent travellers.</p>
        <div className="grid gap-5 md:grid-cols-2">
          {rewards && (
            <article className="rounded-card border border-gray-200 p-6 flex flex-col bg-gradient-to-br from-white to-navy-50">
              <h3 className="flex items-center gap-2 text-xl font-bold text-gray-900"><Award className="text-brand-600" size={24} aria-hidden="true" /> Zivo Rewards</h3>
              <p className="text-sm text-gray-600 mt-1">Free with your account</p>
              <ul className="mt-4 space-y-2 text-gray-700 text-sm">
                {rewards.earnPointsPer100 > 0 && <li className="flex gap-2"><Check size={18} className="text-green-700 shrink-0" aria-hidden="true" /> {rewards.earnPointsPer100} point{rewards.earnPointsPer100 === 1 ? '' : 's'} for every ₹100 you spend on stays</li>}
                <li className="flex gap-2"><Check size={18} className="text-green-700 shrink-0" aria-hidden="true" /> Each point is worth {inr(rewards.pointValue)} off a future booking{rewards.maxRedeemPercent ? ` (up to ${rewards.maxRedeemPercent}% of the room price)` : ''}</li>
                {rewards.tiers.length > 1 && <li className="flex gap-2"><Check size={18} className="text-green-700 shrink-0" aria-hidden="true" /> Earn faster as you move up: {rewards.tiers.map((t) => `${t.name}${t.multiplier > 1 ? ` ${t.multiplier}×` : ''}`).join(', ')}</li>}
                {rewards.expiryMonths > 0 && <li className="flex gap-2"><Check size={18} className="text-green-700 shrink-0" aria-hidden="true" /> Points stay valid for {rewards.expiryMonths} months</li>}
              </ul>
              <Link to="/rewards" className="mt-6 self-start px-5 py-2.5 rounded-lg border border-navy-200 bg-white text-navy-800 font-semibold hover:bg-navy-50">How Rewards work</Link>
            </article>
          )}
          {prime && (
            <article className="rounded-card p-6 flex flex-col bg-navy-900 text-white">
              <h3 className="flex items-center gap-2 text-xl font-bold"><Crown className="text-amber-300" size={24} aria-hidden="true" /> {prime.name}</h3>
              <p className="text-sm text-navy-100 mt-1"><span className="text-2xl font-bold text-white tabular-nums">{inr(prime.price)}</span> for {prime.durationDays >= 360 ? 'a year' : `${prime.durationDays} days`}</p>
              <ul className="mt-4 space-y-2 text-sm text-navy-50">
                {prime.zivoDiscountPercent > 0 && <li className="flex gap-2"><Check size={18} className="text-green-300 shrink-0" aria-hidden="true" /> Extra {prime.zivoDiscountPercent}% off every stay{prime.zivoDiscountMax ? `, up to ${inr(prime.zivoDiscountMax)} a booking` : ''}</li>}
                {prime.pointsMultiplier > 1 && <li className="flex gap-2"><Check size={18} className="text-green-300 shrink-0" aria-hidden="true" /> {prime.pointsMultiplier}× Zivo Rewards points</li>}
                {prime.freeCancelExtraHours > 0 && <li className="flex gap-2"><Check size={18} className="text-green-300 shrink-0" aria-hidden="true" /> Free cancellation {prime.freeCancelExtraHours} hours longer on eligible rates</li>}
                <li className="flex gap-2"><Check size={18} className="text-green-300 shrink-0" aria-hidden="true" /> Member prices at hotels that offer them</li>
              </ul>
              <Link to="/membership" className="mt-6 self-start px-5 py-2.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white font-semibold">Get {prime.name}</Link>
            </article>
          )}
        </div>
      </div>
    </section>
  );
};

export default RewardsMembership;
