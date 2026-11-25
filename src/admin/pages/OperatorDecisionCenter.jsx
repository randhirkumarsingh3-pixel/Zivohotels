import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Loader2, Play, Pause, Flag, Trash2, BarChart3 } from 'lucide-react';
import { adminOpsApi } from '../../services/api';
import usePageTitle from '../../hooks/usePageTitle';
import useAccess from '../../hooks/useAccess';
import { PageHeader, Card, Pill, Loading, ErrorNote, Empty, RefreshButton, Table } from '../components/ops/OpsUi';
import { int, inr, pct, when } from '../components/ops/opsFormat';

/**
 * Admin → Experiments: A/B tests on the website. Each visitor always sees the same version;
 * results compare booking rates per version with a significance check. A test only changes
 * what guests see where the website's code uses its name (listed at the top).
 */
const STATUS = { DRAFT: ['off', 'Draft'], ACTIVE: ['ok', 'Running'], PAUSED: ['warn', 'Paused'], CONCLUDED: ['info', 'Ended'] };
const input = 'mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm';

const NewTest = ({ website, onCreated, onCancel }) => {
  const [name, setName] = useState(website.find((w) => !w.setUp)?.name || '');
  const [traffic, setTraffic] = useState(100);
  const [variants, setVariants] = useState([{ name: 'control', weight: 50 }, { name: 'variantA', weight: 50 }]);
  const [notes, setNotes] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const known = website.find((w) => w.name === name);
  const total = variants.reduce((s, v) => s + (Number(v.weight) || 0), 0);
  const save = async () => {
    setBusy(true); setErr('');
    try { onCreated(await adminOpsApi.createExperiment({ name, traffic: Number(traffic), variants: variants.map((v) => ({ ...v, weight: Number(v.weight) })), notes })); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <Card title="New test" sub="It starts as a draft. Start it when you're ready.">
      <div className="grid gap-4 md:grid-cols-2">
        <label className="text-xs font-semibold text-gray-700">Test name
          <input className={input} value={name} onChange={(e) => setName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))} list="known-tests" placeholder="badge_urgency" />
          <datalist id="known-tests">{website.map((w) => <option key={w.name} value={w.name} />)}</datalist>
          <span className={`block mt-1 font-normal ${known ? 'text-green-700' : 'text-amber-700'}`}>{known ? `Used by the website: ${known.where}.` : name ? 'The website doesn\'t use this name yet, so guests won\'t see a difference until a developer adds it.' : ''}</span>
        </label>
        <label className="text-xs font-semibold text-gray-700">Share of visitors in the test (%)
          <input type="number" min="1" max="100" className={input} value={traffic} onChange={(e) => setTraffic(e.target.value)} />
          <span className="block mt-1 font-normal text-gray-500">Visitors outside the test see control.</span>
        </label>
      </div>
      <fieldset className="mt-4">
        <legend className="text-xs font-semibold text-gray-700">Versions and their share (must add up to 100; one must be &quot;control&quot;)</legend>
        <div className="mt-2 space-y-2">
          {variants.map((v, i) => (
            <div key={i} className="flex gap-2 items-center">
              <label className="sr-only" htmlFor={`vn-${i}`}>Version name</label>
              <input id={`vn-${i}`} className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm" value={v.name} onChange={(e) => setVariants(variants.map((x, j) => (j === i ? { ...x, name: e.target.value.replace(/[^A-Za-z0-9_]/g, '') } : x)))} />
              <label className="sr-only" htmlFor={`vw-${i}`}>Share</label>
              <input id={`vw-${i}`} type="number" min="0" max="100" className="w-24 px-3 py-2 border border-gray-200 rounded-lg text-sm" value={v.weight} onChange={(e) => setVariants(variants.map((x, j) => (j === i ? { ...x, weight: e.target.value } : x)))} />
              {known?.variants?.[v.name] && <span className="text-xs text-gray-500 hidden md:inline w-48 truncate">{known.variants[v.name]}</span>}
              {variants.length > 2 && <button type="button" aria-label="Remove version" onClick={() => setVariants(variants.filter((_, j) => j !== i))} className="p-2 text-gray-400 hover:text-red-600"><Trash2 size={15} /></button>}
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between mt-2">
          <button type="button" onClick={() => setVariants([...variants, { name: `variant${String.fromCharCode(65 + variants.length - 1)}`, weight: 0 }])} className="text-sm font-semibold text-navy-800">+ Add version</button>
          <span className={`text-xs tabular-nums ${total === 100 ? 'text-gray-500' : 'text-red-600 font-semibold'}`}>Total {total}%</span>
        </div>
      </fieldset>
      <label className="block text-xs font-semibold text-gray-700 mt-4">What you expect to learn (optional)
        <input className={input} value={notes} maxLength={500} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. The urgency line increases bookings" />
      </label>
      {err && <p role="alert" className="text-sm text-red-700 mt-3">{err}</p>}
      <div className="flex justify-end gap-2 mt-4">
        <button type="button" onClick={onCancel} className="px-4 py-2 rounded-lg border border-gray-200 text-sm font-semibold">Cancel</button>
        <button type="button" onClick={save} disabled={busy || total !== 100 || !name} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-navy-800 text-white text-sm font-bold disabled:opacity-50">{busy && <Loader2 size={15} className="animate-spin" />} Save draft</button>
      </div>
    </Card>
  );
};

const Results = ({ id }) => {
  const [r, setR] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => { adminOpsApi.experimentResults(id).then(setR).catch((e) => setErr(e.message)); }, [id]);
  if (err) return <p className="text-sm text-red-700">{err}</p>;
  if (!r) return <Loading text="Counting results…" />;
  return (
    <div className="space-y-3">
      <p className={`text-sm px-3 py-2 rounded-lg ${r.verdict.tone === 'good' ? 'bg-green-50 text-green-800' : r.verdict.tone === 'bad' ? 'bg-red-50 text-red-700' : 'bg-sky-50 text-sky-900'}`}>{r.verdict.text}</p>
      <Table head={['Version', '#Visitors', '#Viewed a hotel', '#Started checkout', '#Booked', '#Booking rate', '#vs control', '#Booking value', '#p']}>
        {r.variants.map((v) => (
          <tr key={v.name}>
            <td className="px-5 py-2 font-semibold">{v.name} <span className="text-xs text-gray-500 font-normal">{v.weight}%</span></td>
            <td className="px-5 py-2 text-right tabular-nums">{int(v.visitors)}</td>
            <td className="px-5 py-2 text-right tabular-nums">{int(v.viewers)}</td>
            <td className="px-5 py-2 text-right tabular-nums">{int(v.checkouts)}</td>
            <td className="px-5 py-2 text-right tabular-nums">{int(v.bookings)}</td>
            <td className="px-5 py-2 text-right tabular-nums">{pct(v.conversionPct, 2)}</td>
            <td className={`px-5 py-2 text-right tabular-nums ${v.upliftPct > 0 ? 'text-green-700' : v.upliftPct < 0 ? 'text-red-600' : ''}`}>{v.upliftPct === null ? '—' : `${v.upliftPct > 0 ? '+' : ''}${v.upliftPct}%`}</td>
            <td className="px-5 py-2 text-right tabular-nums">{inr(v.revenue)}</td>
            <td className="px-5 py-2 text-right tabular-nums">{v.pValue ?? '—'}</td>
          </tr>
        ))}
      </Table>
      <ul className="text-xs text-gray-500 list-disc pl-5">{r.notes.map((n) => <li key={n}>{n}</li>)}</ul>
    </div>
  );
};

const Experiments = () => {
  usePageTitle('Experiments');
  const { can } = useAccess();
  const canEdit = can('settings.manage');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState(null);
  const [actionErr, setActionErr] = useState('');

  const load = useCallback(() => {
    setBusy(true); setError('');
    adminOpsApi.experiments().then(setData).catch((e) => setError(e.message || 'Could not load the tests.')).finally(() => setBusy(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const [ending, setEnding] = useState(null); // { id, winner }
  const act = async (e, body) => {
    setActionErr('');
    try { await adminOpsApi.updateExperiment(e.id, body); setEnding(null); load(); } catch (err) { setActionErr(err.message); }
  };
  const remove = async (e) => { setActionErr(''); try { await adminOpsApi.deleteExperiment(e.id); load(); } catch (err) { setActionErr(err.message); } };

  return (
    <div className="space-y-6 max-w-6xl">
      <PageHeader title="Experiments" sub="Try two versions of part of the website and keep the one that gets more bookings. Each visitor always sees the same version.">
        <RefreshButton onClick={load} busy={busy} />
        {canEdit && !creating && <button type="button" onClick={() => setCreating(true)} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-navy-800 text-white text-sm font-bold"><Plus size={15} /> New test</button>}
      </PageHeader>

      {error && <ErrorNote error={error} onRetry={load} />}
      {!data && !error && <Loading />}

      {data && (
        <>
          {!data.experimentsOn && (
            <p className="text-sm px-4 py-3 rounded-xl bg-amber-50 text-amber-900">Experiments are switched off in <Link to="/admin/control-center" className="underline font-semibold">System control</Link>. Every visitor sees control until they&apos;re switched on again.</p>
          )}

          <Card title="Tests the website supports" sub="The website's code checks these names. A test with another name has no visible effect.">
            <ul className="divide-y divide-gray-100 -my-2">
              {data.website.map((w) => (
                <li key={w.name} className="py-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2"><code className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">{w.name}</code><span className="font-semibold">{w.where}</span>{w.setUp ? <Pill tone="info">Set up below</Pill> : <Pill>Not set up</Pill>}</div>
                  <p className="text-gray-600 mt-1">{w.what}</p>
                  <p className="text-xs text-gray-500 mt-1">{Object.entries(w.variants).map(([k, v]) => `${k}: ${v}`).join(' · ')}</p>
                </li>
              ))}
            </ul>
          </Card>

          {creating && <NewTest website={data.website} onCancel={() => setCreating(false)} onCreated={() => { setCreating(false); load(); }} />}
          {actionErr && <p role="alert" className="text-sm text-red-700">{actionErr}</p>}

          <Card title="Tests">
            {data.experiments.length === 0 ? <Empty>No tests yet.{canEdit ? ' Choose New test to set one up.' : ''}</Empty> : (
              <ul className="divide-y divide-gray-100 -my-4">
                {data.experiments.map((e) => (
                  <li key={e.id} className="py-4">
                    <div className="flex flex-col md:flex-row md:items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2"><code className="font-mono text-sm font-semibold">{e.name}</code><Pill tone={STATUS[e.status]?.[0]}>{STATUS[e.status]?.[1] || e.status}</Pill>{!e.website && <Pill tone="warn">Not used by the website</Pill>}{e.winner && <Pill tone="ok">Winner: {e.winner}</Pill>}</div>
                        <p className="text-xs text-gray-500 mt-1">{e.variants.map((v) => `${v.name} ${v.weight}%`).join(' · ')} · {e.traffic}% of visitors · {e.startAt ? `started ${when(e.startAt)}` : 'not started'}{e.concludedAt ? ` · ended ${when(e.concludedAt)}` : ''}{e.owner ? ` · ${e.owner}` : ''}</p>
                        {e.notes && <p className="text-sm text-gray-600 mt-1">{e.notes}</p>}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={() => setOpen(open === e.id ? null : e.id)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-sm font-semibold"><BarChart3 size={14} /> Results</button>
                        {canEdit && ['DRAFT', 'PAUSED'].includes(e.status) && <button type="button" onClick={() => act(e, { status: 'ACTIVE' })} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-700 text-white text-sm font-semibold"><Play size={14} /> {e.status === 'DRAFT' ? 'Start' : 'Resume'}</button>}
                        {canEdit && e.status === 'ACTIVE' && <button type="button" onClick={() => act(e, { status: 'PAUSED' })} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-300 text-sm font-semibold"><Pause size={14} /> Pause</button>}
                        {canEdit && ['ACTIVE', 'PAUSED'].includes(e.status) && <button type="button" onClick={() => setEnding({ id: e.id, winner: '' })} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-300 text-sm font-semibold"><Flag size={14} /> End</button>}
                        {canEdit && e.status === 'DRAFT' && <button type="button" onClick={() => remove(e)} aria-label={`Delete ${e.name}`} className="p-2 rounded-lg text-gray-400 hover:text-red-600"><Trash2 size={15} /></button>}
                      </div>
                    </div>
                    {ending?.id === e.id && (
                      <div className="mt-3 flex flex-wrap items-center gap-2 bg-gray-50 rounded-xl p-3 text-sm">
                        <label htmlFor={`win-${e.id}`} className="font-semibold">End the test. Winner:</label>
                        <select id={`win-${e.id}`} value={ending.winner} onChange={(ev) => setEnding({ ...ending, winner: ev.target.value })} className="px-2 py-1.5 border border-gray-200 rounded-lg">
                          <option value="">No winner</option>
                          {e.variants.map((v) => <option key={v.name} value={v.name}>{v.name}</option>)}
                        </select>
                        <button type="button" onClick={() => act(e, { status: 'CONCLUDED', winner: ending.winner || undefined })} className="px-3 py-1.5 rounded-lg bg-navy-800 text-white font-semibold">End test</button>
                        <button type="button" onClick={() => setEnding(null)} className="px-3 py-1.5 rounded-lg border border-gray-200 font-semibold">Cancel</button>
                        <span className="text-xs text-gray-500 w-full">Ending stops the test for everyone; visitors then see control. To show the winner to everyone, a developer makes it the standard version.</span>
                      </div>
                    )}
                    {open === e.id && <div className="mt-4"><Results id={e.id} /></div>}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </div>
  );
};

export default Experiments;
