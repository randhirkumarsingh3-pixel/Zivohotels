import { useCallback, useEffect, useState } from 'react';
import { Loader2, Download, ChevronLeft, ChevronRight, ArrowUpRight, ArrowDownRight, TrendingUp } from 'lucide-react';
import { extranetGet, financeHubApi } from '../../services/extranetApi';

/**
 * Extranet → Performance → Monthly report (GET /extranet/performance/monthly?month=): the month by
 * room type against the month before (occupancy, revenue, ADR, RevPAR, cancellations), how bookings
 * for it are coming in (pace), occupancy per night, and a CSV.
 */
const inr = (n) => (n == null ? '—' : `₹${Math.round(Number(n)).toLocaleString('en-IN')}`);
const thisMonth = () => new Date(Date.now() + 5.5 * 3600000).toISOString().slice(0, 7);
const shift = (m, k) => { const [y, mo] = m.split('-').map(Number); const d = new Date(Date.UTC(y, mo - 1 + k, 1)); return d.toISOString().slice(0, 7); };
const monthName = (m) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });

/** "▲ 12%" against last month; a fall in cancellations is good news. */
const Delta = ({ value, goodWhenUp = true }) => {
  if (value == null) return <span className="text-xs text-gray-400">—</span>;
  if (!value) return <span className="text-xs text-gray-500">same</span>;
  const good = value > 0 === goodWhenUp;
  const Icon = value > 0 ? ArrowUpRight : ArrowDownRight;
  return <span className={`inline-flex items-center text-xs font-semibold ${good ? 'text-green-800' : 'text-red-700'}`}><Icon size={13} aria-hidden="true" />{Math.abs(value)}%</span>;
};

const Tile = ({ label, value, previous, change, goodWhenUp, note }) => (
  <div className="bg-white rounded-card border border-gray-200 p-4">
    <p className="text-sm text-gray-600">{label}</p>
    <p className="text-2xl font-bold text-gray-900 tabular-nums mt-0.5">{value}</p>
    <p className="mt-1 text-xs text-gray-500 flex flex-wrap items-center gap-x-2"><Delta value={change} goodWhenUp={goodWhenUp} /><span>{previous}</span></p>
    {note && <p className="text-xs text-gray-500 mt-0.5">{note}</p>}
  </div>
);

const MonthlyReport = ({ hotelId, addToast }) => {
  const [month, setMonth] = useState(thisMonth());
  const [r, setR] = useState(null);
  const [loading, setLoading] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    try { setR(await extranetGet(`/performance/monthly?month=${month}`)); } catch (e) { addToast?.(e.message, 'error'); } finally { setLoading(false); }
  }, [month, addToast]);
  useEffect(() => { if (hotelId) load(); }, [load, hotelId]);
  const csv = async () => {
    try {
      const blob = await financeHubApi.monthlyReportCsv(month);
      const u = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = u; a.download = `performance-${month}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(u), 30000);
    } catch (e) { addToast?.(e.message, 'error'); }
  };

  const t = r?.total; const prevName = r ? monthName(r.previousMonth) : '';
  const maxOcc = Math.max(100, ...(r?.daily || []).map((d) => d.occupancy || 0));
  return (
    <section aria-labelledby="monthly-h" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="monthly-h" className="text-xl font-bold text-gray-900">Monthly report</h2>
          <p className="text-sm text-gray-600">Stays in the month by room type, against the month before. Revenue is before GST, after discounts.</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" aria-label="Previous month" onClick={() => setMonth((m) => shift(m, -1))} className="p-2 rounded-lg border border-gray-300 bg-white"><ChevronLeft size={16} /></button>
          <span className="min-w-[9rem] text-center font-semibold text-gray-900" aria-live="polite">{monthName(month)}</span>
          <button type="button" aria-label="Next month" onClick={() => setMonth((m) => shift(m, 1))} disabled={month >= shift(thisMonth(), 6)} className="p-2 rounded-lg border border-gray-300 bg-white disabled:opacity-40"><ChevronRight size={16} /></button>
          <button type="button" onClick={csv} disabled={!r} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm font-semibold"><Download size={15} /> CSV</button>
        </div>
      </div>

      {loading && !r ? <div className="flex h-40 items-center justify-center"><Loader2 className="animate-spin text-navy-700" size={28} /></div> : r && (
        <>
          {r.status !== 'PAST' && <p className="text-xs text-gray-600 bg-gray-50 rounded-lg px-3 py-2">{r.status === 'CURRENT' ? 'This month is still running: figures include stays booked for the rest of it.' : 'A month ahead: figures are what is booked so far.'}</p>}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Tile label="Occupancy" value={t.occupancy != null ? `${t.occupancy}%` : '—'} change={t.change.occupancy} previous={`${t.previous.occupancy ?? '—'}% in ${prevName}`} note={`${t.sold} of ${t.supply} room nights`} />
            <Tile label="Room revenue" value={inr(t.revenue)} change={t.change.revenue} previous={`${inr(t.previous.revenue)} in ${prevName}`} />
            <Tile label="ADR · RevPAR" value={`${inr(t.adr)} · ${inr(t.revpar)}`} change={t.change.revpar} previous={`RevPAR ${inr(t.previous.revpar)} in ${prevName}`} note="Per room night sold · per room night on sale" />
            <Tile label="Cancellations" value={t.cancellationRate != null ? `${t.cancellationRate}%` : '—'} change={t.change.cancellationRate} goodWhenUp={false} previous={`${t.previous.cancellationRate ?? '—'}% in ${prevName}`} note={`${t.cancellations} cancelled`} />
          </div>

          <div className="bg-white rounded-card border border-gray-200 p-4 flex flex-wrap items-center gap-x-6 gap-y-2">
            <p className="font-semibold text-gray-900 flex items-center gap-2"><TrendingUp size={17} className="text-navy-700" aria-hidden="true" /> Booking pace</p>
            {r.status === 'PAST'
              ? <p className="text-sm text-gray-700">Final: <b>{r.pace.onTheBooks}</b> room nights; {prevName}: <b>{r.pace.previousAtSamePoint}</b>.</p>
              : <p className="text-sm text-gray-700"><b>{r.pace.onTheBooks}</b> room nights on the books today; {prevName} had <b>{r.pace.previousAtSamePoint}</b> at the same point ({r.pace.daysBefore > 0 ? `${r.pace.daysBefore} days before it began` : `${-r.pace.daysBefore} days into it`}). <Delta value={r.pace.change} /></p>}
          </div>

          <div className="bg-white rounded-card border border-gray-200 overflow-x-auto">
            <table className="w-full text-sm min-w-[720px]">
              <caption className="sr-only">By room type, {monthName(r.month)} against {prevName}</caption>
              <thead className="bg-gray-50 text-gray-600 text-left">
                <tr>
                  <th className="px-4 py-2 font-semibold">Room type</th>
                  <th className="px-3 py-2 font-semibold text-right">Occupancy</th>
                  <th className="px-3 py-2 font-semibold text-right">Room nights</th>
                  <th className="px-3 py-2 font-semibold text-right">Revenue</th>
                  <th className="px-3 py-2 font-semibold text-right">ADR</th>
                  <th className="px-3 py-2 font-semibold text-right">RevPAR</th>
                  <th className="px-3 py-2 font-semibold text-right">Cancelled</th>
                  <th className="px-3 py-2 font-semibold text-right">On the books</th>
                </tr>
              </thead>
              <tbody>
                {[...r.byRoomType, { ...t, name: 'All room types', total: true }].map((x) => {
                  const pace = x.total ? r.pace : r.pace.byRoomType.find((p) => p.roomTypeId === x.roomTypeId);
                  return (
                    <tr key={x.roomTypeId || 'total'} className={`border-t border-gray-100 ${x.total ? 'font-semibold bg-gray-50/60' : ''}`}>
                      <td className="px-4 py-2 text-gray-900">{x.name}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{x.occupancy != null ? `${x.occupancy}%` : '—'} <Delta value={x.change?.occupancy} /></td>
                      <td className="px-3 py-2 text-right tabular-nums">{x.sold}<span className="text-gray-400"> / {x.supply}</span></td>
                      <td className="px-3 py-2 text-right tabular-nums">{inr(x.revenue)} <Delta value={x.change?.revenue} /></td>
                      <td className="px-3 py-2 text-right tabular-nums">{inr(x.adr)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{inr(x.revpar)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{x.cancellations}{x.cancellationRate != null ? <span className="text-gray-500"> ({x.cancellationRate}%)</span> : ''}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{pace?.onTheBooks ?? 0}<span className="text-gray-400"> vs {pace?.previousAtSamePoint ?? 0}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {r.hourly.stays > 0 && <p className="text-sm text-gray-600">Hourly stays: {r.hourly.stays} ({inr(r.hourly.revenue)}), not counted in room nights. {prevName}: {r.hourly.previous.stays}.</p>}

          <figure className="bg-white rounded-card border border-gray-200 p-4">
            <figcaption className="font-semibold text-gray-900">Occupancy per night</figcaption>
            <div className="mt-3 h-32 flex items-end gap-[2px]" role="img" aria-label={`Occupancy per night in ${monthName(r.month)}`}>
              {r.daily.map((d) => (
                <div key={d.date} title={`${new Date(`${d.date}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' })}: ${d.occupancy ?? 0}% (${d.sold}/${d.supply})`} className="flex-1 h-full flex items-end">
                  <span className="w-full rounded-t-[3px] bg-navy-600" style={{ height: d.occupancy ? `${Math.max(3, (d.occupancy / maxOcc) * 100)}%` : 0 }} />
                </div>
              ))}
            </div>
            <div className="mt-1 flex justify-between text-xs text-gray-500"><span>1</span><span>{r.daily.length}</span></div>
          </figure>
        </>
      )}
    </section>
  );
};

export default MonthlyReport;
