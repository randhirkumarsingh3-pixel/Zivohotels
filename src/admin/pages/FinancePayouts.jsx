import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Banknote, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { adminFinanceApi } from '../../services/api';
import usePageTitle from '../../hooks/usePageTitle';
import useAccess from '../../hooks/useAccess';

/**
 * Admin → Finance → Payouts: what each hotel is owed now (its payout date has come), what is on
 * hold until a later payout date, and the payout history. A payout is recorded with the bank
 * transfer reference (UTR) after the money is sent; it marks the due stays as paid and tells the
 * hotel. (Automatic RazorpayX payouts come later.)
 */
const inr = (v) => `${Number(v) < 0 ? '−' : ''}₹${Math.abs(Number(v || 0)).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const day = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }) : '–');

const FinancePayouts = () => {
  usePageTitle('Payouts');
  const { can } = useAccess();
  const canPay = can('finance.manage');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [paying, setPaying] = useState(null); // { hotel, due, ref, busy, error }
  const [notice, setNotice] = useState('');

  const load = useCallback(() => adminFinanceApi.payouts().then(setData).catch((e) => setError(e.message)), []);
  useEffect(() => { load(); }, [load]);

  const open = async (h) => {
    setNotice('');
    setPaying({ hotel: h, due: null, ref: '', busy: true, error: '' });
    try { const due = await adminFinanceApi.due(h.hotelId); setPaying({ hotel: h, due, ref: '', busy: false, error: '' }); } catch (e) { setPaying({ hotel: h, due: null, ref: '', busy: false, error: e.message }); }
  };
  const record = async () => {
    setPaying((p) => ({ ...p, busy: true, error: '' }));
    try {
      await adminFinanceApi.record(paying.hotel.hotelId, paying.ref.trim());
      setNotice(`Payout to ${paying.hotel.name} recorded. The hotel has been told.`);
      setPaying(null); load();
    } catch (e) { setPaying((p) => ({ ...p, busy: false, error: e.message })); }
  };

  if (!data) return <div className="p-8">{error ? <p role="alert" className="text-red-700">{error}</p> : <Loader2 className="animate-spin text-gray-400" />}</div>;

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Payouts</h1>
        <p className="text-sm text-gray-600 mt-1">What each hotel is owed for checked-out stays. Send the bank transfer, then record it here with its reference (UTR).</p>
      </div>
      {notice && <p className="rounded-lg bg-green-50 text-green-800 px-4 py-3 text-sm flex items-center gap-2"><CheckCircle2 size={16} /> {notice}</p>}
      {error && <p role="alert" className="rounded-lg bg-red-50 text-red-800 px-4 py-3 text-sm">{error}</p>}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Stat label="Due to hotels now" value={inr(data.totals.due)} />
        <Stat label="On hold until payout dates" value={inr(data.totals.onHold)} />
        <Stat label="Owed by hotels (pay-at-hotel commission)" value={inr(Math.abs(data.totals.owedByHotels))} />
      </div>

      <section className="bg-white rounded-xl border border-gray-200 overflow-hidden" aria-label="Hotels">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-navy-800 text-white"><tr>
              {['Property', 'Bank account', 'Due now', 'On hold', 'Next payout date', 'Last payout', ''].map((h, i) => <th key={i} scope="col" className={`px-3 py-2 font-semibold whitespace-nowrap ${[2, 3].includes(i) ? 'text-right' : 'text-left'}`}>{h}</th>)}
            </tr></thead>
            <tbody>
              {data.hotels.map((h) => (
                <tr key={h.hotelId} className="border-b border-gray-100">
                  <td className="px-3 py-2"><p className="font-semibold text-gray-900">{h.name}</p><p className="text-xs text-gray-500">{h.city} · {String(h.cycle || '').toLowerCase()} payouts</p></td>
                  <td className="px-3 py-2 whitespace-nowrap">{h.bank ? `${h.bank.bankName} ••••${h.bank.last4}` : <span className="text-amber-700 inline-flex items-center gap-1"><AlertTriangle size={14} /> Not added</span>}</td>
                  <td className={`px-3 py-2 text-right tabular-nums font-semibold ${h.due < 0 ? 'text-red-700' : ''}`}>{inr(h.due)}{h.dueCount ? <span className="block text-xs font-normal text-gray-500">{h.dueCount} stay{h.dueCount === 1 ? '' : 's'}</span> : null}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{inr(h.onHold)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{day(h.nextDate)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{h.lastPayout ? <>{inr(h.lastPayout.amount)}<span className="block text-xs text-gray-500">{day(h.lastPayout.at)} · {h.lastPayout.reference}</span></> : '–'}</td>
                  <td className="px-3 py-2 text-right">{canPay && h.due > 0 && <button type="button" onClick={() => open(h)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold bg-brand-600 text-white"><Banknote size={15} /> Record payout</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="px-4 py-2 text-xs text-gray-500 border-t border-gray-100">A negative amount means the hotel holds the guest&apos;s money (pay at hotel) and owes ZivoPlus the commission; it is taken from its next payouts. Per-stay details: <Link className="text-brand-700 underline" to="/admin/reports?r=settlements">Reports → Hotel settlements</Link>.</p>
      </section>

      {paying && (
        <section className="bg-white rounded-xl border-2 border-brand-200 p-5" aria-label={`Record payout to ${paying.hotel.name}`}>
          <h2 className="font-bold text-gray-900">Record payout: {paying.hotel.name}</h2>
          {paying.busy && !paying.due ? <Loader2 className="mt-3 animate-spin text-gray-400" /> : paying.due && (
            <div className="mt-2 text-sm text-gray-700 space-y-1">
              <p>Amount to send: <b>{inr(paying.due.due)}</b> for {paying.due.count} stay{paying.due.count === 1 ? '' : 's'}.</p>
              <p>To: {paying.due.bank ? <b>{paying.due.bank.accountName}, {paying.due.bank.bankName} ••••{paying.due.bank.last4} ({paying.due.bank.ifsc})</b> : <span className="text-amber-700">no bank account on file</span>}</p>
            </div>
          )}
          <label className="mt-3 block text-sm font-semibold text-gray-700">Bank transfer reference (UTR)
            <input className="mt-1 block w-full max-w-sm rounded-lg border border-gray-300 px-3 py-2 text-sm" value={paying.ref} onChange={(e) => setPaying((p) => ({ ...p, ref: e.target.value }))} placeholder="e.g. UTIBR52026110400031" />
          </label>
          {paying.error && <p role="alert" className="mt-2 text-sm text-red-700">{paying.error}</p>}
          <div className="mt-3 flex gap-2">
            <button type="button" disabled={paying.busy || paying.ref.trim().length < 6 || !paying.due?.bank} onClick={record} className="px-4 py-2 rounded-lg text-sm font-semibold bg-brand-600 text-white disabled:opacity-60">{paying.busy ? 'Saving…' : 'I have sent it: record payout'}</button>
            <button type="button" onClick={() => setPaying(null)} className="px-4 py-2 rounded-lg text-sm font-semibold border border-gray-300">Cancel</button>
          </div>
        </section>
      )}

      <section className="bg-white rounded-xl border border-gray-200 overflow-hidden" aria-label="Payout history">
        <h2 className="px-4 pt-4 font-bold text-gray-900">Payout history</h2>
        {data.history.length === 0 ? <p className="p-4 text-sm text-gray-500">No payouts yet.</p> : (
          <div className="overflow-x-auto mt-2">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-gray-600"><tr>{['Date', 'Property', 'Reference (UTR)', 'Amount', 'Status'].map((h, i) => <th key={h} scope="col" className={`px-3 py-2 font-semibold ${i === 3 ? 'text-right' : 'text-left'}`}>{h}</th>)}</tr></thead>
              <tbody>{data.history.map((p) => (
                <tr key={p.id} className="border-t border-gray-100"><td className="px-3 py-2 whitespace-nowrap">{day(p.createdAt)}</td><td className="px-3 py-2">{p.hotel}</td><td className="px-3 py-2 font-mono text-xs">{p.reference || '–'}</td><td className="px-3 py-2 text-right tabular-nums">{inr(p.totalAmount)}</td><td className="px-3 py-2">{p.status === 'SUCCESS' ? 'Paid' : p.status}</td></tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};

const Stat = ({ label, value }) => (
  <div className="bg-white rounded-xl border border-gray-200 px-4 py-3"><p className="text-xs font-semibold text-gray-500">{label}</p><p className="mt-1 text-lg font-bold text-gray-900 tabular-nums">{value}</p></div>
);

export default FinancePayouts;
