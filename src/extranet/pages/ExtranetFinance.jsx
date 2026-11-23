import { useCallback, useEffect, useState } from 'react';
import { Loader2, FileText, FileSpreadsheet, Landmark, Info, Receipt } from 'lucide-react';
import { financeHubApi } from '../../services/extranetApi';
import { saveBlob } from '../../services/api';
import { useExtranet } from '../context/ExtranetContext';
import ExplainMoneyModal from '../components/ExplainMoneyModal';

/**
 * Extranet → Finance Hub: a month of the property's money. Booking value, what guests paid online
 * and at the hotel, ZivoPlus' commission and its GST, TCS and TDS, net earned, payouts with their
 * bank reference and the balance; every stay; the commission tax invoices and credit notes; the
 * statement (PDF / Excel); 12 months of earnings and TCS / TDS per quarter for tax filing.
 */
const IST = 330 * 60000;
const thisMonth = () => new Date(Date.now() + IST).toISOString().slice(0, 7);
const inr = (v) => `${Number(v) < 0 ? '−' : ''}₹${Math.abs(Number(v || 0)).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const day = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }) : '–');
const short = (d) => (d ? new Date(`${d}T00:00:00Z`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', timeZone: 'UTC' }) : '');
const btn = 'inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold';

const ExtranetFinance = () => {
  const { addToast } = useExtranet();
  const [period, setPeriod] = useState(thisMonth());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [explain, setExplain] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setData(await financeHubApi.hub(period)); } catch (e) { addToast(e.message, 'error'); } finally { setLoading(false); }
  }, [period, addToast]);
  useEffect(() => { load(); }, [load]);

  const download = async (key, fn, name) => {
    setBusy(key);
    try { saveBlob(await fn(), name); } catch (e) { addToast(e.message || 'Download failed', 'error'); } finally { setBusy(''); }
  };

  if (!data) return <div className="flex h-64 items-center justify-center">{loading ? <Loader2 className="animate-spin text-gray-400" size={32} /> : null}</div>;
  const t = data.totals;
  const maxNet = Math.max(1, ...data.earnings.map((e) => Math.abs(e.net)));

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Finance Hub</h1>
          <p className="text-sm text-gray-600 mt-1">Your earnings, ZivoPlus commission, taxes and payouts, month by month.</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs font-semibold text-gray-600">Month<input type="month" className="block mt-1 rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm" value={period} max={thisMonth()} onChange={(e) => e.target.value && setPeriod(e.target.value)} /></label>
          <button type="button" onClick={() => download('pdf', () => financeHubApi.statement(period, 'pdf'), `ZivoPlus-Statement-${period}.pdf`)} className={`${btn} bg-brand-600 text-white`}>{busy === 'pdf' ? <Loader2 size={15} className="animate-spin" /> : <FileText size={15} />} Statement PDF</button>
          <button type="button" onClick={() => download('xlsx', () => financeHubApi.statement(period, 'xlsx'), `ZivoPlus-Statement-${period}.xlsx`)} className={`${btn} border border-gray-300 bg-white`}>{busy === 'xlsx' ? <Loader2 size={15} className="animate-spin" /> : <FileSpreadsheet size={15} />} Excel</button>
        </div>
      </div>

      <section className="grid gap-3 md:grid-cols-3" aria-label="Balance">
        <div className="rounded-xl bg-navy-800 text-white p-5"><p className="text-xs font-semibold text-navy-200">Due to you now</p><p className="mt-1 text-2xl font-bold tabular-nums">{inr(data.balance.dueNow)}</p><p className="mt-1 text-xs text-navy-200">{data.balance.dueNow < 0 ? 'You owe ZivoPlus commission on pay-at-hotel stays; it is taken from your next payouts.' : 'Paid out on your payout date.'}</p></div>
        <div className="rounded-xl bg-white border border-gray-200 p-5"><p className="text-xs font-semibold text-gray-500">On hold until the payout date</p><p className="mt-1 text-2xl font-bold tabular-nums">{inr(data.balance.onHold)}</p><p className="mt-1 text-xs text-gray-500">{data.balance.nextDate ? `Next payout date ${day(data.balance.nextDate)}` : 'Nothing on hold'}</p></div>
        <div className="rounded-xl bg-white border border-gray-200 p-5"><p className="text-xs font-semibold text-gray-500 flex items-center gap-1"><Landmark size={13} /> Paid to</p>{data.bank ? <><p className="mt-1 font-bold text-gray-900">{data.bank.bankName} ••••{data.bank.last4}</p><p className="text-xs text-gray-500">{data.bank.accountName} · {data.bank.ifsc}</p></> : <p className="mt-1 text-sm text-amber-700">No bank account yet: add it in Property Info so payouts can be sent.</p>}</div>
      </section>

      <section aria-label={`${data.label} summary`}>
        <h2 className="text-lg font-bold text-gray-900">{data.label}</h2>
        <div className="mt-2 grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            ['Stays settled', String(t.stays)], ['Booking value (incl. GST)', inr(t.gross)], ['Paid online by guests', inr(t.online)], ['Paid at your hotel', inr(t.atHotel)],
            ['Commission + GST', inr(t.commission + t.commissionGst)], ['TCS + TDS deducted', inr(t.tcs + t.tds)], ['Net earned', inr(t.earned + t.credits)], ['Paid out', inr(t.paid)],
          ].map(([k, v]) => <div key={k} className="rounded-xl bg-white border border-gray-200 px-4 py-3"><p className="text-xs font-semibold text-gray-500">{k}</p><p className="mt-1 text-lg font-bold text-gray-900 tabular-nums">{v}</p></div>)}
        </div>
        <p className="mt-2 text-sm text-gray-700">Balance: opening {inr(t.opening)} → closing <b>{inr(t.closing)}</b>{t.credits ? ` (includes ${inr(t.credits)} of commission given back)` : ''}.</p>
      </section>

      <section className="rounded-xl bg-white border border-gray-200 p-5" aria-label="Earnings by month">
        <h2 className="font-bold text-gray-900">Net earnings, last 12 months</h2>
        <div className="mt-4 flex items-end gap-1.5 h-36" role="img" aria-label="Net earnings by month">
          {data.earnings.map((e) => (
            <button key={e.period} type="button" onClick={() => setPeriod(e.period)} title={`${e.label}: ${inr(e.net)}, ${e.stays} stays`} className="flex-1 flex flex-col items-center justify-end h-full group">
              <span className={`w-full rounded-t ${e.period === period ? 'bg-brand-600' : e.net < 0 ? 'bg-red-200' : 'bg-navy-200 group-hover:bg-navy-300'}`} style={{ height: `${Math.max(2, (Math.abs(e.net) / maxNet) * 100)}%` }} />
              <span className={`mt-1 text-[11px] ${e.period === period ? 'font-bold text-gray-900' : 'text-gray-500'}`}>{e.label}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-xl bg-white border border-gray-200 overflow-hidden" aria-label="Stays">
        <h2 className="px-5 pt-4 font-bold text-gray-900">Stays settled in {data.label}</h2>
        {data.stays.length === 0 ? <p className="p-5 text-sm text-gray-500">No stays settled this month.</p> : (
          <div className="overflow-x-auto mt-2"><table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-gray-600"><tr>{['Booking', 'Stay', 'Value incl. GST', 'Paid online', 'At hotel', 'Commission', 'GST on it', 'TCS + TDS', 'Net to you', ''].map((h, i) => <th key={i} scope="col" className={`px-3 py-2 font-semibold whitespace-nowrap ${i >= 2 && i <= 8 ? 'text-right' : 'text-left'}`}>{h}</th>)}</tr></thead>
            <tbody>{data.stays.map((x) => (
              <tr key={x.settlementId} className="border-t border-gray-100">
                <td className="px-3 py-2"><span className="font-semibold">{x.ref}</span><span className="block text-xs text-gray-500">{x.guest} · {x.kind}</span></td>
                <td className="px-3 py-2 whitespace-nowrap">{short(x.checkIn)} – {short(x.checkOut)}<span className="block text-xs text-gray-500">{x.stay}</span></td>
                <td className="px-3 py-2 text-right tabular-nums">{inr(x.gross)}</td><td className="px-3 py-2 text-right tabular-nums">{inr(x.online)}</td><td className="px-3 py-2 text-right tabular-nums">{inr(x.atHotel)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{inr(x.commission)}<span className="block text-xs text-gray-500">{x.rate}%</span></td><td className="px-3 py-2 text-right tabular-nums">{inr(x.cgst + x.sgst + x.igst)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{inr(x.tcs + x.tds)}</td><td className={`px-3 py-2 text-right tabular-nums font-semibold ${x.net < 0 ? 'text-red-700' : ''}`}>{inr(x.net)}</td>
                <td className="px-3 py-2"><button type="button" onClick={() => setExplain(x.settlementId)} className="text-brand-700 hover:underline inline-flex items-center gap-1 text-xs font-semibold"><Info size={13} /> Explain</button></td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl bg-white border border-gray-200 p-5" aria-label="Invoices and credit notes">
          <h2 className="font-bold text-gray-900 flex items-center gap-2"><Receipt size={17} /> Commission invoices & credit notes</h2>
          <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-gray-500">Issued on the 1st for the previous month. Use them to claim GST input credit.</p>
            {data.documents.length > 0 && <button type="button" onClick={() => download('zip', () => financeHubApi.invoicesZip(data.tax.fy), `ZivoPlus-invoices-FY${data.tax.fy}.zip`)} className="px-2.5 py-1 rounded-lg border border-gray-300 text-xs font-semibold">{busy === 'zip' ? <Loader2 size={13} className="animate-spin inline" /> : `All for FY ${data.tax.fy} (ZIP)`}</button>}
          </div>
          {data.documents.length === 0 ? <p className="mt-3 text-sm text-gray-500">None yet.</p> : (
            <ul className="mt-3 divide-y divide-gray-100">{data.documents.map((d) => (
              <li key={d.id} className="py-2 flex items-center justify-between gap-2 text-sm">
                <span><span className="font-mono text-xs">{d.number}</span><span className="block text-xs text-gray-500">{d.kind === 'INVOICE' ? `Tax invoice · ${d.period}` : `Credit note · ${d.reason || ''}`} · {day(d.issueDate)}{!d.live ? ' · test' : ''}</span></span>
                <span className="flex items-center gap-2"><b className="tabular-nums">{inr(d.total)}</b>
                  <button type="button" onClick={() => download(d.id, () => financeHubApi.documentPdf(d.id), `${d.number.replace(/\//g, '-')}.pdf`)} className="px-2 py-1 rounded border border-gray-300 text-xs font-semibold" aria-label={`Download ${d.number}`}>{busy === d.id ? <Loader2 size={13} className="animate-spin" /> : 'PDF'}</button></span>
              </li>
            ))}</ul>
          )}
        </section>

        <section className="rounded-xl bg-white border border-gray-200 p-5" aria-label="Payouts">
          <h2 className="font-bold text-gray-900">Payouts in {data.label}</h2>
          {data.payouts.length === 0 ? <p className="mt-3 text-sm text-gray-500">No payouts this month.</p> : (
            <ul className="mt-3 divide-y divide-gray-100">{data.payouts.map((p, i) => (
              <li key={i} className="py-2 flex items-center justify-between text-sm"><span>{day(p.at)}<span className="block text-xs text-gray-500">Bank reference {p.reference || '–'} · {p.account}</span></span><b className="tabular-nums">{inr(p.amount)}</b></li>
            ))}</ul>
          )}
        </section>
      </div>

      <section className="rounded-xl bg-white border border-gray-200 p-5" aria-label="Taxes">
        <h2 className="font-bold text-gray-900">Taxes deducted for you to claim · FY {data.tax.fy}</h2>
        <p className="text-xs text-gray-500 mt-1">TCS (GST section 52, {data.rates?.tcsPercent ?? 0.5}%{data.zivo.tcsGstin ? `, ZivoPlus TCS GSTIN ${data.zivo.tcsGstin}` : ''}) shows on the GST portal; TDS (section 194-O, {data.rates?.tdsPercent ?? 0.1}%{data.zivo.tan ? `, ZivoPlus TAN ${data.zivo.tan}` : ''}) in Form 26AS, with Form 16A every quarter.</p>
        <div className="overflow-x-auto mt-3"><table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-gray-600"><tr>{['Quarter', 'Sales value', 'TCS', 'TDS'].map((h, i) => <th key={h} scope="col" className={`px-3 py-2 font-semibold ${i ? 'text-right' : 'text-left'}`}>{h}</th>)}</tr></thead>
          <tbody>{data.tax.quarters.map((q) => <tr key={q.quarter} className="border-t border-gray-100"><td className="px-3 py-2">{q.quarter} <span className="text-gray-500">{q.label}</span></td><td className="px-3 py-2 text-right tabular-nums">{inr(q.value)}</td><td className="px-3 py-2 text-right tabular-nums">{inr(q.tcs)}</td><td className="px-3 py-2 text-right tabular-nums">{inr(q.tds)}</td></tr>)}</tbody>
        </table></div>
      </section>

      {explain && <ExplainMoneyModal isOpen onClose={() => setExplain(null)} settlementId={explain} />}
    </div>
  );
};

export default ExtranetFinance;
