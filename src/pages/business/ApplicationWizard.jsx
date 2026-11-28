import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, CheckCircle2, Circle, Upload, Trash2, AlertCircle, FileText, ArrowLeft, ArrowRight, Landmark, ShieldCheck } from 'lucide-react';
import { businessApi } from '../../services/api';
import BusinessDetailsFields from '../../components/business/BusinessDetailsFields';
import BankFields from '../../components/business/BankFields';
import Steps from './ApplicationSteps';

/**
 * Applying for ZivoPlus for Business / ZivoPlus Partner Hub, after the account (step 1):
 *  2 Business details   the same fields as the admin "Add" form; saved as a draft
 *  3 Documents          a checklist for the business type (PAN, GST certificate, incorporation,
 *                       address proof, authorisation, accreditation); upload each one here
 *  4 Bank account       agents: required, for commission payouts; companies: optional (refunds of
 *                       unused balance); with a cancelled cheque
 *  5 Review and submit  everything at a glance, the declaration, submit
 * The draft is saved at every step, so it can be finished later (one reminder email after 2 days).
 */
const card = 'bg-white border border-gray-200 rounded-2xl p-5 md:p-8';
const btn = 'inline-flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50';
const DOC_STEP_KEYS = ['PAN_CARD', 'GST_CERTIFICATE', 'INCORPORATION', 'ADDRESS_PROOF', 'AUTHORISATION', 'ACCREDITATION'];
const DOC_HINTS = {
  PAN_CARD: 'The business PAN (for a proprietorship, the owner\'s PAN).',
  GST_CERTIFICATE: 'Form GST REG-06 from the GST portal.',
  INCORPORATION: 'Certificate of incorporation, LLP certificate, partnership deed or registration certificate.',
  ADDRESS_PROOF: 'Electricity or phone bill, or rent agreement, for the registered address (under 3 months old).',
  AUTHORISATION: 'A letter on letterhead from an owner, director or partner authorising you to apply.',
  ACCREDITATION: 'Your IATA / TAAI / TAFI / Ministry of Tourism certificate, if you have one.',
  CANCELLED_CHEQUE: 'A cancelled cheque or a bank letter showing the account holder, number and IFSC.',
};

const Note = ({ msg }) => (msg ? <p role={msg.ok ? 'status' : 'alert'} className={`text-sm px-3 py-2 rounded-lg ${msg.ok ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'}`}>{msg.text}</p> : null);

const fromOrg = (org, user) => ({
  name: org?.name || '', legalName: org?.legalName || '', incorporationType: org?.incorporationType || '', pan: org?.pan || '', gstin: org?.gstin || '',
  address: org?.address || '', city: org?.city || '', state: org?.state || '', pincode: org?.pincode || '', billingEmail: org?.billingEmail || user?.email || '',
  phone: org?.phone || user?.phone || '', website: org?.website || '', contactName: org?.contactName || user?.name || '', contactDesignation: org?.contactDesignation || '',
  isSignatory: org ? org.isSignatory !== false : true, accreditation: org?.accreditation || { body: '', number: '' }, businessProfile: org?.businessProfile || {}, gstDeclaration: Boolean(org?.gstDeclaration),
});

/** One document row: status, files uploaded, upload / remove. */
const DocRow = ({ org, item, onChanged }) => {
  const ref = useRef(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const files = (org.documents || []).filter((d) => d.type === item.key);
  const upload = (file) => {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { setErr('The file is larger than 10 MB.'); return; }
    setBusy(true); setErr('');
    const reader = new FileReader();
    reader.onload = async () => {
      try { await businessApi.addDocument(org.id, { type: item.key, fileName: file.name, file: reader.result }); await onChanged(); } catch (e) { setErr(e.message); } finally { setBusy(false); if (ref.current) ref.current.value = ''; }
    };
    reader.readAsDataURL(file);
  };
  const remove = async (id) => { setBusy(true); try { await businessApi.removeDocument(org.id, id); await onChanged(); } catch (e) { setErr(e.message); } finally { setBusy(false); } };
  return (
    <li className="py-4 flex flex-col sm:flex-row sm:items-start gap-3">
      <span className="mt-0.5">{item.done ? <CheckCircle2 size={20} className="text-green-600" aria-label="Done" /> : <Circle size={20} className={item.required ? 'text-gray-300' : 'text-gray-200'} aria-label="Not yet" />}</span>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-gray-900">{item.label} {!item.required && <span className="text-xs font-normal text-gray-500">(optional)</span>}</p>
        <p className="text-xs text-gray-500">{DOC_HINTS[item.key]}</p>
        {item.note && <p className="text-xs text-red-700 mt-1">{item.note}{files.find((f) => f.review?.note) ? `: ${files.find((f) => f.review?.note).review.note}` : ''}</p>}
        {files.length > 0 && (
          <ul className="mt-2 space-y-1">
            {files.map((f) => (
              <li key={f.id} className="flex items-center gap-2 text-sm text-gray-700">
                <FileText size={14} className="text-navy-700 shrink-0" aria-hidden="true" /><span className="truncate">{f.name}</span>
                {f.review?.status === 'VERIFIED' && <span className="text-xs text-green-700 font-semibold">Checked</span>}
                {f.review?.status === 'REJECTED' && <span className="text-xs text-red-700 font-semibold">Not acceptable</span>}
                {f.review?.status !== 'VERIFIED' && <button type="button" disabled={busy} onClick={() => remove(f.id)} aria-label={`Remove ${f.name}`} className="p-1 text-gray-400 hover:text-red-700"><Trash2 size={14} /></button>}
              </li>
            ))}
          </ul>
        )}
        {err && <p role="alert" className="text-xs text-red-700 mt-1">{err}</p>}
      </div>
      <div>
        <input ref={ref} type="file" accept="application/pdf,image/jpeg,image/png" className="sr-only" id={`doc-${item.key}`} onChange={(e) => upload(e.target.files?.[0])} />
        <label htmlFor={`doc-${item.key}`} className={`${btn} border border-gray-300 bg-white text-gray-800 cursor-pointer ${busy ? 'opacity-50 pointer-events-none' : 'hover:border-navy-500'}`}>
          {busy ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />} {files.length ? 'Add another' : 'Upload'}
        </label>
      </div>
    </li>
  );
};

const ApplicationWizard = ({ kind, info, user, orgId, onSubmitted, onCreated }) => {
  const agent = kind === 'AGENCY';
  const requireGstin = agent ? info?.agency?.requireGstin : info?.corporate?.requireGstin;
  const [org, setOrg] = useState(null);
  const [step, setStep] = useState(orgId ? 3 : 2);
  const [f, setF] = useState(fromOrg(null, user));
  const [bank, setBank] = useState({ accountType: 'CURRENT' });
  const [declared, setDeclared] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const top = useRef(null);

  const load = useCallback(async () => {
    if (!orgId) return null;
    const o = await businessApi.get(orgId);
    setOrg(o);
    return o;
  }, [orgId]);
  useEffect(() => { load().then((o) => { if (o) { setF(fromOrg(o, user)); if (o.bank) setBank((b) => ({ ...b, holderName: o.bank.holderName, ifsc: o.bank.ifsc, accountType: o.bank.accountType })); } }).catch((e) => setMsg({ ok: false, text: e.message })); }, [load, user]);
  const go = (n) => { setStep(n); setMsg(null); top.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));

  const saveDetails = async (e) => {
    e.preventDefault(); setBusy(true); setMsg(null);
    try {
      if (org) { await businessApi.update(org.id, f); await load(); go(3); } else {
        const o = await businessApi.apply({ ...f, kind, draft: true });
        onCreated?.(o);
      }
    } catch (err) { setMsg({ ok: false, text: err.message }); } finally { setBusy(false); }
  };
  const saveBank = async (e) => {
    e.preventDefault(); setBusy(true); setMsg(null);
    try {
      const r = await businessApi.setBank(org.id, bank);
      setOrg(r.organisation);
      setBank((b) => ({ ...b, accountNumber: '', confirmAccountNumber: '' }));
      setMsg({ ok: true, text: r.status === 'VERIFIED' ? 'Bank account verified.' : r.message || 'Bank account saved. ZivoPlus checks it against your cancelled cheque during review.' });
    } catch (err) { setMsg({ ok: false, text: err.message }); } finally { setBusy(false); }
  };
  const submit = async () => {
    setBusy(true); setMsg(null);
    try { await businessApi.submit(org.id, { declaration: declared }); onSubmitted?.(); } catch (err) { setMsg({ ok: false, text: err.message }); } finally { setBusy(false); }
  };

  if (orgId && !org) return <div className={card}><p className="text-sm text-gray-500 flex items-center gap-2"><Loader2 size={16} className="animate-spin" /> Loading your application…</p>{msg && <Note msg={msg} />}</div>;
  const checklist = org?.checklist || [];
  const docItems = checklist.filter((i) => DOC_STEP_KEYS.includes(i.key));
  const chequeItem = checklist.find((i) => i.key === 'CANCELLED_CHEQUE') || { key: 'CANCELLED_CHEQUE', label: 'Cancelled cheque or bank letter for that account', required: agent, done: false };
  const missing = org?.missing || [];

  return (
    <div className="space-y-5" ref={top}>
      <Steps current={step} onGo={org ? go : null} />

      {step === 2 && (
        <form onSubmit={saveDetails} className={`${card} space-y-6`} aria-labelledby="ap-2">
          <div>
            <h2 id="ap-2" className="text-xl font-bold text-gray-900">Step 2 of 5: business details</h2>
            <p className="text-sm text-gray-600 mt-1">Use the legal details on your PAN and GST certificate. Your application is saved as you go; you can finish it later.</p>
          </div>
          <BusinessDetailsFields kind={kind} f={f} set={set} requireGstin={requireGstin} />
          <Note msg={msg} />
          <div className="flex justify-end">
            <button type="submit" disabled={busy} className={`${btn} bg-brand-600 hover:bg-brand-700 text-white`}>{busy ? <Loader2 size={15} className="animate-spin" /> : null} Save and continue <ArrowRight size={15} /></button>
          </div>
        </form>
      )}

      {step === 3 && org && (
        <section className={`${card} space-y-4`} aria-labelledby="ap-3">
          <div>
            <h2 id="ap-3" className="text-xl font-bold text-gray-900">Step 3 of 5: documents</h2>
            <p className="text-sm text-gray-600 mt-1">PDF, JPG or PNG, up to 10 MB each. They are stored privately and only ZivoPlus reviewers can see them.</p>
          </div>
          <ul className="divide-y divide-gray-100">{docItems.map((i) => <DocRow key={i.key} org={org} item={i} onChanged={load} />)}</ul>
          {checklist.some((i) => i.key === 'GST_DECLARATION' && !i.done) && <p className="text-sm text-amber-900 bg-amber-50 rounded-lg px-3 py-2">No GSTIN: tick the &ldquo;not registered under GST&rdquo; declaration in <button type="button" onClick={() => go(2)} className="font-semibold underline">business details</button>.</p>}
          <Note msg={msg} />
          <div className="flex justify-between gap-2">
            <button type="button" onClick={() => go(2)} className={`${btn} border border-gray-300 bg-white`}><ArrowLeft size={15} /> Back</button>
            <button type="button" onClick={() => go(4)} className={`${btn} bg-brand-600 hover:bg-brand-700 text-white`}>Continue <ArrowRight size={15} /></button>
          </div>
        </section>
      )}

      {step === 4 && org && (
        <section className={`${card} space-y-5`} aria-labelledby="ap-4">
          <div>
            <h2 id="ap-4" className="text-xl font-bold text-gray-900 flex items-center gap-2"><Landmark size={20} className="text-navy-700" aria-hidden="true" /> Step 4 of 5: bank account {!agent && <span className="text-sm font-normal text-gray-500">(optional)</span>}</h2>
            <p className="text-sm text-gray-600 mt-1">{agent ? 'Your commission is paid to this account. It must be in the agency\'s own name.' : 'Only used to refund an unused prepaid balance. You can add it later.'} Account details are stored encrypted.</p>
          </div>
          {org.bank && (
            <p className={`text-sm rounded-lg px-3 py-2 ${org.bank.status === 'VERIFIED' ? 'bg-green-50 text-green-800' : org.bank.status === 'REJECTED' ? 'bg-red-50 text-red-700' : 'bg-gray-50 text-gray-700'}`}>
              Saved: {org.bank.bankName || 'Bank'} ····{org.bank.last4} ({org.bank.ifsc}), {org.bank.holderName}. {org.bank.status === 'VERIFIED' ? 'Verified.' : org.bank.status === 'REJECTED' ? `Not acceptable: ${org.bank.note || 'enter it again'}.` : org.bank.status === 'NAME_MISMATCH' ? org.bank.note : 'ZivoPlus checks it during review.'} Enter it again below to change it.
            </p>
          )}
          <form onSubmit={saveBank} className="space-y-4">
            <BankFields b={bank} set={(k, v) => setBank((x) => ({ ...x, [k]: v }))} lookup={businessApi.ifsc} />
            <button type="submit" disabled={busy || !bank.accountNumber || bank.accountNumber !== bank.confirmAccountNumber} className={`${btn} bg-navy-800 text-white`}>{busy && <Loader2 size={15} className="animate-spin" />} {org.bank ? 'Save the new account' : 'Save bank account'}</button>
          </form>
          {(org.bank || agent) && <ul className="border-t border-gray-100"><DocRow org={org} item={chequeItem} onChanged={load} /></ul>}
          <Note msg={msg} />
          <div className="flex justify-between gap-2">
            <button type="button" onClick={() => go(3)} className={`${btn} border border-gray-300 bg-white`}><ArrowLeft size={15} /> Back</button>
            <button type="button" onClick={() => go(5)} className={`${btn} bg-brand-600 hover:bg-brand-700 text-white`}>{!agent && !org.bank ? 'Skip for now' : 'Continue'} <ArrowRight size={15} /></button>
          </div>
        </section>
      )}

      {step === 5 && org && (
        <section className={`${card} space-y-5`} aria-labelledby="ap-5">
          <h2 id="ap-5" className="text-xl font-bold text-gray-900">Step 5 of 5: review and submit</h2>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
            {[['Name', org.name], ['Legal name', org.legalName], ['PAN', org.pan], ['GSTIN', org.gstin || (org.gstDeclaration ? 'Not registered (declared)' : '—')], ['Address', `${org.address}, ${org.city}, ${org.state} ${org.pincode}`], ['Contact', `${org.contactName || '—'}${org.contactDesignation ? `, ${org.contactDesignation}` : ''}`], ['Invoices to', org.billingEmail], ['Phone', org.phone],
              agent && ['Accreditation', org.accreditation ? `${org.accreditation.body} ${org.accreditation.number}` : 'None'],
              ['Bank account', org.bank ? `${org.bank.bankName || ''} ····${org.bank.last4} (${org.bank.ifsc})` : 'Not added']].filter(Boolean).map(([k, v]) => <div key={k} className="contents"><dt className="text-gray-500">{k}</dt><dd className="text-gray-900 break-words">{v}</dd></div>)}
          </dl>
          <div>
            <p className="text-sm font-semibold text-gray-900 mb-2">Checklist</p>
            <ul className="space-y-1.5">
              {checklist.map((i) => (
                <li key={i.key} className="flex items-start gap-2 text-sm">
                  {i.done ? <CheckCircle2 size={17} className="text-green-600 shrink-0" aria-label="Done" /> : i.required ? <AlertCircle size={17} className="text-red-600 shrink-0" aria-label="Missing" /> : <Circle size={17} className="text-gray-300 shrink-0" aria-label="Optional" />}
                  <span className={i.done ? 'text-gray-800' : i.required ? 'text-red-800' : 'text-gray-500'}>{i.label}{!i.required && !i.done ? ' (optional)' : ''}{i.note ? `: ${i.note}` : ''}</span>
                </li>
              ))}
            </ul>
          </div>
          <label className="flex items-start gap-2.5 text-sm text-gray-800 rounded-lg bg-gray-50 p-3">
            <input type="checkbox" className="mt-0.5" checked={declared} onChange={(e) => setDeclared(e.target.checked)} />
            <span><ShieldCheck size={15} className="inline text-navy-700 mr-1 -mt-0.5" aria-hidden="true" />I confirm these details and documents are true and belong to this business, and that I may apply on its behalf. I agree to the ZivoPlus terms for {agent ? 'travel agents' : 'business accounts'}.</span>
          </label>
          <Note msg={msg} />
          <div className="flex flex-wrap justify-between gap-2">
            <button type="button" onClick={() => go(4)} className={`${btn} border border-gray-300 bg-white`}><ArrowLeft size={15} /> Back</button>
            <button type="button" disabled={busy || !declared || missing.length > 0} onClick={submit} className={`${btn} bg-brand-600 hover:bg-brand-700 text-white`}>{busy && <Loader2 size={15} className="animate-spin" />} Submit application</button>
          </div>
          {missing.length > 0 && <p className="text-xs text-gray-500 text-right">Add what&apos;s missing above to submit. Your application is saved.</p>}
        </section>
      )}
    </div>
  );
};

export default ApplicationWizard;
