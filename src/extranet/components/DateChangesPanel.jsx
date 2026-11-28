import { useCallback, useEffect, useState } from 'react';
import { CalendarClock, CheckCircle2, XCircle, Loader2, ArrowRight } from 'lucide-react';
import { fetchDateChanges, respondToDateChange } from '../../services/extranetApi';

/**
 * Extranet → Bookings: guests asking to move their stay. Each shows the current and asked-for
 * dates and the new total at today's rates; Approve moves the booking (or asks a prepaid guest to
 * pay the difference first), Decline needs a reply. Nothing changes on the booking until approved.
 */
const day = (d) => new Date(`${String(d).slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const when = (d) => new Date(d).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const inr = (n) => `₹${Math.round(Number(n) || 0).toLocaleString('en-IN')}`;
const DONE = {
  APPLIED: ['Dates changed', 'text-green-800'], AWAITING_PAYMENT: ['Approved · guest paying the difference', 'text-navy-800'],
  DECLINED: ['Declined', 'text-red-700'], WITHDRAWN: ['Withdrawn by guest', 'text-gray-500'], EXPIRED: ['Expired (not answered)', 'text-gray-500'], FAILED: ['Not possible: sold out', 'text-red-700'],
};

const DateChangesPanel = ({ addToast, onChanged }) => {
  const [list, setList] = useState([]);
  const [replies, setReplies] = useState({});
  const [busy, setBusy] = useState(null);
  const load = useCallback(() => fetchDateChanges().then((d) => setList(Array.isArray(d) ? d : [])).catch(() => {}), []);
  useEffect(() => { load(); const t = setInterval(load, 60000); return () => clearInterval(t); }, [load]);

  const pending = list.filter((r) => r.status === 'PENDING');
  const recent = list.filter((r) => r.status !== 'PENDING').slice(0, 5);
  if (!pending.length && !recent.length) return null;

  const answer = async (r, decision) => {
    const reply = (replies[r.id] || '').trim();
    if (decision === 'DECLINE' && reply.length < 3) { addToast?.('Add a reply: why not, or which dates would work.', 'error'); return; }
    setBusy(r.id + decision);
    try {
      const out = await respondToDateChange(r.id, decision, reply);
      addToast?.(decision === 'DECLINE' ? 'Declined. The guest has been told.' : out?.status === 'AWAITING_PAYMENT' ? 'Approved. The booking moves once the guest pays the difference.' : 'Approved. The booking is on the new dates.', 'success');
      await load(); onChanged?.();
    } catch (e) { addToast?.(e.message || 'Could not save the answer.', 'error'); await load(); }
    finally { setBusy(null); }
  };

  return (
    <section aria-labelledby="dc-h" className="bg-white rounded-xl border border-gray-200 shadow-sm">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3">
        <h2 id="dc-h" className="font-bold text-gray-900 flex items-center gap-2"><CalendarClock size={18} className="text-navy-700" aria-hidden="true" /> Date change requests</h2>
        {pending.length > 0 && <span className="px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 text-xs font-bold">{pending.length} to answer</span>}
      </div>
      <ul className="divide-y divide-gray-100">
        {pending.map((r) => (
          <li key={r.id} className="p-5 space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-semibold text-gray-900">{r.booking?.guestName} · <span className="font-mono text-sm">{r.booking?.bookingRef}</span></p>
                <p className="text-sm text-gray-700 mt-0.5">{day(r.oldCheckIn)} → {day(r.oldCheckOut)} <ArrowRight size={13} className="inline text-gray-400" aria-hidden="true" /> <b>{day(r.newCheckIn)} → {day(r.newCheckOut)}</b></p>
                <p className="text-xs text-gray-500 mt-0.5">{r.booking?.rooms} room{r.booking?.rooms === 1 ? '' : 's'}{r.booking?.roomType?.name ? ` · ${r.booking.roomType.name}` : ''} · new total {inr(r.newTotal)} (was {inr(r.oldTotal)}) · answer by {when(r.expiresAt)}</p>
                {r.guestNote && <p className="text-sm text-gray-700 mt-1">&ldquo;{r.guestNote}&rdquo;</p>}
              </div>
            </div>
            <label className="block text-xs font-semibold text-gray-700">Reply to the guest <span className="font-normal text-gray-500">(needed to decline)</span>
              <input type="text" maxLength={300} value={replies[r.id] || ''} onChange={(e) => setReplies((x) => ({ ...x, [r.id]: e.target.value }))} placeholder="e.g. Fully booked then; 18–20 Dec works"
                className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-navy-500 outline-none" />
            </label>
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={!!busy} onClick={() => answer(r, 'APPROVE')} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-green-700 hover:bg-green-800 text-white text-sm font-semibold disabled:opacity-50">
                {busy === r.id + 'APPROVE' ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} aria-hidden="true" />} Approve
              </button>
              <button type="button" disabled={!!busy} onClick={() => answer(r, 'DECLINE')} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-red-300 text-red-700 hover:bg-red-50 text-sm font-semibold disabled:opacity-50">
                {busy === r.id + 'DECLINE' ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} aria-hidden="true" />} Decline
              </button>
            </div>
          </li>
        ))}
        {recent.length > 0 && (
          <li className="px-5 py-3">
            <details>
              <summary className="text-sm font-semibold text-gray-700 cursor-pointer">Recently answered ({recent.length})</summary>
              <ul className="mt-2 space-y-1.5 text-sm">
                {recent.map((r) => (
                  <li key={r.id} className="text-gray-700"><span className="font-mono">{r.booking?.bookingRef}</span> · {day(r.newCheckIn)} → {day(r.newCheckOut)} · <span className={`font-semibold ${DONE[r.status]?.[1] || ''}`}>{DONE[r.status]?.[0] || r.status}</span></li>
                ))}
              </ul>
            </details>
          </li>
        )}
      </ul>
    </section>
  );
};

export default DateChangesPanel;
