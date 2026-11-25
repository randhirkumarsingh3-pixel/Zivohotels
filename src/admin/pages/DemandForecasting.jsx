import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { TrendingUp, TrendingDown, Info, AlertTriangle } from 'lucide-react';
import { adminOpsApi } from '../../services/api';
import usePageTitle from '../../hooks/usePageTitle';
import { PageHeader, Card, Stat, Pill, Loading, ErrorNote, Empty, RefreshButton, Segmented, Bars, Table } from '../components/ops/OpsUi';
import { inr, int, pct } from '../components/ops/opsFormat';

/**
 * Admin → Demand forecasting: for each coming night, rooms for sale, rooms already booked, the
 * expected final occupancy (from how bookings usually come in that close to arrival over the last
 * 90 nights) and how many guests searched for it. Suggestions are rules with their reason;
 * prices are changed by people in the calendar, never automatically from here.
 */
const TONE_ICON = { up: TrendingUp, down: TrendingDown, warn: AlertTriangle, info: Info };
const occTone = (p) => (p === null ? 'off' : p >= 85 ? 'high' : p >= 60 ? 'medium' : 'low');
const CONF = { good: ['ok', 'Good history'], fair: ['medium', 'Some history'], low: ['warn', 'Little history'], none: ['off', 'No history yet'] };

const DemandForecasting = () => {
  usePageTitle('Demand forecasting');
  const [days, setDays] = useState('30');
  const [city, setCity] = useState('');
  const [cityInput, setCityInput] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setBusy(true); setError('');
    adminOpsApi.forecast({ days, city }).then(setData).catch((e) => setError(e.message || 'Could not load the forecast.')).finally(() => setBusy(false));
  }, [days, city]);
  useEffect(() => { load(); }, [load]);

  const t = data?.totals;
  const conf = CONF[data?.model?.confidence || 'none'];

  return (
    <div className="space-y-6 max-w-6xl">
      <PageHeader title="Demand forecasting" sub="Rooms booked and expected for each coming night, with what guests are searching for. Use it to decide where to raise prices or run an offer.">
        <form onSubmit={(e) => { e.preventDefault(); setCity(cityInput.trim()); }} className="flex gap-2">
          <label htmlFor="fc-city" className="sr-only">City</label>
          <input id="fc-city" value={cityInput} onChange={(e) => setCityInput(e.target.value)} placeholder="All cities" className="w-36 px-3 py-2 border border-gray-200 rounded-lg text-sm" />
          <button type="submit" className="px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm font-semibold">Apply</button>
        </form>
        <Segmented label="Nights ahead" value={days} onChange={setDays} options={[['14', '14 nights'], ['30', '30 nights'], ['90', '90 nights']]} />
        <RefreshButton onClick={load} busy={busy} />
      </PageHeader>

      {error && <ErrorNote error={error} onRetry={load} />}
      {!data && !error && <Loading />}

      {data && !t && <Empty>No live hotels {city ? `in ${city}` : ''} yet.</Empty>}

      {data && t && (
        <>
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-5">
            <Stat label="Booked, next 7 nights" value={pct(t.occupancy7Pct)} hint={`Expected ${pct(t.forecast7Pct)}`} />
            <Stat label={`Booked, next ${data.period.days} nights`} value={pct(t.occupancyPct)} hint={`Expected ${pct(t.forecastPct)} · ${int(t.booked)} of ${int(t.capacity)} room nights`} />
            <Stat label="Average room rate booked" value={inr(t.adr)} hint={`${inr(t.revenueOnBooks)} on the books`} />
            <Stat label="Booking pace" value={`${int(t.pace7)} room nights`} hint={t.paceChangePct !== null ? `booked in the last 7 days, ${t.paceChangePct > 0 ? '+' : ''}${t.paceChangePct}% vs the week before` : 'booked in the last 7 days'} tone={t.paceChangePct > 0 ? 'good' : t.paceChangePct < 0 ? 'bad' : undefined} />
            <Stat label="Searches for these nights" value={int(t.searches)} hint="made in the last 30 days" />
          </div>

          {data.suggestions.length > 0 && (
            <Card title="What to look at" sub="Rules based on the numbers below. Nothing is changed automatically.">
              <ul className="space-y-3">
                {data.suggestions.map((s) => {
                  const Icon = TONE_ICON[s.tone] || Info;
                  return (
                    <li key={s.title} className="flex gap-3">
                      <Icon size={18} className={`shrink-0 mt-0.5 ${s.tone === 'up' ? 'text-green-700' : s.tone === 'down' ? 'text-amber-700' : s.tone === 'warn' ? 'text-red-600' : 'text-sky-700'}`} aria-hidden="true" />
                      <div><p className="text-sm font-semibold text-gray-900">{s.title}</p><p className="text-sm text-gray-600">{s.detail}</p></div>
                    </li>
                  );
                })}
              </ul>
              <p className="text-xs text-gray-500 mt-4">Change prices or open dates in <Link to="/admin/inventory-pricing" className="underline font-semibold">Inventory &amp; pricing</Link> (or the hotel&apos;s Extranet calendar).</p>
            </Card>
          )}

          <Card title="Occupancy by night" sub="Dark: rooms already booked. Grey: rooms for sale. The expected occupancy for each night is in the table below." right={<Pill tone={conf[0]}>{conf[1]}</Pill>}>
            <Bars label="Rooms booked and expected per night" data={data.nights.map((n) => ({ label: `${n.weekday.slice(0, 2)} ${n.date.slice(8)}`, value: n.booked, value2: n.capacity }))} height={150} />
            <p className="text-xs text-gray-500 mt-3">{data.model.method} Based on {int(data.model.historyBookings)} bookings.</p>
          </Card>

          <Card title="Night by night">
            <Table head={['Night', '#For sale', '#Booked', '#Booked %', '#Expected %', '#Avg rate', '#Searches', '']}>
              {data.nights.map((n) => (
                <tr key={n.date} className={n.closed ? 'bg-red-50/40' : ''}>
                  <td className="px-5 py-2 whitespace-nowrap"><b>{n.weekday}</b> {new Date(`${n.date}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' })}</td>
                  <td className="px-5 py-2 text-right tabular-nums">{int(n.capacity)}</td>
                  <td className="px-5 py-2 text-right tabular-nums">{int(n.booked)}</td>
                  <td className="px-5 py-2 text-right tabular-nums">{pct(n.occupancyPct)}</td>
                  <td className="px-5 py-2 text-right"><Pill tone={occTone(n.forecastPct)}>{pct(n.forecastPct)}</Pill></td>
                  <td className="px-5 py-2 text-right tabular-nums">{inr(n.adr)}</td>
                  <td className="px-5 py-2 text-right tabular-nums">{int(n.searches)}</td>
                  <td className="px-5 py-2 text-xs text-red-700">{n.closed ? 'No rooms for sale' : ''}</td>
                </tr>
              ))}
            </Table>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card title="By city" sub="Next 14 nights.">
              <Table head={['City', '#Hotels', '#Room nights', '#Booked']} empty={!data.cities.length && <Empty>No cities.</Empty>}>
                {data.cities.map((c) => <tr key={c.city}><td className="px-5 py-2 font-semibold">{c.city}</td><td className="px-5 py-2 text-right tabular-nums">{c.hotels}</td><td className="px-5 py-2 text-right tabular-nums">{int(c.capacity)}</td><td className="px-5 py-2 text-right"><Pill tone={occTone(c.occupancyPct)}>{pct(c.occupancyPct)}</Pill></td></tr>)}
              </Table>
            </Card>
            <Card title="By hotel" sub="Next 14 nights, fullest first.">
              <Table head={['Hotel', '#Booked', '#Avg rate']} empty={!data.hotels.length && <Empty>No hotels.</Empty>}>
                {data.hotels.map((h) => <tr key={h.id}><td className="px-5 py-2"><span className="font-semibold">{h.name}</span><span className="block text-xs text-gray-500">{h.city}</span></td><td className="px-5 py-2 text-right"><Pill tone={occTone(h.occupancyPct)}>{pct(h.occupancyPct)}</Pill></td><td className="px-5 py-2 text-right tabular-nums">{inr(h.adr)}</td></tr>)}
              </Table>
            </Card>
          </div>
        </>
      )}
    </div>
  );
};

export default DemandForecasting;
