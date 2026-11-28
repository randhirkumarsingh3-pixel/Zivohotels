import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { FlaskConical, ArrowRight } from 'lucide-react';
import { companySsoTestCodeApi, companySsoTestVerifyApi } from '../services/api';
import usePageTitle from '../hooks/usePageTitle';
import { AuthShell, ErrorNote, Field, CodeInput, TestCodeNote, ResendButton } from '../components/auth/AuthParts';
import { inputClass, primaryButton } from '../components/auth/authUtils';

/**
 * Company sign-in in setup mode: until ZivoPlus connects Google Workspace and Microsoft, this page
 * stands in for their sign-in page. The person proves their work email with a one-time code; we
 * then go back to ZivoPlus exactly as the provider would.
 */
const SsoTestSignIn = () => {
  usePageTitle('Company sign-in (setup mode)');
  const q = new URLSearchParams(useLocation().search);
  const state = q.get('state') || '';
  const provider = q.get('provider') === 'MICROSOFT' ? 'Microsoft' : 'Google Workspace';
  const [email, setEmail] = useState(q.get('login_hint') || '');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(null); // { to, testCode }
  const [error, setError] = useState(state ? '' : 'This sign-in link is incomplete. Please start again from ZivoPlus.');
  const [loading, setLoading] = useState(false);

  const send = async (e) => {
    e?.preventDefault();
    setError(''); setLoading(true);
    try { const r = await companySsoTestCodeApi(state, email.trim()); setSent(r.data); } catch (err) { setError(err.message); } finally { setLoading(false); }
  };
  const verify = async (e) => {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const r = await companySsoTestVerifyApi(state, email.trim(), code.trim(), name.trim());
      window.location.assign(r.data.redirect);
    } catch (err) { setError(err.message); setLoading(false); }
  };

  return (
    <AuthShell title={`Sign in with ${provider}`} subtitle="Company sign-in for ZivoPlus for Business">
      <div className="mb-5 flex gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
        <FlaskConical size={16} className="shrink-0 mt-0.5" aria-hidden="true" />
        <span><b>Setup mode.</b> ZivoPlus hasn&apos;t connected {provider} yet, so this page stands in for its sign-in. You prove your work email with a code we send to it; everything else works as it will live.</span>
      </div>
      {!sent ? (
        <form className="space-y-5" onSubmit={send}>
          <ErrorNote>{error}</ErrorNote>
          <Field label="Work email" id="sso-t-email">
            <input id="sso-t-email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} placeholder="you@yourcompany.com" />
          </Field>
          <Field label="Your name" id="sso-t-name" hint="Used if this is your first sign-in.">
            <input id="sso-t-name" type="text" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="As your company knows you" />
          </Field>
          <button type="submit" disabled={loading || !state} className={primaryButton}>{loading ? 'Sending…' : 'Send code'}</button>
        </form>
      ) : (
        <form className="space-y-5" onSubmit={verify}>
          <ErrorNote>{error}</ErrorNote>
          <Field label={`Code sent to ${sent.to}`} id="sso-t-code">
            <CodeInput id="sso-t-code" value={code} onChange={setCode} autoFocus />
            <TestCodeNote code={sent.testCode} channel="EMAIL" onUse={setCode} />
            <div className="mt-1 flex justify-between">
              <button type="button" onClick={() => { setSent(null); setCode(''); setError(''); }} className="text-xs font-semibold text-navy-700">Use a different email</button>
              <ResendButton onResend={() => send()} />
            </div>
          </Field>
          <button type="submit" disabled={loading || code.length < 6} className={primaryButton}>
            {loading ? 'Signing in…' : <>Continue <ArrowRight className="ml-2 h-5 w-5" aria-hidden="true" /></>}
          </button>
        </form>
      )}
    </AuthShell>
  );
};

export default SsoTestSignIn;
