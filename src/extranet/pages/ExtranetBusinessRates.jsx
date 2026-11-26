import { useCallback, useEffect, useState } from 'react';
import { Briefcase, Handshake, Loader2, Save, FileSignature, CheckCircle2, XCircle } from 'lucide-react';
import { hotelBusinessRatesApi } from '../../services/api';
import { useExtranet } from '../context/ExtranetContext';
import useAccess from '../../hooks/useAccess';

/**
 * Extranet → Business rates: whether companies (ZivoPlus for Business) and travel agents (Partner
 * Hub) can book this property at a business rate, and the discount for each. Business rates are
 * shown only to approved business accounts, never on the public website or Google. The property
 * funds the discount (ZivoPlus' commission is on the discounted price).
 */
const inr = (n) => `₹${Math.round(Number(n || 0)).toLocaleString('en-IN')}`;
const input = 'mt-1 w-28 px-3 py-2 border border-gray-300 rounded-lg text-base sm:text-sm disabled:bg-gray-50';

const day = (d) => new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
const STATE = { PROPOSED: ['bg-blue-50 text-blue-800', 'Waiting for you'], ACTIVE: ['bg-green-50 text-green-800', 'In place'], UPCOMING: ['bg-green-50 text-green-800', 'Starts later'], EXPIRED: ['bg-gray-100 text-gray-600', 'Ended'], DECLINED: ['bg-red-50 text-red-800', 'You declined'], ENDED: ['bg-gray-100 text-gray-600', 'Ended by ZivoPlus'] };

/** Rates ZivoPlus agreed with a company for this property: they apply once accepted here. */
const CompanyContracts = ({ hotelId, edit, addToast }) => {
  const [list, setList] = useState(null);
  const [note, setNote] = useState({});
  const [busy, setBusy] = useState('');
  const load = useCallback(() => hotelBusinessRatesApi.contracts(hotelId).then(setList).catch((e) => addToast(e.message, 'error')), [hotelId, addToast]);
  useEffect(() => { load(); }, [load]);
  if (!list || list.length === 0) return null;
  const decide = async (r, decision) => {
    setBusy(`${decision}-${r.id}`);
    try { await hotelBusinessRatesApi.decideContract(hotelId, r.id, decision, note[r.id]); addToast(decision === 'ACCEPT' ? `Accepted: ${r.organisation.name} gets this rate from ${day(r.validFrom)}` : 'Declined. ZivoPlus was told.', 'success'); await load(); } catch (e) { addToast(e.message, 'error'); } finally { setBusy(''); }
  };
  const waiting = list.filter((r) => r.status === 'PROPOSED').length;
  return (
    <section className="bg-white border border-gray-200 rounded-2xl p-5 space-y-3">
      <h2 className="font-bold text-gray-900 flex items-center gap-2"><FileSignature size={18} className="text-brand-700" aria-hidden="true" /> Company rates{waiting ? <span className="text-xs font-bold bg-blue-50 text-blue-800 px-2 py-0.5 rounded">{waiting} to answer</span> : null}</h2>
      <p className="text-sm text-gray-600">Rates ZivoPlus agreed with a company for your property. They apply to that company&apos;s bookings only after you accept them; the company gets them or your company discount above, whichever is lower for them.</p>
      <ul className="divide-y divide-gray-100">
        {list.map((r) => {
          const [c, l] = STATE[r.state] || STATE.ENDED;
          return (
            <li key={r.id} className="py-3 space-y-2">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div><p className="font-semibold text-gray-900">{r.organisation.name}</p><p className="text-sm text-gray-700">{r.label} · {day(r.validFrom)} to {day(r.validTo)}</p></div>
                <span className={`px-2 py-0.5 rounded-md text-xs font-semibold ${c}`}>{l}</span>
              </div>
              {r.notes && <p className="text-xs text-gray-600">From ZivoPlus: {r.notes}</p>}
              {r.decisionNote && r.status !== 'PROPOSED' && <p className="text-xs text-gray-500">Note: {r.decisionNote}</p>}
              {edit && r.status === 'PROPOSED' && (
                <div className="flex flex-wrap items-end gap-2">
                  <button type="button" disabled={!!busy} onClick={() => decide(r, 'ACCEPT')} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-green-700 text-white text-sm font-bold disabled:opacity-50">{busy === `ACCEPT-${r.id}` ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Accept</button>
                  <label className="text-xs font-semibold text-gray-700 flex-1 min-w-[10rem]">Reason, to decline<input className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-base sm:text-sm" value={note[r.id] || ''} onChange={(e) => setNote({ ...note, [r.id]: e.target.value })} /></label>
                  <button type="button" disabled={!!busy} onClick={() => decide(r, 'DECLINE')} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-300 text-red-700 text-sm font-bold disabled:opacity-50"><XCircle size={14} /> Decline</button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
};

const ExtranetBusinessRates = () => {
  const { hotelId, addToast } = useExtranet();
  const { access, canAtHotel } = useAccess();
  const edit = !access || canAtHotel(hotelId, 'rates.manage');
  const [r, setR] = useState(null);
  const [saving, setSaving] = useState(false);
  const load = useCallback(() => hotelBusinessRatesApi.get(hotelId).then(setR).catch((e) => addToast(e.message, 'error')), [hotelId, addToast]);
  useEffect(() => { if (hotelId) load(); }, [hotelId, load]);
  useEffect(() => { document.title = 'Business rates · ZivoPlus Extranet'; }, []);
  if (!r) return <div className="flex h-64 items-center justify-center"><Loader2 className="animate-spin text-brand-700" size={32} /></div>;
  const set = (k, v) => setR((x) => ({ ...x, [k]: v }));
  const save = async () => {
    setSaving(true);
    try { setR(await hotelBusinessRatesApi.save(hotelId, r)); addToast('Business rates saved', 'success'); } catch (e) { addToast(e.message, 'error'); } finally { setSaving(false); }
  };
  const ex = 5000;
  const agentNet = ex * (1 - Number(r.agentDiscountPct || 0) / 100);
  return (
    <div className="max-w-4xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Business rates</h1>
        <p className="text-sm text-gray-600 mt-1">Get bookings from companies and travel agents. Only approved business accounts see these rates; your public price on ZivoPlus and Google doesn&apos;t change.</p>
      </div>

      <section className="bg-white border border-gray-200 rounded-2xl p-5 space-y-3">
        <h2 className="font-bold text-gray-900 flex items-center gap-2"><Briefcase size={18} className="text-brand-700" aria-hidden="true" /> Companies (ZivoPlus for Business)</h2>
        <label className="flex items-center gap-2 text-sm font-semibold text-gray-900"><input type="checkbox" disabled={!edit} checked={r.corporateEnabled} onChange={(e) => set('corporateEnabled', e.target.checked)} /> Accept company bookings</label>
        <label className="block text-sm font-semibold text-gray-800">Company discount %
          <input type="number" min="0" max="50" step="0.5" className={input} disabled={!edit || !r.corporateEnabled} value={r.corporateDiscountPct} onChange={(e) => set('corporateDiscountPct', e.target.value)} />
        </label>
        {r.corporateEnabled && <p className="text-xs text-gray-600">Example: a {inr(ex)} room is {inr(ex * (1 - Number(r.corporateDiscountPct || 0) / 100))} for companies (before GST). They get a GST invoice in their company&apos;s name.</p>}
        {!r.corporateOpen && <p className="text-xs text-amber-800">ZivoPlus for Business isn&apos;t open to companies yet; your rate applies once it is.</p>}
      </section>

      <section className="bg-white border border-gray-200 rounded-2xl p-5 space-y-3">
        <h2 className="font-bold text-gray-900 flex items-center gap-2"><Handshake size={18} className="text-brand-700" aria-hidden="true" /> Travel agents (ZivoPlus Partner Hub)</h2>
        <label className="flex items-center gap-2 text-sm font-semibold text-gray-900"><input type="checkbox" disabled={!edit} checked={r.agentEnabled} onChange={(e) => set('agentEnabled', e.target.checked)} /> Accept travel agent bookings</label>
        <label className="block text-sm font-semibold text-gray-800">Travel agent discount %
          <input type="number" min="1" max="50" step="0.5" className={input} disabled={!edit || !r.agentEnabled} value={r.agentDiscountPct} onChange={(e) => set('agentDiscountPct', e.target.value)} />
        </label>
        {r.agentEnabled && <p className="text-xs text-gray-600">Example on a {inr(ex)} room: an agent on net rates pays {inr(agentNet)}; an agent on commission pays {inr(ex)} and earns {inr(ex - agentNet)}. Either way you receive the same.</p>}
        {!r.agencyOpen && <p className="text-xs text-amber-800">Partner Hub isn&apos;t open to agents yet; your rate applies once it is.</p>}
      </section>

      {edit && <button type="button" onClick={save} disabled={saving} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-bold disabled:opacity-50">{saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Save</button>}
      <p className="text-xs text-gray-500">You fund these discounts: ZivoPlus&apos; commission is charged on the discounted price.</p>

      <CompanyContracts hotelId={hotelId} edit={edit} addToast={addToast} />
    </div>
  );
};

export default ExtranetBusinessRates;
