import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { ArrowRight, Eye, EyeOff, Mail, Smartphone } from 'lucide-react';
import { signupStartApi, signupUser, googleSignInApi } from '../services/api';
import { useAuth } from '../context/AuthContext';
import usePageTitle from '../hooks/usePageTitle';
import { AuthShell, ErrorNote, Field, PhoneInput, CodeInput, TestCodeNote, ResendButton, GoogleButton } from '../components/auth/AuthParts';
import { phoneForApi, inputClass, primaryButton } from '../components/auth/authUtils';

/**
 * Sign up in two steps:
 *  1. name, email, mobile, password -> we send a code to the email and one to the phone
 *  2. both codes -> the account is created and the guest is signed in
 */
const Signup = () => {
  usePageTitle('Create an account');
  const navigate = useNavigate();
  const location = useLocation();
  const { setSession } = useAuth();
  const from = location.state?.from?.pathname || '/';

  const [step, setStep] = useState('details');
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '' });
  const [showPw, setShowPw] = useState(false);
  const [codes, setCodes] = useState({ emailCode: '', phoneCode: '' });
  const [sent, setSent] = useState({ phone: '', emailTest: '', smsTest: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: typeof v === 'string' ? v : v.target.value }));
  const details = () => ({ name: form.name.trim(), email: form.email.trim(), phone: phoneForApi(form.phone), password: form.password });

  const sendCodes = async (only) => {
    const r = await signupStartApi({ ...details(), ...(only ? { only } : {}) });
    const d = r?.data || {};
    setSent((s) => ({
      phone: d.phone || s.phone,
      emailTest: only === 'SMS' ? s.emailTest : d.email?.testCode || '',
      smsTest: only === 'EMAIL' ? s.smsTest : d.sms?.testCode || '',
    }));
  };

  const start = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await sendCodes();
      setCodes({ emailCode: '', phoneCode: '' });
      setStep('codes');
    } catch (err) {
      setError(err.message || 'Could not send the codes. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const finish = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const r = await signupUser({ ...details(), ...codes });
      setSession(r?.data?.user);
      navigate(from, { replace: true, state: { welcome: true } });
    } catch (err) {
      setError(err.message || 'Could not create the account.');
      setLoading(false);
    }
  };

  const resend = (only) => sendCodes(only).catch((err) => setError(err.message));

  const onGoogle = async (credential) => {
    setError('');
    try {
      const r = await googleSignInApi(credential);
      setSession(r?.data?.user);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err.message || 'Google sign-in failed.');
    }
  };

  if (step === 'codes') {
    return (
      <AuthShell title="Confirm it's you" subtitle="We sent a 6-digit code to your email and one to your mobile.">
        <form className="space-y-5" onSubmit={finish}>
          <ErrorNote>{error}</ErrorNote>
          <Field label={<span className="flex items-center gap-1.5"><Mail size={15} aria-hidden="true" /> Code sent to {form.email.trim()}</span>} id="email-code">
            <CodeInput id="email-code" value={codes.emailCode} onChange={(v) => setCodes((c) => ({ ...c, emailCode: v }))} autoFocus />
            <TestCodeNote code={sent.emailTest} channel="EMAIL" onUse={(v) => setCodes((c) => ({ ...c, emailCode: v }))} />
            <div className="mt-1 text-right"><ResendButton onResend={() => resend('EMAIL')} label="Resend email code" /></div>
          </Field>
          <Field label={<span className="flex items-center gap-1.5"><Smartphone size={15} aria-hidden="true" /> Code sent to {sent.phone}</span>} id="phone-code">
            <CodeInput id="phone-code" value={codes.phoneCode} onChange={(v) => setCodes((c) => ({ ...c, phoneCode: v }))} />
            <TestCodeNote code={sent.smsTest} channel="SMS" onUse={(v) => setCodes((c) => ({ ...c, phoneCode: v }))} />
            <div className="mt-1 text-right"><ResendButton onResend={() => resend('SMS')} label="Resend SMS code" /></div>
          </Field>
          <button type="submit" disabled={loading || codes.emailCode.length !== 6 || codes.phoneCode.length !== 6} className={primaryButton}>
            {loading ? 'Creating your account…' : <>Create account <ArrowRight className="ml-2 h-5 w-5" aria-hidden="true" /></>}
          </button>
          <button type="button" onClick={() => { setStep('details'); setError(''); }} className="w-full text-sm font-semibold text-navy-700 hover:text-navy-900">
            Change my details
          </button>
        </form>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Create an account"
      subtitle={<>Already have an account? <Link to="/login" state={location.state} className="font-semibold text-navy-700 hover:text-navy-900">Sign in instead</Link></>}
    >
      <form className="space-y-5" onSubmit={start}>
        <ErrorNote>{error}</ErrorNote>
        <Field label="Full name" id="su-name">
          <input id="su-name" type="text" autoComplete="name" required minLength={2} value={form.name} onChange={set('name')} className={inputClass} placeholder="As on your ID" />
        </Field>
        <Field label="Email address" id="su-email" hint="We'll send a code to confirm it.">
          <input id="su-email" type="email" autoComplete="email" required value={form.email} onChange={set('email')} className={inputClass} placeholder="you@example.com" />
        </Field>
        <Field label="Mobile number" id="su-phone" hint="We'll send a code by SMS. Hotels use it to reach you about your stay.">
          <PhoneInput id="su-phone" value={form.phone} onChange={set('phone')} />
        </Field>
        <Field label="Password" id="su-pass" hint="At least 8 characters.">
          <div className="relative">
            <input id="su-pass" type={showPw ? 'text' : 'password'} autoComplete="new-password" required minLength={8} value={form.password} onChange={set('password')} className={`${inputClass} pr-11`} placeholder="••••••••" />
            <button type="button" onClick={() => setShowPw((s) => !s)} aria-label={showPw ? 'Hide password' : 'Show password'} className="absolute inset-y-0 right-0 px-3 text-gray-400 hover:text-gray-600">
              {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </Field>
        <button type="submit" disabled={loading} className={primaryButton}>
          {loading ? 'Sending codes…' : <>Continue <ArrowRight className="ml-2 h-5 w-5" aria-hidden="true" /></>}
        </button>
        <p className="text-xs text-gray-500 text-center">
          By continuing you agree to our <Link to="/terms" className="underline">Terms</Link> and <Link to="/privacy" className="underline">Privacy Policy</Link>.
        </p>
      </form>
      <GoogleButton onCredential={onGoogle} text="signup_with" />
    </AuthShell>
  );
};

export default Signup;
