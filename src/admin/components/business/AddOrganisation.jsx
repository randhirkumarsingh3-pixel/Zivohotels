import { useState } from 'react';
import { Loader2, X, Briefcase, Handshake } from 'lucide-react';
import { adminBusinessApi, businessApi } from '../../../services/api';
import BusinessDetailsFields from '../../../components/business/BusinessDetailsFields';
import BankFields from '../../../components/business/BankFields';

/**
 * "Add a company / travel agent" for them (Admin → Business & Partners), with the same details as
 * the public application: its admin is invited by email to set a password.
 */
const input = 'mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm disabled:bg-gray-50';
const btn = 'inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold disabled:opacity-50';


/** The legal, tax and contact fields (add form and profile edit). */
/** Add a company or travel agent for them; its admin is invited by email. */
const AddOrganisation = ({ kind: fixedKind, onClose, onCreated }) => {
  const [f, setF] = useState({ kind: fixedKind || 'CORPORATE', incorporationType: 'PVT_LTD', approve: false, isSignatory: true, accreditation: { body: '', number: '' }, businessProfile: {} });
  const [addBank, setAddBank] = useState(false);
  const [bank, setBank] = useState({ accountType: 'CURRENT' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const save = async (e) => {
    e.preventDefault(); setBusy(true); setErr('');
    try { const o = await adminBusinessApi.create({ ...f, bank: addBank ? bank : null }); onCreated(o); } catch (x) { setErr(x.message); } finally { setBusy(false); }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto" role="dialog" aria-modal="true" aria-labelledby="add-org-h">
      <button type="button" aria-label="Close" className="fixed inset-0 bg-navy-950/40" onClick={onClose} />
      <form onSubmit={save} className="relative w-full max-w-3xl bg-white rounded-2xl shadow-2xl p-6 space-y-5 my-8">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="add-org-h" className="text-xl font-bold text-gray-900">Add {f.kind === 'AGENCY' ? 'a travel agent' : 'a company'}</h2>
            <p className="text-sm text-gray-600 mt-1">Set up the account for them. The person who runs it gets an email to set a password and sign in.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="p-2 rounded-lg hover:bg-gray-100"><X size={18} /></button>
        </div>
        {!fixedKind && (
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Kind">
            {[['CORPORATE', 'Company', 'ZivoPlus for Business', Briefcase], ['AGENCY', 'Travel agent', 'ZivoPlus Partner Hub', Handshake]].map(([k, l, sub, I]) => (
              <button key={k} type="button" role="radio" aria-checked={f.kind === k} onClick={() => set('kind', k)} className={`text-left rounded-xl border-2 p-3 ${f.kind === k ? 'border-navy-700 bg-navy-50' : 'border-gray-200'}`}>
                <span className="flex items-center gap-2 font-semibold text-gray-900"><I size={16} aria-hidden="true" />{l}</span><span className="text-xs text-gray-500">{sub}</span>
              </button>
            ))}
          </div>
        )}
        <BusinessDetailsFields kind={f.kind} f={f} set={set} />
        <div className="rounded-xl border border-gray-200 p-4 space-y-3">
          <label className="flex items-start gap-2 text-sm font-semibold text-gray-900"><input type="checkbox" className="mt-1" checked={addBank} onChange={(e) => setAddBank(e.target.checked)} /><span>Add their bank account now <span className="block text-xs font-normal text-gray-500">{f.kind === 'AGENCY' ? 'Needed for commission payouts; they can also add it themselves.' : 'Optional: only used to refund an unused balance.'} Stored encrypted. Upload the cancelled cheque from the Documents tab afterwards.</span></span></label>
          {addBank && <BankFields b={bank} set={(k, v) => setBank((x) => ({ ...x, [k]: v }))} lookup={(code) => businessApi.ifsc(code)} />}
        </div>
        <div className="rounded-xl bg-gray-50 p-4 grid gap-3 sm:grid-cols-2">
          <p className="sm:col-span-2 text-sm font-semibold text-gray-900">Who runs the account</p>
          <label className="text-xs font-semibold text-gray-700">Name<input className={input} value={f.adminName || ''} onChange={(e) => set('adminName', e.target.value)} /></label>
          <label className="text-xs font-semibold text-gray-700">Email<input type="email" required className={input} value={f.adminEmail || ''} onChange={(e) => set('adminEmail', e.target.value)} /></label>
          <label className="sm:col-span-2 flex items-start gap-2 text-sm text-gray-800"><input type="checkbox" className="mt-1" checked={f.approve} onChange={(e) => set('approve', e.target.checked)} /><span>Approve now <span className="block text-xs text-gray-500">The account is active at once and its agreement is sent to sign. Leave unticked to check their documents first.</span></span></label>
        </div>
        {err && <p role="alert" className="text-sm px-3 py-2 rounded-lg bg-red-50 text-red-700">{err}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className={`${btn} border border-gray-300 bg-white`}>Cancel</button>
          <button type="submit" disabled={busy} className={`${btn} bg-navy-800 text-white`}>{busy && <Loader2 size={14} className="animate-spin" />} Add and invite</button>
        </div>
      </form>
    </div>
  );
};

export default AddOrganisation;
