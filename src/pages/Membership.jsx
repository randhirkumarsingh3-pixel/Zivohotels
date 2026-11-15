import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Crown, Check, X, Percent, Award, CalendarX, Headphones, Tag, Loader2, Wallet } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { getMembershipPlans, getMyMembership, buyMembership, verifyMembership, getMyWallet } from '../services/api';
import usePageTitle from '../hooks/usePageTitle';

/**
 * Membership: the free Member plan every guest account has, and paid plans (e.g. Zivo Prime) with
 * bigger benefits. Shows the guest's plan, savings so far and history, and lets them buy or renew
 * a plan with Zivo Cash or online.
 */
const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

const benefitRows = (b) => [
  { icon: Percent, label: 'Member prices at hotels that offer them', on: b.hotelMemberRates },
  { icon: Percent, label: b.zivoDiscountPercent ? `Extra ${b.zivoDiscountPercent}% off every stay${b.zivoDiscountMax ? ` (up to ${inr(b.zivoDiscountMax)})` : ''}` : 'Extra discount on every stay', on: b.zivoDiscountPercent > 0 },
  { icon: Award, label: b.pointsMultiplier > 1 ? `${b.pointsMultiplier}× Zivo Rewards points` : 'Extra Zivo Rewards points', on: b.pointsMultiplier > 1 },
  { icon: Tag, label: 'Member-only offers', on: b.memberOffers },
  { icon: CalendarX, label: b.freeCancelExtraHours ? `Free cancellation ${b.freeCancelExtraHours} hours longer than the hotel's policy` : 'Longer free cancellation', on: b.freeCancelExtraHours > 0 },
  { icon: Headphones, label: 'Priority support', on: b.prioritySupport },
];

const loadRazorpay = () => new Promise((resolve) => {
  if (window.Razorpay) return resolve(true);
  const s = document.createElement('script');
  s.src = 'https://checkout.razorpay.com/v1/checkout.js';
  s.onload = () => resolve(true);
  s.onerror = () => resolve(false);
  document.body.appendChild(s);
});

const Membership = () => {
  usePageTitle('Membership');
  const { isAuthenticated, user } = useAuth();
  const [plans, setPlans] = useState([]);
  const [me, setMe] = useState(null);
  const [wallet, setWallet] = useState(0);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState(null);
  const isGuest = isAuthenticated && user?.role === 'CUSTOMER';

  const load = useCallback(() => {
    getMembershipPlans().then(setPlans).catch(() => {});
    if (isGuest) {
      getMyMembership().then(setMe).catch(() => {});
      getMyWallet().then((w) => setWallet(w?.balance || 0)).catch(() => {});
    }
  }, [isGuest]);
  useEffect(() => { load(); }, [load]);

  const buy = async (plan, method) => {
    setBusy(`${plan.id}-${method}`); setMsg(null);
    try {
      if (method === 'WALLET') {
        await buyMembership(plan.id, 'WALLET');
        setMsg({ ok: true, text: `Welcome to ${plan.name}! Your benefits apply to your next booking.` });
        load();
        return;
      }
      const { membershipId, order } = await buyMembership(plan.id, 'ONLINE');
      if (!(await loadRazorpay())) throw new Error('Could not load the payment window. Check your connection.');
      new window.Razorpay({
        key: import.meta.env.VITE_RAZORPAY_KEY_ID, amount: order.amount, currency: order.currency, order_id: order.id,
        name: 'ZivoHotels', description: `${plan.name} membership`,
        handler: async (r) => {
          try {
            await verifyMembership({ membershipId, ...r });
            setMsg({ ok: true, text: `Welcome to ${plan.name}! Your benefits apply to your next booking.` });
            load();
          } catch (e) { setMsg({ ok: false, text: e.message }); }
        },
        theme: { color: '#e11d48' },
      }).open();
    } catch (e) {
      setMsg({ ok: false, text: e.message || 'Could not complete the purchase' });
    } finally {
      setBusy('');
    }
  };

  const current = me?.current;
  return (
    <div className="pt-24 pb-20 bg-gray-50 min-h-screen">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        <div>
          <p className="text-brand-700 font-bold uppercase tracking-wider text-sm flex items-center gap-1.5"><Crown size={16} /> Membership</p>
          <h1 className="text-3xl md:text-4xl font-black text-gray-900 tracking-tight mt-1">Member prices, extra savings, more flexibility</h1>
        </div>

        {current && (
          <div className={`rounded-3xl p-6 md:p-8 text-white shadow-xl ${current.isPaid ? 'bg-gradient-to-br from-amber-500 to-orange-700' : 'bg-gradient-to-br from-gray-800 to-gray-900'}`}>
            <p className="text-xs font-bold uppercase tracking-widest opacity-80">Your plan</p>
            <p className="text-3xl font-black mt-1 flex items-center gap-2">{current.isPaid && <Crown size={26} />} {current.plan.name}</p>
            {current.isPaid ? (
              <p className="text-sm opacity-90 mt-1">Active until {new Date(me.renewsTo || current.endsAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}{me.renewsTo ? ' (renewal included)' : ''}</p>
            ) : <p className="text-sm opacity-80 mt-1">Free with your account. Upgrade for bigger savings.</p>}
            {me.savings?.bookings > 0 && <p className="mt-4 inline-block bg-white/15 rounded-full px-3 py-1 text-sm font-semibold">You&apos;ve saved {inr(me.savings.total)} on {me.savings.bookings} booking{me.savings.bookings === 1 ? '' : 's'} as a member</p>}
          </div>
        )}
        {msg && <p role={msg.ok ? 'status' : 'alert'} className={`p-3 rounded-xl text-sm border ${msg.ok ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-700'}`}>{msg.text}</p>}

        <div className={`grid grid-cols-1 ${plans.length > 1 ? 'md:grid-cols-2' : ''} gap-5`}>
          {plans.map((p) => {
            const isCurrent = current?.plan?.id === p.id;
            return (
              <div key={p.id} className={`bg-white rounded-3xl border shadow-sm p-6 flex flex-col ${p.isFree ? 'border-gray-200' : 'border-amber-300 ring-1 ring-amber-200'}`}>
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xl font-black text-gray-900 flex items-center gap-2">{!p.isFree && <Crown size={20} className="text-amber-500" />}{p.name}</p>
                    {p.description && <p className="text-sm text-gray-500">{p.description}</p>}
                  </div>
                  {isCurrent && <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-gray-900 text-white">Your plan</span>}
                </div>
                <p className="text-3xl font-black text-gray-900 mt-4">{p.isFree ? 'Free' : inr(p.price)}<span className="text-sm font-medium text-gray-500">{p.isFree ? '' : ` / ${p.durationDays === 365 ? 'year' : `${p.durationDays} days`}`}</span></p>
                {!p.isFree && <p className="text-xs text-gray-400">Price includes GST</p>}
                <ul className="mt-5 space-y-2.5 flex-1">
                  {benefitRows(p.benefits).map((b) => (
                    <li key={b.label} className={`flex gap-2 text-sm ${b.on ? 'text-gray-800' : 'text-gray-400'}`}>
                      {b.on ? <Check size={16} className="text-green-700 shrink-0 mt-0.5" /> : <X size={16} className="shrink-0 mt-0.5" />} {b.label}
                    </li>
                  ))}
                </ul>
                <div className="mt-6 space-y-2">
                  {p.isFree ? (
                    !isAuthenticated ? <Link to="/signup" className="block text-center px-4 py-3 rounded-xl bg-gray-900 text-white font-bold">Create a free account</Link>
                      : <p className="text-center text-sm text-gray-500">Included with your account</p>
                  ) : !isAuthenticated ? (
                    <Link to="/login" className="block text-center px-4 py-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold">Log in to join</Link>
                  ) : !isGuest ? (
                    <p className="text-center text-sm text-gray-500">Membership is for guest accounts</p>
                  ) : (
                    <>
                      <button type="button" disabled={!!busy} onClick={() => buy(p, 'ONLINE')} className="w-full px-4 py-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold disabled:opacity-50 flex items-center justify-center gap-2">
                        {busy === `${p.id}-ONLINE` && <Loader2 size={16} className="animate-spin" />}{isCurrent ? 'Renew' : 'Join'} for {inr(p.price)}
                      </button>
                      {wallet >= p.price && (
                        <button type="button" disabled={!!busy} onClick={() => buy(p, 'WALLET')} className="w-full px-4 py-2.5 rounded-xl border border-gray-300 font-semibold text-gray-800 disabled:opacity-50 flex items-center justify-center gap-2">
                          <Wallet size={15} /> Pay with Zivo Cash ({inr(wallet)} available)
                        </button>
                      )}
                      {isCurrent && <p className="text-center text-xs text-gray-400">Renewing adds {p.durationDays} days after your current period.</p>}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {me?.history?.length > 0 && (
          <div className="bg-white rounded-3xl border border-gray-100 shadow-sm">
            <h2 className="p-6 pb-3 text-lg font-bold text-gray-900">Membership history</h2>
            <ul className="divide-y divide-gray-100">
              {me.history.map((h) => (
                <li key={h.id} className="px-6 py-3 flex justify-between text-sm">
                  <div><p className="font-semibold text-gray-900">{h.plan}</p><p className="text-xs text-gray-500">{h.startsAt ? `${new Date(h.startsAt).toLocaleDateString('en-IN')} – ${new Date(h.endsAt).toLocaleDateString('en-IN')}` : ''} · {h.status.toLowerCase()}</p></div>
                  <p className="text-gray-700">{h.paymentMethod === 'ADMIN' ? 'Gift from ZivoHotels' : `${inr(h.pricePaid)} · ${h.paymentMethod === 'WALLET' ? 'Zivo Cash' : 'online'}`}</p>
                </li>
              ))}
            </ul>
          </div>
        )}
        <p className="text-xs text-gray-400">Member prices are set by each hotel. The extra discount, extra points and longer free cancellation are paid for by ZivoHotels. Non-refundable rates stay non-refundable.</p>
      </div>
    </div>
  );
};

export default Membership;
