import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FileSpreadsheet, FileText, Printer, Loader2, AlertTriangle } from 'lucide-react';
import { adminReportsApi } from '../../services/api';
import usePageTitle from '../../hooks/usePageTitle';

/**
 * Admin → Reports, from real data: bookings, revenue & commission, payments, refunds,
 * cancellations, occupancy, hotel settlements, tax and offers. The same filters for all; every
 * report can be grouped (day, week, month, property, city, status) and downloaded as CSV or Excel.
 * Money reports need the finance permission (the server leaves them out otherwise).
 */
const input = 'rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm bg-white focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none';
const IST = 330 * 60000;
const ymd = (d) => new Date(d).toISOString().slice(0, 10);
const today = () => ymd(Date.now() + IST);
const RANGES = {
  thisMonth: ['This month', () => [`${today().slice(0, 7)}-01`, today()]],
  lastMonth: ['Last month', () => {
    const t = new Date(`${today().slice(0, 7)}-01T00:00:00Z`);
    const end = new Date(t.getTime() - 86400000);
    return [`${ymd(end).slice(0, 7)}-01`, ymd(end)];
  }],
  last7: ['Last 7 days', () => [ymd(Date.now() + IST - 6 * 86400000), today()]],
  last30: ['Last 30 days', () => [ymd(Date.now() + IST - 29 * 86400000), today()]],
  next30: ['Next 30 days', () => [today(), ymd(Date.now() + IST + 29 * 86400000)]],
  thisYear: ['This financial year', () => {
    const t = today(); const y = Number(t.slice(0, 4)) - (Number(t.slice(5, 7)) < 4 ? 1 : 0);
    return [`${y}-04-01`, t];
  }],
};
const GROUPS = { none: 'Every row', day: 'Day', week: 'Week', month: 'Month', property: 'Property', city: 'City', status: 'Status' };
const PAYMENT = { '': 'Any payment', PREPAID: 'Paid online', PARTIAL: 'Part paid online', PAY_AT_HOTEL: 'Pay at hotel' };
const PAYMENT_REPORTS = ['bookings', 'payments', 'cancellations'];

const inr = (v) => `${Number(v) < 0 ? '−' : ''}₹${Math.abs(Number(v || 0)).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmt = (v, type) => {
  if (v === null || v === undefined || v === '') return '–';
  if (type === 'money') return inr(v);
  if (type === 'int') return Number(v).toLocaleString('en-IN', { maximumFractionDigits: 1 });
  if (type === 'pct') return `${Number(v).toFixed(1)}%`;
  if (type === 'date') return new Date(v).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
  if (type === 'datetime') return new Date(v).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });
  return String(v);
};
const numeric = (t) => ['money', 'int', 'pct'].includes(t);
const SHOW = 500;

const Reports = () => {
  usePageTitle('Reports');
  const [params, setParams] = useSearchParams();
  const [meta, setMeta] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState('');

  const key = params.get('r') || 'bookings';
  const [defFrom, defTo] = RANGES.thisMonth[1]();
  const filters = useMemo(() => ({
    from: params.get('from') || defFrom, to: params.get('to') || defTo,
    dateField: params.get('dateField') || '', hotelId: params.get('hotelId') || '', city: params.get('city') || '',
    status: params.get('status') || '', stayType: params.get('stayType') || '', paymentType: params.get('paymentType') || '',
    groupBy: params.get('groupBy') || '',
  }), [params, defFrom, defTo]);
  const set = (patch) => {
    const next = new URLSearchParams(params);
    Object.entries(patch).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)));
    setParams(next, { replace: true });
  };

  useEffect(() => { adminReportsApi.list().then(setMeta).catch((e) => setError(e.message)); }, []);
  const report = meta?.reports.find((r) => r.key === key) || meta?.reports[0];

  useEffect(() => {
    if (!report) return undefined;
    let live = true;
    setLoading(true); setError('');
    adminReportsApi.run(report.key, filters).then((d) => { if (live) setData(d); }).catch((e) => { if (live) setError(e.message); }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [report, filters]);

  const download = async (format) => {
    setDownloading(format);
    try {
      const blob = await adminReportsApi.download(report.key, filters, format);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `ZivoPlus-${report.title.replace(/[^A-Za-z0-9]+/g, '-')}-${data?.filters?.from || filters.from}-to-${data?.filters?.to || filters.to}.${format}`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (e) { setError(e.message); } finally { setDownloading(''); }
  };

  if (!meta) return <div className="p-8">{error ? <p role="alert" className="text-red-700">{error}</p> : <Loader2 className="animate-spin text-gray-400" />}</div>;

  const cols = data?.columns || [];
  const shown = (data?.rows || []).slice(0, SHOW);
  const moneyTotals = data && !data.grouped ? cols.filter((c) => c.type === 'money').slice(0, 4) : (data ? cols.filter((c) => c.type === 'money').slice(0, 4) : []);
  const groupBy = data?.filters?.groupBy || filters.groupBy || report.defaultGroup;

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-5 print:p-0">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
          <p className="text-sm text-gray-600 mt-1">Live figures from bookings, payments, refunds and hotel settlements. Download any report as Excel or CSV.</p>
        </div>
        <div className="flex gap-2 print:hidden">
          <button type="button" onClick={() => download('xlsx')} disabled={!data || !!downloading} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold bg-brand-600 text-white disabled:opacity-60">{downloading === 'xlsx' ? <Loader2 size={15} className="animate-spin" /> : <FileSpreadsheet size={15} />} Excel</button>
          <button type="button" onClick={() => download('csv')} disabled={!data || !!downloading} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold border border-gray-300 bg-white disabled:opacity-60">{downloading === 'csv' ? <Loader2 size={15} className="animate-spin" /> : <FileText size={15} />} CSV</button>
          <button type="button" onClick={() => window.print()} disabled={!data} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold border border-gray-300 bg-white disabled:opacity-60"><Printer size={15} /> Print / PDF</button>
        </div>
      </div>

      <div role="tablist" aria-label="Reports" className="flex gap-1.5 overflow-x-auto pb-1 print:hidden">
        {meta.reports.map((r) => (
          <button key={r.key} type="button" role="tab" aria-selected={r.key === report.key} onClick={() => set({ r: r.key, dateField: '', status: '', groupBy: '' })}
            className={`whitespace-nowrap px-3 py-1.5 rounded-full text-sm font-semibold border ${r.key === report.key ? 'bg-navy-800 text-white border-navy-800' : 'bg-white text-gray-700 border-gray-200 hover:border-gray-400'}`}>
            {r.title}
          </button>
        ))}
      </div>

      <section className="bg-white rounded-xl border border-gray-200 p-4 print:hidden" aria-label="Filters">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs font-semibold text-gray-600">From<input type="date" className={`${input} block mt-1`} value={filters.from} onChange={(e) => set({ from: e.target.value })} /></label>
          <label className="text-xs font-semibold text-gray-600">To<input type="date" className={`${input} block mt-1`} value={filters.to} onChange={(e) => set({ to: e.target.value })} /></label>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(RANGES).map(([k, [label, fn]]) => (
              <button key={k} type="button" onClick={() => { const [from, to] = fn(); set({ from, to }); }} className="px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-gray-200 hover:bg-gray-50">{label}</button>
            ))}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          {Object.keys(report.dateFields).length > 1 && (
            <label className="text-xs font-semibold text-gray-600">Dates are<select className={`${input} block mt-1`} value={filters.dateField || Object.keys(report.dateFields)[0]} onChange={(e) => set({ dateField: e.target.value })}>
              {Object.entries(report.dateFields).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select></label>
          )}
          <label className="text-xs font-semibold text-gray-600">Property<select className={`${input} block mt-1 max-w-[14rem]`} value={filters.hotelId} onChange={(e) => set({ hotelId: e.target.value })}>
            <option value="">All properties</option>{meta.hotels.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
          </select></label>
          <label className="text-xs font-semibold text-gray-600">City<select className={`${input} block mt-1`} value={filters.city} onChange={(e) => set({ city: e.target.value })}>
            <option value="">All cities</option>{meta.cities.map((c) => <option key={c} value={c}>{c}</option>)}
          </select></label>
          {report.statuses && (
            <label className="text-xs font-semibold text-gray-600">Status<select className={`${input} block mt-1`} value={filters.status} onChange={(e) => set({ status: e.target.value })}>
              <option value="">Any status</option>{Object.entries(report.statuses).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select></label>
          )}
          {report.key === 'payments' && (
            <label className="text-xs font-semibold text-gray-600">Status<select className={`${input} block mt-1`} value={filters.status} onChange={(e) => set({ status: e.target.value })}>
              <option value="">Any status</option><option value="Received">Received</option><option value="Received by hotel">Received by hotel</option><option value="Failed">Failed</option>
            </select></label>
          )}
          {report.key !== 'offers' && (
            <label className="text-xs font-semibold text-gray-600">Stay<select className={`${input} block mt-1`} value={filters.stayType} onChange={(e) => set({ stayType: e.target.value })}>
              <option value="">Nightly and hourly</option><option value="NIGHTLY">Nightly</option><option value="HOURLY">Hourly</option>
            </select></label>
          )}
          {PAYMENT_REPORTS.includes(report.key) && (
            <label className="text-xs font-semibold text-gray-600">Payment<select className={`${input} block mt-1`} value={filters.paymentType} onChange={(e) => set({ paymentType: e.target.value })}>
              {Object.entries(PAYMENT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select></label>
          )}
          <label className="text-xs font-semibold text-gray-600">Show<select className={`${input} block mt-1`} value={groupBy} onChange={(e) => set({ groupBy: e.target.value })}>
            {Object.entries(GROUPS).map(([k, v]) => <option key={k} value={k}>{k === 'none' ? v : `Totals by ${v.toLowerCase()}`}</option>)}
          </select></label>
        </div>
      </section>

      <div className="hidden print:block">
        <h2 className="text-lg font-bold">{report.title}</h2>
        <p className="text-sm">{fmt(filters.from, 'date')} – {fmt(filters.to, 'date')}{filters.hotelId ? ` · ${meta.hotels.find((h) => h.id === filters.hotelId)?.name}` : ''}{filters.city ? ` · ${filters.city}` : ''}</p>
      </div>

      {error && <p role="alert" className="rounded-lg bg-red-50 text-red-800 px-4 py-3 text-sm flex items-center gap-2"><AlertTriangle size={16} /> {error}</p>}

      {data && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat label={data.grouped ? 'Rows in report' : 'Rows'} value={(data.grouped ? data.totals.count : (data.rowCount ?? data.rows.length)).toLocaleString('en-IN')} />
            {moneyTotals.slice(0, 3).map((c) => <Stat key={c.key} label={c.label} value={inr(data.totals[c.key])} />)}
            {(data.cards || []).map((c) => <Stat key={c.label} label={c.label} value={fmt(c.value, c.type)} />)}
          </div>

          <section className={`bg-white rounded-xl border border-gray-200 overflow-hidden ${loading ? 'opacity-60' : ''}`} aria-busy={loading} aria-label={report.title}>
            {data.rows.length === 0 ? (
              <p className="p-8 text-center text-sm text-gray-500">Nothing in this period with these filters.</p>
            ) : (
              <div className="overflow-auto max-h-[70vh] print:max-h-none print:overflow-visible">
                <table className="min-w-full text-sm">
                  <thead className="sticky top-0 bg-navy-800 text-white">
                    <tr>{cols.map((c) => <th key={c.key} scope="col" className={`px-3 py-2 font-semibold whitespace-nowrap ${numeric(c.type) ? 'text-right' : 'text-left'}`}>{c.label}</th>)}</tr>
                  </thead>
                  <tbody>
                    {shown.map((r, i) => (
                      <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                        {cols.map((c) => {
                          // Totals by property: click a property to see its rows one by one
                          const hotel = data.grouped && groupBy === 'property' && c.key === 'group' ? meta.hotels.find((h) => h.name === r.group) : null;
                          return (
                            <td key={c.key} className={`px-3 py-1.5 whitespace-nowrap ${numeric(c.type) ? 'text-right tabular-nums' : ''} ${r[c.key] === 'Failed' || /failed/i.test(String(r[c.key] || '')) ? 'text-red-700 font-semibold' : ''} ${c.key === 'net' && Number(r[c.key]) < 0 ? 'text-red-700' : ''}`}>
                              {hotel ? <button type="button" onClick={() => set({ hotelId: hotel.id, groupBy: 'none' })} className="text-brand-700 font-semibold hover:underline" title={`See ${hotel.name} row by row`}>{r.group}</button> : fmt(r[c.key], c.type)}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="sticky bottom-0 bg-gray-50 font-bold border-t-2 border-navy-800">
                    <tr>{cols.map((c, i) => <td key={c.key} className={`px-3 py-2 whitespace-nowrap ${numeric(c.type) ? 'text-right tabular-nums' : ''}`}>{i === 0 ? 'Total' : data.totals[c.key] !== undefined && data.totals[c.key] !== null ? fmt(data.totals[c.key], c.type) : ''}</td>)}</tr>
                  </tfoot>
                </table>
              </div>
            )}
            {((data.rowCount ?? data.rows.length) > SHOW || data.truncated) && (
              <p className="px-4 py-2 text-xs text-gray-600 border-t border-gray-100">
                {data.truncated ? 'This report has more than 20,000 rows: narrow the dates or filters. ' : ''}
                Showing the first {SHOW.toLocaleString('en-IN')} of {(data.rowCount ?? data.rows.length).toLocaleString('en-IN')} rows; the totals and downloads include all of them.
              </p>
            )}
          </section>
          <p className="text-xs text-gray-500">{explain(report.key)}</p>
        </>
      )}
      {!data && loading && <Loader2 className="animate-spin text-gray-400" />}
    </div>
  );
};

const Stat = ({ label, value }) => (
  <div className="bg-white rounded-xl border border-gray-200 px-4 py-3">
    <p className="text-xs font-semibold text-gray-500">{label}</p>
    <p className="mt-1 text-lg font-bold text-gray-900 tabular-nums">{value}</p>
  </div>
);

const explain = (key) => ({
  bookings: 'Room value is the price before GST, after offers. "Due at hotel" is what the guest still pays at check-in.',
  revenue: 'One row per stay, made when the guest checks out. Commission is on the room price before GST; GST on commission is IGST, or CGST + SGST for hotels in Bihar. Net payable can be negative for pay-at-hotel stays (the hotel owes the commission).',
  payments: 'Online payments when they succeeded (and failed attempts), plus what guests paid at the hotel, dated at check-out.',
  refunds: 'Refunds to the original card / UPI or to Zivo Cash. Failed refunds are retried automatically and are also listed in Admin → Bookings.',
  cancellations: '"Charge kept" is what the guest paid minus what was refunded.',
  occupancy: 'Rooms available come from the inventory calendar (stop-sell days count as 0). ADR = room revenue ÷ room-nights sold; RevPAR = room revenue ÷ rooms available.',
  settlements: 'What each hotel is owed per stay: on hold until its payout date, then due, then paid (recorded under Finance → Payouts).',
  tax: 'For GST and income-tax filing: GST on rooms, GST on ZivoPlus commission, TCS under GST section 52 (registered hotels) and TDS under section 194-O.',
  collections: 'Money in and out per property: payments received online (Razorpay and Zivo Cash) and at the hotel, refunds made (dated when they went out) and still pending, and failed payments. Net collected = received − refunded. Click a property to see its payments and refunds one by one.',
  offers: 'Discounts given per offer, and who paid for them. Zivo Rewards points earned and redeemed in the period are shown above.',
}[key] || '');

export default Reports;
