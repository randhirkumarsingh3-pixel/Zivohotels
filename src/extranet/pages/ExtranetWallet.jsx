import { useState, useEffect, useCallback } from 'react';
import { Wallet, Clock, CheckCircle2, AlertTriangle, Banknote, Download, Loader2 } from 'lucide-react';
import { extranetGet } from '../../services/extranetApi';
import { useExtranet } from '../context/ExtranetContext';

/**
 * Extranet -> Wallet: the property's money with ZivoHotels, worked out from its settlements and
 * payouts. On hold until the payout date, ready to pay, owed to Zivo (commission on pay-at-hotel
 * stays, netted against payouts), paid out, and a statement with a running balance (CSV download).
 */
const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const STATUS = { ON_HOLD: ['On hold', 'bg-amber-50 text-amber-700'], READY: ['Ready', 'bg-blue-50 text-blue-700'], PAID: ['Paid', 'bg-green-50 text-green-700'] };

const ExtranetWallet = () => {
  const { hotelId, property, addToast } = useExtranet();
  const [data, setData] = useState(null);
  const [range, setRange] = useState({ from: '', to: '' });

  const load = useCallback(async () => {
    try {
      const q = new URLSearchParams(Object.fromEntries(Object.entries(range).filter(([, v]) => v)));
      setData(await extranetGet(`/wallet?${q}`));
    } catch (e) { addToast(e.message, 'error'); }
  }, [range, addToast]);
  useEffect(() => { if (hotelId) load(); }, [load, hotelId]);

  const downloadCsv = () => {
    const rows = [['Date', 'Type', 'Description', 'Details', 'Gross', 'Commission & taxes', 'Amount', 'Balance', 'Status']];
    data.statement.forEach((e) => rows.push([
      new Date(e.date).toLocaleDateString('en-IN'), e.kind === 'PAYOUT' ? 'Payout' : 'Settlement', e.title, e.detail || '',
      e.gross ?? '', e.deductions ?? '', e.amount, e.balance, STATUS[e.status]?.[0] || e.status,
    ]));
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: `zivo-statement-${(property?.name || 'property').replace(/\W+/g, '-').toLowerCase()}.csv` });
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!data) return <div className="flex h-64 items-center justify-center"><Loader2 className="animate-spin text-brand-600" size={32} /></div>;
  const cards = [
    { icon: Clock, label: 'On hold', value: data.onHold, sub: data.nextPayoutDate ? `Next payout ${new Date(data.nextPayoutDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : 'Released after check-out, per your payout cycle', cls: 'text-amber-600' },
    { icon: CheckCircle2, label: 'Ready to pay', value: data.ready, sub: 'Included in the next payout', cls: 'text-blue-600' },
    { icon: AlertTriangle, label: 'Owed to ZivoHotels', value: data.owed, sub: 'Commission on stays paid at the hotel; deducted from payouts', cls: data.owed > 0 ? 'text-red-600' : 'text-gray-900' },
    { icon: Banknote, label: 'Paid out', value: data.paidOut, sub: 'Total paid to your bank account', cls: 'text-green-700' },
  ];

  return (
    <div className="space-y-6 pb-12">
      <div>
        <h1 className="text-3xl font-black text-gray-900 tracking-tight flex items-center gap-2"><Wallet size={28} className="text-brand-600" /> Wallet</h1>
        <p className="text-gray-500 font-medium mt-1">What {property?.name || 'your property'} has earned through ZivoHotels, after commission and taxes.</p>
      </div>

      <div className="bg-gray-900 text-white rounded-2xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-gray-400">Balance</p>
          <p className={`text-4xl font-black mt-1 ${data.balance < 0 ? 'text-red-300' : ''}`}>{data.balance < 0 ? '−' : ''}{inr(Math.abs(data.balance))}</p>
          <p className="text-sm text-gray-400">{data.balance < 0 ? 'You owe ZivoHotels this amount; it is deducted from your next payouts.' : 'On hold + ready, minus anything owed to ZivoHotels.'}</p>
        </div>
        <p className="text-xs text-gray-400 md:text-right">Earned so far: <span className="text-white font-bold">{inr(data.lifetimeEarned)}</span></p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((c) => (
          <div key={c.label} className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1.5"><c.icon size={14} /> {c.label}</p>
            <p className={`text-2xl font-black mt-1 ${c.cls}`}>{inr(c.value)}</p>
            <p className="text-xs text-gray-500 mt-1">{c.sub}</p>
          </div>
        ))}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl shadow-sm">
        <div className="p-4 border-b border-gray-100 flex flex-wrap items-center gap-3 justify-between">
          <h2 className="font-bold text-gray-900">Statement</h2>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <label className="flex items-center gap-1 text-gray-600">From <input type="date" aria-label="From" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} className="px-2 py-1.5 border border-gray-200 rounded-lg" /></label>
            <label className="flex items-center gap-1 text-gray-600">To <input type="date" aria-label="To" value={range.to} min={range.from} onChange={(e) => setRange({ ...range, to: e.target.value })} className="px-2 py-1.5 border border-gray-200 rounded-lg" /></label>
            <button type="button" onClick={downloadCsv} disabled={!data.statement.length} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40"><Download size={14} /> CSV</button>
          </div>
        </div>
        {data.statement.length === 0 ? (
          <p className="p-6 text-sm text-gray-500">No entries yet. Each stay is added here after check-out; payouts are shown as they are made.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-gray-500 bg-gray-50"><th className="px-4 py-2">Date</th><th className="px-4 py-2">Description</th><th className="px-4 py-2 text-right">Gross</th><th className="px-4 py-2 text-right">Commission & taxes</th><th className="px-4 py-2 text-right">Amount</th><th className="px-4 py-2 text-right">Balance</th><th className="px-4 py-2">Status</th></tr></thead>
              <tbody>
                {data.statement.map((e) => (
                  <tr key={`${e.kind}-${e.id}`} className="border-t border-gray-100">
                    <td className="px-4 py-2.5 whitespace-nowrap text-gray-600">{new Date(e.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                    <td className="px-4 py-2.5"><p className="font-semibold text-gray-900">{e.title}</p>{e.detail && <p className="text-xs text-gray-500">{e.detail}</p>}</td>
                    <td className="px-4 py-2.5 text-right text-gray-600">{e.gross != null ? inr(e.gross) : ''}</td>
                    <td className="px-4 py-2.5 text-right text-gray-600">{e.deductions != null ? `−${inr(e.deductions)}` : ''}</td>
                    <td className={`px-4 py-2.5 text-right font-bold ${e.amount < 0 ? 'text-gray-900' : 'text-green-700'}`}>{e.amount < 0 ? '−' : '+'}{inr(Math.abs(e.amount))}</td>
                    <td className="px-4 py-2.5 text-right text-gray-600">{inr(e.balance)}</td>
                    <td className="px-4 py-2.5"><span className={`px-2 py-0.5 rounded text-[11px] font-bold ${STATUS[e.status]?.[1] || ''}`}>{STATUS[e.status]?.[0] || e.status}</span>{e.status === 'ON_HOLD' && e.payoutOn && <span className="block text-[11px] text-gray-400">pays {new Date(e.payoutOn).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default ExtranetWallet;
