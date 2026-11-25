import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ShieldAlert, Loader2 } from 'lucide-react';
import { adminOpsApi } from '../../services/api';
import usePageTitle from '../../hooks/usePageTitle';
import useAccess from '../../hooks/useAccess';
import { PageHeader, Card, Pill, Loading, ErrorNote, Empty, RefreshButton } from '../components/ops/OpsUi';
import { when } from '../components/ops/opsFormat';

/**
 * Admin → System control: the platform's safety switches. Each one is enforced on the server
 * (backend/services/ops/controlService.js); every change needs a reason and is logged.
 */
const SwitchRow = ({ s, canEdit, onAsk }) => (
  <li className="flex flex-col sm:flex-row sm:items-center gap-3 py-4">
    <div className="flex-1 min-w-0">
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-semibold text-gray-900">{s.label}</p>
        {s.key === 'experimentsEnabled'
          ? <Pill tone={s.on ? 'ok' : 'warn'}>{s.on ? 'On' : 'Off'}</Pill>
          : <Pill tone={s.on ? (s.danger ? 'down' : 'warn') : 'ok'}>{s.on ? 'On' : 'Off'}</Pill>}
      </div>
      <p className="text-sm text-gray-600 mt-1">{s.on ? s.effectOn : s.effectOff}</p>
      {!s.on && <p className="text-xs text-gray-500 mt-1">When on: {s.effectOn}</p>}
    </div>
    {canEdit && (
      <button type="button" onClick={() => onAsk(s)}
        className={`shrink-0 min-w-[120px] px-4 py-2 rounded-lg text-sm font-bold border ${s.on ? 'border-gray-300 text-gray-800 hover:bg-gray-50' : s.danger ? 'border-red-600 text-red-700 hover:bg-red-50' : 'border-navy-800 text-navy-800 hover:bg-navy-50'}`}>
        {s.on ? 'Turn off' : 'Turn on'}
      </button>
    )}
  </li>
);

const SystemControlCenter = () => {
  usePageTitle('System control');
  const { can } = useAccess();
  const canEdit = can('settings.manage');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [ask, setAsk] = useState(null); // switch being changed
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState('');
  const [saveError, setSaveError] = useState('');

  const load = useCallback(() => {
    setBusy(true); setError('');
    adminOpsApi.control().then(setData).catch((e) => setError(e.message || 'Could not load the switches.')).finally(() => setBusy(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const openAsk = (s) => { setAsk(s); setReason(''); setSaveError(''); setMessage(data?.maintenanceMessage || ''); };
  const confirm = async () => {
    setBusy(true); setSaveError('');
    try {
      const d = await adminOpsApi.setSwitch(ask.key, { on: !ask.on, reason, ...(ask.key === 'maintenanceMode' && !ask.on ? { message } : {}) });
      setData(d); setAsk(null);
    } catch (e) { setSaveError(e.message || 'Could not change the switch.'); } finally { setBusy(false); }
  };

  const active = data?.switches?.filter((s) => (s.key === 'experimentsEnabled' ? !s.on : s.on)) || [];

  return (
    <div className="space-y-6 max-w-5xl">
      <PageHeader title="System control" sub="Switches that change what guests can do on ZivoPlus right now. Every change needs a reason and is logged below.">
        <RefreshButton onClick={load} busy={busy} />
      </PageHeader>

      {error && <ErrorNote error={error} onRetry={load} />}
      {!data && !error && <Loading />}

      {data && (
        <>
          <div className={`rounded-2xl border px-5 py-4 flex items-start gap-3 ${active.length ? 'bg-amber-50 border-amber-200' : 'bg-green-50 border-green-200'}`}>
            <ShieldAlert size={20} className={active.length ? 'text-amber-700' : 'text-green-700'} aria-hidden="true" />
            <p className="text-sm text-gray-900">
              {active.length ? <>Not in the normal position: <b>{active.map((s) => s.label).join(', ')}</b>.</> : <>Everything is running normally. Guests can search, book and pay.</>}
              {' '}<Link to="/admin/system-health" className="font-semibold underline">System health</Link>
            </p>
          </div>

          <Card title="Switches" sub={canEdit ? 'Changes reach every server within a few seconds.' : 'You can see the switches; changing them needs the settings.manage permission.'}>
            <ul className="divide-y divide-gray-100 -my-4">
              {data.switches.map((s) => <SwitchRow key={s.key} s={s} canEdit={canEdit} onAsk={openAsk} />)}
            </ul>
          </Card>

          <Card title="Change log" sub="Who changed a switch, when and why.">
            {data.log.length === 0 ? <Empty>No changes yet.</Empty> : (
              <ol className="space-y-3">
                {data.log.map((l) => (
                  <li key={l.id} className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-4 text-sm">
                    <span className="text-xs text-gray-500 w-32 shrink-0 tabular-nums">{when(l.at)}</span>
                    <span className="min-w-0"><b>{l.label}</b> turned <b>{l.on ? 'on' : 'off'}</b> by {l.by}<span className="text-gray-600"> — {l.reason}</span></span>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </>
      )}

      {ask && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="sw-title">
          <div className="bg-white rounded-2xl w-full max-w-lg p-5 space-y-4">
            <h2 id="sw-title" className="text-lg font-bold text-gray-900">{ask.on ? 'Turn off' : 'Turn on'}: {ask.label}</h2>
            <p className="text-sm text-gray-700">{ask.on ? ask.effectOff : ask.effectOn}</p>
            {ask.key === 'maintenanceMode' && !ask.on && (
              <label className="block text-xs font-semibold text-gray-700">Message guests see (optional)
                <input className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" maxLength={300} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="ZivoPlus is down for maintenance. Please try again in a few minutes." />
              </label>
            )}
            <label className="block text-xs font-semibold text-gray-700">Why? (shown in the change log)
              <textarea rows={3} className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Payment gateway outage, Razorpay status page shows degraded" autoFocus />
            </label>
            {saveError && <p role="alert" className="text-sm text-red-700">{saveError}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setAsk(null)} className="px-4 py-2 rounded-lg border border-gray-200 text-sm font-semibold">Cancel</button>
              <button type="button" onClick={confirm} disabled={busy || reason.trim().length < 5}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold text-white disabled:opacity-50 ${!ask.on && ask.danger ? 'bg-red-600 hover:bg-red-700' : 'bg-navy-800 hover:bg-navy-900'}`}>
                {busy && <Loader2 size={15} className="animate-spin" />} {ask.on ? 'Turn off' : 'Turn on'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SystemControlCenter;
