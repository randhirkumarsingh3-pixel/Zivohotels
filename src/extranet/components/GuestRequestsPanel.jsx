import { useState } from 'react';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { respondToStayRequest } from '../../services/extranetApi';
import { requestLabel } from '../../constants/stayRequests';

/**
 * A booking's guest requests (late arrival, pickup…). Waiting ones get Confirm / Decline with a
 * reply; the guest is emailed the answer and sees it in My Bookings.
 */
const STATUS = {
  PENDING: ['Waiting for your answer', 'bg-amber-50 text-amber-900 border-amber-200'],
  CONFIRMED: ['Confirmed', 'bg-green-50 text-green-800 border-green-200'],
  DECLINED: ['Declined', 'bg-red-50 text-red-800 border-red-200'],
  CANCELLED: ['Withdrawn by guest', 'bg-gray-50 text-gray-600 border-gray-200'],
};
const when = (d) => new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });

const GuestRequestsPanel = ({ requests = [], onChanged, addToast }) => {
  const [replies, setReplies] = useState({});
  const [busy, setBusy] = useState(null);
  if (!requests.length) return null;

  const answer = async (r, status) => {
    const reply = (replies[r.id] || '').trim();
    if (status === 'DECLINED' && reply.length < 3) { addToast?.('Add a reply: why it isn\'t possible, or what you can offer instead.', 'error'); return; }
    setBusy(r.id + status);
    try {
      await respondToStayRequest(r.id, status, reply);
      addToast?.(status === 'CONFIRMED' ? 'Request confirmed. The guest has been emailed.' : 'Reply sent to the guest.', 'success');
      onChanged?.();
    } catch (e) { addToast?.(e.message || 'Could not save the answer.', 'error'); }
    finally { setBusy(null); }
  };

  return (
    <div className="text-sm">
      <p className="font-semibold text-gray-900 mb-2">Guest requests</p>
      <ul className="space-y-3">
        {requests.map((r) => {
          const [label, cls] = STATUS[r.status] || STATUS.PENDING;
          return (
            <li key={r.id} className="rounded-lg border border-gray-200 bg-white p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold text-gray-900">{requestLabel(r.type)}</p>
                <span className={`px-2 py-0.5 rounded-full border text-xs font-semibold ${cls}`}>{label}</span>
              </div>
              {(r.requestedTime || r.details) && <p className="text-gray-700 mt-1 break-words">{[r.requestedTime, r.details].filter(Boolean).join(' · ')}</p>}
              <p className="text-xs text-gray-500 mt-1">Sent {when(r.createdAt)}{r.respondedAt ? ` · answered ${when(r.respondedAt)}` : ''}</p>
              {r.hotelReply && <p className="mt-2 text-gray-800 bg-gray-50 rounded px-2 py-1.5"><span className="font-semibold">Your reply: </span>{r.hotelReply}</p>}
              {r.status === 'PENDING' && (
                <div className="mt-3 space-y-2">
                  <label htmlFor={`reply-${r.id}`} className="block text-xs font-semibold text-gray-700">Reply to the guest <span className="font-normal text-gray-500">(needed to decline)</span></label>
                  <textarea id={`reply-${r.id}`} rows={2} maxLength={500} value={replies[r.id] || ''}
                    placeholder="e.g. Driver will wait at Gate 3 with a ZivoHotels sign. ₹900, pay at the hotel."
                    onChange={(e) => setReplies((x) => ({ ...x, [r.id]: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-navy-500 outline-none" />
                  <div className="flex flex-wrap gap-2">
                    <button type="button" disabled={!!busy} onClick={() => answer(r, 'CONFIRMED')}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-green-700 hover:bg-green-800 text-white text-sm font-semibold disabled:opacity-50">
                      {busy === r.id + 'CONFIRMED' ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <CheckCircle2 size={14} aria-hidden="true" />} Confirm
                    </button>
                    <button type="button" disabled={!!busy} onClick={() => answer(r, 'DECLINED')}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-red-300 text-red-700 hover:bg-red-50 text-sm font-semibold disabled:opacity-50">
                      {busy === r.id + 'DECLINED' ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <XCircle size={14} aria-hidden="true" />} Decline
                    </button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
};

export default GuestRequestsPanel;
