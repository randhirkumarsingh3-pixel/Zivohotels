import { useEffect, useRef, useState } from 'react';
import { AlertCircle, FlaskConical } from 'lucide-react';
import { inputClass, useAuthConfig } from './authUtils';

/** Page frame shared by sign-in, sign-up and the account set-up screens. */
export const AuthShell = ({ title, subtitle, children, footer }) => (
  <div className="min-h-screen bg-gray-50 flex flex-col justify-start sm:justify-center pt-28 pb-12 sm:py-12 px-4 sm:px-6 lg:px-8">
    <div className="sm:mx-auto sm:w-full sm:max-w-md">
      <img src="/brand/zivo-mark.png" alt="" aria-hidden="true" className="mx-auto h-12 w-12" />
      <h1 className="mt-4 text-center text-3xl font-bold text-navy-900">{title}</h1>
      {subtitle && <p className="mt-2 text-center text-sm text-gray-600">{subtitle}</p>}
    </div>
    <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
      <div className="bg-white py-8 px-4 shadow-sm rounded-card sm:px-10 border border-gray-100">{children}</div>
      {footer && <div className="mt-6 text-center text-sm text-gray-500">{footer}</div>}
    </div>
  </div>
);

export const ErrorNote = ({ children }) => (children ? (
  <div role="alert" className="bg-red-50 p-3.5 rounded-lg flex items-start">
    <AlertCircle className="h-5 w-5 text-red-500 mr-2 shrink-0 mt-0.5" aria-hidden="true" />
    <p className="text-sm text-red-800">{children}</p>
  </div>
) : null);


export const Field = ({ label, id, hint, children }) => (
  <div>
    <label htmlFor={id} className="block text-sm font-semibold text-gray-700 mb-1.5">{label}</label>
    {children}
    {hint && <p className="mt-1 text-xs text-gray-500">{hint}</p>}
  </div>
);

/** Indian mobile number with a fixed +91 in front (other countries: type the full +code number). */
export const PhoneInput = ({ id, value, onChange, autoFocus }) => (
  <div className="flex">
    <span className="inline-flex items-center px-3 rounded-l-xl border border-r-0 border-gray-300 bg-gray-50 text-sm text-gray-600">+91</span>
    <input
      id={id} type="tel" inputMode="tel" autoComplete="tel-national" required autoFocus={autoFocus}
      value={value} onChange={(e) => onChange(e.target.value)} placeholder="98765 43210" maxLength={16}
      className={`${inputClass} rounded-l-none`}
    />
  </div>
);

/** 6-digit code box (phones offer the code from the SMS automatically). */
export const CodeInput = ({ id, value, onChange, autoFocus }) => (
  <input
    id={id} type="text" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required autoFocus={autoFocus}
    value={value} onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="••••••"
    className={`${inputClass} text-center text-2xl font-bold tracking-[0.5em]`}
  />
);

/**
 * Shown while codes aren't really sent (no SMS provider / email not set up yet): the code is
 * displayed here instead, with a button to fill it in.
 */
export const TestCodeNote = ({ code, channel, onUse }) => (code ? (
  <div className="mt-2 flex items-center justify-between gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
    <span className="flex items-center gap-1.5"><FlaskConical size={14} aria-hidden="true" /> Test mode ({channel === 'SMS' ? 'SMS not connected yet' : 'email not connected yet'}): your code is <b className="tracking-wider">{code}</b></span>
    {onUse && <button type="button" onClick={() => onUse(code)} className="font-bold underline whitespace-nowrap shrink-0">Use it</button>}
  </div>
) : null);

/** "Resend code" with a 30-second wait between sends. */
export const ResendButton = ({ onResend, label = 'Resend code', seconds = 30 }) => {
  const [left, setLeft] = useState(seconds);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (left <= 0) return undefined; const t = setTimeout(() => setLeft(left - 1), 1000); return () => clearTimeout(t); }, [left]);
  return (
    <button
      type="button" disabled={left > 0 || busy}
      onClick={async () => { setBusy(true); try { await onResend(); setLeft(seconds); } finally { setBusy(false); } }}
      className="text-xs font-semibold text-navy-700 hover:text-navy-900 disabled:text-gray-400"
    >
      {left > 0 ? `${label} in ${left}s` : busy ? 'Sending…' : label}
    </button>
  );
};

let gsiPromise = null;
const loadGoogle = () => {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (!gsiPromise) {
    gsiPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.async = true;
      s.onload = resolve;
      s.onerror = () => { gsiPromise = null; reject(new Error('Google sign-in could not load')); };
      document.head.appendChild(s);
    });
  }
  return gsiPromise;
};

/**
 * "Continue with Google". Appears only once a Google client id is set on the server
 * (GOOGLE_CLIENT_ID). Calls onCredential with Google's ID token.
 */
export const GoogleButton = ({ onCredential, text = 'continue_with' }) => {
  const config = useAuthConfig();
  const ref = useRef(null);
  const cb = useRef(onCredential);
  cb.current = onCredential;
  const clientId = config?.googleClientId;
  useEffect(() => {
    if (!clientId || !ref.current) return;
    let cancelled = false;
    loadGoogle().then(() => {
      if (cancelled || !ref.current) return;
      window.google.accounts.id.initialize({ client_id: clientId, callback: (r) => cb.current?.(r.credential), ux_mode: 'popup' });
      window.google.accounts.id.renderButton(ref.current, { theme: 'outline', size: 'large', text, shape: 'pill', width: Math.min(ref.current.offsetWidth || 320, 400) });
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [clientId, text]);
  if (!clientId) return null;
  return (
    <>
      <div className="flex items-center gap-3 my-5 text-xs text-gray-400"><span className="h-px flex-1 bg-gray-200" />or<span className="h-px flex-1 bg-gray-200" /></div>
      <div ref={ref} className="flex justify-center w-full min-h-[44px]" />
    </>
  );
};
