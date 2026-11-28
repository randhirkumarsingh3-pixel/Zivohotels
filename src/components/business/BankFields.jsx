import { useState } from 'react';
import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react';

/**
 * The payout / refund bank account: holder, account number (twice), IFSC with the bank and
 * branch looked up, account type. `lookup(ifsc)` returns { ok, bank, branch, message }.
 */
const input = 'mt-1 w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-navy-500 focus:border-navy-500 outline-none';
const label = 'block text-sm font-semibold text-gray-800';

const BankFields = ({ b, set, lookup }) => {
  const [ifscInfo, setIfscInfo] = useState(null);
  const [checking, setChecking] = useState(false);
  const check = async (code) => {
    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(code)) { setIfscInfo(code ? { ok: false, message: 'An IFSC has 11 characters: 4 letters, a zero, then 6 letters or digits.' } : null); return; }
    setChecking(true);
    try { setIfscInfo(await lookup(code)); } catch (e) { setIfscInfo({ ok: false, message: e.message }); } finally { setChecking(false); }
  };
  const mismatch = b.confirmAccountNumber && b.accountNumber !== b.confirmAccountNumber;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <label className={`${label} sm:col-span-2`}>Account holder name <span className="font-normal text-gray-500">(as the bank has it; the business's own account)</span>
        <input className={input} value={b.holderName || ''} onChange={(e) => set('holderName', e.target.value)} required />
      </label>
      <label className={label}>Account number
        <input className={input} inputMode="numeric" autoComplete="off" value={b.accountNumber || ''} onChange={(e) => set('accountNumber', e.target.value.replace(/\D/g, ''))} maxLength={18} required />
      </label>
      <label className={label}>Account number again
        <input className={input} inputMode="numeric" autoComplete="off" value={b.confirmAccountNumber || ''} onChange={(e) => set('confirmAccountNumber', e.target.value.replace(/\D/g, ''))} maxLength={18} required onPaste={(e) => e.preventDefault()} />
        {mismatch && <span className="block mt-1 text-xs font-normal text-red-700">The two numbers don&apos;t match.</span>}
      </label>
      <label className={label}>IFSC
        <input className={`${input} uppercase`} value={b.ifsc || ''} maxLength={11} required placeholder="HDFC0001234"
          onChange={(e) => { const v = e.target.value.toUpperCase().replace(/\s/g, ''); set('ifsc', v); if (v.length === 11) check(v); else setIfscInfo(null); }} />
        <span className="block mt-1 text-xs font-normal min-h-[1rem]" aria-live="polite">
          {checking ? <span className="inline-flex items-center gap-1 text-gray-500"><Loader2 size={12} className="animate-spin" /> Looking up…</span>
            : ifscInfo ? <span className={`inline-flex items-start gap-1 ${ifscInfo.ok ? 'text-green-800' : 'text-red-700'}`}>{ifscInfo.ok ? <CheckCircle2 size={13} className="mt-px shrink-0" /> : <AlertCircle size={13} className="mt-px shrink-0" />}{ifscInfo.message}</span> : null}
        </span>
      </label>
      <label className={label}>Account type
        <select className={input} value={b.accountType || 'CURRENT'} onChange={(e) => set('accountType', e.target.value)}>
          <option value="CURRENT">Current</option><option value="SAVINGS">Savings</option>
        </select>
      </label>
    </div>
  );
};

export default BankFields;
