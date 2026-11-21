import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { ArrowRight, Eye, EyeOff, Mail, Smartphone, Building2, MapPin } from 'lucide-react';
import { signupStartApi, signupUser, googleSignInApi } from '../services/api';
import { useAuth } from '../context/AuthContext';
import usePageTitle from '../hooks/usePageTitle';
import { AuthShell, ErrorNote, Field, PhoneInput, CodeInput, TestCodeNote, ResendButton, GoogleButton } from '../components/auth/AuthParts';
import { phoneForApi, inputClass, primaryButton } from '../components/auth/authUtils';

/**
 * Sign up in two steps:
 *  1. name, email, mobile, password -> we send a code to the email and one to the phone
 *  2. both codes -> the account is created and signed in
 *
 * `partner`: "List your property" — the same, plus the property's name and city; the account is
 * a hotel partner's, and it goes straight to step 1 of property registration, prefilled.
 */
const ONBOARDING_DRAFT = 'zivo_onboarding_draft';

const Signup = ({ partner = false, aside = null }) => {
  usePageTitle(partner ? 'List your property' : 'Create an account');
  const navigate = useNavigate();
  const location = useLocation();
  const { setSession } = useAuth();
  const from = location.state?.from?.pathname || '/';

  const [step, setStep] = useState('details');
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '', propertyName: '', propertyCity: '' });
  const [showPw, setShowPw] = useState(false);
  const [codes, setCodes] = useState({ emailCode: '', phoneCode: '' });
  const [sent, setSent] = useState({ phone: '', emailTest: '', smsTest: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: typeof v === 'string' ? v : v.target.value }));
  const details = () => ({
    name: form.name.trim(), email: form.email.trim(), phone: phoneForApi(form.phone), password: form.password,
    ...(partner ? { accountType: 'PARTNER', propertyName: form.propertyName.trim(), propertyCity: form.propertyCity.trim() } : {}),
  });

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
      if (partner) {
        // Registration opens at step 1 with what they already told us
        try {
          const prev = JSON.parse(localStorage.getItem(ONBOARDING_DRAFT) || 'null') || {};
          const d = details();
          localStorage.setItem(ONBOARDING_DRAFT, JSON.stringify({
            ...prev, name: d.propertyName, city: d.propertyCity,
            ownerName: d.name, ownerEmail: d.email, ownerPhone: d.phone, managerName: d.name, managerEmail: d.email, managerPhone: d.phone,
          }));
          localStorage.setItem('zivo_onboarding_step', '1');
        } catch { /* storage unavailable: the wizard starts empty */ }
        navigate('/extranet/onboarding', { replace: true });
      } else {
        navigate(from, { replace: true, state: { welcome: true } });
      }
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
      <AuthShell title="Confirm it's you" subtitle="We sent a 6-digit code to your email and one to your mobile." aside={aside}>
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
            {loading ? 'Creating your account…' : <>{partner ? 'Create partner account' : 'Create account'} <ArrowRight className="ml-2 h-5 w-5" aria-hidden="true" /></>}
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
      title={partner ? 'List your property' : 'Create an account'}
      aside={aside}
      subtitle={partner
        ? <>Already a partner? <Link to="/extranet/login" className="font-semibold text-navy-700 hover:text-navy-900">Log in to the Extranet</Link></>
        : <>Already have an account? <Link to="/login" state={location.state} className="font-semibold text-navy-700 hover:text-navy-900">Sign in instead</Link></>}
    >
      <form className="space-y-5" onSubmit={start}>
        <ErrorNote>{error}</ErrorNote>
        {partner && (
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label={<span className="flex items-center gap-1.5"><Building2 size={15} aria-hidden="true" /> Property name</span>} id="su-prop">
              <input id="su-prop" type="text" required minLength={2} maxLength={120} value={form.propertyName} onChange={set('propertyName')} className={inputClass} placeholder="e.g. Hotel Sunrise" />
            </Field>
            <Field label={<span className="flex items-center gap-1.5"><MapPin size={15} aria-hidden="true" /> City</span>} id="su-city">
              <input id="su-city" type="text" required minLength={2} maxLength={80} value={form.propertyCity} onChange={set('propertyCity')} className={inputClass} placeholder="e.g. Bengaluru" />
            </Field>
          </div>
        )}
        <Field label={partner ? 'Your full name' : 'Full name'} id="su-name">
          <input id="su-name" type="text" autoComplete="name" required minLength={2} value={form.name} onChange={set('name')} className={inputClass} placeholder={partner ? 'Owner or manager' : 'As on your ID'} />
        </Field>
        <Field label={partner ? 'Email (you will log in with it)' : 'Email address'} id="su-email" hint="We'll send a code to confirm it.">
          <input id="su-email" type="email" autoComplete="email" required value={form.email} onChange={set('email')} className={inputClass} placeholder="you@example.com" />
        </Field>
        <Field label="Mobile number" id="su-phone" hint={partner ? "We'll send a code by SMS. Our partner team uses it to reach you." : "We'll send a code by SMS. Hotels use it to reach you about your stay."}>
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
          By continuing you agree to our <Link to="/terms" className="underline">Terms</Link>{partner && <> (including <Link to="/terms#partners" className="underline">hotel partners</Link>)</>} and <Link to="/privacy" className="underline">Privacy Policy</Link>.
        </p>
      </form>
      {!partner && <GoogleButton onCredential={onGoogle} text="signup_with" />}
    </AuthShell>
  );
};

export default Signup;
