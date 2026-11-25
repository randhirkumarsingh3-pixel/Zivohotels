import { useCallback, useEffect, useState } from 'react';
import { adminOpsApi } from '../../services/api';
import usePageTitle from '../../hooks/usePageTitle';
import { PageHeader, Card, Stat, Loading, ErrorNote, Empty, RefreshButton, Segmented, Bars, Table } from '../components/ops/OpsUi';
import { inr, int, pct, day } from '../components/ops/opsFormat';

/**
 * Admin → Revenue per search: how many guest searches turn into bookings and money, per day and
 * per city, the steps in between, and searches that found nothing (demand without supply).
 * Data: SearchLog (every search, recorded by the server), hotel page views, checkouts, bookings.
 */
const change = (n) => (n === null || n === undefined ? null : `${n > 0 ? '+' : ''}${n}% vs previous period`);

const RevenuePerSearch = () => {
  usePageTitle('Revenue per search');
  const [days, setDays] = useState('30');
  const [city, setCity] = useState('');
  const [cityInput, setCityInput] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setBusy(true); setError('');
    adminOpsApi.searchRevenue({ days, city }).then(setData).catch((e) => setError(e.message || 'Could not load the numbers.')).finally(() => setBusy(false));
  }, [days, city]);
  useEffect(() => { load(); }, [load]);

  const t = data?.totals;
  const funnelMax = Math.max(1, ...(data?.funnel || []).map((f) => f.count));

  return (
    <div className="space-y-6 max-w-6xl">
      <PageHeader title="Revenue per search" sub="How guest searches turn into bookings and booking value, by day and by city.">
        <form onSubmit={(e) => { e.preventDefault(); setCity(cityInput.trim()); }} className="flex gap-2">
          <label htmlFor="rps-city" className="sr-only">City</label>
          <input id="rps-city" value={cityInput} onChange={(e) => setCityInput(e.target.value)} placeholder="All cities" className="w-36 px-3 py-2 border border-gray-200 rounded-lg text-sm" />
          <button type="submit" className="px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm font-semibold">Apply</button>
        </form>
        <Segmented label="Period" value={days} onChange={setDays} options={[['7', '7 days'], ['30', '30 days'], ['90', '90 days']]} />
        <RefreshButton onClick={load} busy={busy} />
      </PageHeader>

      {error && <ErrorNote error={error} onRetry={load} />}
      {!data && !error && <Loading />}

      {data && (
        <>
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-5">
            <Stat label="Revenue per search" value={t.rps !== null ? `₹${t.rps.toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : '—'} hint="Booking value ÷ searches" />
            <Stat label="Searches" value={int(t.searches)} hint={change(t.change.searches) || `${int(t.visits)} visits searched`} />
            <Stat label="Bookings" value={int(t.bookings)} hint={change(t.change.bookings) || (t.conversionPct !== null ? `${pct(t.conversionPct, 2)} of searches` : null)} />
            <Stat label="Booking value" value={inr(t.revenue)} hint={change(t.change.revenue)} />
            <Stat label="Average booking" value={inr(t.avgBooking)} hint={`${int(t.bookingsFromSearch)} traced to a search`} />
          </div>

          {t.searches === 0 && (
            <p className="text-sm px-4 py-3 rounded-xl bg-sky-50 text-sky-900">No searches recorded in this period yet. Searches are recorded from today&apos;s release onward; revenue per search appears once guests search.</p>
          )}

          <div className="grid gap-6 lg:grid-cols-3">
            <Card title="From search to booking" sub="Each step of the period.">
              <ol className="space-y-3">
                {data.funnel.map((f, i) => {
                  const prev = i ? data.funnel[i - 1].count : null;
                  return (
                    <li key={f.step}>
                      <div className="flex justify-between text-sm"><span className="font-semibold text-gray-900">{f.step}</span><span className="tabular-nums">{int(f.count)}</span></div>
                      <div className="h-2 bg-gray-100 rounded-full mt-1 overflow-hidden"><div className="h-full bg-navy-800 rounded-full" style={{ width: `${(f.count / funnelMax) * 100}%` }} /></div>
                      {prev ? <p className="text-xs text-gray-500 mt-0.5">{pct((f.count / prev) * 100, 1)} of the step before</p> : null}
                    </li>
                  );
                })}
              </ol>
            </Card>
            <Card title="Searches and booking value per day" className="lg:col-span-2">
              <p className="text-xs text-gray-500 mb-2">Searches</p>
              <Bars label="Searches per day" data={data.series.map((s) => ({ label: day(s.day), value: s.searches }))} height={90} />
              <p className="text-xs text-gray-500 mt-4 mb-2">Booking value</p>
              <Bars label="Booking value per day" data={data.series.map((s) => ({ label: day(s.day), value: s.revenue }))} height={90} format={inr} color="#15803d" />
            </Card>
          </div>

          <Card title="By city" sub="Searches typed for the city, and bookings at hotels in it.">
            <Table head={['City', '#Searches', '#Avg. hotels found', '#Found nothing', '#Bookings', '#Booking value', '#Revenue / search']} empty={!data.cities.length && <Empty>No searches or bookings yet.</Empty>}>
              {data.cities.map((c) => (
                <tr key={c.city}>
                  <td className="px-5 py-2 font-semibold">{c.city}</td>
                  <td className="px-5 py-2 text-right tabular-nums">{int(c.searches)}</td>
                  <td className="px-5 py-2 text-right tabular-nums">{c.avgResults ?? '—'}</td>
                  <td className={`px-5 py-2 text-right tabular-nums ${c.zeroResultPct >= 20 ? 'text-red-600 font-semibold' : ''}`}>{pct(c.zeroResultPct)}</td>
                  <td className="px-5 py-2 text-right tabular-nums">{int(c.bookings)}</td>
                  <td className="px-5 py-2 text-right tabular-nums">{inr(c.revenue)}</td>
                  <td className="px-5 py-2 text-right tabular-nums">{c.rps !== null ? `₹${c.rps}` : '—'}</td>
                </tr>
              ))}
            </Table>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card title="Searches that found no hotel" sub="Places guests want that ZivoPlus can't serve yet: candidates for new properties.">
              {data.zeroResults.length === 0 ? <Empty>Every search found at least one hotel.</Empty> : (
                <ul className="divide-y divide-gray-50">
                  {data.zeroResults.map((z) => <li key={z.place} className="flex justify-between py-2 text-sm"><span>{z.place}</span><span className="tabular-nums font-semibold">{int(z.searches)}</span></li>)}
                </ul>
              )}
            </Card>
            <Card title="How far ahead guests search" sub="Days between the search and the check-in date.">
              <Bars label="Searches by days ahead" data={data.leadTime.map((l) => ({ label: l.label, value: l.searches }))} height={110} showEvery={1} />
            </Card>
          </div>

          <ul className="text-xs text-gray-500 space-y-1 list-disc pl-5">{data.notes.map((n) => <li key={n}>{n}</li>)}</ul>
        </>
      )}
    </div>
  );
};

export default RevenuePerSearch;
