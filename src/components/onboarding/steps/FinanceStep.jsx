import { useState, useEffect } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { verificationApi } from '../../../services/api';
import { 
  Landmark, CheckCircle2, AlertCircle,
  FileCheck, HelpCircle, ChevronDown, Check, Loader2
} from 'lucide-react';

const MAJOR_BANKS = [
  "HDFC Bank",
  "ICICI Bank",
  "State Bank of India (SBI)",
  "Axis Bank",
  "Kotak Mahindra Bank",
  "IndusInd Bank",
  "Yes Bank",
  "Punjab National Bank",
  "Bank of Baroda",
  "Canara Bank",
  "Union Bank of India",
  "IDFC First Bank"
];

const INCORPORATION_TYPES = [
  { value: "INDIVIDUAL", label: "Individual / Sole Proprietorship" },
  { value: "PARTNERSHIP", label: "Partnership Firm" },
  { value: "LLP", label: "Limited Liability Partnership (LLP)" },
  { value: "PVT_LTD", label: "Private Limited Company (Pvt Ltd)" },
  { value: "PUBLIC_LTD", label: "Public Limited Company" }
];

/** What each payout cycle means, under the cycle on the fee card. */
const payoutCycleNote = (cycle) => {
  const c = String(cycle || 'Weekly');
  const t = c.match(/^T\+(\d+)$/i);
  if (t) return `${t[1]} day${t[1] === '1' ? '' : 's'} after the guest checks out`;
  if (c === 'Monthly') return 'First week of the month';
  if (c === '15 days') return 'On the 1st and 16th';
  return 'Every Wednesday';
};

const ACCOUNT_STATUS = {
  VERIFIED: ['bg-emerald-50 text-emerald-800 border-emerald-200', 'Account verified'],
  PENDING: ['bg-blue-50 text-blue-800 border-blue-200', 'Test deposit sent: checking'],
  MANUAL: ['bg-amber-50 text-amber-900 border-amber-200', 'ZivoPlus will check it against your cancelled cheque'],
  NAME_MISMATCH: ['bg-red-50 text-red-700 border-red-200', 'Name at the bank does not match'],
  FAILED: ['bg-red-50 text-red-700 border-red-200', 'Account could not be verified'],
};

const FinanceStep = ({ formData, updateForm, isAdmin: isAdminProp, hotelId }) => {
  // Read from auth context directly so this works even in old cached bundles
  // that may not pass the isAdmin prop
  const { user } = useAuth();
  const isAdmin = isAdminProp !== undefined
    ? isAdminProp
    : (user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN');
  // Owners enter legal and bank details while onboarding; once the property is submitted they're
  // locked (changes go through support). The backend enforces the same rule.
  const isDraft = !formData.status || ['DRAFT', 'INFORMATION_REQUESTED'].includes(formData.status);
  const isProtected = !isAdmin && !isDraft;
  // Commission is agreed with ZivoPlus: only an admin enters it, and there is no automatic default
  const commissionLocked = !isAdmin;
  const commissionSet = Number(formData.commission) > 0;
  const [activeStep, setActiveStep] = useState(1);
  const [reAccountNumber, setReAccountNumber] = useState(formData.accountNumber || '');

  const [ifscBusy, setIfscBusy] = useState(false);
  const [ifscResult, setIfscResult] = useState(null); // { ok, bank, branch, city, message }
  const [panBusy, setPanBusy] = useState(false);
  const [panResult, setPanResult] = useState(null);
  const [gstBusy, setGstBusy] = useState(false);
  const [gstResult, setGstResult] = useState(null);
  const [accBusy, setAccBusy] = useState(false);
  const [account, setAccount] = useState(null); // server status of the payout account
  const [accError, setAccError] = useState('');

  // Sync reAccountNumber if formData changes
  useEffect(() => {
    if (formData.accountNumber && !reAccountNumber) {
      setReAccountNumber(formData.accountNumber);
    }
  }, [formData.accountNumber]);

  // Payouts go to the business's own account: the holder is the legal entity
  useEffect(() => {
    if (formData.legalName && formData.accountName !== formData.legalName) {
      updateForm('accountName', formData.legalName);
    }
  }, [formData.legalName]);

  // The payout account's check status (and the bank's answer once a test deposit completes)
  useEffect(() => {
    if (!hotelId) return undefined;
    let alive = true;
    const load = () => verificationApi.accountStatus(hotelId).then((d) => { if (alive) setAccount(d); }).catch(() => {});
    load();
    const t = setInterval(() => { if (account?.status === 'PENDING') load(); }, 8000);
    return () => { alive = false; clearInterval(t); };
  }, [hotelId, account?.status]);

  // A changed account number or IFSC needs a new check
  const accountChanged = account && account.status !== 'NONE' && (
    (formData.accountNumber && account.accountEnding && !account.accountEnding.endsWith(String(formData.accountNumber).slice(-4)))
    || (formData.ifscCode && account.ifscCode && account.ifscCode !== formData.ifscCode)
  );

  const handleVerifyIFSC = async () => {
    setIfscBusy(true); setIfscResult(null);
    try {
      const r = await verificationApi.ifsc(formData.ifscCode?.trim().toUpperCase());
      setIfscResult(r);
      if (r?.ok) updateForm({ ifscCode: r.ifsc, ...(r.bank ? { bankName: r.bank } : {}), ...(r.branch ? { branchName: [r.branch, r.city].filter(Boolean).join(', ') } : {}) });
    } catch (e) { setIfscResult({ ok: false, message: e.message || 'Could not look up the IFSC.' }); } finally { setIfscBusy(false); }
  };

  const handleVerifyAccount = async () => {
    setAccError('');
    if (!hotelId) { setAccError('Save the property first (Next step saves it), then check the account.'); return; }
    if (reAccountNumber !== formData.accountNumber) { setAccError('The two account numbers don\'t match.'); return; }
    setAccBusy(true);
    try {
      const d = await verificationApi.checkAccount({ hotelId, accountName: formData.legalName || formData.accountName, accountNumber: formData.accountNumber, ifscCode: formData.ifscCode, bankName: formData.bankName, branchName: formData.branchName });
      setAccount(d);
      if (d?.ifsc?.bank && !formData.bankName) updateForm('bankName', d.ifsc.bank);
    } catch (e) { setAccError(e.message || 'Could not check the account.'); } finally { setAccBusy(false); }
  };

  const handlePanChange = (val) => {
    updateForm('pan', val.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10));
    setPanResult(null);
  };
  const handleVerifyPAN = async () => {
    setPanBusy(true);
    try { setPanResult(await verificationApi.pan(formData.pan, formData.incorporationType || 'INDIVIDUAL')); } catch (e) { setPanResult({ ok: false, message: e.message }); } finally { setPanBusy(false); }
  };
  const handleVerifyGST = async () => {
    setGstBusy(true);
    try { setGstResult(await verificationApi.gstin(formData.gstin, formData.pan, formData.state)); } catch (e) { setGstResult({ ok: false, message: e.message }); } finally { setGstBusy(false); }
  };
  const panValid = !formData.pan || formData.pan.length < 10 || /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(formData.pan);
  const statusCls = (ok) => `p-2.5 text-xs rounded-lg border flex items-start gap-1.5 font-semibold mt-1.5 ${ok ? 'bg-emerald-50 text-emerald-800 border-emerald-100' : 'bg-red-50 text-red-700 border-red-100'}`;

  const toggleSection = (stepNum) => {
    setActiveStep(activeStep === stepNum ? null : stepNum);
  };

  return (
    <div className="p-0 sm:p-4 max-w-5xl mx-auto animate-fade-in pb-16">
      
      <div className="mb-10">
        <h2 className="text-3xl font-extrabold text-slate-900 leading-tight tracking-tight">Legal & Financials</h2>
        <p className="text-lg text-slate-500 mt-2">Set up your payouts, tax registrations, and statutory compliance documentation.</p>
      </div>

      {isProtected && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-xl mb-6 flex items-center gap-3">
          <AlertCircle size={20} className="text-red-500" />
          <p className="text-sm font-medium">Certain financial and compliance fields are locked. Please contact support to modify them.</p>
        </div>
      )}
      {/* Commission & Fee Summary Card: text on top, the two figures below. (Side by side, the
          figures overflowed the editor's narrow column and "Payout cycle" was cut off.) */}
      <div className="bg-gradient-to-br from-blue-900 to-indigo-900 rounded-3xl p-6 sm:p-8 text-white shadow-xl mb-10 flex flex-col gap-6 relative overflow-hidden">
        {/* Abstract background shapes */}
        <div className="absolute top-0 right-0 -mr-20 -mt-20 w-64 h-64 rounded-full bg-blue-500/20 blur-3xl pointer-events-none"></div>
        <div className="absolute bottom-0 left-0 -ml-20 -mb-20 w-48 h-48 rounded-full bg-indigo-500/30 blur-2xl pointer-events-none"></div>

        <div className="relative z-10">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/20 border border-blue-400/30 text-blue-200 text-xs font-black uppercase tracking-widest mb-4">
            <Landmark size={12} /> Standard Partnership
          </div>
          <h3 className="text-2xl font-extrabold mb-2">Platform Fee Structure</h3>
          <p className="text-blue-200 text-sm leading-relaxed max-w-prose">
            We operate on a performance-based model. You only pay when a guest successfully books and completes their stay. There are no hidden setup or subscription fees.
          </p>
        </div>

        <div className="relative z-10 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="text-center bg-white/10 border border-white/10 rounded-2xl p-4 min-w-0">
            <p className="text-xs text-blue-200 font-bold uppercase tracking-widest mb-1">Platform Commission</p>
            <div className="flex items-baseline justify-center gap-1">
              {commissionSet ? (<><span className="text-4xl font-black">{formData.commission}</span>
              <span className="text-xl font-bold text-blue-300">%</span></>) : <span className="text-lg font-bold">{isAdmin ? 'Not set yet' : 'Set by ZivoPlus'}</span>}
            </div>
            <p className="text-xs text-blue-300 mt-1">{commissionSet ? 'of the room price before GST, per completed booking' : isAdmin ? 'Enter it under Commission & payout below' : 'You will see it in your agreement before you sign'}</p>
          </div>
          <div className="text-center bg-white/10 border border-white/10 rounded-2xl p-4 min-w-0">
            <p className="text-xs text-blue-200 font-bold uppercase tracking-widest mb-1">Payout Cycle</p>
            <div className="flex items-baseline justify-center gap-1">
              <span className="text-4xl font-black break-words">{formData.payoutCycle || 'T+2'}</span>
            </div>
            <p className="text-xs text-blue-300 mt-1">{payoutCycleNote(formData.payoutCycle)}</p>
          </div>
        </div>
      </div>

      <div className="relative pl-14">
        {/* Stepper Vertical Connector Line */}
        <div className="absolute left-6 top-8 bottom-8 w-[2px] bg-gray-200 z-0"></div>

        <div className="space-y-6">

          {/* ────── STEP 1: BANK ACCOUNT INFORMATION ────── */}
          <div className="relative flex gap-6 z-10 items-start">
            <button
              type="button"
              onClick={() => toggleSection(1)}
              className={`absolute -left-14 w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm border-2 shrink-0 transition-all ${
                activeStep === 1
                  ? 'bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-100 scale-105'
                  : formData.accountNumber && formData.ifscCode
                    ? 'bg-emerald-500 border-emerald-500 text-white'
                    : 'bg-white border-slate-300 text-slate-500 hover:border-slate-400'
              }`}
            >
              {formData.accountNumber && formData.ifscCode && activeStep !== 1 ? <Check size={16} /> : "1"}
            </button>

            <div className="w-full">
              {activeStep === 1 ? (
                // EXPANDED STATE
                <div className="bg-white border border-slate-200 rounded-2xl shadow-xl shadow-slate-100/50 overflow-hidden transition-all duration-300">
                  <div className="p-6 border-b border-slate-100 bg-slate-50/50">
                    <h3 className="text-lg font-black text-slate-900">Bank Account Information</h3>
                    <p className="text-xs text-slate-500 mt-1">Please provide your bank details to receive payouts without delay</p>
                  </div>

                  <div className="p-6 space-y-5">
                    
                    {/* Account Number */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
                      <label className="text-xs font-black text-slate-700 uppercase tracking-wider md:col-span-1">
                        Bank Account Number <span className="text-red-500">*</span>
                      </label>
                      <div className="md:col-span-2">
                        <input disabled={isProtected}
                          type="text"
                          value={formData.accountNumber || ''}
                          onChange={e => updateForm('accountNumber', e.target.value.replace(/\D/g, ''))}
                          placeholder="1234567890123456"
                          className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm text-slate-900 bg-white font-mono"
                        />
                      </div>
                    </div>

                    {/* Re-Enter Account Number */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
                      <label className="text-xs font-black text-slate-700 uppercase tracking-wider md:col-span-1">
                        Re-Enter Bank Account Number <span className="text-red-500">*</span>
                      </label>
                      <div className="md:col-span-2">
                        <input disabled={isProtected}
                          type="text"
                          value={reAccountNumber}
                          onChange={e => setReAccountNumber(e.target.value.replace(/\D/g, ''))}
                          placeholder="1234567890123456"
                          className={`w-full px-4 py-3 border rounded-xl focus:ring-2 outline-none text-sm text-slate-900 bg-white font-mono ${
                            reAccountNumber && reAccountNumber !== formData.accountNumber
                              ? 'border-red-300 focus:ring-red-200'
                              : 'border-slate-200 focus:ring-blue-500'
                          }`}
                        />
                        {reAccountNumber && reAccountNumber !== formData.accountNumber && (
                          <p className="text-xs text-red-600 mt-1 font-semibold flex items-center gap-1">
                            <AlertCircle size={12} /> Account numbers do not match
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Bank IFSC Code */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
                      <div className="md:col-span-1">
                        <label className="text-xs font-black text-slate-700 uppercase tracking-wider block">
                          Bank IFSC Code <span className="text-red-500">*</span>
                        </label>
                        <span className="text-xs text-slate-400 font-medium block mt-1 leading-relaxed">
                          You can find this on your cheque book or bank statement
                        </span>
                      </div>
                      <div className="md:col-span-2 space-y-2">
                        <div className="flex gap-2">
                          <input disabled={isProtected}
                            type="text"
                            value={formData.ifscCode || ''}
                            onChange={e => {
                              updateForm('ifscCode', e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''));
                              setIfscResult(null);
                            }}
                            placeholder="HDFC0001234"
                            maxLength={11}
                            className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm text-slate-900 bg-white font-mono uppercase"
                          />
                          <button
                            type="button"
                            disabled={isProtected || ifscBusy || !formData.ifscCode || formData.ifscCode.length < 11}
                            onClick={handleVerifyIFSC}
                            className="px-5 py-3 bg-blue-50 hover:bg-blue-100 text-blue-700 disabled:opacity-50 disabled:bg-slate-50 disabled:text-slate-400 font-bold text-xs rounded-xl transition-all border border-blue-200/50 flex items-center gap-1.5 whitespace-nowrap"
                          >
                            {ifscBusy ? <Loader2 size={12} className="animate-spin" /> : 'Look up'}
                          </button>
                        </div>
                        {ifscResult && (
                          <div role="status" className={statusCls(ifscResult.ok)}>
                            {ifscResult.ok ? <CheckCircle2 size={14} className="text-emerald-600 shrink-0" /> : <AlertCircle size={14} className="shrink-0" />}
                            <span>{ifscResult.ok && ifscResult.source === 'directory' ? `${ifscResult.bank}, ${ifscResult.branch}${ifscResult.city ? `, ${ifscResult.city}` : ''}` : ifscResult.message}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Bank Name */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
                      <label className="text-xs font-black text-slate-700 uppercase tracking-wider md:col-span-1">
                        Bank Name <span className="text-red-500">*</span>
                      </label>
                      <div className="md:col-span-2">
                        <input disabled={isProtected} list="bank-names"
                          value={formData.bankName || ''}
                          onChange={e => updateForm('bankName', e.target.value)}
                          placeholder="Filled in from the IFSC, or type it"
                          className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm text-slate-900 bg-white"
                        />
                        <datalist id="bank-names">{MAJOR_BANKS.map((bank) => <option key={bank} value={bank} />)}</datalist>
                      </div>
                    </div>

                    {/* Branch Name */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
                      <label className="text-xs font-black text-slate-700 uppercase tracking-wider md:col-span-1">
                        Branch Name <span className="text-red-500">*</span>
                      </label>
                      <div className="md:col-span-2">
                        <input disabled={isProtected}
                          type="text"
                          value={formData.branchName || ''}
                          onChange={e => updateForm('branchName', e.target.value)}
                          placeholder="e.g. Connaught Place, New Delhi"
                          className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm text-slate-900 bg-white"
                        />
                      </div>
                    </div>

                    {/* Account holder: payouts go to the business's own account */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
                      <span className="text-xs font-black text-slate-700 uppercase tracking-wider md:col-span-1">Account holder</span>
                      <p className="md:col-span-2 text-sm text-slate-800">{formData.legalName || <span className="text-slate-400">The legal entity name from the next section</span>}</p>
                    </div>

                    {/* Check the account */}
                    <div className="pt-4 border-t border-slate-100 space-y-3">
                      <label className="flex items-start gap-3 cursor-pointer group">
                        <input disabled={isProtected}
                          type="checkbox"
                          checked={formData.verificationConsent === true}
                          onChange={e => updateForm('verificationConsent', e.target.checked)}
                          className="w-4.5 h-4.5 text-blue-600 border-slate-300 rounded focus:ring-blue-500 mt-0.5"
                        />
                        <span className="text-xs font-bold text-slate-800 leading-relaxed">
                          I agree that ZivoPlus may check this account, including by sending ₹1 to it.
                        </span>
                      </label>
                      <div className="flex flex-wrap items-center gap-3">
                        <button type="button" onClick={handleVerifyAccount}
                          disabled={isProtected || accBusy || formData.verificationConsent !== true || !formData.accountNumber || !formData.ifscCode || !formData.legalName}
                          className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 font-bold text-xs rounded-xl inline-flex items-center gap-1.5">
                          {accBusy ? <Loader2 size={13} className="animate-spin" /> : <Landmark size={13} />} {account && account.status !== 'NONE' && !accountChanged ? 'Check again' : 'Verify account'}
                        </button>
                        {account && account.status !== 'NONE' && !accountChanged && ACCOUNT_STATUS[account.status] && (
                          <span className={`text-xs font-bold px-2.5 py-1 rounded-lg border ${ACCOUNT_STATUS[account.status][0]}`}>{account.accountEnding ? `Saved account ${account.accountEnding}: ` : ''}{ACCOUNT_STATUS[account.status][1]}</span>
                        )}
                        {accountChanged && <span className="text-xs font-bold text-amber-800">Details changed: verify again</span>}
                      </div>
                      {!formData.legalName && <p className="text-xs text-slate-500">Fill in the legal entity name (next section) first: the account must be in that name.</p>}
                      {account?.note && !accountChanged && <p className="text-xs text-slate-600">{account.note}</p>}
                      {accError && <p role="alert" className="text-xs text-red-700 font-semibold">{accError}</p>}
                    </div>

                  </div>
                </div>
              ) : (
                // COLLAPSED STATE
                <button
                  type="button"
                  onClick={() => toggleSection(1)}
                  className="w-full text-left bg-white border border-slate-100 hover:border-slate-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all flex items-center justify-between group animate-fade-in"
                >
                  <div>
                    <h3 className="font-bold text-slate-800 group-hover:text-slate-900 transition-colors">Bank Account Information</h3>
                    <p className="text-xs text-slate-400 mt-1 leading-relaxed">Please provide your bank details to receive payouts without delay</p>
                  </div>
                  <ChevronDown className="text-slate-400 group-hover:text-slate-600 transition-colors" size={18} />
                </button>
              )}
            </div>
          </div>

          {/* ────── STEP 2: TAX, MSME AND REGISTRATION ────── */}
          <div className="relative flex gap-6 z-10 items-start">
            <button
              type="button"
              onClick={() => toggleSection(2)}
              className={`absolute -left-14 w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm border-2 shrink-0 transition-all ${
                activeStep === 2
                  ? 'bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-100 scale-105'
                  : formData.legalName && formData.pan
                    ? 'bg-emerald-500 border-emerald-500 text-white'
                    : 'bg-white border-slate-300 text-slate-500 hover:border-slate-400'
              }`}
            >
              {formData.legalName && formData.pan && activeStep !== 2 ? <Check size={16} /> : "2"}
            </button>

            <div className="w-full">
              {activeStep === 2 ? (
                // EXPANDED STATE
                <div className="bg-white border border-slate-200 rounded-2xl shadow-xl shadow-slate-100/50 overflow-hidden transition-all duration-300">
                  <div className="p-6 border-b border-slate-100 bg-slate-50/50">
                    <h3 className="text-lg font-black text-slate-900">Tax, MSME and Registration Information</h3>
                    <p className="text-xs text-slate-500 mt-1">These tax details will be used for invoicing and statutory compliance</p>
                  </div>

                  <div className="p-6 space-y-5">

                    {/* PAN Number */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
                      <label className="text-xs font-black text-slate-700 uppercase tracking-wider md:col-span-1">
                        PAN Number <span className="text-red-500">*</span>
                      </label>
                      <div className="md:col-span-2">
                        <div className="flex gap-2">
                          <input disabled={isProtected}
                            type="text"
                            value={formData.pan || ''}
                            onChange={e => handlePanChange(e.target.value)}
                            placeholder="ABCDE1234F"
                            maxLength={10}
                            className={`flex-1 w-full px-4 py-3 border rounded-xl focus:ring-2 outline-none text-sm text-slate-900 bg-white font-mono uppercase ${
                              !panValid ? 'border-red-300 focus:ring-red-200' : 'border-slate-200 focus:ring-blue-500'
                            }`}
                          />
                          <button
                            type="button"
                            disabled={isProtected || panBusy || !formData.pan || formData.pan.length < 10}
                            onClick={handleVerifyPAN}
                            className="px-5 py-3 bg-blue-50 hover:bg-blue-100 text-blue-700 disabled:opacity-50 disabled:bg-slate-50 disabled:text-slate-400 font-bold text-xs rounded-xl transition-all border border-blue-200/50 flex items-center gap-1.5 whitespace-nowrap"
                          >
                            {panBusy ? <Loader2 size={12} className="animate-spin" /> : 'Check PAN'}
                          </button>
                        </div>
                        {!panValid && (
                          <p className="text-xs text-red-600 mt-1 font-semibold flex items-center gap-1">
                            <AlertCircle size={12} /> Please enter a valid 10-digit PAN format (e.g., ABCDE1234F)
                          </p>
                        )}
                        {panResult && (
                          <div role="status" className={statusCls(panResult.ok)}>
                            {panResult.ok ? <CheckCircle2 size={14} className="text-emerald-600 shrink-0" /> : <AlertCircle size={14} className="shrink-0" />}
                            <span>{panResult.message}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* GSTIN */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
                      <label className="text-xs font-black text-slate-700 uppercase tracking-wider md:col-span-1">
                        GSTIN (Optional)
                      </label>
                      <div className="md:col-span-2">
                        <div className="flex gap-2">
                          <input disabled={isProtected}
                            type="text"
                            value={formData.gstin || ''}
                            onChange={e => {
                              updateForm('gstin', e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''));
                              setGstResult(null);
                            }}
                            placeholder="15 Digit GST Number"
                            maxLength={15}
                            className="flex-1 w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm text-slate-900 bg-white font-mono uppercase"
                          />
                          <button
                            type="button"
                            disabled={isProtected || gstBusy || !formData.gstin || formData.gstin.length < 15}
                            onClick={handleVerifyGST}
                            className="px-5 py-3 bg-blue-50 hover:bg-blue-100 text-blue-700 disabled:opacity-50 disabled:bg-slate-50 disabled:text-slate-400 font-bold text-xs rounded-xl transition-all border border-blue-200/50 flex items-center gap-1.5 whitespace-nowrap"
                          >
                            {gstBusy ? <Loader2 size={12} className="animate-spin" /> : 'Check GSTIN'}
                          </button>
                        </div>
                        {gstResult && (
                          <div role="status" className={statusCls(gstResult.ok)}>
                            {gstResult.ok ? <CheckCircle2 size={14} className="text-emerald-600 shrink-0" /> : <AlertCircle size={14} className="shrink-0" />}
                            <span>{gstResult.message}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Legal Entity Name (Either verified or manually edited) */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
                      <label className="text-xs font-black text-slate-700 uppercase tracking-wider md:col-span-1">
                        Legal Entity Name <span className="text-red-500">*</span>
                      </label>
                      <div className="md:col-span-2">
                        <input disabled={isProtected}
                          type="text"
                          value={formData.legalName || ''}
                          onChange={e => updateForm('legalName', e.target.value)}
                          placeholder="e.g. Sunrise Hotels Pvt Ltd"
                          className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm text-slate-900 bg-white"
                        />
                        <p className="text-xs text-slate-400 mt-1">Exactly as on the PAN card or GST certificate. The agreement and payouts use this name.</p>
                      </div>
                    </div>

                    {/* MSME Number */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
                      <label className="text-xs font-black text-slate-700 uppercase tracking-wider md:col-span-1">
                        MSME Number (Optional)
                      </label>
                      <div className="md:col-span-2">
                        <input disabled={isProtected}
                          type="text"
                          value={formData.msme || ''}
                          onChange={e => updateForm('msme', e.target.value.toUpperCase())}
                          placeholder="UDYAM-XX-00-1234567"
                          className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm text-slate-900 bg-white font-mono uppercase"
                        />
                      </div>
                    </div>

                    {/* Incorporation Type */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
                      <label className="text-xs font-black text-slate-700 uppercase tracking-wider md:col-span-1">
                        Incorporation Type
                      </label>
                      <div className="md:col-span-2">
                        <select disabled={isProtected}
                          value={formData.incorporationType || 'INDIVIDUAL'}
                          onChange={e => updateForm('incorporationType', e.target.value)}
                          className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm text-slate-900 bg-white"
                        >
                          {INCORPORATION_TYPES.map(type => (
                            <option key={type.value} value={type.value}>{type.label}</option>
                          ))}
                        </select>
                      </div>
                    </div>



                  </div>
                </div>
              ) : (
                // COLLAPSED STATE
                <button
                  type="button"
                  onClick={() => toggleSection(2)}
                  className="w-full text-left bg-white border border-slate-100 hover:border-slate-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all flex items-center justify-between group animate-fade-in"
                >
                  <div>
                    <h3 className="font-bold text-slate-800 group-hover:text-slate-900 transition-colors">Tax, MSME and Registration Information</h3>
                    <p className="text-xs text-slate-400 mt-1 leading-relaxed">These tax details will be used for invoicing and statutory compliance</p>
                  </div>
                  <ChevronDown className="text-slate-400 group-hover:text-slate-600 transition-colors" size={18} />
                </button>
              )}
            </div>
          </div>

          {/* ────── STEP 3: PROPERTY DOCUMENTS ────── */}
          <div className="relative flex gap-6 z-10 items-start">
            <button
              type="button"
              onClick={() => toggleSection(3)}
              className={`absolute -left-14 w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm border-2 shrink-0 transition-all ${
                activeStep === 3
                  ? 'bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-100 scale-105'
                  : 'bg-white border-slate-300 text-slate-500 hover:border-slate-400'
              }`}
            >
              3
            </button>

            <div className="w-full">
              {activeStep === 3 ? (
                // EXPANDED STATE
                <div className="bg-white border border-slate-200 rounded-2xl shadow-xl shadow-slate-100/50 overflow-hidden transition-all duration-300">
                  <div className="p-6 border-b border-slate-100 bg-slate-50/50">
                    <h3 className="text-lg font-black text-slate-900">Property Documents</h3>
                    <p className="text-xs text-slate-500 mt-1">Uploaded in the next step</p>
                  </div>

                  <div className="p-6 space-y-4">
                    {/* Documents are uploaded for real in the next step (Documents). This section used
                        to show upload boxes that only stored the file name in the browser, so owners
                        thought they had uploaded their KYC when nothing had been sent. */}
                    <div className="p-4 bg-blue-50 rounded-xl border border-blue-100 flex items-start gap-2.5">
                      <FileCheck size={16} className="text-blue-600 mt-0.5 shrink-0" />
                      <p className="text-xs text-blue-900 leading-relaxed font-medium">
                        You&apos;ll upload your documents in the next step: your <strong>PAN card</strong> and a{' '}
                        <strong>cancelled cheque</strong> (plus your <strong>GST certificate</strong> if you have a GSTIN)
                        are required. Ownership/lease proof, trade licence and fire NOC are optional.
                      </p>
                    </div>

                    <div className="p-4 bg-amber-50/40 rounded-xl border border-amber-100/50 flex items-start gap-2.5 mt-4">
                      <HelpCircle size={16} className="text-amber-700 mt-0.5 shrink-0" />
                      <p className="text-xs text-amber-900/80 leading-relaxed font-medium">
                        Verification of financial information and uploaded documents typically completes within 12-24 working hours. Once verified, your payout status is activated.
                      </p>
                    </div>

                  </div>
                </div>
              ) : (
                // COLLAPSED STATE
                <button
                  type="button"
                  onClick={() => toggleSection(3)}
                  className="w-full text-left bg-white border border-slate-100 hover:border-slate-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all flex items-center justify-between group animate-fade-in"
                >
                  <div>
                    <h3 className="font-bold text-slate-800 group-hover:text-slate-900 transition-colors">Property Documents</h3>
                    <p className="text-xs text-slate-400 mt-1 leading-relaxed">Uploaded in the next step</p>
                  </div>
                  <ChevronDown className="text-slate-400 group-hover:text-slate-600 transition-colors" size={18} />
                </button>
              )}
            </div>
          </div>

        </div>
      </div>

      {/* ────── STEP 4: PLATFORM COMMISSION & PAYOUT ────── */}
      <div className="relative pl-14 mt-6">
      <div className="relative flex gap-6 z-10 items-start">
        <button
          type="button"
          onClick={() => toggleSection(4)}
          className={`absolute -left-14 w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm border-2 shrink-0 transition-all ${
            activeStep === 4
              ? 'bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-100 scale-105'
              : commissionSet && formData.payoutCycle
                ? 'bg-emerald-500 border-emerald-500 text-white'
                : 'bg-white border-slate-300 text-slate-500 hover:border-slate-400'
          }`}
        >
          {commissionSet && formData.payoutCycle && activeStep !== 4 ? <Check size={16} /> : "4"}
        </button>

        <div className="w-full">
          {activeStep === 4 ? (
            // EXPANDED STATE
            <div className="bg-white border border-slate-200 rounded-2xl shadow-xl shadow-slate-100/50 overflow-hidden transition-all duration-300">
              <div className="p-6 border-b border-slate-100 bg-slate-50/50">
                <h3 className="text-lg font-black text-slate-900">Platform Commission & Payout</h3>
                <p className="text-xs text-slate-500 mt-1">Configure your commission rate and payout frequency</p>
              </div>

              <div className="p-6 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  
                  {/* Platform Commission */}
                  <div>
                    <label className="text-xs font-black text-slate-700 uppercase tracking-wider block mb-2">
                      Platform Commission (%) {isAdmin && <span className="text-red-500">*</span>}
                    </label>
                    <div className="relative">
                      <input disabled={commissionLocked}
                        type="number"
                        min="0"
                        max="100"
                        step="0.5"
                        value={formData.commission ?? ''}
                        onChange={e => updateForm('commission', e.target.value === '' ? '' : parseFloat(e.target.value))}
                        placeholder={commissionLocked ? 'Set by ZivoPlus' : 'e.g. 12'}
                        className="w-full px-4 py-3 pr-10 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm text-slate-900 font-bold bg-white"
                      />
                      <span className="absolute right-4 top-3 text-slate-400 font-bold text-sm">%</span>
                    </div>
                    <p className="text-xs text-slate-400 mt-1">{commissionLocked ? 'Agreed with ZivoPlus. It appears in your agreement before you sign.' : 'Agreed with the owner. Required: there is no default rate. It goes into the agreement the owner signs.'}</p>
                  </div>

                  {/* Payout Cycle */}
                  <div>
                    <label className="text-xs font-black text-slate-700 uppercase tracking-wider block mb-2">
                      Payout Cycle <span className="text-red-500">*</span>
                    </label>
                    <select disabled={isProtected}
                      value={formData.payoutCycle || 'T+2'}
                      onChange={e => updateForm('payoutCycle', e.target.value)}
                      className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm text-slate-900 bg-white"
                    >
                      <option value="T+2">2 days after check-out (T+2)</option>
                      <option value="Weekly">Weekly (Every Wednesday)</option>
                      <option value="15 days">15 days (1st & 16th)</option>
                      <option value="Monthly">Monthly (First week)</option>
                    </select>
                    <p className="text-xs text-slate-400 mt-1">Frequency of earnings remittance to your account</p>
                  </div>

                </div>
              </div>
            </div>
          ) : (
            // COLLAPSED STATE
            <button
              type="button"
              onClick={() => toggleSection(4)}
              className="w-full text-left bg-white border border-slate-100 hover:border-slate-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all flex items-center justify-between group animate-fade-in"
            >
              <div>
                <h3 className="font-bold text-slate-800 group-hover:text-slate-900 transition-colors">Platform Commission & Payout</h3>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">Configure your commission rate and payout frequency</p>
              </div>
              <ChevronDown className="text-slate-400 group-hover:text-slate-600 transition-colors" size={18} />
            </button>
          )}
        </div>
      </div>

      </div>

      {/* Terms & Conditions Checkbox at the bottom of the page */}
      <div className="mt-8 pt-6 border-t border-slate-200 animate-fade-in">
        <label className="flex items-start gap-3 cursor-pointer group">
          <input disabled={isProtected}
            type="checkbox"
            checked={formData.acceptTerms === true}
            onChange={e => updateForm('acceptTerms', e.target.checked)}
            className="w-5 h-5 text-blue-600 border-slate-300 rounded focus:ring-blue-500 mt-0.5 cursor-pointer"
          />
          <span className="text-xs font-bold text-slate-700 group-hover:text-slate-900 transition-colors leading-relaxed">
            I accept the ZivoPlus Platform Agreement, Terms of Service, and Payout Policies. I confirm that all banking, tax registrations, and corporate documents provided are authentic and legally binding.
          </span>
        </label>
      </div>

    </div>
  );
};

export default FinanceStep;
