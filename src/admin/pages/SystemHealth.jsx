import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Database, Server, Mail, FileText, HardDrive, Activity, Cpu, ToggleLeft } from 'lucide-react';
import { adminOpsApi } from '../../services/api';
import usePageTitle from '../../hooks/usePageTitle';
import { PageHeader, Card, Pill, Loading, ErrorNote, Empty, RefreshButton, Bars, Table } from '../components/ops/OpsUi';
import { STATUS_LABEL, int, when } from '../components/ops/opsFormat';

/**
 * Admin → System health: live checks of the database, Redis, the job queue (emails), invoices,
 * disk, traffic (requests, errors, response times), server processes and the safety switches.
 * Refreshes every 30 seconds while open.
 */
const CHECKS = [
  ['database', 'Database', Database, (c) => c.latencyMs !== undefined && `${c.latencyMs} ms · ${int(c.sizeMb)} MB · ${c.connections} connections`],
  ['redis', 'Redis (shared memory)', Server, (c) => (c.latencyMs !== undefined ? `${c.latencyMs} ms · ${c.memoryMb} MB` : null)],
  ['jobs', 'Emails & background jobs', Mail, (c) => `${c.waitingMin ? `oldest waiting ${c.waitingMin} min · ` : ''}${c.failed24h} failed (24 h)${c.lastCompletedAt ? ` · last sent ${when(c.lastCompletedAt)}` : ''}`],
  ['invoices', 'Guest invoices', FileText, (c) => `${c.missingPdf} without a PDF`],
  ['disk', 'Disk space', HardDrive, (c) => (c.usedPct !== undefined ? `${c.usedPct}% used · ${c.freeGb} GB free of ${c.totalGb} GB` : null)],
  ['traffic', 'Website & app traffic', Activity, (c) => `${c.requestsPerMin}/min · ${c.errorPct15m}% errors (15 min) · typical ${c.p50Ms ? `< ${c.p50Ms} ms` : '—'}`],
  ['processes', 'Server processes', Cpu, (c) => `${c.list.length} running`],
  ['switches', 'Safety switches', ToggleLeft, (c) => (c.active.length ? c.active.join(', ') : 'Normal')],
];

const SystemHealth = () => {
  usePageTitle('System health');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setBusy(true);
    adminOpsApi.health().then((d) => { setData(d); setError(''); }).catch((e) => setError(e.message || 'Could not run the checks.')).finally(() => setBusy(false));
  }, []);
  useEffect(() => {
    load();
    const t = setInterval(() => { if (document.visibilityState === 'visible') load(); }, 30000);
    return () => clearInterval(t);
  }, [load]);

  const c = data?.checks;
  const overallText = { ok: 'All systems normal', warn: 'Something needs attention', down: 'There is a problem' };

  return (
    <div className="space-y-6 max-w-6xl">
      <PageHeader title="System health" sub="Live checks of everything ZivoPlus runs on. Refreshes every 30 seconds while this page is open.">
        {data && <span className="text-xs text-gray-500">Checked {when(data.checkedAt)}</span>}
        <RefreshButton onClick={load} busy={busy} />
      </PageHeader>

      {error && <ErrorNote error={error} onRetry={load} />}
      {!data && !error && <Loading text="Running the checks…" />}

      {data && (
        <>
          <div className={`rounded-2xl border px-5 py-4 ${data.overall === 'ok' ? 'bg-green-50 border-green-200' : data.overall === 'warn' ? 'bg-amber-50 border-amber-200' : 'bg-red-50 border-red-200'}`}>
            <p className="font-bold text-gray-900">{overallText[data.overall]}</p>
            <p className="text-sm text-gray-700 mt-0.5">
              {Object.entries(c).filter(([, v]) => v.status !== 'ok').map(([k, v]) => `${CHECKS.find((x) => x[0] === k)?.[1]}: ${v.note}`).join(' ') || 'Database, jobs, disk and traffic are all within normal limits.'}
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {CHECKS.map(([key, label, Icon, detail]) => {
              const v = c[key];
              return (
                <div key={key} className="bg-white border border-gray-200 rounded-2xl p-4 flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-sm font-semibold text-gray-900"><Icon size={16} className="text-gray-400" aria-hidden="true" /> {label}</span>
                    <Pill tone={v.status}>{STATUS_LABEL[v.status]}</Pill>
                  </div>
                  <p className="text-xs text-gray-600 tabular-nums">{detail(v) || ''}</p>
                  <p className="text-xs text-gray-500">{v.note}</p>
                </div>
              );
            })}
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <Card title="Requests per minute" sub="Last 60 minutes, all server processes. Red: server errors." className="lg:col-span-2">
              <Bars label="Requests per minute" data={c.traffic.series.map((s) => ({ label: new Date(s.minute).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }), value: s.requests, color: s.errors ? '#dc2626' : undefined }))} />
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 text-sm">
                <div><p className="text-xs text-gray-500">Requests (60 min)</p><p className="font-bold tabular-nums">{int(c.traffic.requests60m)}</p></div>
                <div><p className="text-xs text-gray-500">Server errors (60 min)</p><p className={`font-bold tabular-nums ${c.traffic.errors5xx60m ? 'text-red-600' : ''}`}>{int(c.traffic.errors5xx60m)}</p></div>
                <div><p className="text-xs text-gray-500">Average response</p><p className="font-bold tabular-nums">{c.traffic.avgMs !== null ? `${c.traffic.avgMs} ms` : '—'}</p></div>
                <div><p className="text-xs text-gray-500">95% answered within</p><p className="font-bold tabular-nums">{c.traffic.p95Ms ? `${c.traffic.p95Ms >= 5000 ? '5 s+' : `${c.traffic.p95Ms} ms`}` : '—'}</p></div>
              </div>
            </Card>

            <Card title="Server processes" sub="Memory and how busy each one is.">
              <ul className="space-y-3 text-sm">
                {c.processes.list.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3">
                    <span className="min-w-0">
                      <b>Process {p.worker || 1}</b>{p.runsJobs && <span className="ml-2"><Pill tone="info">Runs jobs</Pill></span>}
                      <span className="block text-xs text-gray-500">up {Math.floor(p.uptimeSec / 3600)} h {Math.floor((p.uptimeSec % 3600) / 60)} min</span>
                    </span>
                    <span className="text-xs text-gray-600 tabular-nums text-right">{p.rssMb} MB<br />delay {p.loopDelayMs} ms</span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card title="Slowest routes" sub="Average response time, last 2 hours (3+ requests).">
              <Table head={['Route', '#Requests', '#Average']} empty={!c.traffic.slowest.length && <Empty>Not enough traffic yet.</Empty>}>
                {c.traffic.slowest.map((r) => <tr key={r.route}><td className="px-5 py-2 font-mono text-xs break-all">{r.route}</td><td className="px-5 py-2 text-right tabular-nums">{int(r.requests)}</td><td className={`px-5 py-2 text-right tabular-nums ${r.avgMs >= 1000 ? 'text-red-600 font-semibold' : ''}`}>{r.avgMs} ms</td></tr>)}
              </Table>
            </Card>
            <Card title="Routes with server errors" sub="Last 2 hours. Details are in the server logs.">
              <Table head={['Route', '#Errors', '#Requests']} empty={!c.traffic.failing.length && <Empty>No server errors.</Empty>}>
                {c.traffic.failing.map((r) => <tr key={r.route}><td className="px-5 py-2 font-mono text-xs break-all">{r.route}</td><td className="px-5 py-2 text-right tabular-nums text-red-600 font-semibold">{int(r.errors)}</td><td className="px-5 py-2 text-right tabular-nums">{int(r.requests)}</td></tr>)}
              </Table>
            </Card>
          </div>

          <Card title="Background jobs" sub="Emails and other work done in the background, last 24 hours.">
            <div className="flex flex-wrap gap-3 mb-4">
              {Object.entries(c.jobs.queues).map(([q, st]) => (
                <div key={q} className="border border-gray-200 rounded-xl px-3 py-2 text-xs">
                  <p className="font-semibold text-gray-900 capitalize">{q}</p>
                  <p className="text-gray-600 tabular-nums">{Object.entries(st).map(([k, n]) => `${k.toLowerCase()} ${n}`).join(' · ')}</p>
                </div>
              ))}
              {!Object.keys(c.jobs.queues).length && <p className="text-sm text-gray-500">No jobs in the last 24 hours.</p>}
            </div>
            {c.jobs.failed.length > 0 && (
              <Table head={['Job', 'Error', '#Tries', 'When']}>
                {c.jobs.failed.map((j) => <tr key={j.id}><td className="px-5 py-2 text-xs">{j.queue} · {j.jobType}</td><td className="px-5 py-2 text-xs text-red-700 break-all">{(j.lastError || '').slice(0, 160)}</td><td className="px-5 py-2 text-right tabular-nums">{j.attempts}</td><td className="px-5 py-2 text-xs whitespace-nowrap">{when(j.updatedAt)}</td></tr>)}
              </Table>
            )}
          </Card>

          <p className="text-xs text-gray-500">Running Node {data.nodeVersion}{data.version ? ` · version ${data.version}` : ''}. Safety switches are in <Link to="/admin/control-center" className="underline">System control</Link>.</p>
        </>
      )}
    </div>
  );
};

export default SystemHealth;
