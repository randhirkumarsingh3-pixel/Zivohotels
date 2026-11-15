import { useState } from 'react';
import { Eye, EyeOff, Loader2, CheckCircle2 } from 'lucide-react';
import { changePassword } from '../../services/api';
import { useAuth } from '../../context/AuthContext';

/**
 * Change password (any signed-in user). The server signs out every other device and returns a
 * new token for this one, so the person stays signed in here.
 */
const inputCls = 'w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:border-navy-500 focus:ring-2 focus:ring-navy-500/20 outline-none';

const ChangePasswordForm = () => {
  const { replaceToken } = useAuth();
  const [form, setForm] = useState({ current: '', next: '', confirm: '' });
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const set = (k) => (e) => { setForm((f) => ({ ...f, [k]: e.target.value })); setMsg(null); };

  const submit = async (e) => {
    e.preventDefault();
    if (form.next.length < 8) return setMsg({ ok: false, text: 'Use at least 8 characters for the new password.' });
    if (form.next !== form.confirm) return setMsg({ ok: false, text: "The new passwords don't match." });
    setBusy(true);
    try {
      const res = await changePassword({ currentPassword: form.current, newPassword: form.next });
      replaceToken(res?.token);
      setForm({ current: '', next: '', confirm: '' });
      setMsg({ ok: true, text: res?.message || 'Password changed.' });
    } catch (err) {
      setMsg({ ok: false, text: err.message || 'Could not change the password.' });
    } finally { setBusy(false); }
  };

  return (
    <form onSubmit={submit} className="space-y-4 max-w-md" noValidate>
      <div>
        <label htmlFor="pw-current" className="block text-sm font-medium text-gray-700 mb-1">Current password</label>
        <input id="pw-current" type={show ? 'text' : 'password'} autoComplete="current-password" value={form.current} onChange={set('current')} className={inputCls} required />
      </div>
      <div>
        <label htmlFor="pw-new" className="block text-sm font-medium text-gray-700 mb-1">New password</label>
        <input id="pw-new" type={show ? 'text' : 'password'} autoComplete="new-password" value={form.next} onChange={set('next')} className={inputCls} required minLength={8} aria-describedby="pw-hint" />
        <p id="pw-hint" className="text-xs text-gray-500 mt-1">At least 8 characters.</p>
      </div>
      <div>
        <label htmlFor="pw-confirm" className="block text-sm font-medium text-gray-700 mb-1">Confirm new password</label>
        <input id="pw-confirm" type={show ? 'text' : 'password'} autoComplete="new-password" value={form.confirm} onChange={set('confirm')} className={inputCls} required />
      </div>
      <button type="button" onClick={() => setShow((s) => !s)} className="flex items-center gap-1.5 text-sm text-navy-700 font-medium">
        {show ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />} {show ? 'Hide passwords' : 'Show passwords'}
      </button>
      {msg && (
        <p role="status" className={`text-sm rounded-lg px-3 py-2 flex items-start gap-2 ${msg.ok ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'}`}>
          {msg.ok && <CheckCircle2 size={16} className="mt-0.5 shrink-0" aria-hidden="true" />} {msg.text}
        </p>
      )}
      <button type="submit" disabled={busy || !form.current || !form.next || !form.confirm} className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-navy-800 hover:bg-navy-900 text-white text-sm font-semibold disabled:opacity-50">
        {busy && <Loader2 size={16} className="animate-spin" aria-hidden="true" />} Change password
      </button>
    </form>
  );
};

export default ChangePasswordForm;
