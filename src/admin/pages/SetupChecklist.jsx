import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, AlertCircle, Circle, Info, Loader2, RefreshCw, ArrowRight, Server } from 'lucide-react';
import { adminDocumentsApi } from '../../services/api';
import usePageTitle from '../../hooks/usePageTitle';

/**
 * Admin → Setup checklist: everything a super admin configures for ZivoPlus to run end to end
 * (company and tax details, guest documents, emails and SMS, payments, offers, security), each
 * checked live, with what is set now and where to change it. Server keys (payments, email, SMS)
 * stay in deploy/vps/.env on the server and are only shown as set / not set.
 */
const STATUS = {
  todo: { label: 'Needs attention', cls: 'bg-red-50 text-red-700 border-red-200', Icon: AlertCircle },
  done: { label: 'Done', cls: 'bg-green-50 text-green-800 border-green-200', Icon: CheckCircle2 },
  optional: { label: 'Optional', cls: 'bg-gray-50 text-gray-600 border-gray-200', Icon: Circle },
  info: { label: 'For information', cls: 'bg-blue-50 text-blue-800 border-blue-200', Icon: Info },
};

const SetupChecklist = () => {
  usePageTitle('Setup checklist');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [only, setOnly] = useState('');

  const load = useCallback(() => {
    setLoading(true); setError('');
    adminDocumentsApi.setup().then(setData).catch((e) => setError(e.message || 'Could not load the checklist.')).finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const groups = useMemo(() => {
    const out = new Map();
    for (const it of (data?.items || []).filter((i) => !only || i.status === only)) {
      if (!out.has(it.group)) out.set(it.group, []);
      out.get(it.group).push(it);
    }
    return [...out.entries()];
  }, [data, only]);

  const counts = data?.counts || {};
  const required = (counts.done || 0) + (counts.todo || 0);
  const pct = required ? Math.round(((counts.done || 0) / required) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Setup checklist</h1>
          <p className="text-sm text-gray-600 mt-1 max-w-2xl">Everything that has to be set for ZivoPlus to run end to end: company and tax details, guest documents, emails, payments, offers and security. Each line is checked live.</p>
        </div>
        <button type="button" onClick={load} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm font-semibold text-gray-700 hover:border-gray-300">
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} aria-hidden="true" /> Check again
        </button>
      </div>

      {error && <p role="alert" className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
      {loading && !data && <p className="text-sm text-gray-500 flex items-center gap-2"><Loader2 size={16} className="animate-spin" /> Checking…</p>}

      {data && (
        <>
          <section className="bg-navy-900 text-white rounded-2xl p-5 grid gap-4 md:grid-cols-[1fr_auto] items-center">
            <div>
              <p className="text-xs uppercase tracking-wider text-navy-200 font-semibold">Ready to go live</p>
              <p className="text-3xl font-bold mt-1 tabular-nums">{pct}%</p>
              <div className="mt-3 h-2 rounded-full bg-white/15 overflow-hidden" aria-hidden="true"><div className="h-full bg-brand-500 rounded-full" style={{ width: `${pct}%` }} /></div>
              <p className="text-sm text-navy-100 mt-2">{counts.done || 0} of {required} required settings done{counts.todo ? `; ${counts.todo} need${counts.todo === 1 ? 's' : ''} attention` : ''}.</p>
            </div>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Show">
              {[['', 'All'], ['todo', 'Needs attention'], ['done', 'Done'], ['optional', 'Optional']].map(([k, label]) => (
                <button key={k || 'all'} type="button" aria-pressed={only === k} onClick={() => setOnly(k)}
                  className={`px-3 py-1.5 rounded-full text-xs font-bold border ${only === k ? 'bg-white text-navy-900 border-white' : 'border-white/30 text-white hover:bg-white/10'}`}>
                  {label}{k && counts[k] ? ` · ${counts[k]}` : ''}
                </button>
              ))}
            </div>
          </section>

          {groups.map(([group, items]) => (
            <section key={group} className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
              <h2 className="px-5 py-3 border-b border-gray-100 font-bold text-gray-900">{group}</h2>
              <ul className="divide-y divide-gray-100">
                {items.map((it) => {
                  const st = STATUS[it.status] || STATUS.info;
                  return (
                    <li key={it.key} className="px-5 py-4 grid gap-2 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_auto] md:items-center">
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-900">{it.title}</p>
                        <p className="text-sm text-gray-600">{it.what}</p>
                      </div>
                      <div className="min-w-0">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-semibold ${st.cls}`}><st.Icon size={12} aria-hidden="true" />{st.label}</span>
                        <p className="text-sm text-gray-800 mt-1 break-words">{it.detail}</p>
                      </div>
                      <div>
                        {it.where?.type === 'page' ? (
                          <Link to={it.where.path} className="inline-flex items-center gap-1 text-sm font-semibold text-navy-700 hover:text-navy-900 whitespace-nowrap">{it.where.label} <ArrowRight size={14} aria-hidden="true" /></Link>
                        ) : it.where ? (
                          <span className="inline-flex items-center gap-1 text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1" title="Set on the server, then deploy"><Server size={12} aria-hidden="true" />{it.where.label}</span>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
          <p className="text-xs text-gray-500">Server settings (keys for payments, email and SMS) live in <code>deploy/vps/.env</code> on the server; after changing one, run the deploy script. Checked {new Date(data.checkedAt).toLocaleString('en-IN')}.</p>
        </>
      )}
    </div>
  );
};

export default SetupChecklist;
