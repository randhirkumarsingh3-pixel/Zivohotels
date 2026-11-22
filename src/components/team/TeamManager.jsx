import { useCallback, useEffect, useMemo, useState } from 'react';
import { UserPlus, ShieldCheck, Pencil, Trash2, Copy, X, Mail, PauseCircle, PlayCircle, Loader2, Lock } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { refreshAccess } from '../../hooks/useAccess';

/**
 * Team members and roles: ZivoPlus staff (admin console) or a property's team (extranet).
 * api: adminTeamApi (services/api.js) or teamApi (services/extranetApi.js).
 * The server enforces every rule (no self-changes, nobody gives more access than they have,
 * the last Super Admin stays); this screen explains and shows them.
 */
const input = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none';
const btn = 'inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold';
const when = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Never');

const Modal = ({ title, onClose, children }) => (
  <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={title}>
    <div className="absolute inset-0 bg-navy-950/50" onClick={onClose} />
    <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white">
        <h2 className="text-lg font-bold text-gray-900">{title}</h2>
        <button type="button" onClick={onClose} aria-label="Close" className="p-2 rounded-full hover:bg-gray-100"><X size={18} /></button>
      </div>
      <div className="p-6">{children}</div>
    </div>
  </div>
);

const groupPermissions = (list) => list.reduce((g, p) => ({ ...g, [p.group]: [...(g[p.group] || []), p] }), {});

const RoleEditor = ({ role, permissions, onSave, onClose }) => {
  const [name, setName] = useState(role?.name || '');
  const [description, setDescription] = useState(role?.description || '');
  const [picked, setPicked] = useState(new Set(role?.permissions || []));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const toggle = (k) => setPicked((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const save = async (e) => {
    e.preventDefault(); setBusy(true); setError('');
    try { await onSave({ id: role?.id, name, description, permissions: [...picked] }); onClose(); } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={save} className="space-y-4">
      <label className="block text-sm"><span className="font-semibold text-gray-700">Role name</span><input className={`${input} mt-1`} value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={60} /></label>
      <label className="block text-sm"><span className="font-semibold text-gray-700">What it&apos;s for (optional)</span><input className={`${input} mt-1`} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={200} /></label>
      <div className="space-y-3">
        {Object.entries(groupPermissions(permissions)).map(([group, items]) => (
          <fieldset key={group} className="rounded-xl border border-gray-200 p-3">
            <legend className="px-1 text-xs font-bold uppercase tracking-wider text-gray-500">{group}</legend>
            {items.map((p) => (
              <label key={p.key} className="flex items-start gap-2 py-1 text-sm cursor-pointer">
                <input type="checkbox" className="mt-0.5 rounded border-gray-300" checked={picked.has(p.key)} onChange={() => toggle(p.key)} />
                <span>{p.label}</span>
              </label>
            ))}
          </fieldset>
        ))}
      </div>
      {error && <p role="alert" className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className={`${btn} border border-gray-300`}>Cancel</button>
        <button type="submit" disabled={busy} className={`${btn} bg-brand-600 text-white disabled:opacity-60`}>{busy ? 'Saving…' : 'Save role'}</button>
      </div>
    </form>
  );
};

const InviteForm = ({ roles, permissions, onInvite, onClose, hotelTeam }) => {
  const [form, setForm] = useState({ name: '', email: '', phone: '', roleId: roles[0]?.id || '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const role = roles.find((r) => r.id === form.roleId);
  const labels = Object.fromEntries(permissions.map((p) => [p.key, p.label]));
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const send = async (e) => {
    e.preventDefault(); setBusy(true); setError('');
    try { await onInvite(form); onClose(); } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={send} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm"><span className="font-semibold text-gray-700">Name</span><input className={`${input} mt-1`} value={form.name} onChange={set('name')} placeholder="Full name" /></label>
        <label className="block text-sm"><span className="font-semibold text-gray-700">Work email</span><input type="email" required className={`${input} mt-1`} value={form.email} onChange={set('email')} placeholder="name@company.com" /></label>
        <label className="block text-sm"><span className="font-semibold text-gray-700">Mobile (optional)</span><input type="tel" className={`${input} mt-1`} value={form.phone} onChange={set('phone')} /></label>
        <label className="block text-sm"><span className="font-semibold text-gray-700">Role</span>
          <select className={`${input} mt-1`} value={form.roleId} onChange={set('roleId')} required>
            {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select></label>
      </div>
      {role && (
        <div className="rounded-xl bg-navy-50 p-3 text-sm text-navy-900">
          <p className="font-semibold">{role.name}{role.description ? ` · ${role.description}` : ''}</p>
          <ul className="mt-1 list-disc pl-5 text-xs text-navy-800 space-y-0.5">{role.permissions.map((p) => <li key={p}>{labels[p] || p}</li>)}</ul>
        </div>
      )}
      <p className="text-xs text-gray-500">They get an email to set their password{hotelTeam ? ', or, if they already have a ZivoPlus partner account, to sign in with it' : ''}. Use a work email: an email already used for a guest account can&apos;t be added.</p>
      {error && <p role="alert" className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className={`${btn} border border-gray-300`}>Cancel</button>
        <button type="submit" disabled={busy} className={`${btn} bg-brand-600 text-white disabled:opacity-60`}>{busy ? 'Sending…' : 'Send invite'}</button>
      </div>
    </form>
  );
};

const TeamManager = ({ api, title, intro, hotelTeam = false }) => {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [modal, setModal] = useState(null); // { type: 'invite' } | { type: 'role', role }
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(() => api.get().then(setData).catch((e) => setError(e.message || 'Could not load the team.')), [api]);
  useEffect(() => { load(); }, [load]);

  const act = async (id, fn, ok) => {
    setBusyId(id); setError(''); setNotice('');
    try { const r = await fn(); if (ok) setNotice(typeof ok === 'function' ? ok(r) : ok); await load(); refreshAccess(); } catch (e) { setError(e.message); } finally { setBusyId(null); }
  };
  const assignable = useMemo(() => (data?.roles || []), [data]);

  if (!data) return <div className="p-8">{error ? <p className="text-red-700">{error}</p> : <Loader2 className="animate-spin text-gray-400" />}</div>;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
          {intro && <p className="text-sm text-gray-600 mt-1 max-w-2xl">{intro}</p>}
        </div>
        <button type="button" onClick={() => setModal({ type: 'invite' })} className={`${btn} bg-brand-600 hover:bg-brand-700 text-white`}><UserPlus size={16} /> Invite</button>
      </div>
      {notice && <p className="rounded-lg bg-green-50 text-green-800 px-4 py-3 text-sm">{notice}</p>}
      {error && <p role="alert" className="rounded-lg bg-red-50 text-red-800 px-4 py-3 text-sm">{error}</p>}

      <section className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase tracking-wider text-gray-500">
            <tr><th className="px-4 py-3">Person</th><th className="px-4 py-3">Role</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Last sign-in</th><th className="px-4 py-3 text-right">Actions</th></tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {data.owner && (
              <tr><td className="px-4 py-3"><p className="font-semibold text-gray-900">{data.owner.name}</p><p className="text-xs text-gray-500">{data.owner.email}</p></td>
                <td className="px-4 py-3"><span className="inline-flex items-center gap-1 font-semibold text-navy-800"><Lock size={13} /> Owner</span></td>
                <td className="px-4 py-3 text-gray-600">Full access</td><td className="px-4 py-3" /><td className="px-4 py-3" /></tr>
            )}
            {data.members.map((m) => {
              const self = m.user.id === user?.id;
              return (
                <tr key={m.id} className={m.status === 'PAUSED' ? 'bg-gray-50/60' : ''}>
                  <td className="px-4 py-3"><p className="font-semibold text-gray-900">{m.user.name}{self && <span className="ml-1 text-xs text-gray-500">(you)</span>}</p><p className="text-xs text-gray-500">{m.user.email}</p></td>
                  <td className="px-4 py-3">
                    <select aria-label={`Role of ${m.user.name}`} disabled={self || busyId === m.id} value={m.role.id} className={`${input} py-1.5 min-w-[150px]`}
                      onChange={(e) => act(m.id, () => api.update(m.id, { roleId: e.target.value }), `${m.user.name}'s role changed.`)}>
                      {assignable.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    {m.invited ? <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 text-xs font-bold">Invited</span>
                      : m.status === 'PAUSED' ? <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 text-xs font-bold">Paused</span>
                        : <span className="px-2 py-0.5 rounded-full bg-green-50 text-green-700 text-xs font-bold">Active</span>}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{when(m.user.lastLogin)}</td>
                  <td className="px-4 py-3">
                    {!self && (
                      <div className="flex justify-end gap-1">
                        {m.invited && <button type="button" title="Send the invite again" onClick={() => act(m.id, () => api.resend(m.id), `Invite sent again to ${m.user.email}.`)} className="p-2 rounded-lg hover:bg-gray-100"><Mail size={16} /></button>}
                        {m.status === 'PAUSED'
                          ? <button type="button" title="Resume access" onClick={() => act(m.id, () => api.update(m.id, { status: 'ACTIVE' }), `${m.user.name} can sign in again.`)} className="p-2 rounded-lg hover:bg-gray-100"><PlayCircle size={16} /></button>
                          : <button type="button" title="Pause access" onClick={() => act(m.id, () => api.update(m.id, { status: 'PAUSED' }), `${m.user.name}'s access is paused.`)} className="p-2 rounded-lg hover:bg-gray-100"><PauseCircle size={16} /></button>}
                        <button type="button" title="Remove from the team" onClick={() => window.confirm(`Remove ${m.user.name} from the team? They lose access straight away.`) && act(m.id, () => api.remove(m.id), `${m.user.name} was removed.`)} className="p-2 rounded-lg hover:bg-red-50 text-red-700"><Trash2 size={16} /></button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
            {!data.members.length && <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-500">No team members yet. Invite someone to share the work.</td></tr>}
          </tbody>
        </table>
      </section>

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2"><ShieldCheck size={18} className="text-navy-700" /> Roles</h2>
          <button type="button" onClick={() => setModal({ type: 'role', role: null })} className={`${btn} border border-gray-300 hover:bg-gray-50`}>New role</button>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {data.roles.map((r) => (
            <div key={r.id} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-bold text-gray-900">{r.name}</p>
                  <p className="text-xs text-gray-500">{r.isSystem ? 'Ready-made' : 'Custom'} · {r.members} member{r.members === 1 ? '' : 's'}</p>
                </div>
                <div className="flex gap-1">
                  <button type="button" title="Copy as a new role" onClick={() => setModal({ type: 'role', role: { name: `${r.name} (copy)`, description: r.description, permissions: r.permissions } })} className="p-1.5 rounded-lg hover:bg-gray-100"><Copy size={15} /></button>
                  {!r.isSystem && <button type="button" title="Edit" onClick={() => setModal({ type: 'role', role: r })} className="p-1.5 rounded-lg hover:bg-gray-100"><Pencil size={15} /></button>}
                  {!r.isSystem && <button type="button" title="Delete" onClick={() => window.confirm(`Delete the role "${r.name}"?`) && act(r.id, () => api.deleteRole(r.id), `Role "${r.name}" deleted.`)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-700"><Trash2 size={15} /></button>}
                </div>
              </div>
              {r.description && <p className="text-sm text-gray-600 mt-2">{r.description}</p>}
              <p className="text-xs text-gray-500 mt-2">{r.all ? 'Everything' : `${r.permissions.length} permission${r.permissions.length === 1 ? '' : 's'}`}</p>
            </div>
          ))}
        </div>
      </section>

      {modal?.type === 'invite' && (
        <Modal title="Invite a team member" onClose={() => setModal(null)}>
          <InviteForm roles={assignable} permissions={data.permissions} hotelTeam={hotelTeam} onClose={() => setModal(null)}
            onInvite={async (body) => { const r = await api.invite(body); setNotice(r?.newAccount ? `Invite sent to ${body.email}.` : `${body.email} was added: they can sign in with their existing account.`); await load(); return r; }} />
        </Modal>
      )}
      {modal?.type === 'role' && (
        <Modal title={modal.role?.id ? `Edit ${modal.role.name}` : 'New role'} onClose={() => setModal(null)}>
          <RoleEditor role={modal.role} permissions={data.permissions} onClose={() => setModal(null)}
            onSave={async (role) => { await api.saveRole(role); setNotice(`Role "${role.name}" saved.`); await load(); }} />
        </Modal>
      )}
    </div>
  );
};

export default TeamManager;
