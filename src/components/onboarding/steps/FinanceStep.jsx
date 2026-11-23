import { useState, useEffect } from 'react';
import { useAuth } from '../../../context/AuthContext';
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

const FinanceStep = ({ formData, updateForm, isAdmin: isAdminProp }) => {
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
  // Commission is agreed with ZivoPlus and only an admin can change it
  const commissionLocked = !isAdmin;
  const [activeStep, setActiveStep] = useState(1);
  const [reAccountNumber, setReAccountNumber] = useState(formData.accountNumber || '');
  const [ifscVerifying, setIfscVerifying] = useState(false);
  const [ifscVerified, setIfscVerified] = useState(!!formData.ifscCode);
  const [detectedBranch, setDetectedBranch] = useState(formData.branchName || '');
  
  const [panVerifying, setPanVerifying] = useState(false);
  const [panVerified, setPanVerified] = useState(!!formData.pan && !!formData.legalName);
  const [panValid, setPanValid] = useState(true);

  const [gstVerifying, setGstVerifying] = useState(false);
  const [gstVerified, setGstVerified] = useState(!!formData.gstin);

  // Sync reAccountNumber if formData changes
  useEffect(() => {
    if (formData.accountNumber && !reAccountNumber) {
      setReAccountNumber(formData.accountNumber);
    }
  }, [formData.accountNumber]);

  // Set default commission rate if not specified (e.g. 15%)
  useEffect(() => {
    if (!formData.commission) {
      updateForm('commission', 15);
    }
  }, [formData.commission]);

  // Sync account holder name with legal entity name automatically for backend compliance
  useEffect(() => {
    if (formData.legalName && formData.accountName !== formData.legalName) {
      updateForm('accountName', formData.legalName);
    }
  }, [formData.legalName]);

  // MOCK IFSC Code Verification
  const handleVerifyIFSC = () => {
    const ifsc = formData.ifscCode?.trim().toUpperCase();
    if (!ifsc || ifsc.length < 11) {
      alert("Please enter a valid 11-character IFSC code first.");
      return;
    }

    setIfscVerifying(true);
    setTimeout(() => {
      setIfscVerifying(false);
      setIfscVerified(true);
      const bankCode = ifsc.substring(0, 4);
      let bankNameGuess = "Other";
      if (bankCode.startsWith("HDFC")) bankNameGuess = "HDFC Bank";
      else if (bankCode.startsWith("ICIC")) bankNameGuess = "ICICI Bank";
      else if (bankCode.startsWith("SBIN")) bankNameGuess = "State Bank of India (SBI)";
      else if (bankCode.startsWith("UTIB")) bankNameGuess = "Axis Bank";
      else if (bankCode.startsWith("KKBK")) bankNameGuess = "Kotak Mahindra Bank";
      else if (bankCode.startsWith("INDB")) bankNameGuess = "IndusInd Bank";
      else if (bankCode.startsWith("YESB")) bankNameGuess = "Yes Bank";
      else if (bankCode.startsWith("PUNB")) bankNameGuess = "Punjab National Bank";
      else if (bankCode.startsWith("BARB")) bankNameGuess = "Bank of Baroda";
      else if (bankCode.startsWith("CNRB")) bankNameGuess = "Canara Bank";
      else if (bankCode.startsWith("UBIN")) bankNameGuess = "Union Bank of India";
      else if (bankCode.startsWith("IDFB")) bankNameGuess = "IDFC First Bank";
      
      const branchName = "CONNAUGHT PLACE MAIN BRANCH, NEW DELHI";
      setDetectedBranch(branchName);
      
      updateForm({
        ifscCode: ifsc,
        bankName: bankNameGuess,
        branchName: branchName
      });
    }, 1000);
  };

  // PAN Validation and Mock Verification
  const handlePanChange = (val) => {
    const cleaned = val.toUpperCase().replace(/[^A-Z0-9]/g, '');
    updateForm('pan', cleaned);
    setPanVerified(false);
    
    // PAN Regex: 5 letters, 4 numbers, 1 letter
    if (cleaned.length === 10) {
      const isValid = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(cleaned);
      setPanValid(isValid);
    } else {
      setPanValid(cleaned.length === 0);
    }
  };

  const handleVerifyPAN = () => {
    const pan = formData.pan?.trim().toUpperCase();
    if (!pan || pan.length < 10) {
      alert("Please enter a valid 10-character PAN number first.");
      return;
    }

    setPanVerifying(true);
    setTimeout(() => {
      setPanVerifying(false);
      setPanVerified(true);
      
      // Auto-populate Legal Entity Name (pushed from verification details)
      const mockName = "ZIVO LODGING & SUITES PRIVATE LIMITED";
      updateForm({
        pan: pan,
        legalName: mockName,
        ...(formData.accountName ? {} : { accountName: mockName })
      });
    }, 1000);
  };

  // GST Mock Verification
  const handleVerifyGST = () => {
    const gstin = formData.gstin?.trim().toUpperCase();
    if (!gstin || gstin.length < 15) {
      alert("Please enter a valid 15-character GSTIN first.");
      return;
    }

    setGstVerifying(true);
    setTimeout(() => {
      setGstVerifying(false);
      setGstVerified(true);
      
      // Auto-populate Legal Entity Name (pushed from verification details)
      const mockName = "SUNRISE HOTELS & RESORTS PRIVATE LIMITED";
      updateForm({
        gstin: gstin,
        legalName: mockName,
        accountName: mockName // Sync payout holder name
      });
    }, 1000);
  };

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
              <span className="text-4xl font-black">{formData.commission !== undefined && formData.commission !== '' ? formData.commission : 15}</span>
              <span className="text-xl font-bold text-blue-300">%</span>
            </div>
            <p className="text-xs text-blue-300 mt-1">per completed booking</p>
          </div>
          <div className="text-center bg-white/10 border border-white/10 rounded-2xl p-4 min-w-0">
            <p className="text-xs text-blue-200 font-bold uppercase tracking-widest mb-1">Payout Cycle</p>
            <div className="flex items-baseline justify-center gap-1">
              <span className="text-4xl font-black break-words">{formData.payoutCycle || 'Weekly'}</span>
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
                        Bank Account Number <span className="text-red-550 text-red-500">*</span>
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
                        Re-Enter Bank Account Number <span className="text-red-550 text-red-500">*</span>
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
                          Bank IFSC Code <span className="text-red-550 text-red-500">*</span>
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
                              updateForm('ifscCode', e.target.value.toUpperCase());
                              setIfscVerified(false);
                            }}
                            placeholder="HDFC0001234"
                            maxLength={11}
                            className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm text-slate-900 bg-white font-mono uppercase"
                          />
                          <button
                            type="button"
                            disabled={isProtected || ifscVerifying || !formData.ifscCode || formData.ifscCode.length < 11}
                            onClick={handleVerifyIFSC}
                            className="px-5 py-3 bg-blue-50 hover:bg-blue-100 text-blue-700 disabled:opacity-50 disabled:bg-slate-50 disabled:text-slate-400 font-bold text-xs rounded-xl transition-all border border-blue-200/50 flex items-center gap-1.5 whitespace-nowrap"
                          >
                            {ifscVerifying ? <Loader2 size={12} className="animate-spin" /> : 'Verify'}
                          </button>
                        </div>
                        {ifscVerified && (
                          <div className="p-2.5 bg-emerald-50 text-emerald-800 text-xs rounded-lg border border-emerald-100 flex items-center gap-1.5 font-bold">
                            <CheckCircle2 size={14} className="text-emerald-600 shrink-0" />
                            IFSC Verified: {formData.bankName} - {detectedBranch || 'Main Branch'}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Bank Name */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
                      <label className="text-xs font-black text-slate-700 uppercase tracking-wider md:col-span-1">
                        Bank Name <span className="text-red-550 text-red-500">*</span>
                      </label>
                      <div className="md:col-span-2">
                        <select disabled={isProtected}
                          value={formData.bankName || ''}
                          onChange={e => updateForm('bankName', e.target.value)}
                          className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm text-slate-900 bg-white"
                        >
                          <option value="">Select your bank from the list</option>
                          {MAJOR_BANKS.map(bank => (
                            <option key={bank} value={bank}>{bank}</option>
                          ))}
                          <option value="Other">Other Bank</option>
                        </select>
                      </div>
                    </div>

                    {/* Branch Name */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
                      <label className="text-xs font-black text-slate-700 uppercase tracking-wider md:col-span-1">
                        Branch Name <span className="text-red-550 text-red-500">*</span>
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

                    {/* Account Holder Verification Consent */}
                    <div className="pt-3 border-t border-slate-100">
                      <label className="flex items-start gap-3 cursor-pointer group">
                        <input disabled={isProtected}
                          type="checkbox"
                          checked={formData.verificationConsent === true}
                          onChange={e => updateForm('verificationConsent', e.target.checked)}
                          className="w-4.5 h-4.5 text-blue-600 border-slate-300 rounded focus:ring-blue-500 mt-0.5"
                        />
                        <span className="text-xs font-bold text-slate-800 group-hover:text-slate-950 transition-colors leading-relaxed">
                          I consent to third-party bank account verification, ₹1 will be deposited in given bank account.
                        </span>
                      </label>
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
                        PAN Number <span className="text-red-550 text-red-500">*</span>
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
                            disabled={isProtected || panVerifying || !formData.pan || formData.pan.length < 10}
                            onClick={handleVerifyPAN}
                            className="px-5 py-3 bg-blue-50 hover:bg-blue-100 text-blue-700 disabled:opacity-50 disabled:bg-slate-50 disabled:text-slate-400 font-bold text-xs rounded-xl transition-all border border-blue-200/50 flex items-center gap-1.5 whitespace-nowrap"
                          >
                            {panVerifying ? <Loader2 size={12} className="animate-spin" /> : 'Verify PAN'}
                          </button>
                        </div>
                        {!panValid && (
                          <p className="text-xs text-red-600 mt-1 font-semibold flex items-center gap-1">
                            <AlertCircle size={12} /> Please enter a valid 10-digit PAN format (e.g., ABCDE1234F)
                          </p>
                        )}
                        {panVerified && (
                          <div className="p-2 bg-emerald-50 text-emerald-800 text-xs rounded-lg border border-emerald-100 flex items-center gap-1 mt-1.5 font-bold">
                            <CheckCircle2 size={12} className="text-emerald-600 shrink-0" /> PAN Verified & Legal Name Synchronized!
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
                              updateForm('gstin', e.target.value.toUpperCase());
                              setGstVerified(false);
                            }}
                            placeholder="15 Digit GST Number"
                            maxLength={15}
                            className="flex-1 w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm text-slate-900 bg-white font-mono uppercase"
                          />
                          <button
                            type="button"
                            disabled={isProtected || gstVerifying || !formData.gstin || formData.gstin.length < 15}
                            onClick={handleVerifyGST}
                            className="px-5 py-3 bg-blue-50 hover:bg-blue-100 text-blue-700 disabled:opacity-50 disabled:bg-slate-50 disabled:text-slate-400 font-bold text-xs rounded-xl transition-all border border-blue-200/50 flex items-center gap-1.5 whitespace-nowrap"
                          >
                            {gstVerifying ? <Loader2 size={12} className="animate-spin" /> : 'Verify GST'}
                          </button>
                        </div>
                        {gstVerified && (
                          <div className="p-2 bg-emerald-50 text-emerald-800 text-xs rounded-lg border border-emerald-100 flex items-center gap-1 mt-1.5 font-bold">
                            <CheckCircle2 size={12} className="text-emerald-600 shrink-0" /> GST Verified & Legal Name Synchronized!
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Legal Entity Name (Either verified or manually edited) */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
                      <label className="text-xs font-black text-slate-700 uppercase tracking-wider md:col-span-1">
                        Legal Entity Name <span className="text-red-550 text-red-500">*</span>
                      </label>
                      <div className="md:col-span-2">
                        <input disabled={isProtected}
                          type="text"
                          value={formData.legalName || ''}
                          onChange={e => updateForm('legalName', e.target.value)}
                          placeholder="e.g. Sunrise Hotels Pvt Ltd"
                          className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm text-slate-900 bg-white"
                        />
                        <p className="text-xs text-slate-400 mt-1">Automatically pushes from verified PAN/GST or you can manually enter/edit it.</p>
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
      <div className="relative flex gap-6 z-10 items-start mt-6">
        <button
          type="button"
          onClick={() => toggleSection(4)}
          className={`absolute -left-14 w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm border-2 shrink-0 transition-all ${
            activeStep === 4
              ? 'bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-100 scale-105'
              : formData.commission !== undefined && formData.payoutCycle
                ? 'bg-emerald-500 border-emerald-500 text-white'
                : 'bg-white border-slate-300 text-slate-500 hover:border-slate-400'
          }`}
        >
          {formData.commission !== undefined && formData.payoutCycle && activeStep !== 4 ? <Check size={16} /> : "4"}
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
                      Platform Commission (%) <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <input disabled={commissionLocked}
                        type="number"
                        min="0"
                        max="100"
                        value={formData.commission !== undefined ? formData.commission : 15}
                        onChange={e => updateForm('commission', parseFloat(e.target.value) || 0)}
                        placeholder="15"
                        className="w-full px-4 py-3 pr-10 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm text-slate-900 font-bold bg-white"
                      />
                      <span className="absolute right-4 top-3 text-slate-400 font-bold text-sm">%</span>
                    </div>
                    <p className="text-xs text-slate-400 mt-1">Standard platform fee applied per booking</p>
                  </div>

                  {/* Payout Cycle */}
                  <div>
                    <label className="text-xs font-black text-slate-700 uppercase tracking-wider block mb-2">
                      Payout Cycle <span className="text-red-500">*</span>
                    </label>
                    <select disabled={isProtected}
                      value={formData.payoutCycle || 'Weekly'}
                      onChange={e => updateForm('payoutCycle', e.target.value)}
                      className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm text-slate-900 bg-white"
                    >
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
