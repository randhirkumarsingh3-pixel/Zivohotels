import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Loader2, Save, Trash2, Copy, CheckCircle2, Clock, KeyRound, RefreshCw, Plus, ExternalLink } from 'lucide-react';
import { businessApi } from '../../services/api';

/**
 * ZivoPlus for Business: company sign-in (single sign-on with Google Workspace or Microsoft
 * Entra ID). Company admins set the provider, prove they own their email domains with a DNS TXT
 * record, test a sign-in, then choose whether new employees join automatically and whether
 * company sign-in is the only way in.
 *
 * Shown only when the server says it is available (GET /business/info → sso.available). The
 * server side (Phase 3b) answers:
 *   GET    /business/:orgId/sso                 { config, domains, providers, lastTest }
 *          config  { enabled, provider: GOOGLE|MICROSOFT|null, tenantId, autoJoin, defaultRole, defaultGrade, enforce }
 *          domains [{ id, domain, status: PENDING|VERIFIED, txtName, txtValue, verifiedAt, checkedAt }]
 *          providers { GOOGLE: bool, MICROSOFT: bool }   lastTest { ok, at, email, error } | null
 *   PUT    /business/:orgId/sso                 config → { config, … }
 *   POST   /business/:orgId/sso/domains         { domain } → domain
 *   POST   /business/:orgId/sso/domains/:id/verify   → domain (status VERIFIED, or 409 with why)
 *   DELETE /business/:orgId/sso/domains/:id
 *   POST   /business/:orgId/sso/test            → { url }: the provider's sign-in page; it comes back
 *          to /business?tab=signin&sso_test=ok, or &sso_test=error&sso_error=<message>
 */
const input = 'mt-1 w-full px-3 py-2.5 border border-gray-300 rounded-lg text-base sm:text-sm disabled:bg-gray-50';
const btn = 'inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold disabled:opacity-50';
const Note = ({ msg }) => (msg ? <p role={msg.ok ? 'status' : 'alert'} className={`text-sm px-3 py-2 rounded-lg ${msg.ok ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'}`}>{msg.text}</p> : null);
const when = (d) => (d ? new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '');
const PROVIDERS = [
  ['GOOGLE', 'Google Workspace', 'Employees sign in with their company Google account.'],
  ['MICROSOFT', 'Microsoft Entra ID', 'Employees sign in with their Microsoft 365 work account.'],
];
const ROLES = [['TRAVELLER', 'Traveller'], ['BOOKER', 'Booker'], ['APPROVER', 'Approver'], ['FINANCE', 'Finance']];

const CopyValue = ({ label, value }) => {
  const [done, setDone] = useState(false);
  const copy = async () => { try { await navigator.clipboard.writeText(value); setDone(true); setTimeout(() => setDone(false), 1500); } catch { /* the value is on screen to select */ } };
  return (
    <div className="min-w-0">
      <p className="text-xs font-semibold text-gray-600">{label}</p>
      <div className="mt-1 flex items-center gap-2">
        <code className="flex-1 min-w-0 break-all rounded-lg bg-white border border-gray-200 px-2.5 py-1.5 text-xs text-gray-900">{value}</code>
        <button type="button" onClick={copy} aria-label={`Copy ${label.toLowerCase()}`} className="shrink-0 p-2 rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50">
          {done ? <CheckCircle2 size={15} className="text-green-700" /> : <Copy size={15} />}
        </button>
      </div>
    </div>
  );
};

const DomainRow = ({ org, d, onChange, setMsg }) => {
  const [busy, setBusy] = useState('');
  const act = async (what, fn, ok) => {
    setBusy(what); setMsg(null);
    try { await fn(); if (ok) setMsg({ ok: true, text: ok }); await onChange(); } catch (e) { setMsg({ ok: false, text: e.message }); } finally { setBusy(''); }
  };
  const verified = d.status === 'VERIFIED';
  return (
    <li className="py-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold text-gray-900 break-all">{d.domain}</p>
        <div className="flex items-center gap-3">
          {verified
            ? <span className="inline-flex items-center gap-1 text-xs font-bold text-green-800 bg-green-50 px-2 py-1 rounded"><CheckCircle2 size={13} aria-hidden="true" /> Verified</span>
            : <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-800 bg-amber-50 px-2 py-1 rounded"><Clock size={13} aria-hidden="true" /> Waiting for DNS record</span>}
          <button type="button" disabled={Boolean(busy)} onClick={() => act('remove', () => businessApi.removeSsoDomain(org.id, d.id), `${d.domain} removed.`)} aria-label={`Remove ${d.domain}`} className="p-1.5 text-gray-500 hover:text-red-700 disabled:opacity-50">
            {busy === 'remove' ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
          </button>
        </div>
      </div>
      {verified ? (
        <p className="text-xs text-gray-600">Verified {when(d.verifiedAt)}. You can delete the TXT record now if you like; we don&apos;t check it again.</p>
      ) : (
        <div className="rounded-xl bg-gray-50 p-3 space-y-3">
          <p className="text-xs text-gray-700">Add this TXT record where you manage DNS for <strong>{d.domain}</strong> (GoDaddy, Cloudflare, your IT team…). It can take a few minutes to an hour to show up.</p>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            <CopyValue label="Name / host" value={d.txtName} />
            <CopyValue label="Value" value={d.txtValue} />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" disabled={Boolean(busy)} onClick={() => act('verify', () => businessApi.verifySsoDomain(org.id, d.id), `${d.domain} is verified.`)} className={`${btn} border border-gray-300 bg-white text-gray-800`}>
              {busy === 'verify' ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />} Check now
            </button>
            {d.checkedAt && <span className="text-xs text-gray-500">Last checked {when(d.checkedAt)}: not found yet.</span>}
          </div>
        </div>
      )}
    </li>
  );
};

export const SsoTab = ({ org }) => {
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState(null);
  const [c, setC] = useState(null);
  const [grades, setGrades] = useState([]);
  const [domain, setDomain] = useState('');
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState(() => {
    const t = params.get('sso_test');
    if (t === 'ok') return { ok: true, text: 'Test sign-in worked. You can now turn company sign-in on.' };
    if (t === 'error') return { ok: false, text: `Test sign-in didn't work: ${params.get('sso_error') || 'the provider refused it.'}` };
    return null;
  });

  // Forget the test result in the address bar once shown
  useEffect(() => {
    if (!params.get('sso_test')) return;
    const p = new URLSearchParams(params); p.delete('sso_test'); p.delete('sso_error');
    setParams(p, { replace: true });
  }, [params, setParams]);

  // Domain changes reload the list only, so unsaved choices on screen stay as they are
  const load = useCallback(async () => {
    const d = await businessApi.sso(org.id);
    setData(d);
    return d;
  }, [org.id]);
  useEffect(() => {
    load().then((d) => setC(d.config)).catch((e) => setMsg({ ok: false, text: e.message }));
    businessApi.policy(org.id).then((p) => setGrades(p.grades || [])).catch(() => {});
  }, [load, org.id]);

  if (!data || !c) return <p className="text-sm text-gray-500 flex items-center gap-2">{msg && !data ? msg.text : <><Loader2 size={15} className="animate-spin" /> Loading…</>}</p>;

  const verified = data.domains.filter((d) => d.status === 'VERIFIED');
  const tested = Boolean(data.lastTest?.ok);
  const ready = Boolean(c.provider) && verified.length > 0 && tested;
  const set = (k, v) => setC((x) => ({ ...x, [k]: v }));

  const save = async (next = c, text = 'Saved.') => {
    setBusy('save'); setMsg(null);
    try { const d = await businessApi.saveSso(org.id, next); setData(d); setC(d.config); setMsg({ ok: true, text }); } catch (e) { setMsg({ ok: false, text: e.message }); } finally { setBusy(''); }
  };
  const addDomain = async (e) => {
    e.preventDefault();
    const v = domain.trim().toLowerCase().replace(/^@/, '');
    if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(v)) { setMsg({ ok: false, text: 'Enter a domain like yourcompany.com, without http or @.' }); return; }
    setBusy('add'); setMsg(null);
    try { await businessApi.addSsoDomain(org.id, v); setDomain(''); await load(); } catch (err) { setMsg({ ok: false, text: err.message }); } finally { setBusy(''); }
  };
  const test = async () => {
    setBusy('test'); setMsg(null);
    try {
      // Save the provider first so the test uses what is on screen
      if (c.provider !== data.config.provider || (c.tenantId || '') !== (data.config.tenantId || '')) await businessApi.saveSso(org.id, { ...data.config, provider: c.provider, tenantId: c.tenantId });
      const r = await businessApi.testSso(org.id);
      window.location.assign(r.url);
    } catch (e) { setMsg({ ok: false, text: e.message }); setBusy(''); }
  };

  return (
    <div className="space-y-5">
      {data.testMode && (
        <p className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <b>Setup mode.</b> ZivoPlus hasn&apos;t connected Google Workspace and Microsoft yet. Until then, &quot;Test sign-in&quot; and your employees&apos; sign-ins go to a ZivoPlus test page where they confirm their work email with a one-time code. Your settings carry over when the real connection is switched on.
        </p>
      )}
      <section className={`rounded-2xl p-5 border ${c.enabled && data.config.enabled ? 'bg-green-50 border-green-200' : 'bg-white border-gray-200'}`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-bold text-gray-900 flex items-center gap-2"><KeyRound size={18} aria-hidden="true" /> Company sign-in {data.config.enabled ? 'is on' : 'is off'}</h2>
            <p className="text-sm text-gray-700 mt-1 max-w-2xl">
              {data.config.enabled
                ? `People with ${verified.map((d) => `@${d.domain}`).join(', ')} emails sign in to ZivoPlus with their ${data.config.provider === 'MICROSOFT' ? 'Microsoft' : 'Google'} work account.${data.config.enforce ? ' Passwords and sign-in codes don\'t work for them.' : ''}`
                : 'Let your employees sign in with the work account they already use, and stop access the day IT closes their account.'}
            </p>
          </div>
          {data.config.enabled && <button type="button" disabled={Boolean(busy)} onClick={() => save({ ...c, enabled: false, enforce: false }, 'Company sign-in is off. Everyone signs in with a password or code again.')} className={`${btn} border border-gray-300 bg-white text-gray-800`}>Turn off</button>}
        </div>
      </section>

      <section className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4">
        <h3 className="font-bold text-gray-900">1. Your work accounts</h3>
        <fieldset className="grid gap-2 sm:grid-cols-2">
          <legend className="sr-only">Provider</legend>
          {PROVIDERS.map(([v, l, h]) => {
            const offered = data.providers?.[v];
            return (
              <label key={v} className={`flex gap-2 p-3 rounded-xl border ${offered ? 'cursor-pointer' : 'opacity-60'} ${c.provider === v ? 'border-navy-800 bg-navy-50' : 'border-gray-200'}`}>
                <input type="radio" name="sso-provider" className="mt-1" disabled={!offered} checked={c.provider === v} onChange={() => set('provider', v)} />
                <span><span className="block text-sm font-semibold">{l}</span><span className="block text-xs text-gray-600">{offered ? h : 'Not offered yet. Ask ZivoPlus.'}</span></span>
              </label>
            );
          })}
        </fieldset>
        {c.provider === 'MICROSOFT' && (
          <label className="block text-sm font-semibold text-gray-800 max-w-md">Directory (tenant) ID <span className="font-normal text-gray-500">(optional)</span>
            <input className={input} value={c.tenantId || ''} onChange={(e) => set('tenantId', e.target.value.trim())} placeholder="e.g. 2b7f6c0a-…" />
            <span className="block mt-1 text-xs font-normal text-gray-500">From Microsoft Entra admin centre → Overview. With it, only accounts from your company&apos;s directory can sign in.</span>
          </label>
        )}
      </section>

      <section className="bg-white border border-gray-200 rounded-2xl p-5 space-y-2">
        <h3 className="font-bold text-gray-900">2. Your email domains</h3>
        <p className="text-sm text-gray-600">Prove your company owns each domain your employees&apos; emails use. Only emails at verified domains can use company sign-in.</p>
        {data.domains.length > 0 && (
          <ul className="divide-y divide-gray-100">
            {data.domains.map((d) => <DomainRow key={d.id} org={org} d={d} onChange={load} setMsg={setMsg} />)}
          </ul>
        )}
        <form onSubmit={addDomain} className="flex flex-wrap items-end gap-2 pt-2">
          <label className="text-sm font-semibold text-gray-800 flex-1 min-w-[12rem]">Add a domain<input className={input} value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="yourcompany.com" autoCapitalize="none" spellCheck={false} /></label>
          <button type="submit" disabled={busy === 'add' || !domain.trim()} className={`${btn} border border-gray-300 bg-white text-gray-800`}>{busy === 'add' ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />} Add</button>
        </form>
      </section>

      <section className="bg-white border border-gray-200 rounded-2xl p-5 space-y-3">
        <h3 className="font-bold text-gray-900">3. Test it</h3>
        <p className="text-sm text-gray-600">Sign in once with your own work account to check it works before your team uses it. You&apos;ll come back here afterwards.</p>
        {data.lastTest && (
          <p className={`text-xs ${data.lastTest.ok ? 'text-green-800' : 'text-red-700'}`}>
            Last test {when(data.lastTest.at)}{data.lastTest.email ? ` as ${data.lastTest.email}` : ''}: {data.lastTest.ok ? 'worked' : data.lastTest.error || 'failed'}.
          </p>
        )}
        <button type="button" onClick={test} disabled={Boolean(busy) || !c.provider || !verified.length} className={`${btn} bg-navy-800 text-white`}>
          {busy === 'test' ? <Loader2 size={15} className="animate-spin" /> : <ExternalLink size={15} />} Test sign-in
        </button>
        {(!c.provider || !verified.length) && <p className="text-xs text-gray-500">Choose your work accounts and verify a domain first.</p>}
      </section>

      <section className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4">
        <h3 className="font-bold text-gray-900">4. Who gets in</h3>
        <label className="flex items-start gap-2 text-sm text-gray-800">
          <input type="checkbox" className="mt-1" checked={Boolean(c.autoJoin)} onChange={(e) => set('autoJoin', e.target.checked)} />
          <span><span className="font-semibold">New employees join automatically</span><span className="block text-xs text-gray-600">Someone at a verified domain who signs in for the first time joins your account without an invitation.</span></span>
        </label>
        {c.autoJoin && (
          <div className="grid gap-3 sm:grid-cols-2 pl-6">
            <label className="text-sm font-semibold text-gray-800">They join as<select className={input} value={c.defaultRole || 'TRAVELLER'} onChange={(e) => set('defaultRole', e.target.value)}>{ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
            <label className="text-sm font-semibold text-gray-800">Grade<select className={input} value={c.defaultGrade || ''} onChange={(e) => set('defaultGrade', e.target.value || null)}><option value="">Policy default</option>{grades.map((g) => <option key={g.key} value={g.key}>{g.name}</option>)}</select></label>
          </div>
        )}
        <label className={`flex items-start gap-2 text-sm text-gray-800 ${ready ? '' : 'opacity-60'}`}>
          <input type="checkbox" className="mt-1" disabled={!ready} checked={Boolean(c.enforce)} onChange={(e) => set('enforce', e.target.checked)} />
          <span><span className="font-semibold">Company sign-in only</span><span className="block text-xs text-gray-600">Passwords and sign-in codes stop working for emails at your verified domains. When IT closes someone&apos;s work account, they can&apos;t get into ZivoPlus either.{!ready && ' Available after a test sign-in works.'}</span></span>
        </label>
      </section>

      <Note msg={msg} />
      <div className="flex flex-wrap gap-2">
        {!data.config.enabled && (
          <button type="button" disabled={Boolean(busy) || !ready} onClick={() => save({ ...c, enabled: true }, 'Company sign-in is on.')} className={`${btn} bg-brand-600 hover:bg-brand-700 text-white`}>
            {busy === 'save' ? <Loader2 size={15} className="animate-spin" /> : <KeyRound size={15} />} Turn on company sign-in
          </button>
        )}
        <button type="button" disabled={Boolean(busy)} onClick={() => save(c)} className={`${btn} border border-gray-300 bg-white text-gray-800`}>
          {busy === 'save' && data.config.enabled ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Save
        </button>
      </div>
      {!data.config.enabled && !ready && <p className="text-xs text-gray-500">To turn it on: choose your work accounts, verify a domain and test a sign-in.</p>}
    </div>
  );
};

export default SsoTab;
