import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Wallet, Award, Crown, ArrowRight } from 'lucide-react';
import { getMyWallet, getMyRewards, getMyMembership } from '../../services/api';

/**
 * "Your ZivoPlus" on the home page for signed-in guests: Zivo Cash to spend, Zivo Rewards tier and
 * points (and what the next tier needs), and their membership with its main benefit, each with the
 * next thing to do. Live figures; a card whose figures can't load shows its general line instead.
 */
const inr = (n) => `₹${Math.round(Number(n) || 0).toLocaleString('en-IN')}`;
const num = (n) => Math.round(Number(n) || 0).toLocaleString('en-IN');

const Card = ({ Icon, tone, label, value, line, to, cta }) => (
  <Link to={to} className="group bg-white rounded-2xl border border-gray-200 p-5 flex items-start gap-4 hover:border-navy-300 hover:shadow-md transition">
    <span className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${tone === 'red' ? 'bg-brand-50 text-brand-600' : tone === 'gold' ? 'bg-amber-50 text-amber-600' : 'bg-navy-50 text-navy-800'}`}><Icon size={22} aria-hidden="true" /></span>
    <span className="min-w-0 flex-1">
      <span className="block text-xs font-bold uppercase tracking-wider text-gray-500">{label}</span>
      <span className="block text-xl font-black text-navy-900 mt-0.5 truncate">{value}</span>
      <span className="block text-sm text-gray-600 mt-0.5">{line}</span>
      <span className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-brand-600">{cta}<ArrowRight size={14} className="group-hover:translate-x-0.5 transition-transform" aria-hidden="true" /></span>
    </span>
  </Link>
);

const YourZivoPlus = ({ name }) => {
  const [d, setD] = useState(null);
  useEffect(() => {
    let live = true;
    Promise.allSettled([getMyWallet(), getMyRewards(), getMyMembership()]).then(([w, r, m]) => {
      if (live) setD({ wallet: w.value, rewards: r.value, membership: m.value?.current });
    });
    return () => { live = false; };
  }, []);
  if (!d) return null;
  const r = d.rewards; const plan = d.membership?.plan;
  const toNext = r?.next ? [r.next.nightsToGo > 0 && `${r.next.nightsToGo} night${r.next.nightsToGo === 1 ? '' : 's'}`, r.next.spendToGo > 0 && inr(r.next.spendToGo)].filter(Boolean).join(' or ') : '';
  const pct = plan?.benefits?.zivoDiscountPercent;
  return (
    <section className="py-10 bg-gray-50 border-b border-gray-100" aria-labelledby="yz-h">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <h2 id="yz-h" className="text-2xl font-bold text-navy-900">Your ZivoPlus{name ? `, ${name}` : ''}</h2>
        <p className="text-gray-600 mt-1 mb-5">What you have to spend and save on your next stay.</p>
        <div className="grid gap-4 md:grid-cols-3">
          <Card Icon={Wallet} label="Zivo Cash" value={d.wallet ? `${inr(d.wallet.balance)} to spend` : 'Zivo Cash'}
            line={Number(d.wallet?.balance) > 0 ? 'Use it at checkout on any booking.' : 'Refunds land here instantly; use them on any booking.'} to="/wallet" cta="View Zivo Cash" />
          <Card Icon={Award} tone="red" label="Zivo Rewards" value={r ? `${r.tier?.name || 'Member'} · ${num(r.available)} points` : 'Zivo Rewards'}
            line={r?.next ? `${toNext} more to reach ${r.next.name}.` : r ? 'You are in the top tier.' : 'Points on every stay.'} to="/rewards" cta="How to earn more" />
          <Card Icon={Crown} tone="gold" label="Membership" value={plan ? plan.name : 'Membership'}
            line={plan && !plan.isFree ? `${pct ? `Extra ${pct}% off every stay` : 'Member benefits'}${d.membership?.expiresAt ? ` until ${new Date(d.membership.expiresAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}.` : `${pct ? `${pct}% member price on every stay. ` : ''}Upgrade for more savings.`}
            to="/membership" cta={plan && !plan.isFree ? 'Your benefits' : 'See plans'} />
        </div>
      </div>
    </section>
  );
};

export default YourZivoPlus;
