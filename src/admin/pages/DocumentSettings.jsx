import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, FileText, Mail, Eye, Save, Building2, Receipt, Landmark } from 'lucide-react';
import { adminDocumentsApi } from '../../services/api';
import usePageTitle from '../../hooks/usePageTitle';
import useAccess from '../../hooks/useAccess';

/**
 * Admin → Documents & emails: who issues the guest's GST invoice, the invoice series and note,
 * the notes printed on guest and hotel vouchers, and whether booking emails carry the voucher
 * PDFs. Every document and email uses the same ZivoPlus look; previews are made from the latest
 * confirmed booking with the saved settings.
 */
const MODES = [
  { id: 'ON_BEHALF', Icon: Building2, title: 'ZivoPlus, on behalf of the hotel', text: 'Tax invoice with the hotel as supplier (its GSTIN and state), numbered and sent by ZivoPlus. Hotels invoice guests only for extras. Common for booking platforms.' },
  { id: 'ZIVO_SUPPLIER', Icon: Receipt, title: 'ZivoPlus as supplier', text: 'Tax invoice with ZivoPlus\'s GSTIN as supplier of the stay. Needs your CA\'s go-ahead and the company details in Finance Settings.' },
  { id: 'HOTEL_ISSUES', Icon: Landmark, title: 'The hotel issues it', text: 'ZivoPlus gives the guest a payment receipt (not a tax invoice); the hotel issues the GST invoice at check-out.' },
];
const PREVIEWS = [
  ['guest-invoice', 'Guest invoice (PDF)', FileText], ['guest-voucher', 'Guest voucher (PDF)', FileText], ['hotel-voucher', 'Hotelier voucher (PDF)', FileText],
  ['guest-email', 'Guest confirmation email', Mail], ['hotel-email', 'Hotel new-booking email', Mail],
];

const DocumentSettings = () => {
  usePageTitle('Documents & emails');
  const { can } = useAccess();
  const canEdit = can('settings.manage');
  const [s, setS] = useState(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const [previewing, setPreviewing] = useState('');

  useEffect(() => { adminDocumentsApi.get().then((d) => setS(d.settings)).catch((e) => setMsg({ ok: false, text: e.message })); }, []);
  if (!s) return <p className="text-sm text-gray-500 flex items-center gap-2">{msg ? msg.text : <><Loader2 size={16} className="animate-spin" /> Loading…</>}</p>;

  const set = (path, value) => setS((cur) => { const n = structuredClone(cur); const [a, b] = path.split('.'); n[a][b] = value; return n; });
  const save = async () => {
    setSaving(true); setMsg(null);
    try {
      const body = { ...s, voucher: { guestNotes: s.voucher.guestNotes, hotelNotes: s.voucher.hotelNotes } };
      const d = await adminDocumentsApi.save(body);
      setS(d.settings);
      setMsg({ ok: true, text: 'Saved. New documents and emails use these settings.' });
    } catch (e) { setMsg({ ok: false, text: e.message || 'Could not save.' }); } finally { setSaving(false); }
  };
  const preview = async (kind) => {
    setPreviewing(kind); setMsg(null);
    try {
      const blob = await adminDocumentsApi.preview(kind);
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) { setMsg({ ok: false, text: e.message || 'Could not make the sample.' }); } finally { setPreviewing(''); }
  };
  const notes = (v) => (Array.isArray(v) ? v.join('\n') : v || '');
  const input = 'mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none disabled:bg-gray-50';

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Documents & emails</h1>
        <p className="text-sm text-gray-600 mt-1">Guest invoices, vouchers and booking emails share one ZivoPlus look. Company details (legal name, GSTIN, PAN, address, signatory) come from <Link to="/admin/finance/settings" className="font-semibold text-navy-700 underline">Finance Settings</Link>; support contacts from <Link to="/admin/platform-settings" className="font-semibold text-navy-700 underline">Platform Settings</Link>.</p>
      </div>

      <section className="bg-white border border-gray-200 rounded-2xl p-5">
        <h2 className="font-bold text-gray-900">Who issues the guest&apos;s GST invoice</h2>
        <p className="text-sm text-gray-600 mt-1">Changes what the guest invoice says and what vouchers and emails tell guests and hotels. Confirm the choice with your CA.</p>
        <div className="mt-4 grid gap-3 md:grid-cols-3" role="radiogroup" aria-label="Who issues the guest invoice">
          {MODES.map((m) => {
            const on = s.guestInvoice.mode === m.id;
            return (
              <button key={m.id} type="button" role="radio" aria-checked={on} disabled={!canEdit} onClick={() => set('guestInvoice.mode', m.id)}
                className={`text-left rounded-xl border p-4 transition-colors ${on ? 'border-navy-800 ring-2 ring-navy-800 bg-navy-50/40' : 'border-gray-200 hover:border-gray-300'} disabled:opacity-70`}>
                <m.Icon size={20} className={on ? 'text-navy-800' : 'text-gray-400'} aria-hidden="true" />
                <p className="font-semibold text-gray-900 mt-2">{m.title}</p>
                <p className="text-xs text-gray-600 mt-1 leading-relaxed">{m.text}</p>
              </button>
            );
          })}
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-[180px_1fr]">
          <label className="text-xs font-semibold text-gray-700">Number prefix
            <input className={input} value={s.guestInvoice.prefix} maxLength={8} disabled={!canEdit} onChange={(e) => set('guestInvoice.prefix', e.target.value.toUpperCase())} />
            <span className="block mt-1 font-normal text-gray-500">{s.guestInvoice.prefix || 'ZIV'}/{new Date().getFullYear()}/000001</span>
          </label>
          <label className="text-xs font-semibold text-gray-700">Note printed on the invoice (optional)
            <input className={input} value={s.guestInvoice.note} maxLength={400} disabled={!canEdit} onChange={(e) => set('guestInvoice.note', e.target.value)} placeholder="e.g. Subject to Bengaluru jurisdiction." />
          </label>
        </div>
      </section>

      <section className="bg-white border border-gray-200 rounded-2xl p-5 grid gap-4 md:grid-cols-2">
        <div className="md:col-span-2">
          <h2 className="font-bold text-gray-900">Voucher notes</h2>
          <p className="text-sm text-gray-600 mt-1">One note per line. The cancellation policy, the hotel&apos;s house rules and the invoice line are added automatically.</p>
        </div>
        <label className="text-xs font-semibold text-gray-700">Guest voucher: &ldquo;Good to know&rdquo;
          <textarea rows={5} className={input} disabled={!canEdit} value={notes(s.voucher.guestNotes)} onChange={(e) => set('voucher.guestNotes', e.target.value.split('\n'))} />
        </label>
        <label className="text-xs font-semibold text-gray-700">Hotelier voucher: &ldquo;Notes for the property&rdquo;
          <textarea rows={5} className={input} disabled={!canEdit} value={notes(s.voucher.hotelNotes)} onChange={(e) => set('voucher.hotelNotes', e.target.value.split('\n'))} />
        </label>
      </section>

      <section className="bg-white border border-gray-200 rounded-2xl p-5 space-y-3">
        <h2 className="font-bold text-gray-900">Booking emails</h2>
        <label className="flex items-start gap-3 text-sm"><input type="checkbox" className="mt-1 rounded border-gray-300" disabled={!canEdit} checked={s.email.attachGuestVoucher} onChange={(e) => set('email.attachGuestVoucher', e.target.checked)} /><span><b>Attach the booking voucher (PDF)</b> to the guest&apos;s confirmation email</span></label>
        <label className="flex items-start gap-3 text-sm"><input type="checkbox" className="mt-1 rounded border-gray-300" disabled={!canEdit} checked={s.email.attachHotelVoucher} onChange={(e) => set('email.attachHotelVoucher', e.target.checked)} /><span><b>Attach the hotelier voucher (PDF)</b> to the hotel&apos;s new-booking email</span></label>
        <label className="block text-xs font-semibold text-gray-700">Footer line on every email (optional)
          <input className={input} value={s.email.footerNote} maxLength={300} disabled={!canEdit} onChange={(e) => set('email.footerNote', e.target.value)} placeholder="e.g. ZivoPlus Hospitality Pvt Ltd, Bengaluru" />
        </label>
      </section>

      {msg && <p role="status" className={`text-sm px-3 py-2 rounded-lg ${msg.ok ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'}`}>{msg.text}</p>}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {canEdit && <button type="button" onClick={save} disabled={saving} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-bold disabled:opacity-60">{saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Save</button>}
      </div>

      <section className="bg-white border border-gray-200 rounded-2xl p-5">
        <h2 className="font-bold text-gray-900">See a sample</h2>
        <p className="text-sm text-gray-600 mt-1">Made from the latest confirmed booking with the saved settings. Nothing is sent.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {PREVIEWS.map(([k, label, Icon]) => (
            <button key={k} type="button" onClick={() => preview(k)} disabled={!!previewing} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 text-sm font-semibold text-gray-800 hover:border-navy-700 disabled:opacity-60">
              {previewing === k ? <Loader2 size={16} className="animate-spin" /> : <Icon size={16} aria-hidden="true" />} {label} <Eye size={14} className="text-gray-400" aria-hidden="true" />
            </button>
          ))}
        </div>
      </section>
    </div>
  );
};

export default DocumentSettings;
