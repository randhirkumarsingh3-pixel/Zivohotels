import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { adminFinanceApi } from '../../services/api';
import usePageTitle from '../../hooks/usePageTitle';

/**
 * Admin → Finance → Ledger: every money movement as double-entry lines (guest payments, GST,
 * commission, TCS, TDS, what hotels are owed, payouts, Zivo Cash), with each account's credits,
 * debits and balance for the period. Credits and debits should match; a difference is shown.
 */
const inr = (v) => `${Number(v) < 0 ? '−' : ''}₹${Math.abs(Number(v || 0)).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const IST = 330 * 60000;
const today = () => new Date(Date.now() + IST).toISOString().slice(0, 10);
const input = 'rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm bg-white';

const FinanceLedger = () => {
  usePageTitle('Ledger');
  const [f, setF] = useState({ from: `${today().slice(0, 7)}-01`, to: today(), account: '', page: 1 });
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let live = true;
    setLoading(true);
    adminFinanceApi.ledger(f).then((d) => { if (live) { setData(d); setError(''); } }).catch((e) => live && setError(e.message)).finally(() => live && setLoading(false));
    return () => { live = false; };
  }, [f]);

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Ledger</h1>
        <p className="text-sm text-gray-600 mt-1">Every money movement, recorded twice (credit and debit): guest payments, GST, commission, TCS, TDS, what hotels are owed and payouts.</p>
      </div>
      <div className="flex flex-wrap items-end gap-3 bg-white rounded-xl border border-gray-200 p-4">
        <label className="text-xs font-semibold text-gray-600">From<input type="date" className={`${input} block mt-1`} value={f.from} onChange={(e) => setF({ ...f, from: e.target.value, page: 1 })} /></label>
        <label className="text-xs font-semibold text-gray-600">To<input type="date" className={`${input} block mt-1`} value={f.to} onChange={(e) => setF({ ...f, to: e.target.value, page: 1 })} /></label>
        <label className="text-xs font-semibold text-gray-600">Account<select className={`${input} block mt-1`} value={f.account} onChange={(e) => setF({ ...f, account: e.target.value, page: 1 })}>
          <option value="">All accounts</option>{(data?.accounts || []).map((a) => <option key={a.account} value={a.account}>{a.label}</option>)}
        </select></label>
        {loading && <Loader2 size={18} className="animate-spin text-gray-400 mb-2" />}
      </div>
      {error && <p role="alert" className="rounded-lg bg-red-50 text-red-800 px-4 py-3 text-sm">{error}</p>}
      {data && (
        <>
          <section className="bg-white rounded-xl border border-gray-200 overflow-hidden" aria-label="Accounts">
            <div className="overflow-x-auto"><table className="min-w-full text-sm">
              <thead className="bg-navy-800 text-white"><tr>{['Account', 'Entries', 'Credits', 'Debits', 'Balance'].map((h, i) => <th key={h} scope="col" className={`px-3 py-2 font-semibold ${i ? 'text-right' : 'text-left'}`}>{h}</th>)}</tr></thead>
              <tbody>{data.accounts.map((a) => (
                <tr key={a.account} className="border-b border-gray-100"><td className="px-3 py-2"><button type="button" className="text-left font-semibold text-gray-900 hover:underline" onClick={() => setF({ ...f, account: a.account, page: 1 })}>{a.label}</button><span className="block text-xs text-gray-500 font-mono">{a.account}</span></td>
                  <td className="px-3 py-2 text-right tabular-nums">{a.entries}</td><td className="px-3 py-2 text-right tabular-nums">{inr(a.credit)}</td><td className="px-3 py-2 text-right tabular-nums">{inr(a.debit)}</td><td className="px-3 py-2 text-right tabular-nums font-semibold">{inr(a.balance)}</td></tr>
              ))}</tbody>
              <tfoot className="bg-gray-50 font-bold border-t-2 border-navy-800"><tr><td className="px-3 py-2">Total</td><td /><td className="px-3 py-2 text-right tabular-nums">{inr(data.totals.credit)}</td><td className="px-3 py-2 text-right tabular-nums">{inr(data.totals.debit)}</td><td className={`px-3 py-2 text-right tabular-nums ${Math.abs(data.totals.difference) > 0.01 ? 'text-red-700' : 'text-green-700'}`}>{Math.abs(data.totals.difference) > 0.01 ? `Difference ${inr(data.totals.difference)}` : 'Balanced'}</td></tr></tfoot>
            </table></div>
          </section>
          <section className="bg-white rounded-xl border border-gray-200 overflow-hidden" aria-label="Entries">
            <h2 className="px-4 pt-4 font-bold text-gray-900">Entries {f.account ? `· ${data.accounts.find((a) => a.account === f.account)?.label || f.account}` : ''} <span className="text-sm font-normal text-gray-500">({data.count.toLocaleString('en-IN')})</span></h2>
            <div className="overflow-x-auto mt-2"><table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-gray-600"><tr>{['When', 'Account', 'Description', 'Reference', 'Credit', 'Debit'].map((h, i) => <th key={h} scope="col" className={`px-3 py-2 font-semibold ${i > 3 ? 'text-right' : 'text-left'}`}>{h}</th>)}</tr></thead>
              <tbody>{data.entries.map((e) => (
                <tr key={e.id} className="border-t border-gray-100"><td className="px-3 py-1.5 whitespace-nowrap">{new Date(e.createdAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' })}</td>
                  <td className="px-3 py-1.5">{e.accountLabel}</td><td className="px-3 py-1.5">{e.description}</td><td className="px-3 py-1.5 font-mono text-xs text-gray-500">{e.referenceId.slice(0, 12)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{e.type === 'CREDIT' ? inr(e.amount) : ''}</td><td className="px-3 py-1.5 text-right tabular-nums">{e.type === 'DEBIT' ? inr(e.amount) : ''}</td></tr>
              ))}</tbody>
            </table></div>
            {data.pages > 1 && (
              <div className="flex items-center justify-between px-4 py-2 border-t border-gray-100 text-sm">
                <button type="button" disabled={f.page <= 1} onClick={() => setF({ ...f, page: f.page - 1 })} className="px-3 py-1 rounded border border-gray-300 disabled:opacity-50">Newer</button>
                <span>Page {f.page} of {data.pages}</span>
                <button type="button" disabled={f.page >= data.pages} onClick={() => setF({ ...f, page: f.page + 1 })} className="px-3 py-1 rounded border border-gray-300 disabled:opacity-50">Older</button>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
};

export default FinanceLedger;
