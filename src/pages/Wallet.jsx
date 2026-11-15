import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Wallet as WalletIcon, ArrowDownLeft, ArrowUpRight, ShieldCheck, Zap, Info } from 'lucide-react';
import { getMyWallet } from '../services/api';

/**
 * Zivo Cash: the guest's wallet. Balance, how it works, and every movement with the balance after
 * it. Money comes from refunds the guest chose to take as Zivo Cash and from ZivoHotels credits;
 * it is spent at checkout. It can't be topped up, withdrawn or transferred.
 */
const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

const Wallet = () => {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { getMyWallet().then(setData).catch((e) => setError(e.message || 'Could not load your Zivo Cash')); }, []);

  return (
    <div className="pt-24 pb-20 bg-gray-50 min-h-screen">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        <div>
          <p className="text-brand-600 font-bold uppercase tracking-wider text-sm flex items-center gap-1.5"><WalletIcon size={16} /> Zivo Cash</p>
          <h1 className="text-3xl md:text-4xl font-black text-gray-900 tracking-tight mt-1">Your wallet</h1>
        </div>
        {error && <p className="text-red-600">{error}</p>}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <div className="md:col-span-2 rounded-3xl p-6 md:p-8 text-white bg-gradient-to-br from-navy-950 via-navy-900 to-navy-800 shadow-xl">
            <p className="text-xs font-bold uppercase tracking-widest opacity-70">Available balance</p>
            <p className="text-5xl font-black mt-2">{data ? inr(data.balance) : '…'}</p>
            <p className="text-sm opacity-80 mt-2">Use it at checkout: tick &ldquo;Pay with Zivo Cash&rdquo;.</p>
            <Link to="/hotels" className="inline-block mt-6 px-5 py-2.5 rounded-full bg-white text-gray-900 text-sm font-bold">Book a stay</Link>
          </div>
          <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm space-y-3 text-sm text-gray-600">
            <p className="flex gap-2"><Zap size={16} className="text-brand-600 shrink-0 mt-0.5" /> Choose Zivo Cash when you cancel and your refund arrives instantly.</p>
            <p className="flex gap-2"><ShieldCheck size={16} className="text-brand-600 shrink-0 mt-0.5" /> If a booking paid with Zivo Cash is cancelled, that amount comes back here.</p>
            <p className="flex gap-2"><Info size={16} className="text-gray-400 shrink-0 mt-0.5" /> Zivo Cash can only be used for ZivoHotels bookings. It can&apos;t be topped up, withdrawn to a bank or transferred.</p>
          </div>
        </div>

        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm">
          <div className="p-6 border-b border-gray-100"><h2 className="text-xl font-bold text-gray-900">Transactions</h2></div>
          {!data ? <p className="p-6 text-sm text-gray-400">Loading…</p> : data.transactions.length === 0 ? (
            <p className="p-6 text-sm text-gray-500">No Zivo Cash yet. When you cancel a booking you can choose to get the refund here instantly.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {data.transactions.map((t) => (
                <li key={t.id} className="px-6 py-4 flex items-center gap-4">
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center ${t.type === 'CREDIT' ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-500'}`}>
                    {t.type === 'CREDIT' ? <ArrowDownLeft size={16} /> : <ArrowUpRight size={16} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900">{t.description || t.label}{t.booking?.hotel ? ` · ${t.booking.hotel}` : ''}</p>
                    <p className="text-xs text-gray-500">{new Date(t.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })} · {t.label}</p>
                  </div>
                  <div className="text-right">
                    <p className={`font-bold ${t.type === 'CREDIT' ? 'text-green-700' : 'text-gray-900'}`}>{t.type === 'CREDIT' ? '+' : '−'}{inr(t.amount)}</p>
                    {t.balanceAfter != null && <p className="text-[11px] text-gray-400">Balance {inr(t.balanceAfter)}</p>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};

export default Wallet;
