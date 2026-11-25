import { useCallback, useEffect, useState } from 'react';
import { Briefcase, Handshake, Loader2, Save } from 'lucide-react';
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
    </div>
  );
};

export default ExtranetBusinessRates;
