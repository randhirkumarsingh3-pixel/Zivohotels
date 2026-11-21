import { useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { phoneCodeSendApi, phoneVerifyApi } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { ErrorNote, PhoneInput, CodeInput, TestCodeNote, ResendButton } from '../auth/AuthParts';
import { phoneForApi, primaryButton } from '../auth/authUtils';

/** Add or change the mobile number on the account: number -> SMS code -> confirmed. */
const PhoneVerifyForm = ({ onDone, submitLabel = 'Send code' }) => {
  const { updateUser } = useAuth();
  const [phone, setPhone] = useState('');
  const [sent, setSent] = useState(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const send = async (e) => {
    e?.preventDefault();
    setError(''); setBusy(true);
    try {
      const r = await phoneCodeSendApi(phoneForApi(phone));
      setSent(r?.data || {}); setCode('');
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  const verify = async (e) => {
    e.preventDefault();
    setError(''); setBusy(true);
    try {
      const r = await phoneVerifyApi(phoneForApi(phone), code);
      const u = r?.data?.user;
      updateUser({ phone: u?.phone, phoneVerified: true });
      setDone(true);
      onDone?.(u);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  if (done) return <p className="flex items-center gap-2 text-sm font-semibold text-green-700"><CheckCircle2 size={18} aria-hidden="true" /> Mobile number confirmed.</p>;

  return !sent ? (
    <form onSubmit={send} className="space-y-4">
      <ErrorNote>{error}</ErrorNote>
      <label htmlFor="pv-phone" className="sr-only">Mobile number</label>
      <PhoneInput id="pv-phone" value={phone} onChange={setPhone} />
      <button type="submit" disabled={busy || phone.replace(/\D/g, '').length < 8} className={primaryButton}>{busy ? 'Sending…' : submitLabel}</button>
    </form>
  ) : (
    <form onSubmit={verify} className="space-y-4">
      <ErrorNote>{error}</ErrorNote>
      <label htmlFor="pv-code" className="block text-sm font-semibold text-gray-700">Code sent to {sent.to}</label>
      <CodeInput id="pv-code" value={code} onChange={setCode} autoFocus />
      <TestCodeNote code={sent.testCode} channel="SMS" onUse={setCode} />
      <div className="flex justify-between">
        <button type="button" onClick={() => { setSent(null); setError(''); }} className="text-xs font-semibold text-navy-700">Change number</button>
        <ResendButton onResend={() => send()} />
      </div>
      <button type="submit" disabled={busy || code.length !== 6} className={primaryButton}>{busy ? 'Checking…' : 'Confirm number'}</button>
    </form>
  );
};

export default PhoneVerifyForm;
