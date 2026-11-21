import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { getRoomCancelPreview, cancelBookingRoomApi } from '../../services/api';

/**
 * "Cancel this room" for one room of a booking with several rooms: shows the refund (and any
 * charge under the hotel's policy) before the guest confirms, and where the refund goes.
 */
const inr = (n) => `₹${Math.round(Number(n) || 0).toLocaleString('en-IN')}`;

const RoomCancel = ({ booking, room, onDone, allowWallet = true }) => {
  const [quote, setQuote] = useState(null);
  const [refundTo, setRefundTo] = useState('SOURCE');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const paidOnline = Number(booking.paidAmount) > 0;

  const open = async () => {
    setBusy(true); setError('');
    try { setQuote(await getRoomCancelPreview(booking.id, room.roomNumber)); }
    catch (e) { setError(e.message || 'Could not work out the refund.'); }
    finally { setBusy(false); }
  };
  const confirm = async () => {
    setBusy(true); setError('');
    try { await cancelBookingRoomApi(booking.id, room.roomNumber, refundTo); setQuote(null); onDone?.(); }
    catch (e) { setError(e.message || 'Could not cancel the room.'); }
    finally { setBusy(false); }
  };

  if (!quote) {
    return (
      <span className="inline-flex flex-col items-end">
        <button type="button" onClick={open} disabled={busy} className="text-xs font-semibold text-red-700 hover:underline disabled:opacity-50">
          {busy ? 'Checking…' : 'Cancel this room'}
        </button>
        {error && <span role="alert" className="text-xs text-red-700">{error}</span>}
      </span>
    );
  }
  return (
    <div role="alertdialog" aria-label={`Cancel room ${room.roomNumber}?`} className="mt-2 w-full rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-900 space-y-2">
      <p className="font-bold">Cancel room {room.roomNumber} ({quote.roomTypeName}, {quote.guestName})?</p>
      <p>{paidOnline ? <>Refund: <b>{inr(quote.refundAmount)}</b>{quote.retainedAmount > 0 && <> · charge under the hotel&apos;s policy: {inr(quote.retainedAmount)}</>}</> : 'Nothing was paid for it, so there is nothing to refund.'} New booking total: <b>{inr(quote.newTotal)}</b>. The other rooms stay booked.</p>
      {paidOnline && quote.refundAmount > 0 && allowWallet && (
        <div className="flex flex-wrap gap-3" role="radiogroup" aria-label="Where should the refund go?">
          {[['SOURCE', 'Original payment method (5–7 working days)'], ['WALLET', 'Zivo Cash (instant)']].map(([v, l]) => (
            <label key={v} className="inline-flex items-center gap-1.5 cursor-pointer">
              <input type="radio" name={`refund-${room.roomNumber}`} value={v} checked={refundTo === v} onChange={() => setRefundTo(v)} /> {l}
            </label>
          ))}
        </div>
      )}
      {error && <p role="alert" className="text-red-700">{error}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={confirm} disabled={busy} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-700 hover:bg-red-800 text-white font-semibold disabled:opacity-50">
          {busy && <Loader2 size={12} className="animate-spin" aria-hidden="true" />} Yes, cancel this room
        </button>
        <button type="button" onClick={() => setQuote(null)} className="px-3 py-1.5 rounded-lg border border-gray-300 bg-white font-semibold text-gray-800">Keep it</button>
      </div>
    </div>
  );
};

export default RoomCancel;
