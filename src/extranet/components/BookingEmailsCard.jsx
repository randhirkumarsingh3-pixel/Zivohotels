import { useState } from 'react';
import { Mail, Plus, X, Loader2, CheckCircle2 } from 'lucide-react';
import { updateBookingEmails } from '../../services/extranetApi';

/**
 * Who gets this property's booking emails: the reception email and the owner's login email
 * always, plus up to 5 extra addresses (front desk, manager, revenue team…).
 */
const BookingEmailsCard = ({ property, ownerEmail }) => {
  const contact = property.integrationSettings?.contactInfo || {};
  const [emails, setEmails] = useState(Array.isArray(contact.bookingEmails) ? contact.bookingEmails : []);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const save = async (next) => {
    setBusy(true); setMsg(null);
    try {
      const r = await updateBookingEmails(next);
      setEmails(r?.bookingEmails || next);
      setMsg({ ok: true, text: 'Saved.' });
      return true;
    } catch (e) {
      setMsg({ ok: false, text: e.message || 'Could not save.' });
      return false;
    } finally { setBusy(false); }
  };

  const add = async (e) => {
    e.preventDefault();
    const v = draft.trim().toLowerCase();
    if (!v) return;
    if (emails.includes(v)) { setDraft(''); return; }
    if (await save([...emails, v])) setDraft('');
  };

  const fixed = [[contact.receptionEmail, 'Reception email'], [ownerEmail, 'Owner (your login)']].filter(([e]) => e);

  return (
    <section className="bg-white rounded-card border border-gray-200 shadow-sm">
      <div className="px-6 py-5 border-b border-gray-100 flex items-start gap-3">
        <span className="w-10 h-10 rounded-lg bg-navy-50 text-navy-700 flex items-center justify-center shrink-0"><Mail size={20} aria-hidden="true" /></span>
        <div>
          <h2 className="text-lg font-bold text-gray-900">Booking emails</h2>
          <p className="text-sm text-gray-500 mt-0.5">New bookings, cancellations and guest requests are emailed to all of these.</p>
        </div>
      </div>
      <div className="px-6 py-5 space-y-3">
        <ul className="space-y-2">
          {fixed.map(([e, label]) => (
            <li key={`f-${e}`} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-sm"><span className="font-medium text-gray-900 break-all">{e}</span><span className="text-xs text-gray-500 shrink-0 ml-2">{label}</span></li>
          ))}
          {emails.map((e) => (
            <li key={e} className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-sm">
              <span className="font-medium text-gray-900 break-all">{e}</span>
              <button type="button" disabled={busy} onClick={() => save(emails.filter((x) => x !== e))} aria-label={`Remove ${e}`} className="text-gray-400 hover:text-red-600 ml-2"><X size={16} /></button>
            </li>
          ))}
        </ul>
        {emails.length < 5 && (
          <form onSubmit={add} className="flex gap-2">
            <label htmlFor="booking-email-new" className="sr-only">Add a booking email</label>
            <input id="booking-email-new" type="email" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="frontdesk@yourhotel.com"
              className="flex-1 px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:border-navy-500 focus:ring-2 focus:ring-navy-500/20 outline-none" />
            <button type="submit" disabled={busy || !draft.trim()} className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-navy-900 text-white text-sm font-semibold disabled:opacity-60">
              {busy ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} aria-hidden="true" />} Add
            </button>
          </form>
        )}
        {msg && <p role="status" className={`text-sm flex items-center gap-1.5 ${msg.ok ? 'text-green-700' : 'text-red-700'}`}>{msg.ok && <CheckCircle2 size={15} aria-hidden="true" />}{msg.text}</p>}
      </div>
    </section>
  );
};

export default BookingEmailsCard;
