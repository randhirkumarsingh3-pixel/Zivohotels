import { useEffect, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { ArrowRight, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { loginCodeSendApi, loginCodeVerifyApi, googleSignInApi } from '../services/api';
import usePageTitle from '../hooks/usePageTitle';
import { AuthShell, ErrorNote, Field, CodeInput, TestCodeNote, ResendButton, GoogleButton } from '../components/auth/AuthParts';
import { inputClass, primaryButton } from '../components/auth/authUtils';

/**
 * Guest sign-in, two ways:
 *  - Password: email or mobile number + password
 *  - Code: a 6-digit code to the email or mobile number (no password needed)
 * plus "Continue with Google" once it is set up.
 */
const Login = () => {
  usePageTitle('Log in');
  const { login, setSession } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from?.pathname || '/';
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

  const [mode, setMode] = useState('password');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(null); // { to, testCode, channel }
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const done = (result) => {
    if (result.success) navigate(from, { replace: true });
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

  const switchMode = (m) => { setMode(m); setError(''); setCodeSent(null); setCode(''); };

  return (
    <AuthShell
      title="Welcome back"
      subtitle={<>New to ZivoHotels? <Link to="/signup" state={location.state} className="font-semibold text-navy-700 hover:text-navy-900">Create an account</Link></>}
    >
      {notice && <p className="mb-4 rounded-lg bg-green-50 p-3 text-sm text-green-800">{notice}</p>}
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
    </AuthShell>
  );
};

export default Login;
