import { useState, useEffect, useCallback } from 'react';
import { Crown, Users, Percent, Loader2 } from 'lucide-react';
import { extranetGet, extranetPut } from '../../services/extranetApi';
import { useExtranet } from '../context/ExtranetContext';

/**
 * Extranet -> Member Prices: the property's discount for ZivoHotels members (signed-in guests).
 * Members see the lower price in search, on the hotel page and at checkout. The property funds
 * this discount (commission and payout are on the discounted price). Paid-plan members (e.g. Zivo
 * Prime) may get an extra discount on top, paid for by ZivoHotels.
 */
const inr = (n) => `₹${Math.round(Number(n || 0)).toLocaleString('en-IN')}`;

const ExtranetMembership = () => {
  const { hotelId, property, addToast } = useExtranet();
  const [data, setData] = useState(null);
  const [pct, setPct] = useState(0);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await extranetGet('/membership');
      setData(d);
      setPct(d.memberDiscountPercent);
    } catch (e) { addToast(e.message, 'error'); }
  }, [addToast]);
  useEffect(() => { if (hotelId) load(); }, [load, hotelId]);

  const save = async (value) => {
    setSaving(true);
    try {
      await extranetPut('/membership', { memberDiscountPercent: value });
      addToast(value > 0 ? `Member price on: ${value}% off for members` : 'Member price turned off', 'success');
      load();
    } catch (e) { addToast(e.message, 'error'); } finally { setSaving(false); }
  };

  if (!data) return <div className="flex h-64 items-center justify-center"><Loader2 className="animate-spin text-brand-600" size={32} /></div>;
  const on = data.memberDiscountPercent > 0;
  const example = 5000;

  return (
    <div className="space-y-6 pb-12 max-w-4xl">
      <div>
        <h1 className="text-3xl font-black text-gray-900 tracking-tight flex items-center gap-2"><Crown size={28} className="text-amber-500" /> Member Prices</h1>
        <p className="text-gray-500 font-medium mt-1">Offer ZivoHotels members a lower price at {property?.name || 'your property'}. Members are guests signed in to their account.</p>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-bold text-gray-900">Member discount</p>
            <p className="text-sm text-gray-500">{on ? `Members get ${data.memberDiscountPercent}% off every room and rate plan.` : 'Not offered yet.'}</p>
          </div>
          <span className={`px-3 py-1 rounded-full text-xs font-bold ${on ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{on ? 'ON' : 'OFF'}</span>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <input type="range" aria-label="Member discount percent" min="0" max="30" step="1" value={pct} onChange={(e) => setPct(Number(e.target.value))} className="flex-1 min-w-[200px] accent-brand-600" />
          <span className="text-2xl font-black text-gray-900 w-20 text-right">{pct}%</span>
          <button type="button" disabled={saving || pct === data.memberDiscountPercent} onClick={() => save(pct)} className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-sm font-bold disabled:opacity-40">Save</button>
          {on && <button type="button" disabled={saving} onClick={() => save(0)} className="px-3 py-2 text-sm font-semibold text-gray-500 hover:text-red-600">Turn off</button>}
        </div>
        <p className="text-sm text-gray-600 bg-gray-50 rounded-lg p-3">
          Example: a {inr(example)} room is {inr(example * (1 - pct / 100))} for members. You fund this discount; commission and your payout are on the member price.
          Zivo Prime members may get an extra discount on top, which ZivoHotels pays for: your payout isn&apos;t reduced by it.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { icon: Users, k: 'Member bookings', v: data.stats.bookings },
          { icon: Crown, k: 'From paid members', v: data.stats.paidMemberBookings },
          { icon: Percent, k: 'Member discount given', v: inr(data.stats.discountGiven) },
        ].map((s) => (
          <div key={s.k} className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1.5"><s.icon size={14} /> {s.k}</p>
            <p className="text-2xl font-black text-gray-900 mt-1">{s.v}</p>
          </div>
        ))}
      </div>
      <p className="text-xs text-gray-500">Bookings from paid members are marked for priority support in your bookings list.</p>
    </div>
  );
};

export default ExtranetMembership;
