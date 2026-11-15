import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Award, Gift, BedDouble, Star, Clock, ArrowDownLeft, ArrowUpRight, Crown, Sparkles, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { getRewardsProgram, getMyRewards, getRewardsHistory } from '../services/api';

/**
 * Zivo Rewards for guests: balance and tier for members, how earning and using points works,
 * the tiers and their benefits, and the points history. Logged-out visitors see the program.
 */
const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;
const TIER_STYLE = {
  BLUE: 'from-sky-600 to-blue-800',
  SILVER: 'from-slate-500 to-slate-700',
  GOLD: 'from-amber-500 to-orange-600',
};
const TYPE_LABEL = { EARN: 'Stay', REDEEM: 'Used', BONUS: 'Bonus', ADJUST: 'Adjustment', EXPIRE: 'Expired' };

const Rewards = () => {
  const { isAuthenticated, user } = useAuth();
  const [program, setProgram] = useState(null);
  const [me, setMe] = useState(null);
  const [history, setHistory] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    getRewardsProgram().then(setProgram).catch(() => setError('Zivo Rewards is not available right now.'));
    if (isAuthenticated) {
      getMyRewards().then(setMe).catch(() => {});
      getRewardsHistory().then(setHistory).catch(() => {});
    }
  }, [isAuthenticated]);

  const p = me?.program || program;
  const enabled = me ? me.enabled : program?.enabled;
  const isMember = isAuthenticated && user?.role === 'CUSTOMER' && me;
  const tierId = me?.tier?.id || 'BLUE';

  return (
    <div className="pt-24 pb-20 bg-gray-50 min-h-screen">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        <div>
          <p className="text-brand-600 font-bold uppercase tracking-wider text-sm flex items-center gap-1.5"><Award size={16} /> Zivo Rewards</p>
          <h1 className="text-3xl md:text-4xl font-black text-gray-900 tracking-tight mt-1">Earn points on every stay. Use them on the next.</h1>
          {p && <p className="text-gray-500 mt-2 text-lg">{p.earnPointsPer100} point{p.earnPointsPer100 === 1 ? '' : 's'} per ₹100 you spend, each worth {inr(p.pointValue)} off a future booking.</p>}
        </div>
        {error && <p className="text-red-600">{error}</p>}
        {p && enabled === false && <p className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-sm">Zivo Rewards is paused at the moment. Your points are safe.</p>}

        {/* Member card */}
        {isMember ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <div className={`lg:col-span-2 rounded-3xl p-6 md:p-8 text-white bg-gradient-to-br ${TIER_STYLE[tierId] || 'from-gray-700 to-gray-900'} shadow-xl`}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest opacity-80">{me.tier.name} member</p>
                  <p className="text-5xl font-black mt-2">{me.available.toLocaleString('en-IN')}</p>
                  <p className="text-sm opacity-90">points available · worth {inr(me.value)}</p>
                </div>
                <Crown size={36} className="opacity-80" />
              </div>
              <div className="mt-6 grid grid-cols-3 gap-4 text-sm">
                <div><p className="opacity-70 text-xs">Pending</p><p className="font-bold">{me.pending.toLocaleString('en-IN')} pts</p><p className="opacity-60 text-[11px]">available after check-out</p></div>
                <div><p className="opacity-70 text-xs">Earned so far</p><p className="font-bold">{me.lifetimeEarned.toLocaleString('en-IN')} pts</p></div>
                <div><p className="opacity-70 text-xs">Used so far</p><p className="font-bold">{me.lifetimeUsed.toLocaleString('en-IN')} pts</p></div>
              </div>
              {me.expiringSoon && (
                <p className="mt-5 inline-flex items-center gap-2 bg-white/15 rounded-full px-3 py-1.5 text-xs font-semibold">
                  <Clock size={13} /> {me.expiringSoon.points.toLocaleString('en-IN')} points expire on {new Date(me.expiringSoon.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}. Use them at checkout.
                </p>
              )}
            </div>
            <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm space-y-3">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Your tier</p>
              <p className="text-2xl font-black text-gray-900">{me.tier.name}</p>
              <p className="text-sm text-gray-600">{me.nights} night{me.nights === 1 ? '' : 's'} · {inr(me.spend)} in the last {p.tierWindowMonths} months</p>
              {me.next ? (
                <>
                  <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                    <div className="h-full bg-brand-600" style={{ width: `${Math.min(100, Math.max(me.next.minNights ? (me.nights / me.next.minNights) * 100 : 0, me.next.minSpend ? (me.spend / me.next.minSpend) * 100 : 0))}%` }} />
                  </div>
                  <p className="text-sm text-gray-700">
                    <strong>{me.next.nightsToGo} more night{me.next.nightsToGo === 1 ? '' : 's'}</strong> or <strong>{inr(me.next.spendToGo)}</strong> more to reach <strong>{me.next.name}</strong> ({me.next.multiplier}× points).
                  </p>
                </>
              ) : <p className="text-sm text-green-700 font-semibold">You&apos;re at our top tier. Thank you!</p>}
              <Link to="/hotels" className="inline-block mt-2 text-sm font-bold text-brand-600 hover:text-brand-700">Find your next stay →</Link>
            </div>
          </div>
        ) : !isAuthenticated ? (
          <div className="bg-white rounded-3xl p-6 md:p-8 border border-gray-100 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <p className="text-xl font-black text-gray-900">Join free when you create an account</p>
              <p className="text-gray-500">{p?.signupBonusPoints ? `Get ${p.signupBonusPoints} welcome points. ` : ''}Every completed stay earns points automatically.</p>
            </div>
            <div className="flex gap-3">
              <Link to="/signup" className="px-6 py-3 rounded-full bg-brand-600 hover:bg-brand-700 text-white font-bold">Sign up</Link>
              <Link to="/login" className="px-6 py-3 rounded-full border border-gray-300 font-bold text-gray-700">Log in</Link>
            </div>
          </div>
        ) : user?.role !== 'CUSTOMER' ? (
          <p className="p-4 bg-gray-100 rounded-xl text-sm text-gray-600">Zivo Rewards is for guest accounts. You&apos;re signed in as {user?.role?.toLowerCase()}.</p>
        ) : null}

        {/* How it works */}
        {p && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {[
              { icon: BedDouble, title: 'Earn on stays', text: `${p.earnPointsPer100} point${p.earnPointsPer100 === 1 ? '' : 's'} per ₹100 of the room price (before GST), more at higher tiers. Points show as pending until you check out.` },
              { icon: Gift, title: 'Use at checkout', text: `Tick "Use my points" when you book. ${p.minRedeemPoints} points minimum, up to ${p.maxRedeemPercent}% of the room price. Cancel the booking and your points come back.${p.expiryMonths ? ` Points expire ${p.expiryMonths} months after they're added; we use your oldest points first and remind you 30 days before.` : ' Points don\'t expire.'}` },
              { icon: Star, title: 'Bonus points', text: p.reviewBonusPoints ? `${p.reviewBonusPoints} points when your review of a stay is published.` : 'Watch for bonus offers.' },
            ].map((c) => (
              <div key={c.title} className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
                <c.icon className="text-brand-600" size={26} />
                <h3 className="font-bold text-gray-900 mt-3">{c.title}</h3>
                <p className="text-sm text-gray-600 mt-1 leading-relaxed">{c.text}</p>
              </div>
            ))}
          </div>
        )}

        {/* Tiers */}
        {p && (
          <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-gray-100">
              <h2 className="text-xl font-bold text-gray-900">Tiers</h2>
              <p className="text-sm text-gray-500">Based on completed stays in the last {p.tierWindowMonths} months: reach the nights <em>or</em> the spend.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-gray-100">
              {p.tiers.map((t, i) => (
                <div key={t.id} className={`p-6 ${me?.tier?.id === t.id ? 'bg-brand-50/50' : ''}`}>
                  <div className="flex items-center justify-between">
                    <p className="text-lg font-black text-gray-900">{t.name}</p>
                    {me?.tier?.id === t.id && <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-brand-600 text-white">You</span>}
                  </div>
                  <p className="text-sm text-gray-500 mt-1">{i === 0 ? 'Every member' : `${t.minNights}+ nights or ${inr(t.minSpend)}+`}</p>
                  <ul className="mt-4 space-y-2 text-sm text-gray-700">
                    <li className="flex gap-2"><CheckCircle2 size={16} className="text-green-600 shrink-0 mt-0.5" /> {t.multiplier}× points ({Math.round(p.earnPointsPer100 * t.multiplier * 100) / 100} per ₹100)</li>
                    <li className="flex gap-2"><CheckCircle2 size={16} className="text-green-600 shrink-0 mt-0.5" /> Use points on any Zivo hotel</li>
                  </ul>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* History */}
        {isMember && (
          <div className="bg-white rounded-3xl border border-gray-100 shadow-sm">
            <div className="p-6 border-b border-gray-100 flex items-center gap-2"><Clock size={18} className="text-gray-400" /><h2 className="text-xl font-bold text-gray-900">Points history</h2></div>
            {history.length === 0 ? (
              <p className="p-6 text-sm text-gray-500 flex items-center gap-2"><Sparkles size={16} className="text-brand-500" /> Your first points arrive with your first booking.</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {history.map((h) => (
                  <li key={h.id} className="px-6 py-4 flex items-center gap-4">
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center ${h.points > 0 ? 'bg-green-50 text-green-600' : h.type === 'EXPIRE' ? 'bg-amber-50 text-amber-600' : 'bg-gray-100 text-gray-500'}`}>
                      {h.points > 0 ? <ArrowDownLeft size={16} /> : <ArrowUpRight size={16} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900">{h.description || TYPE_LABEL[h.type]}{h.booking?.hotel ? ` · ${h.booking.hotel}` : ''}</p>
                      <p className="text-xs text-gray-500">{new Date(h.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} · {TYPE_LABEL[h.type] || h.type}</p>
                    </div>
                    <div className="text-right">
                      <p className={`font-bold ${h.status === 'REVERSED' ? 'text-gray-400 line-through' : h.points > 0 ? 'text-green-700' : 'text-gray-900'}`}>{h.points > 0 ? '+' : ''}{h.points.toLocaleString('en-IN')}</p>
                      <p className="text-[11px] text-gray-500">{h.status === 'PENDING' ? 'Pending' : h.status === 'REVERSED' ? (h.type === 'REDEEM' ? 'Returned' : 'Cancelled') : ''}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default Rewards;
