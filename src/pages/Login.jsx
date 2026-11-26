import { useEffect, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { ArrowRight, Eye, EyeOff, Building2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { loginCodeSendApi, loginCodeVerifyApi, googleSignInApi, companySsoStartApi } from '../services/api';
import usePageTitle from '../hooks/usePageTitle';
import { AuthShell, ErrorNote, Field, CodeInput, TestCodeNote, ResendButton, GoogleButton } from '../components/auth/AuthParts';
import { inputClass, primaryButton, returnTo, useAuthConfig } from '../components/auth/authUtils';

/**
 * Guest sign-in, two ways:
 *  - Password: email or mobile number + password
 *  - Code: a 6-digit code to the email or mobile number (no password needed)
 * plus "Continue with Google" once it is set up, and company sign-in (Google Workspace or Microsoft,
 * set up by the company's admin in ZivoPlus for Business) once the server offers it.
 */
const Login = () => {
  usePageTitle('Log in');
  const { login, setSession } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const back = returnTo(location);
  const [notice] = useState(() => {
    let once = '';
    try { once = sessionStorage.getItem('zivo_login_notice') || ''; } catch { /* ignore */ }
    return location.state?.message || once || (new URLSearchParams(location.search).get('expired') ? 'Your session ended. Please sign in again.' : '');
  });
  // Shown once: forget it a moment after the page has shown it
  useEffect(() => {
    const t = setTimeout(() => { try { sessionStorage.removeItem('zivo_login_notice'); } catch { /* ignore */ } }, 1500);
    return () => clearTimeout(t);
  }, []);

  const config = useAuthConfig();
  const query = new URLSearchParams(location.search);
  const [mode, setMode] = useState(() => (query.get('company') || query.get('sso_error') ? 'company' : 'password'));
  const [workEmail, setWorkEmail] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(null); // { to, testCode, channel }
  const [error, setError] = useState(() => query.get('sso_error') || '');
  const [loading, setLoading] = useState(false);

  const done = (result) => {
    if (result.success) navigate(back.path, { replace: true, state: back.state });
    else { setError(result.message || 'Sign-in failed'); setLoading(false); }
  };

  const signInWithPassword = async (e) => {
    e.preventDefault();
    setError(''); setLoading(true);
    done(await login(identifier.trim(), password));
  };

  const sendCode = async (e) => {
    e?.preventDefault();
    setError(''); setLoading(true);
    try {
      const r = await loginCodeSendApi(identifier.trim());
      setCodeSent(r?.data || {});
      setCode('');
    } catch (err) {
      setError(err.message || 'Could not send a code.');
    } finally {
      setLoading(false);
    }
  };

  const signInWithCode = async (e) => {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const r = await loginCodeVerifyApi(identifier.trim(), code);
      done(setSession(r?.data?.user));
    } catch (err) {
      setError(err.message || 'Sign-in failed'); setLoading(false);
    }
  };

  const onGoogle = async (credential) => {
    setError('');
    try {
      const r = await googleSignInApi(credential);
      done(setSession(r?.data?.user));
    } catch (err) {
      setError(err.message || 'Google sign-in failed.');
    }
  };

  // Company sign-in: the server finds the company from the email's domain and sends us to its provider
  const startCompanySignIn = async (e) => {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const r = await companySsoStartApi(workEmail.trim(), back.path);
      window.location.assign(r?.data?.url);
    } catch (err) {
      setError(err.message || 'Company sign-in isn\'t set up for this email.'); setLoading(false);
    }
  };

  const switchMode = (m) => { setMode(m); setError(''); setCodeSent(null); setCode(''); };

  return (
    <AuthShell
      title="Welcome back"
      subtitle={<>New to ZivoPlus? <Link to="/signup" state={location.state} className="font-semibold text-navy-700 hover:text-navy-900">Create an account</Link></>}
    >
      {notice && <p className="mb-4 rounded-lg bg-green-50 p-3 text-sm text-green-800">{notice}</p>}
      {back.booking && !notice && (
        <p className="mb-4 rounded-lg bg-navy-50 p-3 text-sm text-navy-900">
          <strong>Sign in to finish your booking.</strong> Not registered yet? <Link to="/signup" state={location.state} className="font-semibold underline">Create a free account</Link>. Your room and dates are kept.
        </p>
      )}
      {mode === 'company' ? (
        <form className="space-y-5" onSubmit={startCompanySignIn}>
          <div className="flex items-center gap-2 text-sm font-semibold text-navy-900"><Building2 size={18} aria-hidden="true" /> Sign in with your company account</div>
          <ErrorNote>{error}</ErrorNote>
          <Field label="Work email" id="lco-email" hint="If your company set up sign-in with Google Workspace or Microsoft, we'll take you to it.">
            <input id="lco-email" type="email" autoComplete="email" required value={workEmail} onChange={(e) => setWorkEmail(e.target.value)} className={inputClass} placeholder="you@yourcompany.com" autoFocus />
          </Field>
          <button type="submit" disabled={loading} className={primaryButton}>
            {loading ? 'Taking you there…' : <>Continue <ArrowRight className="ml-2 h-5 w-5" aria-hidden="true" /></>}
          </button>
          <button type="button" onClick={() => switchMode('password')} className="w-full text-sm font-semibold text-navy-700 hover:text-navy-900">Sign in another way</button>
        </form>
      ) : (<>
      <div role="tablist" aria-label="How to sign in" className="grid grid-cols-2 gap-1 rounded-xl bg-gray-100 p-1 mb-6">
        {[['password', 'Password'], ['code', 'Sign-in code']].map(([m, label]) => (
          <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => switchMode(m)}
            className={`rounded-lg py-2 text-sm font-semibold transition-colors ${mode === m ? 'bg-white text-navy-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            {label}
          </button>
        ))}
      </div>

      {mode === 'password' ? (
        <form className="space-y-5" onSubmit={signInWithPassword}>
          <ErrorNote>{error}</ErrorNote>
          <Field label="Email or mobile number" id="li-id">
            <input id="li-id" type="text" autoComplete="username" required value={identifier} onChange={(e) => setIdentifier(e.target.value)} className={inputClass} placeholder="you@example.com or 98765 43210" />
          </Field>
          <Field label="Password" id="li-pass">
            <div className="relative">
              <input id="li-pass" type={showPw ? 'text' : 'password'} autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className={`${inputClass} pr-11`} placeholder="••••••••" />
              <button type="button" onClick={() => setShowPw((s) => !s)} aria-label={showPw ? 'Hide password' : 'Show password'} className="absolute inset-y-0 right-0 px-3 text-gray-400 hover:text-gray-600">
                {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </Field>
          <div className="text-right text-sm">
            <Link to="/forgot-password" className="font-semibold text-navy-700 hover:text-navy-900">Forgot password?</Link>
          </div>
          <button type="submit" disabled={loading} className={primaryButton}>
            {loading ? 'Signing in…' : <>Sign in <ArrowRight className="ml-2 h-5 w-5" aria-hidden="true" /></>}
          </button>
        </form>
      ) : !codeSent ? (
        <form className="space-y-5" onSubmit={sendCode}>
          <ErrorNote>{error}</ErrorNote>
          <Field label="Email or mobile number" id="lc-id" hint="We'll send you a 6-digit code. No password needed.">
            <input id="lc-id" type="text" autoComplete="username" required value={identifier} onChange={(e) => setIdentifier(e.target.value)} className={inputClass} placeholder="you@example.com or 98765 43210" />
          </Field>
          <button type="submit" disabled={loading} className={primaryButton}>{loading ? 'Sending…' : 'Send code'}</button>
        </form>
      ) : (
        <form className="space-y-5" onSubmit={signInWithCode}>
          <ErrorNote>{error}</ErrorNote>
          <Field label={`Code sent to ${codeSent.to}`} id="lc-code">
            <CodeInput id="lc-code" value={code} onChange={setCode} autoFocus />
            <TestCodeNote code={codeSent.testCode} channel={codeSent.channel} onUse={setCode} />
            <div className="mt-1 flex justify-between">
              <button type="button" onClick={() => { setCodeSent(null); setError(''); }} className="text-xs font-semibold text-navy-700">Use a different email or number</button>
              <ResendButton onResend={() => sendCode()} />
            </div>
          </Field>
          <button type="submit" disabled={loading || code.length !== 6} className={primaryButton}>
            {loading ? 'Signing in…' : <>Sign in <ArrowRight className="ml-2 h-5 w-5" aria-hidden="true" /></>}
          </button>
        </form>
      )}

      <GoogleButton onCredential={onGoogle} />
      {config?.companySso && !config?.googleClientId && <div className="flex items-center gap-3 my-5 text-xs text-gray-400"><span className="h-px flex-1 bg-gray-200" />or<span className="h-px flex-1 bg-gray-200" /></div>}
      {config?.companySso && (
        <button type="button" onClick={() => switchMode('company')} className="mt-3 w-full inline-flex justify-center items-center gap-2 py-2.5 px-4 rounded-full text-sm font-semibold border border-gray-300 text-gray-800 hover:bg-gray-50">
          <Building2 size={17} aria-hidden="true" /> Sign in with your company account
        </button>
      )}
      </>)}
      <div className="mt-6 pt-5 border-t border-gray-100 text-center">
        <p className="text-sm text-gray-600">Not registered yet?</p>
        <Link to="/signup" state={location.state}
          className="mt-2 w-full inline-flex justify-center items-center py-3 px-4 rounded-xl text-sm font-bold border-2 border-navy-700 text-navy-800 hover:bg-navy-50 transition-colors">
          Create a free account
        </Link>
        <p className="mt-2 text-xs text-gray-500">Member prices, Zivo Rewards on every stay, and all your bookings in one place.</p>
      </div>
    </AuthShell>
  );
};

export default Login;
