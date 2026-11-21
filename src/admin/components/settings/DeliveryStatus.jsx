import { useCallback, useEffect, useState } from 'react';
import { Mail, MessageSquare, RefreshCw, CheckCircle2, AlertTriangle, Loader2, FlaskConical } from 'lucide-react';
import { getDeliveryStatus, retryFailedEmails } from '../../../services/api';

/** Admin: is email / SMS really going out, and what happened to the latest emails. */
const STATUS = {
  COMPLETED: ['Sent', 'bg-green-50 text-green-700'],
  FAILED: ['Failed', 'bg-red-50 text-red-700'],
  PENDING: ['Waiting', 'bg-amber-50 text-amber-800'],
  RETRY: ['Retrying', 'bg-amber-50 text-amber-800'],
  PROCESSING: ['Sending', 'bg-navy-50 text-navy-700'],
  CANCELLED: ['Cancelled', 'bg-gray-100 text-gray-600'],
};

const Pill = ({ ok, warn, children }) => (
  <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${ok ? 'bg-green-50 text-green-700' : warn ? 'bg-amber-50 text-amber-800' : 'bg-red-50 text-red-700'}`}>
    {ok ? <CheckCircle2 size={12} aria-hidden="true" /> : warn ? <FlaskConical size={12} aria-hidden="true" /> : <AlertTriangle size={12} aria-hidden="true" />}{children}
  </span>
);

const DeliveryStatus = () => {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    setError('');
    try { setData(await getDeliveryStatus()); } catch (e) { setError(e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const retry = async () => {
    setBusy(true); setNote('');
    try { const r = await retryFailedEmails(); setNote(r?.message || 'Queued again.'); await load(); } catch (e) { setNote(e.message); } finally { setBusy(false); }
  };

  if (error) return <p className="text-sm text-red-700">{error}</p>;
  if (!data) return <div className="flex justify-center py-8"><Loader2 className="animate-spin text-navy-700" /></div>;
  const failed = data.last7Days?.FAILED || 0;
  const lastError = data.recent.find((r) => r.status === 'FAILED' && r.error)?.error;

  return (
    <div className="space-y-5 mb-8">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-gray-900">Email &amp; SMS delivery</h3>
        <button type="button" onClick={load} className="flex items-center gap-1.5 text-sm font-semibold text-navy-700 hover:text-navy-900"><RefreshCw size={14} aria-hidden="true" /> Refresh</button>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div className="border border-gray-200 rounded-card p-4">
          <p className="flex items-center gap-2 font-semibold text-gray-900"><Mail size={16} aria-hidden="true" /> Email · {data.email.provider}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Pill ok={data.email.keySet}>{data.email.keySet ? 'API key set' : 'No API key'}</Pill>
            {data.email.testMode && <Pill warn>Test mode: codes shown on screen</Pill>}
            <Pill ok={failed === 0}>{failed === 0 ? 'No failures this week' : `${failed} failed this week`}</Pill>
          </div>
          <p className="mt-2 text-xs text-gray-500 break-all">From: {data.email.from}</p>
          {lastError && <p className="mt-2 text-xs text-red-700">Latest error: {lastError}</p>}
        </div>
        <div className="border border-gray-200 rounded-card p-4">
          <p className="flex items-center gap-2 font-semibold text-gray-900"><MessageSquare size={16} aria-hidden="true" /> SMS · {data.sms.provider === 'test' ? 'not connected' : data.sms.provider}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {data.sms.testMode ? <Pill warn>Test mode: codes shown on screen</Pill> : <Pill ok>Connected</Pill>}
            <Pill ok={data.google.configured} warn={!data.google.configured}>{data.google.configured ? 'Google sign-in on' : 'Google sign-in off (no client id)'}</Pill>
          </div>
          <p className="mt-2 text-xs text-gray-500">Set SMS_PROVIDER (msg91 or twilio) and its keys on the server to send real SMS.</p>
        </div>
      </div>

      <div className="border border-gray-200 rounded-card overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold text-gray-900">Latest emails</p>
          {failed > 0 && (
            <button type="button" disabled={busy} onClick={retry} className="text-sm font-semibold text-navy-700 hover:text-navy-900 disabled:opacity-60">
              {busy ? 'Queuing…' : 'Retry failed emails (last 3 days)'}
            </button>
          )}
        </div>
        {note && <p role="status" className="px-4 py-2 text-sm text-gray-700 bg-gray-50">{note}</p>}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs text-gray-500"><tr><th className="px-4 py-2 font-semibold">When</th><th className="px-4 py-2 font-semibold">To</th><th className="px-4 py-2 font-semibold">Subject</th><th className="px-4 py-2 font-semibold">Status</th></tr></thead>
            <tbody className="divide-y divide-gray-100">
              {data.recent.length === 0 && <tr><td colSpan={4} className="px-4 py-6 text-center text-gray-500">No emails yet.</td></tr>}
              {data.recent.map((r) => {
                const [label, cls] = STATUS[r.status] || [r.status, 'bg-gray-100 text-gray-600'];
                return (
                  <tr key={r.id} className="align-top">
                    <td className="px-4 py-2 whitespace-nowrap text-gray-500 tabular-nums">{new Date(r.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                    <td className="px-4 py-2 text-gray-700 break-all">{r.to}</td>
                    <td className="px-4 py-2 text-gray-900">{r.subject}{r.error && <span className="block text-xs text-red-700 mt-0.5">{r.error}</span>}</td>
                    <td className="px-4 py-2"><span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${cls}`}>{label}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default DeliveryStatus;
