import { useCallback, useEffect, useState } from 'react';
import { Loader2, ShieldCheck, Lock, Unlock, X } from 'lucide-react';
import { adminOpsApi } from '../../services/api';
import usePageTitle from '../../hooks/usePageTitle';
import useAccess from '../../hooks/useAccess';
import { PageHeader, Card, Stat, Pill, Loading, ErrorNote, Empty, RefreshButton, Segmented, Table } from '../components/ops/OpsUi';
import { inr, int, when } from '../components/ops/opsFormat';

/**
 * Admin → Fraud & risk: accounts whose recent activity looks risky (failed payments, rooms held
 * without paying, bursts of bookings, phone numbers shared by several accounts, repeated failed
 * sign-ins), with the reasons. A person reviews each one: looks fine, or block (signs them out).
 * Internet addresses with many failed attempts can be blocked too. Nothing is blocked automatically.
 */
const LEVEL = { high: 'High', medium: 'Medium', low: 'Low' };

const Review = ({ account, canEdit, onDone, onClose }) => {
  const [d, setD] = useState(null);
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { adminOpsApi.riskAccount(account.userId).then(setD).catch((e) => setErr(e.message)); }, [account.userId]);
  const decide = async (decision) => {
    setBusy(true); setErr('');
    try { await adminOpsApi.reviewAccount(account.userId, { decision, note, score: account.score }); onDone(); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const blocked = (d?.user?.status || account.accountStatus) === 'BLOCKED';
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex justify-end" role="dialog" aria-modal="true" aria-labelledby="rv-title">
      <div className="bg-white w-full max-w-xl h-full overflow-y-auto p-5 space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="rv-title" className="text-lg font-bold text-gray-900">{account.name || account.email}</h2>
            <p className="text-sm text-gray-600">{account.email}{account.phone ? ` · ${account.phone}` : ''} · {account.role.toLowerCase()} · joined {when(account.joined)}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="p-2 text-gray-500 hover:text-gray-900"><X size={18} /></button>
        </div>
        {account.reasons?.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-gray-500 mb-1">Why it&apos;s listed (score {account.score})</p>
            <ul className="list-disc pl-5 text-sm text-gray-800 space-y-0.5">{account.reasons.map((r, i) => <li key={i}>{r.text}</li>)}</ul>
          </div>
        )}
        {!d && !err && <Loading text="Loading activity…" />}
        {d && (
          <>
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-1">Recent bookings</p>
              {d.bookings.length === 0 ? <p className="text-sm text-gray-500">None.</p> : (
                <ul className="text-sm divide-y divide-gray-50">{d.bookings.map((b) => <li key={b.id} className="py-1.5 flex justify-between gap-3"><span className="min-w-0 truncate">{b.bookingRef} · {b.hotel?.name} · {b.status.toLowerCase()} / {String(b.paymentStatus || '').toLowerCase()}</span><span className="tabular-nums whitespace-nowrap">{inr(b.totalAmount)} · {when(b.createdAt)}</span></li>)}</ul>
              )}
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-1">Payments</p>
              {d.payments.length === 0 ? <p className="text-sm text-gray-500">None.</p> : (
                <ul className="text-sm divide-y divide-gray-50">{d.payments.map((p, i) => <li key={i} className="py-1.5 flex justify-between"><span>{p.type.toLowerCase()} · <span className={p.status === 'FAILED' ? 'text-red-600 font-semibold' : ''}>{p.status.toLowerCase()}</span></span><span className="tabular-nums">{inr(p.amount)} · {when(p.createdAt)}</span></li>)}</ul>
              )}
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-1">Sign-in activity</p>
              {d.security.length === 0 ? <p className="text-sm text-gray-500">Nothing unusual.</p> : (
                <ul className="text-sm divide-y divide-gray-50">{d.security.map((s, i) => <li key={i} className="py-1.5 flex justify-between"><span>{s.type.replace(/_/g, ' ').toLowerCase()}</span><span className="tabular-nums text-gray-600">{s.ip} · {when(s.createdAt)}</span></li>)}</ul>
              )}
            </div>
            {d.decisions.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-1">Earlier reviews</p>
                <ul className="text-sm space-y-1">{d.decisions.map((x, i) => <li key={i}><b>{x.decision.toLowerCase()}</b> · {when(x.at)} — {x.note}</li>)}</ul>
              </div>
            )}
          </>
        )}
        {canEdit ? (
          <div className="border-t border-gray-100 pt-4 space-y-3">
            <label className="block text-xs font-semibold text-gray-700">Note for the record
              <textarea rows={2} className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Called the guest, genuine group booking" />
            </label>
            {err && <p role="alert" className="text-sm text-red-700">{err}</p>}
            <div className="flex flex-wrap gap-2">
              {!blocked && <button type="button" disabled={busy || note.trim().length < 3} onClick={() => decide('CLEARED')} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-green-700 text-green-800 text-sm font-bold disabled:opacity-50"><ShieldCheck size={15} /> Looks fine</button>}
              {!blocked && <button type="button" disabled={busy || note.trim().length < 3} onClick={() => decide('BLOCKED')} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-bold disabled:opacity-50">{busy ? <Loader2 size={15} className="animate-spin" /> : <Lock size={15} />} Block account</button>}
              {blocked && <button type="button" disabled={busy || note.trim().length < 3} onClick={() => decide('UNBLOCKED')} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 text-sm font-bold disabled:opacity-50"><Unlock size={15} /> Unblock</button>}
            </div>
            <p className="text-xs text-gray-500">Blocking signs the person out everywhere and stops sign-in and booking. Their existing bookings stay as they are.</p>
          </div>
        ) : <p className="text-xs text-gray-500">Reviewing accounts needs the users.manage permission.</p>}
      </div>
    </div>
  );
};

const FraudRiskCenter = () => {
  usePageTitle('Fraud & risk');
  const { can } = useAccess();
  const canEdit = can('users.manage');
  const [days, setDays] = useState('30');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState('queue');
  const [open, setOpen] = useState(null);
  const [ipMsg, setIpMsg] = useState('');

  const load = useCallback(() => {
    setBusy(true); setError('');
    adminOpsApi.risk({ days }).then(setData).catch((e) => setError(e.message || 'Could not load.')).finally(() => setBusy(false));
  }, [days]);
  useEffect(() => { load(); }, [load]);

  const ipAction = async (ip, block) => {
    setIpMsg('');
    try { await adminOpsApi.blockIp({ ip, block, note: block ? 'Blocked from Fraud & risk' : 'Unblocked from Fraud & risk' }); setIpMsg(`${ip} ${block ? 'blocked' : 'unblocked'}.`); load(); } catch (e) { setIpMsg(e.message); }
  };

  const t = data?.totals;
  const list = view === 'queue' ? data?.queue : view === 'reviewed' ? data?.reviewed : null;

  return (
    <div className="space-y-6 max-w-6xl">
      <PageHeader title="Fraud & risk" sub="Accounts and internet addresses whose recent activity looks risky, with the reasons. A person decides; nothing is blocked automatically.">
        <Segmented label="Period" value={days} onChange={setDays} options={[['7', '7 days'], ['30', '30 days'], ['90', '90 days']]} />
        <RefreshButton onClick={load} busy={busy} />
      </PageHeader>

      {error && <ErrorNote error={error} onRetry={load} />}
      {!data && !error && <Loading />}

      {data && (
        <>
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-5">
            <Stat label="To review" value={int(t.toReview)} hint={t.high ? `${t.high} high risk` : 'none high risk'} tone={t.high ? 'bad' : undefined} />
            <Stat label="Failed online payments" value={int(t.failedPayments)} />
            <Stat label="Refunds" value={int(t.refunds)} hint={inr(t.refundAmount)} />
            <Stat label="Addresses with 20+ failed attempts (24 h)" value={int(t.suspiciousIps24h)} tone={t.suspiciousIps24h ? 'warn' : undefined} />
            <Stat label="Blocked" value={`${int(t.blockedAccounts)} accounts`} hint={`${int(t.blockedIps)} addresses`} />
          </div>

          <div className="flex flex-wrap gap-2">
            {[['queue', `To review (${data.queue.length})`], ['reviewed', 'Reviewed'], ['blocked', `Blocked (${data.blocked.length})`], ['ips', 'Internet addresses'], ['rules', 'How the score works']].map(([k, label]) => (
              <button key={k} type="button" onClick={() => setView(k)} aria-pressed={view === k} className={`px-3 py-1.5 rounded-lg text-sm font-semibold border ${view === k ? 'bg-navy-800 text-white border-navy-800' : 'bg-white border-gray-200 text-gray-700'}`}>{label}</button>
            ))}
          </div>

          {list && (
            <Card>
              <Table head={['Account', 'Reasons', '#Score', 'Last signal', '']} empty={!list.length && <Empty>{view === 'queue' ? 'Nothing to review. Accounts appear here when their activity looks risky.' : 'No reviews yet.'}</Empty>}>
                {list.map((a) => (
                  <tr key={a.userId}>
                    <td className="px-5 py-3"><span className="font-semibold">{a.name || '—'}</span><span className="block text-xs text-gray-500">{a.email}</span>{a.review && <span className="block text-xs text-gray-500">Reviewed: {a.review.decision.toLowerCase()} · {when(a.review.at)}</span>}</td>
                    <td className="px-5 py-3 text-xs text-gray-700"><ul className="space-y-0.5">{a.reasons.map((r, i) => <li key={i}>{r.text}</li>)}</ul></td>
                    <td className="px-5 py-3 text-right"><Pill tone={a.level}>{a.score} · {LEVEL[a.level]}</Pill></td>
                    <td className="px-5 py-3 text-xs whitespace-nowrap">{when(a.lastSignal)}</td>
                    <td className="px-5 py-3 text-right"><button type="button" onClick={() => setOpen(a)} className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm font-semibold">Review</button></td>
                  </tr>
                ))}
              </Table>
            </Card>
          )}

          {view === 'blocked' && (
            <Card>
              <Table head={['Account', 'Role', 'Since', '']} empty={!data.blocked.length && <Empty>No blocked accounts.</Empty>}>
                {data.blocked.map((u) => (
                  <tr key={u.id}>
                    <td className="px-5 py-3"><span className="font-semibold">{u.name || '—'}</span><span className="block text-xs text-gray-500">{u.email}</span></td>
                    <td className="px-5 py-3 text-xs">{u.role.toLowerCase()}</td>
                    <td className="px-5 py-3 text-xs">{when(u.updatedAt)}</td>
                    <td className="px-5 py-3 text-right"><button type="button" onClick={() => setOpen({ userId: u.id, name: u.name, email: u.email, role: u.role, accountStatus: 'BLOCKED', score: 0, reasons: [] })} className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm font-semibold">Open</button></td>
                  </tr>
                ))}
              </Table>
            </Card>
          )}

          {view === 'ips' && (
            <Card title="Failed attempts by internet address" sub="Failed sign-ins and codes, refused requests and token problems in the last 24 hours.">
              {ipMsg && <p role="status" className="text-sm mb-3">{ipMsg}</p>}
              <Table head={['Address', '#Events', 'Last', '']} empty={!data.ips.length && <Empty>No failed attempts in the last 24 hours.</Empty>}>
                {data.ips.map((ip) => (
                  <tr key={ip.ip}>
                    <td className="px-5 py-2 font-mono text-xs">{ip.ip}</td>
                    <td className={`px-5 py-2 text-right tabular-nums ${ip.events >= 20 ? 'text-red-600 font-semibold' : ''}`}>{int(ip.events)}</td>
                    <td className="px-5 py-2 text-xs">{when(ip.last)}</td>
                    <td className="px-5 py-2 text-right">{canEdit && (ip.blocked
                      ? <button type="button" onClick={() => ipAction(ip.ip, false)} className="px-3 py-1 rounded-lg border border-gray-200 text-xs font-semibold">Unblock</button>
                      : <button type="button" onClick={() => ipAction(ip.ip, true)} className="px-3 py-1 rounded-lg border border-red-300 text-red-700 text-xs font-semibold">Block</button>)}</td>
                  </tr>
                ))}
              </Table>
              {data.blockedIps.length > 0 && (
                <div className="mt-4">
                  <p className="text-xs font-semibold text-gray-500 mb-1">Blocked addresses</p>
                  <div className="flex flex-wrap gap-2">{data.blockedIps.map((ip) => <span key={ip} className="inline-flex items-center gap-1 font-mono text-xs bg-gray-100 rounded px-2 py-1">{ip}{canEdit && <button type="button" aria-label={`Unblock ${ip}`} onClick={() => ipAction(ip, false)} className="text-gray-500 hover:text-gray-900"><X size={12} /></button>}</span>)}</div>
                </div>
              )}
              {data.sharedPhones.length > 0 && (
                <div className="mt-6">
                  <p className="text-xs font-semibold text-gray-500 mb-1">Guest phone numbers used by 3+ accounts</p>
                  <ul className="text-sm">{data.sharedPhones.map((p) => <li key={p.phoneEnding + p.last}>ending {p.phoneEnding}: {p.accounts} accounts, last {when(p.last)}</li>)}</ul>
                </div>
              )}
            </Card>
          )}

          {view === 'rules' && (
            <Card title="How the score works" sub="Points add up to a score out of 100. 20+ is listed for review; 40+ is medium and 70+ high risk.">
              <Table head={['Signal', '#Points']}>{data.rules.map(([s, p]) => <tr key={s}><td className="px-5 py-2">{s}</td><td className="px-5 py-2 text-right">{p}</td></tr>)}</Table>
              <p className="text-xs text-gray-500 mt-3">After a review marked &quot;Looks fine&quot;, the account leaves the list until it has a new signal.</p>
            </Card>
          )}
        </>
      )}

      {open && <Review account={open} canEdit={canEdit} onClose={() => setOpen(null)} onDone={() => { setOpen(null); load(); }} />}
    </div>
  );
};

export default FraudRiskCenter;
