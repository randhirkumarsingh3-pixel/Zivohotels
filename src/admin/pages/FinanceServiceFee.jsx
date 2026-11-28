import { useEffect, useState } from 'react';
import { Loader2, Save, ReceiptIndianRupee } from 'lucide-react';
import { adminFinanceApi } from '../../services/api';
import usePageTitle from '../../hooks/usePageTitle';
import useAccess from '../../hooks/useAccess';

/**
 * Admin → Finance → Service fee: ZivoPlus's own fee on guests' bookings. Off by default. Shown
 * wherever guests see a price to pay, charged with the online payment, kept apart from the hotel's
 * figures and settlement, and on ZivoPlus's facilitator tax invoice with its GST.
 */
const input = 'mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm disabled:bg-gray-50';
const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

const example = (s, total) => {
  if (!s.value) return 0;
  let fee = s.type === 'FLAT' ? Number(s.value) : (total * Number(s.value)) / 100;
  if (s.type === 'PERCENT' && s.maxAmount) fee = Math.min(fee, Number(s.maxAmount));
  return Math.round(fee);
};

const FinanceServiceFee = () => {
  usePageTitle('Service fee');
  const { can } = useAccess();
  const canEdit = can('finance.manage');
  const [s, setS] = useState(null);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { adminFinanceApi.serviceFee().then(setS).catch((e) => setMsg({ ok: false, text: e.message })); }, []);
  if (!s) return <p className="p-6 text-sm text-gray-500 flex items-center gap-2">{msg ? msg.text : <><Loader2 size={15} className="animate-spin" /> Loading…</>}</p>;
  const set = (k, v) => setS((x) => ({ ...x, [k]: v }));
  const save = async (next = s, text = 'Saved.') => {
    setBusy(true); setMsg(null);
    try { setS(await adminFinanceApi.saveServiceFee(next)); setMsg({ ok: true, text }); } catch (e) { setMsg({ ok: false, text: e.message }); } finally { setBusy(false); }
  };
  const fee = example(s, 5000);
  const tax = fee ? Math.round((fee - fee / (1 + s.gstPct / 100)) * 100) / 100 : 0;

  return (
    <div className="p-6 max-w-3xl space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2"><ReceiptIndianRupee size={20} aria-hidden="true" /> Service fee</h1>
        <p className="text-sm text-gray-600 mt-1">ZivoPlus&apos;s own fee on guests&apos; bookings. It is never part of the hotel&apos;s amount, commission or settlement.</p>
      </div>

      <section className={`rounded-2xl p-5 border ${s.enabled ? 'bg-green-50 border-green-200' : 'bg-white border-gray-200'}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-bold text-gray-900">The service fee is {s.enabled ? 'on' : 'off'}</h2>
            <p className="text-sm text-gray-700 mt-1">{s.enabled ? 'Guests see it with every price to pay and pay it online with their booking.' : 'Guests pay no service fee. Set it up below and turn it on when you decide to charge one.'}</p>
          </div>
          {canEdit && (s.enabled
            ? <button type="button" disabled={busy} onClick={() => save({ ...s, enabled: false }, 'The service fee is off. New bookings have no fee.')} className="px-4 py-2 rounded-lg text-sm font-bold border border-gray-300 bg-white">Turn off</button>
            : <button type="button" disabled={busy || !(Number(s.value) > 0)} onClick={() => save({ ...s, enabled: true }, 'The service fee is on for new bookings.')} className="px-4 py-2 rounded-lg text-sm font-bold bg-brand-600 text-white disabled:opacity-50">Turn on</button>)}
        </div>
      </section>

      <section className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4">
        <h2 className="font-bold text-gray-900">The fee</h2>
        <fieldset className="flex flex-wrap gap-4 text-sm" disabled={!canEdit}>
          <legend className="sr-only">Kind of fee</legend>
          <label className="flex items-center gap-2"><input type="radio" name="fee-type" checked={s.type === 'PERCENT'} onChange={() => set('type', 'PERCENT')} /> A percentage of the stay</label>
          <label className="flex items-center gap-2"><input type="radio" name="fee-type" checked={s.type === 'FLAT'} onChange={() => set('type', 'FLAT')} /> A fixed amount per booking</label>
        </fieldset>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="text-sm font-semibold text-gray-800">{s.type === 'PERCENT' ? 'Percentage' : 'Amount (₹)'}
            <input type="number" min="0" step={s.type === 'PERCENT' ? '0.1' : '1'} className={input} disabled={!canEdit} value={s.value} onChange={(e) => set('value', e.target.value)} />
            <span className="block mt-1 text-xs font-normal text-gray-500">Including GST.</span>
          </label>
          {s.type === 'PERCENT' && (
            <label className="text-sm font-semibold text-gray-800">At most (₹, optional)
              <input type="number" min="0" className={input} disabled={!canEdit} value={s.maxAmount ?? ''} onChange={(e) => set('maxAmount', e.target.value === '' ? null : e.target.value)} />
            </label>
          )}
          <label className="text-sm font-semibold text-gray-800">GST on the fee
            <select className={input} disabled={!canEdit} value={s.gstPct} onChange={(e) => set('gstPct', Number(e.target.value))}>
              {[18, 12, 5, 0, 28].map((r) => <option key={r} value={r}>{r}%{r === 18 ? ' (reservation services)' : ''}</option>)}
            </select>
          </label>
        </div>
        <label className="flex items-start gap-2 text-sm text-gray-800">
          <input type="checkbox" className="mt-1" disabled={!canEdit} checked={Boolean(s.refundOnGuestCancel)} onChange={(e) => set('refundOnGuestCancel', e.target.checked)} />
          <span><span className="font-semibold">Refund it when the guest cancels</span><span className="block text-xs text-gray-600">It is always refunded when the hotel or ZivoPlus cancels. Shown to guests before they cancel.</span></span>
        </label>
        <p className="text-sm text-gray-700 bg-gray-50 rounded-lg p-3">Example: on a ₹5,000 stay the fee is <b>{inr(fee)}</b> (taxable value {inr(Math.round((fee - tax) * 100) / 100)}, GST {inr(tax)}), so the guest pays <b>{inr(5000 + fee)}</b>.</p>
        {canEdit && <button type="button" disabled={busy} onClick={() => save()} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold border border-gray-300 bg-white">{busy ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Save</button>}
        {msg && <p role={msg.ok ? 'status' : 'alert'} className={`text-sm px-3 py-2 rounded-lg ${msg.ok ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'}`}>{msg.text}</p>}
      </section>

      <section className="bg-white border border-gray-200 rounded-2xl p-5 text-sm text-gray-700 space-y-1.5">
        <h2 className="font-bold text-gray-900 mb-1">How it works</h2>
        <p>• Website bookings paid online (in full or the part-payment). Not on pay-at-hotel stays, business or travel-agent bookings, or hours added to a stay.</p>
        <p>• Shown before guests choose: a note in search results, a line in the hotel page price and at checkout, and in Google Hotels prices (as other fees).</p>
        <p>• On ZivoPlus&apos;s facilitator tax invoice (SAC 998552) with its GST, so it is offered only while the hotel issues the GST invoice for stays (Documents &amp; emails). A refund gets a credit note.</p>
        <p>• Bookings keep the fee they were quoted; changes apply to new bookings.</p>
      </section>
    </div>
  );
};

export default FinanceServiceFee;
