import React, { useState, useEffect } from 'react';
import { 
  Landmark, FileText, CheckCircle2, AlertCircle, UploadCloud, 
  Trash2, FileCheck, Building, HelpCircle, ChevronDown, Check
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

const FinanceStep = ({ formData, updateForm }) => {
  const [activeStep, setActiveStep] = useState(1);
  const [reAccountNumber, setReAccountNumber] = useState(formData.accountNumber || '');
  const [ifscVerifying, setIfscVerifying] = useState(false);
  const [ifscVerified, setIfscVerified] = useState(!!formData.ifscCode);
  const [detectedBranch, setDetectedBranch] = useState(formData.branchName || '');
  const [panValid, setPanValid] = useState(true);

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

  // Handle syncing account holder name with legal entity name automatically
  useEffect(() => {
    if (formData.legalName && formData.accountName !== formData.legalName) {
      updateForm('accountName', formData.legalName);
    }
  }, [formData.legalName]);

  // MOCK IFSC Code Verification
  const handleVerifyIFSC = () => {
    const ifsc = formData.ifscCode?.trim().toUpperCase();
    if (!ifsc || ifsc.length < 11) return;

    setIfscVerifying(true);
    setTimeout(() => {
      setIfscVerifying(false);
      setIfscVerified(true);
      const bankCode = ifsc.substring(0, 4);
      let bankNameGuess = "Unknown Bank";
      if (bankCode.startsWith("HDFC")) bankNameGuess = "HDFC Bank";
      else if (bankCode.startsWith("ICIC")) bankNameGuess = "ICICI Bank";
      else if (bankCode.startsWith("SBIN")) bankNameGuess = "State Bank of India";
      else if (bankCode.startsWith("UTIB")) bankNameGuess = "Axis Bank";
      else if (bankCode.startsWith("KKBK")) bankNameGuess = "Kotak Mahindra Bank";
      else if (bankCode.startsWith("INDB")) bankNameGuess = "IndusInd Bank";
      
      const branchName = "MAIN METRO BRANCH, NEW DELHI";
      setDetectedBranch(branchName);
      
      updateForm({
        ifscCode: ifsc,
        bankName: bankNameGuess,
        branchName: branchName
      });
    }, 1000);
  };

  // PAN Validation Check
  const handlePanChange = (val) => {
    const cleaned = val.toUpperCase().replace(/[^A-Z0-9]/g, '');
    updateForm('pan', cleaned);
    
    // PAN Regex: 5 letters, 4 numbers, 1 letter
    if (cleaned.length === 10) {
      const isValid = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(cleaned);
      setPanValid(isValid);
    } else {
      setPanValid(cleaned.length === 0);
    }
  };

  // Mock Document Upload Handler
  const handleMockUpload = (docType, fileName) => {
    updateForm(`${docType}Name`, fileName);
    updateForm(`${docType}Url`, `/uploads/docs/${docType}_mock_file.pdf`);
  };

  const handleMockDelete = (docType) => {
    updateForm(`${docType}Name`, '');
    updateForm(`${docType}Url`, '');
  };

  const toggleSection = (stepNum) => {
    setActiveStep(activeStep === stepNum ? null : stepNum);
  };

  return (
    <div className="p-8 max-w-5xl mx-auto animate-fade-in pb-16">
      
      <div className="mb-8">
        <h2 className="text-3xl font-extrabold text-gray-900 leading-tight">Finance & Legal</h2>
        <p className="text-sm text-gray-500 mt-2">Set up your payouts, tax registrations, and statutory compliance documentation.</p>
      </div>

      <div className="relative pl-14">
        {/* Stepper Vertical Connector Line */}
        <div className="absolute left-6 top-8 bottom-8 w-[2px] bg-gray-200 z-0"></div>

        <div className="space-y-6">

          {/* ────── STEP 1: BANK ACCOUNT INFORMATION ────── */}
          <div className="relative flex gap-6 z-10 items-start">
            <button
              onClick={() => toggleSection(1)}
              className={`absolute -left-14 w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm border-2 shrink-0 transition-all ${
                activeStep === 1
                  ? 'bg-brand-600 border-brand-600 text-white shadow-lg shadow-brand-100 scale-105'
                  : formData.accountNumber && formData.ifscCode
                    ? 'bg-emerald-500 border-emerald-500 text-white'
                    : 'bg-white border-gray-300 text-gray-500 hover:border-gray-400'
              }`}
            >
              {formData.accountNumber && formData.ifscCode && activeStep !== 1 ? <Check size={16} /> : "1"}
            </button>

            <div className="w-full">
              {activeStep === 1 ? (
                // EXPANDED STATE
                <div className="bg-white border border-gray-200 rounded-2xl shadow-xl shadow-gray-100/50 overflow-hidden transition-all duration-300">
                  <div className="p-6 border-b border-gray-100 bg-gray-50/50">
                    <h3 className="text-lg font-black text-gray-900">Bank Account Information</h3>
                    <p className="text-xs text-gray-500 mt-1">Please provide your bank details to receive payouts without delay</p>
                  </div>

                  <div className="p-6 space-y-5">
                    
                    {/* Account Number */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
                      <label className="text-xs font-black text-gray-700 uppercase tracking-wider md:col-span-1">
                        Bank Account Number <span className="text-red-500">*</span>
                      </label>
                      <div className="md:col-span-2">
                        <input
                          type="text"
                          value={formData.accountNumber || ''}
                          onChange={e => updateForm('accountNumber', e.target.value.replace(/\D/g, ''))}
                          placeholder="1234567890123456"
                          className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none text-sm text-gray-900 bg-white font-mono"
                        />
                      </div>
                    </div>

                    {/* Re-Enter Account Number */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
                      <label className="text-xs font-black text-gray-700 uppercase tracking-wider md:col-span-1">
                        Re-Enter Bank Account Number <span className="text-red-500">*</span>
                      </label>
                      <div className="md:col-span-2">
                        <input
                          type="text"
                          value={reAccountNumber}
                          onChange={e => setReAccountNumber(e.target.value.replace(/\D/g, ''))}
                          placeholder="1234567890123456"
                          className={`w-full px-4 py-3 border rounded-xl focus:ring-2 outline-none text-sm text-gray-900 bg-white font-mono ${
                            reAccountNumber && reAccountNumber !== formData.accountNumber
                              ? 'border-red-300 focus:ring-red-200'
                              : 'border-gray-200 focus:ring-brand-500'
                          }`}
                        />
                        {reAccountNumber && reAccountNumber !== formData.accountNumber && (
                          <p className="text-[11px] text-red-600 mt-1 font-semibold flex items-center gap-1">
                            <AlertCircle size={12} /> Account numbers do not match
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Bank IFSC Code */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
                      <div className="md:col-span-1">
                        <label className="text-xs font-black text-gray-700 uppercase tracking-wider block">
                          Bank IFSC Code <span className="text-red-500">*</span>
                        </label>
                        <span className="text-[10px] text-gray-400 font-medium block mt-1 leading-relaxed">
                          You can find this on your cheque book or bank statement
                        </span>
                      </div>
                      <div className="md:col-span-2 space-y-2">
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={formData.ifscCode || ''}
                            onChange={e => {
                              updateForm('ifscCode', e.target.value.toUpperCase());
                              setIfscVerified(false);
                            }}
                            placeholder="HDFC0001234"
                            maxLength={11}
                            className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none text-sm text-gray-900 bg-white font-mono uppercase"
                          />
                          <button
                            type="button"
                            onClick={handleVerifyIFSC}
                            disabled={ifscVerifying || !formData.ifscCode || formData.ifscCode.length < 11}
                            className="px-5 py-3 bg-brand-50 hover:bg-brand-100 text-brand-700 disabled:opacity-50 disabled:bg-gray-50 disabled:text-gray-400 font-bold text-xs rounded-xl transition-all border border-brand-200/50 flex items-center gap-1.5 whitespace-nowrap"
                          >
                            {ifscVerifying ? 'Verifying...' : 'Verify'}
                          </button>
                        </div>
                        {ifscVerified && (
                          <div className="p-2.5 bg-emerald-50 text-emerald-800 text-[11px] rounded-lg border border-emerald-100 flex items-center gap-1.5 font-bold">
                            <CheckCircle2 size={14} className="text-emerald-600" />
                            IFSC Verified: {detectedBranch || 'Main Branch'}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Bank Name */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
                      <label className="text-xs font-black text-gray-700 uppercase tracking-wider md:col-span-1">
                        Bank Name <span className="text-red-500">*</span>
                      </label>
                      <div className="md:col-span-2">
                        <select
                          value={formData.bankName || ''}
                          onChange={e => updateForm('bankName', e.target.value)}
                          className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none text-sm text-gray-900 bg-white"
                        >
                          <option value="">Select your bank from the list</option>
                          {MAJOR_BANKS.map(bank => (
                            <option key={bank} value={bank}>{bank}</option>
                          ))}
                          <option value="Other">Other Bank</option>
                        </select>
                      </div>
                    </div>

                    {/* Account Holder Verification Consent */}
                    <div className="pt-3 border-t border-gray-100">
                      <label className="flex items-start gap-3 cursor-pointer group">
                        <input
                          type="checkbox"
                          checked={formData.verificationConsent === true}
                          onChange={e => updateForm('verificationConsent', e.target.checked)}
                          className="w-4.5 h-4.5 text-brand-600 border-gray-300 rounded focus:ring-brand-500 mt-0.5"
                        />
                        <span className="text-xs font-bold text-gray-800 group-hover:text-gray-950 transition-colors leading-relaxed">
                          I consent to third-party bank account verification, ₹1 will be deposited in given bank account.
                        </span>
                      </label>
                    </div>

                  </div>
                </div>
              ) : (
                // COLLAPSED STATE
                <button
                  onClick={() => toggleSection(1)}
                  className="w-full text-left bg-white border border-gray-100 hover:border-gray-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all flex items-center justify-between group"
                >
                  <div>
                    <h3 className="font-bold text-gray-800 group-hover:text-gray-900 transition-colors">Bank Account Information</h3>
                    <p className="text-xs text-gray-400 mt-1 leading-relaxed">Please provide your bank details to receive payouts without delay</p>
                  </div>
                  <ChevronDown className="text-gray-400 group-hover:text-gray-600 transition-colors" size={18} />
                </button>
              )}
            </div>
          </div>

          {/* ────── STEP 2: TAX, MSME AND REGISTRATION ────── */}
          <div className="relative flex gap-6 z-10 items-start">
            <button
              onClick={() => toggleSection(2)}
              className={`absolute -left-14 w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm border-2 shrink-0 transition-all ${
                activeStep === 2
                  ? 'bg-brand-600 border-brand-600 text-white shadow-lg shadow-brand-100 scale-105'
                  : formData.legalName && formData.pan
                    ? 'bg-emerald-500 border-emerald-500 text-white'
                    : 'bg-white border-gray-300 text-gray-500 hover:border-gray-400'
              }`}
            >
              {formData.legalName && formData.pan && activeStep !== 2 ? <Check size={16} /> : "2"}
            </button>

            <div className="w-full">
              {activeStep === 2 ? (
                // EXPANDED STATE
                <div className="bg-white border border-gray-200 rounded-2xl shadow-xl shadow-gray-100/50 overflow-hidden transition-all duration-300">
                  <div className="p-6 border-b border-gray-100 bg-gray-50/50">
                    <h3 className="text-lg font-black text-gray-900">Tax, MSME and Registration Information</h3>
                    <p className="text-xs text-gray-500 mt-1">These tax details will be used for invoicing and statutory compliance</p>
                  </div>

                  <div className="p-6 space-y-5">
                    
                    {/* Legal Entity Name */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
                      <label className="text-xs font-black text-gray-700 uppercase tracking-wider md:col-span-1">
                        Legal Entity Name <span className="text-red-500">*</span>
                      </label>
                      <div className="md:col-span-2">
                        <input
                          type="text"
                          value={formData.legalName || ''}
                          onChange={e => updateForm('legalName', e.target.value)}
                          placeholder="e.g. Zivo Hotels Pvt Ltd"
                          className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none text-sm text-gray-900 bg-white"
                        />
                        <p className="text-[10px] text-gray-400 mt-1">Must exactly match the name registered on your PAN card / GST certificate.</p>
                      </div>
                    </div>

                    {/* PAN Number */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
                      <label className="text-xs font-black text-gray-700 uppercase tracking-wider md:col-span-1">
                        PAN Number <span className="text-red-500">*</span>
                      </label>
                      <div className="md:col-span-2">
                        <input
                          type="text"
                          value={formData.pan || ''}
                          onChange={e => handlePanChange(e.target.value)}
                          placeholder="ABCDE1234F"
                          maxLength={10}
                          className={`w-full px-4 py-3 border rounded-xl focus:ring-2 outline-none text-sm text-gray-900 bg-white font-mono uppercase ${
                            !panValid ? 'border-red-300 focus:ring-red-200' : 'border-gray-200 focus:ring-brand-500'
                          }`}
                        />
                        {!panValid && (
                          <p className="text-[11px] text-red-600 mt-1 font-semibold flex items-center gap-1">
                            <AlertCircle size={12} /> Please enter a valid 10-digit PAN format (e.g., ABCDE1234F)
                          </p>
                        )}
                      </div>
                    </div>

                    {/* GSTIN */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
                      <label className="text-xs font-black text-gray-700 uppercase tracking-wider md:col-span-1">
                        GSTIN (Optional)
                      </label>
                      <div className="md:col-span-2">
                        <input
                          type="text"
                          value={formData.gstin || ''}
                          onChange={e => updateForm('gstin', e.target.value.toUpperCase())}
                          placeholder="15 Digit GST Number"
                          maxLength={15}
                          className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none text-sm text-gray-900 bg-white font-mono uppercase"
                        />
                      </div>
                    </div>

                    {/* MSME Number */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
                      <label className="text-xs font-black text-gray-700 uppercase tracking-wider md:col-span-1">
                        MSME Number (Optional)
                      </label>
                      <div className="md:col-span-2">
                        <input
                          type="text"
                          value={formData.msme || ''}
                          onChange={e => updateForm('msme', e.target.value.toUpperCase())}
                          placeholder="UDYAM-XX-00-1234567"
                          className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none text-sm text-gray-900 bg-white font-mono uppercase"
                        />
                      </div>
                    </div>

                    {/* Incorporation Type */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
                      <label className="text-xs font-black text-gray-700 uppercase tracking-wider md:col-span-1">
                        Incorporation Type
                      </label>
                      <div className="md:col-span-2">
                        <select
                          value={formData.incorporationType || 'INDIVIDUAL'}
                          onChange={e => updateForm('incorporationType', e.target.value)}
                          className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none text-sm text-gray-900 bg-white"
                        >
                          {INCORPORATION_TYPES.map(type => (
                            <option key={type.value} value={type.value}>{type.label}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Read-Only Commission Display for SaaS Transparency */}
                    <div className="mt-4 p-4 rounded-2xl bg-brand-50/50 border border-brand-100/50 flex items-start gap-3">
                      <Building className="text-brand-600 mt-0.5 shrink-0" size={16} />
                      <div className="text-xs">
                        <p className="font-black text-brand-950">Platform Commission & Terms</p>
                        <p className="text-gray-500 leading-relaxed mt-1">
                          As a premium SaaS partner, your current commission rate is configured at <strong className="text-brand-700">{formData.commission || 15}%</strong>. Commissions are auto-settled in real-time on prepaid checkout bookings.
                        </p>
                      </div>
                    </div>

                  </div>
                </div>
              ) : (
                // COLLAPSED STATE
                <button
                  type="button"
                  onClick={() => toggleSection(2)}
                  className="w-full text-left bg-white border border-gray-100 hover:border-gray-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all flex items-center justify-between group"
                >
                  <div>
                    <h3 className="font-bold text-gray-800 group-hover:text-gray-900 transition-colors">Tax, MSME and Registration Information</h3>
                    <p className="text-xs text-gray-400 mt-1 leading-relaxed">These tax details will be used for invoicing and statutory compliance</p>
                  </div>
                  <ChevronDown className="text-gray-400 group-hover:text-gray-600 transition-colors" size={18} />
                </button>
              )}
            </div>
          </div>

          {/* ────── STEP 3: PROPERTY DOCUMENTS ────── */}
          <div className="relative flex gap-6 z-10 items-start">
            <button
              onClick={() => toggleSection(3)}
              className={`absolute -left-14 w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm border-2 shrink-0 transition-all ${
                activeStep === 3
                  ? 'bg-brand-600 border-brand-600 text-white shadow-lg shadow-brand-100 scale-105'
                  : formData.panDocName && formData.bankProofDocName
                    ? 'bg-emerald-500 border-emerald-500 text-white'
                    : 'bg-white border-gray-300 text-gray-500 hover:border-gray-400'
              }`}
            >
              {formData.panDocName && formData.bankProofDocName && activeStep !== 3 ? <Check size={16} /> : "3"}
            </button>

            <div className="w-full">
              {activeStep === 3 ? (
                // EXPANDED STATE
                <div className="bg-white border border-gray-200 rounded-2xl shadow-xl shadow-gray-100/50 overflow-hidden transition-all duration-300">
                  <div className="p-6 border-b border-gray-100 bg-gray-50/50">
                    <h3 className="text-lg font-black text-gray-900">Property Documents</h3>
                    <p className="text-xs text-gray-500 mt-1">Provide necessary documents for verification and onboarding completion</p>
                  </div>

                  <div className="p-6 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      
                      {/* PAN Document Card */}
                      <DocumentUploadBox
                        label="PAN Card Copy"
                        docKey="panDoc"
                        fileName={formData.panDocName}
                        onUpload={handleMockUpload}
                        onDelete={handleMockDelete}
                        required={true}
                      />

                      {/* GST Registration Document Card */}
                      <DocumentUploadBox
                        label="GST Certificate"
                        docKey="gstDoc"
                        fileName={formData.gstDocName}
                        onUpload={handleMockUpload}
                        onDelete={handleMockDelete}
                      />

                      {/* Cancelled Cheque / Bank proof Document Card */}
                      <DocumentUploadBox
                        label="Bank Account Proof (Cheque/Passbook)"
                        docKey="bankProofDoc"
                        fileName={formData.bankProofDocName}
                        onUpload={handleMockUpload}
                        onDelete={handleMockDelete}
                        required={true}
                      />

                      {/* Trade License Card */}
                      <DocumentUploadBox
                        label="Trade License / Fire Safety Proof"
                        docKey="tradeLicenseDoc"
                        fileName={formData.tradeLicenseDocName}
                        onUpload={handleMockUpload}
                        onDelete={handleMockDelete}
                      />

                    </div>

                    <div className="p-4 bg-amber-50/40 rounded-xl border border-amber-100/50 flex items-start gap-2.5 mt-4">
                      <HelpCircle size={16} className="text-amber-600 mt-0.5 shrink-0" />
                      <p className="text-[11px] text-amber-900/80 leading-relaxed font-medium">
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
                  className="w-full text-left bg-white border border-gray-100 hover:border-gray-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all flex items-center justify-between group"
                >
                  <div>
                    <h3 className="font-bold text-gray-800 group-hover:text-gray-900 transition-colors">Property Documents</h3>
                    <p className="text-xs text-gray-400 mt-1 leading-relaxed">Provide necessary documents for verification and onboarding completion</p>
                  </div>
                  <ChevronDown className="text-gray-400 group-hover:text-gray-600 transition-colors" size={18} />
                </button>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};

// Document Upload Box Sub-Component
const DocumentUploadBox = ({ label, docKey, fileName, onUpload, onDelete, required = false }) => {
  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      onUpload(docKey, file.name);
    }
  };

  return (
    <div className="border border-gray-200 rounded-xl p-4 bg-gray-50/50 flex flex-col justify-between min-h-[140px] hover:border-gray-300 hover:bg-gray-50 transition-all">
      <div className="flex justify-between items-start">
        <div>
          <span className="text-[10px] text-gray-400 font-extrabold uppercase tracking-widest block">
            {required ? 'Required *' : 'Optional'}
          </span>
          <h4 className="text-xs font-bold text-gray-850 mt-0.5 leading-snug">{label}</h4>
        </div>
        {fileName && (
          <span className="bg-emerald-500/10 text-emerald-700 text-[9px] font-black uppercase px-2 py-0.5 rounded border border-emerald-500/20 flex items-center gap-1">
            <Check size={10} /> Loaded
          </span>
        )}
      </div>

      {fileName ? (
        <div className="mt-3 p-2.5 bg-white rounded-lg border border-gray-100 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-2 overflow-hidden mr-2">
            <FileCheck size={16} className="text-emerald-500 shrink-0" />
            <span className="text-[11px] font-bold text-gray-700 truncate">{fileName}</span>
          </div>
          <button
            type="button"
            onClick={() => onDelete(docKey)}
            className="p-1 hover:bg-rose-50 rounded text-rose-500 transition-colors shrink-0"
            title="Delete Document"
          >
            <Trash2 size={14} />
          </button>
        </div>
      ) : (
        <label className="mt-4 border-2 border-dashed border-gray-200 hover:border-brand-400 bg-white hover:bg-brand-50/10 rounded-xl py-3 flex flex-col items-center justify-center cursor-pointer transition-colors shadow-sm">
          <input
            type="file"
            accept="image/*,application/pdf"
            className="hidden"
            onChange={handleFileChange}
          />
          <UploadCloud size={18} className="text-gray-400 group-hover:text-brand-500" />
          <span className="text-[10px] font-bold text-gray-600 mt-1">Upload Document</span>
          <span className="text-[8px] text-gray-400 mt-0.5">PDF, PNG, JPG · Max 5MB</span>
        </label>
      )}
    </div>
  );
};

export default FinanceStep;
